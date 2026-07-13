<script setup lang="ts">
// Embedded Stripe Checkout for paying an invoice inside the portal. Mints a
// short-lived Checkout Session from the portal API, loads Stripe.js with the
// returned publishable key, and mounts the embedded payment UI. On completion
// it shows an inline success state and emits `paid` so the page can refetch —
// the invoice.paid webhook will already have flipped the invoice to paid.
// Mirrors PortalDocEmbed.vue (the PandaDoc signing embed).
import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js'

const props = defineProps<{ invoiceId: number }>()
const emit = defineEmits<{ paid: [] }>()

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)
const done = ref(false)
const mountEl = ref<HTMLElement | null>(null)
let checkout: StripeEmbeddedCheckout | null = null

async function start() {
  loading.value = true
  error.value = null
  try {
    const { data } = await api<{ data: { clientSecret: string, publishableKey: string } }>(
      `/portal/invoices/${props.invoiceId}/checkout-session`,
      { method: 'POST' }
    )
    const stripe = await loadStripe(data.publishableKey)
    if (!stripe) throw new Error('Could not load the payment form.')
    checkout = await stripe.createEmbeddedCheckoutPage({
      clientSecret: data.clientSecret,
      onComplete() {
        done.value = true
        checkout?.destroy()
        checkout = null
        emit('paid')
      }
    })
    // Wait a tick so the mount target is in the DOM once loading flips off.
    loading.value = false
    await nextTick()
    if (mountEl.value) checkout.mount(mountEl.value)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    error.value = e?.data?.error?.message || 'We couldn’t start the payment. Please try again.'
    loading.value = false
  }
}

onMounted(start)
onBeforeUnmount(() => {
  checkout?.destroy()
  checkout = null
})
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
      v-else-if="error"
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
      v-show="!loading && !error && !done"
      ref="mountEl"
      class="overflow-hidden rounded-card ring ring-default"
    />
  </div>
</template>
