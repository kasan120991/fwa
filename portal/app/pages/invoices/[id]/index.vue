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
  project_name?: string | null
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
function onInvoiceChanged() {
  load()
}

onMounted(() => {
  load()
  socket.on('invoice:changed', onInvoiceChanged)
})
onBeforeUnmount(() => socket.off('invoice:changed', onInvoiceChanged))

const KIND_LABEL: Record<string, string> = { deposit: 'Deposit', balance: 'Final Invoice', custom: 'Invoice' }

// DECIMAL columns arrive as strings — coerce so formatMoney/qty compare work.
const items = computed(() => (invoice.value?.items ?? invoice.value?.line_items ?? []).map(li => ({
  ...li,
  qty: Number(li.qty),
  unit_price_snapshot: Number(li.unit_price_snapshot),
  line_total: Number(li.line_total)
})))
const payments = computed(() => invoice.value?.payments ?? [])

const amountPaid = computed(() => Number(invoice.value?.amount_paid ?? 0))
const amountDue = computed(() => Number(invoice.value?.amount_due ?? 0))
const remaining = computed(() => Math.max(0, amountDue.value - amountPaid.value))
const subtotal = computed(() => items.value.reduce((sum, li) => sum + li.line_total, 0))

// The headline figure: what's left to pay while open, the total once settled.
const heroAmount = computed(() => invoice.value?.status === 'open' ? remaining.value : amountDue.value)

const spreadEyebrow = computed(() => {
  const i = invoice.value
  if (!i) return ''
  return [i.number || `Invoice #${i.id}`, KIND_LABEL[i.kind] || 'Invoice', i.project_name]
    .filter(Boolean).join(' · ')
})
const dueSoon = computed(() => {
  const days = daysFromNow(invoice.value?.due_date)
  return days != null && days <= 14
})
</script>

<template>
  <div class="flex flex-col gap-7">
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
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Invoice not found
      </h3>
    </div>

    <template v-else>
      <!-- The linen spread — continuation of the invoices list -->
      <section class="flex flex-wrap items-end gap-x-10 gap-y-6 rounded-band bg-sand p-7 sm:p-8">
        <div>
          <p class="eyebrow">
            {{ spreadEyebrow }}
          </p>
          <div class="mt-2.5 font-display text-[2.6rem] font-bold leading-none tracking-[-0.028em] tabular-nums text-highlighted">
            {{ formatMoney(heroAmount) }}
          </div>
          <p class="mt-2.5 text-[13.5px] text-muted">
            <template v-if="invoice.status === 'paid'">
              <span class="font-semibold text-success">Paid in full</span><template v-if="invoice.paid_at">
                · {{ shortDate(invoice.paid_at) }}
              </template>
            </template>
            <template v-else-if="invoice.status !== 'open'">
              {{ formatStatus(invoice.status) }}
            </template>
            <template v-else-if="invoice.is_overdue">
              <span class="font-semibold text-error">Overdue</span> — was due {{ shortDate(invoice.due_date) }}<template v-if="amountPaid > 0">
                · {{ formatMoney(amountPaid) }} already paid
              </template>
            </template>
            <template v-else-if="invoice.due_date">
              <span
                v-if="dueSoon"
                class="font-semibold text-warning"
              >Due Soon</span><template v-if="dueSoon">
                —
              </template><template v-else>
                Due
              </template>{{ shortDate(invoice.due_date) }}<template v-if="amountPaid > 0">
                · {{ formatMoney(amountPaid) }} already paid
              </template>
            </template>
            <template v-else>
              Ready when you are<template v-if="amountPaid > 0">
                · {{ formatMoney(amountPaid) }} already paid
              </template>
            </template>
          </p>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <a
            v-if="invoice.invoice_pdf"
            :href="invoice.invoice_pdf"
            target="_blank"
            class="inline-flex items-center rounded-btn border border-accented px-4 py-2 text-[13px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
          >
            Download PDF
          </a>
          <button
            v-if="invoice.status === 'open' && !showPay"
            class="inline-flex cursor-pointer items-center rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-inverted transition-colors hover:bg-primary/90"
            @click="showPay = true"
          >
            Pay Now
          </button>
          <button
            v-if="invoice.status === 'open' && showPay"
            class="inline-flex cursor-pointer items-center rounded-btn border border-accented px-4 py-2 text-[13px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
            @click="showPay = false"
          >
            Cancel
          </button>
        </div>
      </section>

      <!-- pay in-portal via the Stripe Payment Element, right under the spread -->
      <PortalInvoicePayElement
        v-if="invoice.status === 'open' && showPay"
        :invoice-id="invoice.id"
        :amount="remaining"
        @paid="load"
      />

      <p
        v-if="invoice.description"
        class="max-w-[640px] text-[13.5px] leading-relaxed text-muted"
      >
        {{ invoice.description }}
      </p>

      <!-- line items — open hairline section -->
      <section v-if="items.length">
        <p class="eyebrow">
          Line Items
        </p>
        <div class="mt-1.5">
          <div
            v-for="li in items"
            :key="li.id"
            class="flex items-center gap-4 border-t border-default py-3 first:border-t-0"
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
            <span class="text-[13.5px] font-medium tabular-nums text-highlighted">{{ formatMoney(li.line_total) }}</span>
          </div>
        </div>
        <div class="ml-auto mt-2 max-w-[380px]">
          <div class="flex justify-between py-1.5 text-[13.5px] tabular-nums text-muted">
            <span>Subtotal</span>
            <span class="font-semibold text-highlighted">{{ formatMoney(subtotal) }}</span>
          </div>
          <div
            v-if="amountPaid > 0"
            class="flex justify-between py-1.5 text-[13.5px] tabular-nums text-muted"
          >
            <span>Paid</span>
            <span class="font-semibold text-highlighted">−{{ formatMoney(amountPaid) }}</span>
          </div>
          <div class="mt-1 flex items-center justify-between border-t-2 border-accented pt-2.5 text-[15px] tabular-nums text-muted">
            <span>{{ invoice.status === 'open' ? 'Amount Due' : 'Total' }}</span>
            <span class="font-display text-[18px] font-bold text-highlighted">{{ formatMoney(heroAmount) }}</span>
          </div>
        </div>
      </section>

      <!-- payments — open hairline section -->
      <section v-if="payments.length">
        <p class="eyebrow">
          Payments
        </p>
        <div class="mt-1.5">
          <div
            v-for="p in payments"
            :key="p.id"
            class="flex items-center gap-3 border-t border-default py-3 text-[13.5px] first:border-t-0"
          >
            <UIcon
              name="i-lucide-check-circle-2"
              class="size-4 flex-none text-success"
            />
            <span class="min-w-0 flex-1 text-default">
              {{ p.method === 'card' ? 'Card payment' : p.method === 'bank' ? 'Bank payment' : 'Payment' }}
              <span
                v-if="p.paid_at"
                class="text-muted"
              > · {{ shortDate(p.paid_at) }}</span>
            </span>
            <span class="font-medium tabular-nums text-highlighted">{{ formatMoney(p.amount) }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
