<script setup lang="ts">
// Client detail › Sales & Billing — invoices, agreements (proposals +
// contracts via the merged view), and the hosting-margin card.
import { INV_STATUS, AGREEMENT_STATUS, type InvStatus, type AgreementStatus, type ChipStatus } from '~/utils/clientDetail'

const props = defineProps<{ clientId: number }>()
const emit = defineEmits<{ 'new-invoice': [] }>()

const api = useApi()

// ---- invoices ----
interface ApiInvoice {
  id: number
  number: string | null
  status: InvStatus
  amount_due: number
  amount_paid: number
  due_date: string | null
  finalized_at: string | null
  created_at: string
  is_overdue: boolean
}
function invChip(i: ApiInvoice): { label: string, status: ChipStatus } {
  return i.is_overdue ? { label: 'Overdue', status: 'warning' } : INV_STATUS[i.status]
}

const invoicesRaw = ref<ApiInvoice[]>([])
const invoicesPending = ref(true)
async function loadInvoices() {
  try {
    const { data } = await api<{ data: ApiInvoice[] }>('/invoices', { query: { client_id: props.clientId } })
    invoicesRaw.value = data
  } catch {
    invoicesRaw.value = []
  } finally {
    invoicesPending.value = false
  }
}

const invoices = computed(() => invoicesRaw.value.map((i) => {
  const c = invChip(i)
  const balance = i.amount_due - i.amount_paid
  return {
    key: i.id,
    num: i.number || (i.status === 'draft' ? 'Draft' : '—'),
    issue: shortDate(i.finalized_at || i.created_at),
    due: i.due_date ? shortDate(i.due_date) : '—',
    amount: formatMoney(i.amount_due),
    balance: formatMoney(balance),
    balanceZero: balance <= 0,
    status: c.status,
    statusLabel: c.label,
    overdue: i.is_overdue
  }
}))
const outstanding = computed(() => invoicesRaw.value
  .filter(i => i.status === 'open')
  .reduce((s, i) => s + (i.amount_due - i.amount_paid), 0))

// Shared invoice slideover — opened by id from the rows.
const openInvoiceId = ref<number | null>(null)

// ---- agreements ----
interface ApiAgreementRow {
  kind: 'proposal' | 'contract'
  uid: string
  title: string
  status: AgreementStatus
  total: number
  recurring: boolean
  created_at: string
  closed_at: string | null
  updated_at: string
}
interface AgreementRow { key: string, title: string, type: 'Contract' | 'Proposal', status: 'success' | 'info' | 'error' | 'neutral', statusLabel: string, meta: string, value: string }

function mapAgreement(r: ApiAgreementRow): AgreementRow {
  const type = r.kind === 'contract' ? 'Contract' : 'Proposal'
  const m = AGREEMENT_STATUS[r.status]
  let hint = 'Not sent'
  if (r.status === 'accepted' || r.status === 'signed') hint = `${m.label} ${shortDate(r.closed_at)}`
  else if (r.status === 'sent' || r.status === 'viewed') hint = type === 'Contract' ? 'Awaiting signature' : 'Awaiting response'
  else if (r.status === 'declined' || r.status === 'expired' || r.status === 'voided') hint = `${m.label} ${shortDate(r.updated_at)}`
  return {
    key: r.uid,
    title: r.title,
    type,
    status: m.status,
    statusLabel: m.label,
    meta: [type, shortDate(r.created_at), hint].filter(Boolean).join(' · '),
    value: formatMoney(r.total) + (r.recurring ? '/mo' : '')
  }
}

const agreements = ref<AgreementRow[]>([])
const agreementsPending = ref(true)
async function loadAgreements() {
  try {
    const { data } = await api<{ data: ApiAgreementRow[] }>('/agreements', { query: { client_id: props.clientId } })
    agreements.value = data.map(mapAgreement)
  } catch {
    agreements.value = []
  } finally {
    agreementsPending.value = false
  }
}

// ---- hosting margin ----
interface Hosting { configured: boolean, monthly_cost?: number, droplet_count?: number, mrr?: number, margin?: number, margin_pct?: number | null, error?: string }
const hosting = ref<Hosting | null>(null)
async function loadHosting() {
  try {
    const { data } = await api<{ data: Hosting }>(`/clients/${props.clientId}/hosting`)
    hosting.value = data
  } catch { /* non-fatal */ }
}

const socket = useSocket()
const onInvoiceChanged = () => loadInvoices()
const onAgreementChanged = () => loadAgreements()
onMounted(() => {
  loadInvoices()
  loadAgreements()
  loadHosting()
  socket.on('invoice:changed', onInvoiceChanged)
  socket.on('payment:created', onInvoiceChanged)
  socket.on('contract:changed', onAgreementChanged)
  socket.on('proposal:changed', onAgreementChanged)
})
onBeforeUnmount(() => {
  socket.off('invoice:changed', onInvoiceChanged)
  socket.off('payment:created', onInvoiceChanged)
  socket.off('contract:changed', onAgreementChanged)
  socket.off('proposal:changed', onAgreementChanged)
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- invoices -->
    <div>
      <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
        <div class="flex items-center gap-3.5">
          <span class="text-base font-semibold text-highlighted">Invoices</span>
          <span
            v-if="outstanding > 0"
            class="inline-flex items-center gap-1.5 rounded-chip bg-error/10 px-3 py-1 text-[13px] font-semibold text-error tabular-nums"
          >{{ formatMoney(outstanding) }} outstanding</span>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          @click="emit('new-invoice')"
        >
          New Invoice
        </UButton>
      </div>
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div
          v-if="invoicesPending"
          class="px-4 py-12 text-center text-sm text-muted"
        >
          Loading invoices…
        </div>
        <div
          v-else-if="!invoices.length"
          class="flex flex-col items-center px-4 py-12 text-center"
        >
          <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
            name="i-lucide-receipt-text"
            class="size-5"
          /></span>
          <p class="text-sm text-muted">
            No invoices yet for this client.
          </p>
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default bg-muted/40">
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Invoice
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Issued
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Due
                </th>
                <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Amount
                </th>
                <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Balance
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="v in invoices"
                :key="v.key"
                class="cursor-pointer border-t border-default transition-colors hover:bg-muted first:border-t-0"
                @click="openInvoiceId = v.key"
              >
                <td class="px-4 py-3 text-sm font-semibold text-highlighted tabular-nums">
                  {{ v.num }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-sm text-default tabular-nums">
                  {{ v.issue }}
                </td>
                <td
                  class="whitespace-nowrap px-4 py-3 text-sm tabular-nums"
                  :class="v.overdue ? 'text-error' : 'text-default'"
                >
                  {{ v.due }}
                </td>
                <td class="px-4 py-3 text-right text-sm text-highlighted tabular-nums">
                  {{ v.amount }}
                </td>
                <td
                  class="px-4 py-3 text-right text-sm tabular-nums"
                  :class="v.balanceZero ? 'text-muted' : (v.overdue ? 'font-bold text-error' : 'text-highlighted')"
                >
                  {{ v.balance }}
                </td>
                <td class="px-4 py-3">
                  <StatusChip :status="v.status">
                    {{ v.statusLabel }}
                  </StatusChip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="invoices.length"
          class="flex items-center justify-end border-t border-default px-4 py-2.5"
        >
          <NuxtLink
            to="/invoices"
            class="text-[13px] font-semibold text-primary"
          >
            Open in Invoices →
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
      <!-- agreements -->
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between px-[18px] py-4">
          <span class="text-[15px] font-semibold text-highlighted">Agreements <span class="ml-1 text-[12.5px] font-normal text-muted">{{ agreements.length }} total</span></span>
          <NuxtLink
            to="/agreements"
            class="text-[13px] font-semibold text-primary"
          >
            Open in Agreements →
          </NuxtLink>
        </div>
        <div
          v-if="agreementsPending"
          class="border-t border-default px-4 py-10 text-center text-sm text-muted"
        >
          Loading agreements…
        </div>
        <div
          v-else-if="!agreements.length"
          class="border-t border-default px-4 py-10 text-center text-sm text-muted"
        >
          No proposals or contracts yet for this client.
        </div>
        <template v-else>
          <div
            v-for="c in agreements"
            :key="c.key"
            class="flex items-center gap-3.5 border-t border-default px-[18px] py-3.5 transition-colors hover:bg-muted"
          >
            <span
              class="inline-flex size-[38px] flex-none items-center justify-center rounded-[10px]"
              :class="c.type === 'Contract' ? 'bg-mist text-primary' : 'bg-muted text-muted'"
            >
              <UIcon
                :name="c.type === 'Contract' ? 'i-lucide-file-check-2' : 'i-lucide-file-text'"
                class="size-[18px]"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-highlighted">
                {{ c.title }}
              </div>
              <div class="mt-0.5 text-[13px] text-muted">
                {{ c.meta }}
              </div>
            </div>
            <span class="whitespace-nowrap text-sm text-highlighted tabular-nums">{{ c.value }}</span>
            <div class="flex w-24 justify-end">
              <StatusChip :status="c.status">
                {{ c.statusLabel }}
              </StatusChip>
            </div>
          </div>
        </template>
      </div>

      <!-- hosting margin -->
      <div class="rounded-card bg-default p-[18px] ring ring-default">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-[15px] font-semibold text-highlighted">Hosting Margin</span>
          <span class="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">Monthly</span>
        </div>
        <p
          v-if="!hosting"
          class="text-[13px] text-muted"
        >
          Loading…
        </p>
        <p
          v-else-if="!hosting.configured"
          class="text-[13px] text-muted"
        >
          Connect DigitalOcean to see hosting cost.
        </p>
        <p
          v-else-if="hosting.error"
          class="text-[13px] text-muted"
        >
          Couldn't load hosting cost.
        </p>
        <template v-else>
          <div class="flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Care Plan MRR</span>
            <span class="tabular-nums text-default">{{ formatMoney(hosting.mrr ?? 0) }}</span>
          </div>
          <div class="mt-2 flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Hosting Cost{{ hosting.droplet_count ? ` · ${hosting.droplet_count} droplet${hosting.droplet_count === 1 ? '' : 's'}` : '' }}</span>
            <span class="tabular-nums text-default">{{ formatMoney(hosting.monthly_cost ?? 0) }}</span>
          </div>
          <div class="my-3 border-t border-default" />
          <div class="flex items-center justify-between">
            <span class="text-[13px] text-muted">Margin</span>
            <span
              class="text-[15px] font-bold tabular-nums"
              :class="(hosting.margin ?? 0) >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatMoney(hosting.margin ?? 0) }}<span
                v-if="hosting.margin_pct != null"
                class="ml-1 text-[12px] font-semibold text-muted"
              >({{ hosting.margin_pct }}%)</span>
            </span>
          </div>
        </template>
      </div>
    </div>

    <InvoiceDrawer
      v-model:invoice-id="openInvoiceId"
      @changed="loadInvoices"
    />
  </div>
</template>
