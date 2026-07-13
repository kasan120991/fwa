<script setup lang="ts">
const route = useRoute()
const api = useApi()

interface LineItem { id: number, name_snapshot: string, unit_price_snapshot: number, qty: number, line_total: number }
interface Payment { id: number, amount: number, method: string, status: string, paid_at: string | null }
interface Invoice {
  id: number
  number: string | null
  kind: string
  status: 'open' | 'paid' | 'uncollectible' | 'void'
  description: string | null
  amount_due: number
  amount_paid: number
  is_overdue: boolean
  due_date: string | null
  finalized_at: string | null
  paid_at: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  items?: LineItem[]
  line_items?: LineItem[]
  payments?: Payment[]
}

const invoice = ref<Invoice | null>(null)
const pending = ref(true)
const notFound = ref(false)
const showPay = ref(false)
const socket = useSocket()

useHead({ title: () => `${invoice.value?.number || 'Invoice'} · Francis Web Agency` })

async function load() {
  try {
    const { data } = await api<{ data: Invoice }>(`/portal/invoices/${route.params.id}`)
    invoice.value = data
    // Once it's no longer open (e.g. a payment landed), drop the checkout panel.
    if (data.status !== 'open') showPay.value = false
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
}

// A payment (or any change) pushes over the socket; refetch to reflect it live.
function onInvoiceChanged() { load() }

onMounted(() => {
  load()
  socket.on('invoice:changed', onInvoiceChanged)
})
onBeforeUnmount(() => socket.off('invoice:changed', onInvoiceChanged))

// DECIMAL columns arrive as strings — coerce so formatMoney/qty compare work.
const items = computed(() => (invoice.value?.items ?? invoice.value?.line_items ?? []).map(li => ({
  ...li,
  qty: Number(li.qty),
  unit_price_snapshot: Number(li.unit_price_snapshot),
  line_total: Number(li.line_total)
})))
const payments = computed(() => invoice.value?.payments ?? [])
const statusChip = computed(() => {
  const i = invoice.value
  if (!i) return { label: '', class: '' }
  if (i.status === 'paid') return { label: 'Paid', class: 'bg-success/10 text-success' }
  if (i.is_overdue) return { label: 'Overdue', class: 'bg-warning/10 text-warning' }
  if (i.status === 'open') return { label: 'Open', class: 'bg-mist text-primary' }
  return { label: formatStatus(i.status), class: 'bg-muted text-muted' }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/invoices"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      Invoices
    </NuxtLink>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="notFound || !invoice"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-medium text-highlighted">
        Invoice not found
      </h3>
    </div>

    <template v-else>
      <!-- header -->
      <div class="rounded-card bg-default p-6 ring ring-default">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="eyebrow text-primary">
              Invoice
            </p>
            <h1 class="mt-1 font-display text-[1.75rem] font-medium tracking-tight text-highlighted">
              {{ invoice.number || `#${invoice.id}` }}
            </h1>
            <p
              v-if="invoice.due_date"
              class="mt-1 text-[13.5px] text-muted"
            >
              Due {{ shortDate(invoice.due_date) }}
              <span v-if="invoice.paid_at"> · Paid {{ shortDate(invoice.paid_at) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2.5">
            <span
              class="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              :class="statusChip.class"
            >{{ statusChip.label }}</span>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-default pt-5">
          <div class="me-auto">
            <div class="text-[12.5px] text-muted">
              Amount
            </div>
            <div class="font-display text-[1.6rem] font-medium tabular-nums text-highlighted">
              {{ formatMoney(invoice.amount_due) }}
            </div>
          </div>
          <UButton
            v-if="invoice.status === 'open' && !showPay"
            color="primary"
            size="lg"
            icon="i-lucide-credit-card"
            @click="showPay = true"
          >
            Pay Invoice
          </UButton>
          <UButton
            v-if="invoice.status === 'open' && showPay"
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-lucide-x"
            @click="showPay = false"
          >
            Cancel
          </UButton>
          <UButton
            v-if="invoice.invoice_pdf"
            :to="invoice.invoice_pdf"
            target="_blank"
            color="neutral"
            variant="outline"
            size="lg"
            icon="i-lucide-download"
          >
            Download PDF
          </UButton>
        </div>
      </div>

      <!-- pay in-portal via the Stripe Payment Element -->
      <PortalInvoicePayElement
        v-if="invoice.status === 'open' && showPay"
        :invoice-id="invoice.id"
        :amount="Number(invoice.amount_due)"
        @paid="load"
      />

      <!-- line items -->
      <div
        v-if="items.length"
        class="overflow-hidden rounded-card bg-default ring ring-default"
      >
        <div class="border-b border-default px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
          Line items
        </div>
        <div
          v-for="li in items"
          :key="li.id"
          class="flex items-center gap-4 border-b border-default px-5 py-3.5 last:border-0"
        >
          <div class="min-w-0 flex-1">
            <div class="text-[13.5px] text-default">
              {{ li.name_snapshot }}
            </div>
            <div
              v-if="li.qty > 1"
              class="text-[12px] text-muted tabular-nums"
            >
              {{ li.qty }} × {{ formatMoney(li.unit_price_snapshot) }}
            </div>
          </div>
          <span class="w-24 flex-none text-right text-[13.5px] font-medium tabular-nums text-highlighted">{{ formatMoney(li.line_total) }}</span>
        </div>
      </div>

      <!-- payments -->
      <div
        v-if="payments.length"
        class="overflow-hidden rounded-card bg-default ring ring-default"
      >
        <div class="border-b border-default px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
          Payments
        </div>
        <div
          v-for="p in payments"
          :key="p.id"
          class="flex items-center gap-4 border-b border-default px-5 py-3.5 last:border-0"
        >
          <UIcon
            name="i-lucide-check-circle-2"
            class="size-4 flex-none text-success"
          />
          <span class="min-w-0 flex-1 text-[13.5px] text-default">
            {{ p.method === 'card' ? 'Card payment' : p.method === 'bank' ? 'Bank payment' : 'Payment' }}
            <span
              v-if="p.paid_at"
              class="text-muted"
            > · {{ shortDate(p.paid_at) }}</span>
          </span>
          <span class="w-24 text-right text-[13.5px] font-medium tabular-nums text-highlighted">{{ formatMoney(p.amount) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
