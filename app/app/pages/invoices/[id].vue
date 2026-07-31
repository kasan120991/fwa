<script setup lang="ts">
// Invoice detail — the "Ledger" layout: one full-width money column. Billed
// line items, minus payments, ending in a Balance Due row (citrine sweep on
// the number that matters). Facts strip up top, linked records + Stripe links
// as the footer. Backed by GET /invoices/:id (items + payments included);
// actions reuse the same endpoints as the invoices-list drawer.
const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()

type Status = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
interface LineItem {
  id: number
  name_snapshot: string
  description_snapshot: string | null
  unit_price_snapshot: number
  qty: number
  line_total: number
}
interface Payment { id: number, amount: number, method: string, note: string | null, paid_at: string | null }
interface InvoiceDetail {
  id: number
  number: string | null
  status: Status
  kind: string
  amount_due: number
  amount_paid: number
  currency: string
  description: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  due_date: string | null
  finalized_at: string | null
  paid_at: string | null
  voided_at: string | null
  created_at: string
  stripe_invoice_id: string | null
  is_overdue: boolean
  client_id: number
  client_name: string | null
  client_company: string | null
  client_email: string | null
  project_id: number | null
  project_name: string | null
  items: LineItem[]
  payments: Payment[]
}

const STATUS_META: Record<Status, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
const chip = (inv: { status: Status, is_overdue: boolean }) =>
  inv.is_overdue ? { label: 'Overdue', status: 'warning' as const } : STATUS_META[inv.status]
const clientName = (i: { client_company: string | null, client_name: string | null }) => i.client_company || i.client_name || 'Unknown'

const id = Number(route.params.id)
const invoice = ref<InvoiceDetail | null>(null)
const pending = ref(true)
const missing = ref(false)

const balance = computed(() => {
  if (!invoice.value) return 0
  return Math.round((invoice.value.amount_due - invoice.value.amount_paid) * 100) / 100
})
const strip = computed(() => {
  if (!invoice.value) return ''
  return [
    invoice.value.kind,
    clientName(invoice.value),
    invoice.value.project_name,
    invoice.value.stripe_invoice_id ? 'Stripe synced' : null
  ].filter(Boolean).join(' · ')
})
const lastActivity = computed(() => {
  const inv = invoice.value
  if (!inv) return '—'
  if (inv.voided_at) return `Voided · ${shortDate(inv.voided_at)}`
  const paid = inv.payments[0]?.paid_at
  if (paid) return `Payment · ${shortDate(paid)}`
  if (inv.finalized_at) return `Sent · ${shortDate(inv.finalized_at)}`
  return `Created · ${shortDate(inv.created_at)}`
})

async function load() {
  try {
    const { data } = await api<{ data: InvoiceDetail }>(`/invoices/${id}`)
    invoice.value = data
    useHead({ title: `${data.number || 'Invoice'} · Francis Web Agency` })
  } catch (err: unknown) {
    const e = err as { status?: number, statusCode?: number }
    if ((e?.status ?? e?.statusCode) === 404) missing.value = true
    else toast.add({ title: 'Could not load invoice', color: 'error' })
  } finally {
    pending.value = false
  }
}
function onChanged() {
  load()
}
onMounted(() => {
  load()
  socket.on('invoice:changed', onChanged)
})
onBeforeUnmount(() => socket.off('invoice:changed', onChanged))

async function voidInvoice() {
  if (!invoice.value) return
  try {
    await api(`/invoices/${invoice.value.id}/void`, { method: 'POST' })
    toast.add({ title: 'Invoice voided', color: 'success' })
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not void invoice', description: e?.data?.error?.message, color: 'error' })
  }
}
function copyLink(url: string) {
  navigator.clipboard?.writeText(url)
  toast.add({ title: 'Invoice link copied', color: 'success' })
}

// ---- record payment modal (mirrors the invoices-list drawer) ----
const payOpen = ref(false)
const payAmount = ref<number | null>(null)
const payMethod = ref('manual')
const payNote = ref('')
const paying = ref(false)
const METHOD_ITEMS = [
  { label: 'Manual / Offline', value: 'manual' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank' },
  { label: 'Other', value: 'other' }
]
function openPay() {
  if (!invoice.value) return
  payAmount.value = balance.value
  payMethod.value = 'manual'
  payNote.value = ''
  payOpen.value = true
}
async function submitPay() {
  if (!invoice.value || paying.value) return
  paying.value = true
  try {
    await api(`/invoices/${invoice.value.id}/pay`, { method: 'POST', body: { amount: payAmount.value, method: payMethod.value, note: payNote.value || undefined } })
    toast.add({ title: 'Payment recorded', color: 'success' })
    payOpen.value = false
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not record payment', description: e?.data?.error?.message, color: 'error' })
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div
    v-if="pending"
    class="px-6 py-16 text-center text-sm text-muted"
  >
    Loading invoice…
  </div>

  <div
    v-else-if="missing || !invoice"
    class="flex flex-col items-center px-6 py-20 text-center"
  >
    <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
      name="i-lucide-receipt-text"
      class="size-6"
    /></span>
    <h3 class="font-display text-lg font-semibold text-highlighted">
      Invoice Not Found
    </h3>
    <p class="mt-1.5 max-w-xs text-sm text-muted">
      It may have been deleted, or the link is stale.
    </p>
    <UButton
      to="/invoices"
      color="neutral"
      variant="outline"
      class="mt-5"
      icon="i-lucide-arrow-left"
    >
      Back To Invoices
    </UButton>
  </div>

  <div
    v-else
    class="flex flex-col gap-5"
  >
    <!-- ======================= HEADER ======================= -->
    <div>
      <nav class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <NuxtLink
          to="/invoices"
          class="font-medium transition-colors hover:text-highlighted"
        >Invoices</NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5"
        />
        <span class="font-medium text-highlighted tabular-nums">{{ invoice.number || 'Draft' }}</span>
      </nav>

      <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <div class="text-[10.5px] font-semibold uppercase leading-[1.9] tracking-[0.06em] text-muted">
            {{ strip }}
          </div>
          <div class="mt-1 flex items-center gap-3">
            <h1 class="font-display text-[30px] font-bold leading-tight tracking-tight text-highlighted tabular-nums">
              {{ invoice.number || 'Draft Invoice' }}
            </h1>
            <StatusChip :status="chip(invoice).status">
              {{ chip(invoice).label }}
            </StatusChip>
          </div>
        </div>
        <div class="flex flex-none items-center gap-2.5">
          <UButton
            v-if="invoice.hosted_invoice_url"
            :to="invoice.hosted_invoice_url"
            target="_blank"
            rel="noopener"
            color="neutral"
            variant="outline"
            icon="i-simple-icons-stripe"
            trailing-icon="i-lucide-external-link"
          >
            Open In Stripe
          </UButton>
          <UButton
            v-if="invoice.status === 'open'"
            color="primary"
            icon="i-lucide-hand-coins"
            @click="openPay"
          >
            Record Payment
          </UButton>
        </div>
      </div>
    </div>

    <!-- ======================= FACTS STRIP ======================= -->
    <div class="grid grid-cols-2 divide-default rounded-card bg-sand max-sm:gap-y-px sm:grid-cols-4 sm:divide-x">
      <div class="px-5 py-3.5">
        <div class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Issued
        </div>
        <div class="mt-1 text-[14px] font-semibold text-highlighted tabular-nums">
          {{ invoice.finalized_at ? shortDate(invoice.finalized_at) : '—' }}
        </div>
      </div>
      <div class="px-5 py-3.5">
        <div class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Due
        </div>
        <div
          class="mt-1 text-[14px] font-semibold tabular-nums"
          :class="invoice.is_overdue ? 'text-warning' : 'text-highlighted'"
        >
          {{ invoice.due_date ? shortDate(invoice.due_date) : '—' }}
        </div>
      </div>
      <div class="px-5 py-3.5">
        <div class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Billed To
        </div>
        <div class="mt-1 truncate text-[14px] font-semibold text-highlighted">
          {{ invoice.client_email || clientName(invoice) }}
        </div>
      </div>
      <div class="px-5 py-3.5">
        <div class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Last Activity
        </div>
        <div class="mt-1 text-[14px] font-semibold text-highlighted tabular-nums">
          {{ lastActivity }}
        </div>
      </div>
    </div>

    <!-- ======================= LEDGER ======================= -->
    <div class="rounded-card bg-default px-6 py-2 ring ring-default sm:px-8">
      <table class="w-full border-collapse">
        <tbody>
          <!-- billed -->
          <tr>
            <td
              colspan="2"
              class="pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted"
            >
              Billed
            </td>
          </tr>
          <tr
            v-for="li in invoice.items"
            :key="li.id"
            class="border-b border-default"
          >
            <td class="py-3.5 pr-4">
              <div class="text-[14px] font-semibold text-highlighted">
                {{ li.name_snapshot }}
              </div>
              <div
                v-if="li.description_snapshot || li.qty !== 1"
                class="mt-0.5 text-[12.5px] text-muted"
              >
                {{ [li.qty !== 1 ? `${li.qty} × ${formatMoney(li.unit_price_snapshot)}` : null, li.description_snapshot].filter(Boolean).join(' · ') }}
              </div>
            </td>
            <td class="whitespace-nowrap py-3.5 text-right align-top text-[14px] font-semibold text-highlighted tabular-nums">
              {{ formatMoney(li.line_total) }}
            </td>
          </tr>
          <tr v-if="!invoice.items.length">
            <td
              colspan="2"
              class="border-b border-default py-3.5 text-[13.5px] text-muted"
            >
              No line items — {{ invoice.description || 'amount set directly' }}.
            </td>
          </tr>
          <tr>
            <td class="pb-1 pt-4 text-[14px] font-semibold text-default">
              Subtotal
            </td>
            <td class="whitespace-nowrap pb-1 pt-4 text-right text-[14px] font-semibold text-highlighted tabular-nums">
              {{ formatMoney(invoice.amount_due) }}
            </td>
          </tr>

          <!-- payments -->
          <template v-if="invoice.payments.length">
            <tr>
              <td
                colspan="2"
                class="pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted"
              >
                Payments
              </td>
            </tr>
            <tr
              v-for="p in invoice.payments"
              :key="p.id"
              class="border-b border-default"
            >
              <td class="py-3.5 pr-4">
                <div class="text-[14px] font-semibold capitalize text-highlighted">
                  {{ p.method }}
                </div>
                <div class="mt-0.5 text-[12.5px] text-muted tabular-nums">
                  {{ [p.paid_at ? shortDate(p.paid_at) : null, p.note].filter(Boolean).join(' · ') || '—' }}
                </div>
              </td>
              <td class="whitespace-nowrap py-3.5 text-right align-top text-[14px] font-semibold text-success tabular-nums">
                −{{ formatMoney(p.amount) }}
              </td>
            </tr>
          </template>

          <!-- balance -->
          <tr>
            <td class="border-t border-accented py-4 text-[15px] font-bold text-highlighted">
              {{ invoice.status === 'void' ? 'Voided' : balance > 0 ? 'Balance Due' : 'Paid In Full' }}
            </td>
            <td class="whitespace-nowrap border-t border-accented py-4 text-right">
              <span
                v-if="balance > 0 && invoice.status !== 'void'"
                class="hl text-[19px] font-bold tabular-nums"
              >{{ formatMoney(balance) }}</span>
              <span
                v-else
                class="text-[19px] font-bold tabular-nums"
                :class="invoice.status === 'void' ? 'text-muted' : 'text-success'"
              >{{ invoice.status === 'void' ? '—' : formatMoney(0) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ======================= FOOTER ======================= -->
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-default pt-4">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <NuxtLink
          :to="`/clients/${invoice.client_id}`"
          class="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-highlighted underline decoration-accented underline-offset-4 transition-colors hover:decoration-citrine hover:decoration-2"
        >
          <UIcon
            name="i-lucide-building-2"
            class="size-4 text-muted"
          />{{ clientName(invoice) }}
        </NuxtLink>
        <NuxtLink
          v-if="invoice.project_id"
          :to="`/projects/${invoice.project_id}`"
          class="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-highlighted underline decoration-accented underline-offset-4 transition-colors hover:decoration-citrine hover:decoration-2"
        >
          <UIcon
            name="i-lucide-folder-open"
            class="size-4 text-muted"
          />{{ invoice.project_name || 'Project' }}
        </NuxtLink>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <UButton
          v-if="invoice.hosted_invoice_url"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-link"
          @click="copyLink(invoice.hosted_invoice_url!)"
        >
          Copy Link
        </UButton>
        <UButton
          v-if="invoice.invoice_pdf"
          :to="invoice.invoice_pdf"
          target="_blank"
          rel="noopener"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-download"
        >
          Download PDF
        </UButton>
        <UButton
          v-if="invoice.status === 'open' || invoice.status === 'draft'"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-ban"
          @click="voidInvoice"
        >
          Void
        </UButton>
      </div>
    </div>

    <!-- record payment modal -->
    <UModal
      v-model:open="payOpen"
      title="Record Payment"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="Amount">
            <UInput
              v-model.number="payAmount"
              type="number"
              min="0"
              step="0.01"
              icon="i-lucide-dollar-sign"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Method">
            <USelect
              v-model="payMethod"
              :items="METHOD_ITEMS"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Note (Optional)">
            <UInput
              v-model="payNote"
              placeholder="Check #1042, bank ref…"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton
            color="neutral"
            variant="outline"
            @click="() => { payOpen = false }"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="paying"
            @click="submitPay"
          >
            Record Payment
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
