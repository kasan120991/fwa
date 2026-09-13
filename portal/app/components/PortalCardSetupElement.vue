<script setup lang="ts">
// Save a card for a care plan with Stripe's Payment Element in setup mode.
// Confirms a SetupIntent (no charge), then hands the SetupIntent id back to
// the API, which makes the card the default and — on first setup — creates
// the subscription. Same shape as PortalInvoicePayElement, minus the amount.
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'

const props = defineProps<{
  planId: number
  // 'activate' starts the plan; 'update' swaps the card on a live one.
  mode: 'activate' | 'update'
}>()
const emit = defineEmits<{ saved: [] }>()

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)
const submitting = ref(false)
const done = ref(false)
const mountEl = ref<HTMLElement | null>(null)
let stripe: Stripe | null = null
let elements: StripeElements | null = null

async function start() {
  loading.value = true
  error.value = null
  try {
    const { data } = await api<{ data: { clientSecret: string, publishableKey: string } }>(
      `/portal/care-plans/${props.planId}/setup-intent`,
      { method: 'POST' }
    )
    stripe = await loadStripe(data.publishableKey)
    if (!stripe) throw new Error('Could not load the card form.')
    elements = stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#17181A',
          borderRadius: '8px',
          fontFamily: 'Geist, system-ui, sans-serif'
        }
      }
    })
    const paymentElement = elements.create('payment')
    loading.value = false
    await nextTick()
    if (mountEl.value) paymentElement.mount(mountEl.value)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    error.value = e?.data?.error?.message || 'We couldn’t start the card form. Please try again.'
    loading.value = false
  }
}

async function save() {
  if (!stripe || !elements || submitting.value) return
  submitting.value = true
  error.value = null
  const { error: err, setupIntent } = await stripe.confirmSetup({
    elements,
    confirmParams: { return_url: `${window.location.origin}/care-plan` },
    redirect: 'if_required'
  })
  if (err || !setupIntent) {
    error.value = err?.message || 'Your card could not be saved.'
    submitting.value = false
    return
  }
  try {
    await api(`/portal/care-plans/${props.planId}/${props.mode === 'activate' ? 'activate' : 'update-card'}`, {
      method: 'POST',
      body: { setup_intent_id: setupIntent.id }
    })
    done.value = true
    emit('saved')
  } catch (e: unknown) {
    const x = e as { data?: { error?: { message?: string } } }
    error.value = x?.data?.error?.message || 'Your card was saved but the plan could not be started. Please contact us.'
  } finally {
    submitting.value = false
  }
}

onMounted(start)
</script>

<template>
  <div>
    <div
      v-if="done"
      class="rounded-card bg-success/5 px-6 py-14 text-center ring ring-success/20"
    >
      <UIcon
        name="i-lucide-circle-check"
        class="mx-auto size-9 text-success"
      />
      <h3 class="mt-3 font-display text-lg font-semibold text-highlighted">
        {{ mode === 'activate' ? 'Your care plan is active' : 'Card updated' }}
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        {{ mode === 'activate' ? 'Thanks — your card is on file and the plan will update in a moment.' : 'Future charges will use the new card.' }}
      </p>
    </div>

    <div
      v-else-if="loading"
      class="rounded-card bg-default px-6 py-14 text-center text-sm text-muted ring ring-default"
    >
      Preparing secure card form…
    </div>

    <div
      v-else-if="error && !mountEl"
      class="rounded-card bg-default px-6 py-12 text-center ring ring-default"
    >
      <p class="text-sm text-muted">
        {{ error }}
      </p>
      <UButton
        class="mt-4"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="start"
      >
        Try again
      </UButton>
    </div>

    <div
      v-show="!loading && !done && (!error || mountEl)"
      class="rounded-card bg-default p-5 ring ring-default"
    >
      <div ref="mountEl" />
      <p
        v-if="error"
        class="mt-3 text-[13px] text-error"
      >
        {{ error }}
      </p>
      <UButton
        class="mt-4 w-full justify-center"
        color="primary"
        size="lg"
        icon="i-lucide-credit-card"
        :loading="submitting"
        :disabled="submitting"
        @click="save"
      >
        {{ mode === 'activate' ? 'Save Card & Start Plan' : 'Save New Card' }}
      </UButton>
      <p class="mt-3 text-center text-[12px] text-muted">
        {{ mode === 'activate' ? 'Nothing is charged until your start date. ' : '' }}Card details are handled by Stripe and never touch our servers.
      </p>
    </div>
  </div>
</template>
