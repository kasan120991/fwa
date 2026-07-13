<script setup lang="ts">
// Alternative to PortalInvoicePay.vue: pay an invoice with Stripe's Payment
// Element (a customizable in-page card form) instead of embedded Checkout. It
// confirms the invoice's OWN PaymentIntent, so paying fires invoice.paid
// directly (no out-of-band reconciliation). Built for the owner to compare the
// two payment UIs; the losing variant gets removed afterward.
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'

const props = defineProps<{ invoiceId: number, amount: number }>()
const emit = defineEmits<{ paid: [] }>()

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
      `/portal/invoices/${props.invoiceId}/payment-intent`,
      { method: 'POST' }
    )
    stripe = await loadStripe(data.publishableKey)
    if (!stripe) throw new Error('Could not load the payment form.')
    // Appearance themed to the FWA portal (teal primary, rounded, Inter).
    elements = stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0f766e',
          borderRadius: '10px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }
      }
    })
    const paymentElement = elements.create('payment')
    loading.value = false
    await nextTick()
    if (mountEl.value) paymentElement.mount(mountEl.value)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    error.value = e?.data?.error?.message || 'We couldn’t start the payment. Please try again.'
    loading.value = false
  }
}

async function pay() {
  if (!stripe || !elements || submitting.value) return
  submitting.value = true
  error.value = null
  const { error: err } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      // Only used for redirect-based methods (e.g. 3-D Secure); cards stay in-page.
      return_url: `${window.location.origin}/invoices/${props.invoiceId}`
    },
    redirect: 'if_required'
  })
  if (err) {
    error.value = err.message || 'Your payment could not be completed.'
    submitting.value = false
    return
  }
  done.value = true
  emit('paid')
}

onMounted(start)
</script>

<template>
  <div>
    <div
      v-if="done"
      class="rounded-card bg-success/5 px-6 py-16 text-center ring ring-success/20"
    >
      <UIcon
        name="i-lucide-circle-check"
        class="mx-auto size-9 text-success"
      />
      <h3 class="mt-3 font-display text-lg font-medium text-highlighted">
        Payment received
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Thanks — your payment went through. This invoice will update to paid in a moment.
      </p>
    </div>

    <div
      v-else-if="loading"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Preparing secure payment…
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
        @click="pay"
      >
        Pay {{ formatMoney(amount) }}
      </UButton>
    </div>
  </div>
</template>
