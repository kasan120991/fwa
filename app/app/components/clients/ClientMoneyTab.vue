<script setup lang="ts">
// Client detail › Sales & Billing — invoices, agreements (one row per deal: the proposal +
// contracts via the merged view), and the hosting-margin card.
import { INV_STATUS, type InvStatus, type ChipStatus } from '~/utils/clientDetail'
import { type ApiDeal, stageOf, chipFor, nextFor, whenFor } from '~/utils/deals'

const props = defineProps<{ clientId: number }>()
const emit = defineEmits<{ 'new-invoice': [], 'new-care-plan': [] }>()

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

// ---- agreements: one row per deal, the Sales page's shape ----
// Care plans have their own card below, so they're left out of this list.
interface DealRow { key: string, title: string, code: string | null, chip: { label: string, status: ChipStatus }, next: string, when: string, value: string, to: string, projectCode: string | null }

function mapDeal(d: ApiDeal): DealRow {
  const stage = stageOf(d)
  const contractSide = !!d.contract_id && (stage === 'accepted' || stage === 'contract' || stage === 'signed')
  return {
    key: `${d.kind}-${d.proposal_id ?? d.contract_id}`,
    title: d.title,
    code: d.code,
    chip: chipFor(d, stage),
    next: nextFor(d, stage).text,
    when: whenFor(d, stage),
    value: formatMoney(d.total),
    to: contractSide ? `/contracts/${d.contract_id}` : `/proposals/${d.proposal_id}`,
    projectCode: d.project_code
  }
}

const agreements = ref<DealRow[]>([])
const agreementsPending = ref(true)
async function loadAgreements() {
  try {
    const { data } = await api<{ data: ApiDeal[] }>('/agreements/deals', { query: { client_id: props.clientId } })
    agreements.value = data.filter(d => d.kind === 'deal').map(mapDeal)
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
  socket.on('project:created', onAgreementChanged)
  socket.on('care-plan:changed', loadHosting)
})
onBeforeUnmount(() => {
  socket.off('invoice:changed', onInvoiceChanged)
  socket.off('payment:created', onInvoiceChanged)
  socket.off('contract:changed', onAgreementChanged)
  socket.off('proposal:changed', onAgreementChanged)
  socket.off('project:created', onAgreementChanged)
  socket.off('care-plan:changed', loadHosting)
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
          color="neutral"
          variant="outline"
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
          <span class="mb-3 inline-flex size-11 items-center justify-center rounded-card bg-muted text-muted"><UIcon
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
                <th class="px-4 py-3 text-left eyebrow">
                  Invoice
                </th>
                <th class="px-4 py-3 text-left eyebrow">
                  Issued
                </th>
                <th class="px-4 py-3 text-left eyebrow">
                  Due
                </th>
                <th class="px-4 py-3 text-right eyebrow">
                  Amount
                </th>
                <th class="px-4 py-3 text-right eyebrow">
                  Balance
                </th>
                <th class="px-4 py-3 text-left eyebrow">
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

    <!-- agreements -->
    <div>
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between px-6 py-5">
          <span class="text-[15px] font-semibold text-highlighted">Agreements <span class="ml-1 text-[12.5px] font-normal text-muted">{{ agreements.length }} {{ agreements.length === 1 ? 'deal' : 'deals' }}</span></span>
          <NuxtLink
            to="/sales"
            class="text-[13px] font-semibold text-primary"
          >
            Open in Sales →
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
          No proposals yet for this client.
        </div>
        <template v-else>
          <NuxtLink
            v-for="c in agreements"
            :key="c.key"
            :to="c.to"
            class="flex items-center gap-4 border-t border-default px-6 py-3.5 transition-colors hover:bg-muted"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold text-highlighted">{{ c.title }}</span>
                <span
                  v-if="c.projectCode"
                  class="rounded-chip bg-muted px-1.5 py-px text-[11px] font-semibold text-muted tabular-nums"
                >{{ c.projectCode }}</span>
              </div>
              <div class="mt-0.5 truncate text-[12.5px] text-muted">
                <span
                  v-if="c.code"
                  class="tabular-nums"
                >{{ c.code }} · </span>{{ c.when }} · {{ c.next }}
              </div>
            </div>
            <StatusChip :status="c.chip.status">
              {{ c.chip.label }}
            </StatusChip>
            <span class="w-20 text-right text-sm font-semibold text-highlighted tabular-nums">{{ c.value }}</span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 flex-none text-muted"
            />
          </NuxtLink>
        </template>
      </div>
    </div>

    <!-- care plan -->
    <ClientsClientCarePlanCard
      :client-id="clientId"
      @new="emit('new-care-plan')"
    />

    <!-- hosting margin -->
    <div class="rounded-card bg-default ring ring-default">
      <div class="flex items-center justify-between px-6 py-5">
        <span class="text-[15px] font-semibold text-highlighted">Hosting Margin</span>
        <span class="eyebrow">Monthly</span>
      </div>
      <p
        v-if="!hosting"
        class="border-t border-default px-6 py-5 text-[13px] text-muted"
      >
        Loading…
      </p>
      <p
        v-else-if="!hosting.configured"
        class="border-t border-default px-6 py-5 text-[13px] text-muted"
      >
        Connect DigitalOcean to see hosting cost.
      </p>
      <p
        v-else-if="hosting.error"
        class="border-t border-default px-6 py-5 text-[13px] text-muted"
      >
        Couldn't load hosting cost.
      </p>
      <div
        v-else
        class="grid grid-cols-1 gap-px border-t border-default bg-[var(--ui-border)] sm:grid-cols-3"
      >
        <div class="flex flex-col gap-2 bg-default px-6 py-[18px]">
          <div class="eyebrow">
            Care Plan MRR
          </div>
          <span class="text-[22px] font-bold leading-none tracking-tight text-highlighted tabular-nums">{{ formatMoney(hosting.mrr ?? 0) }}</span>
        </div>
        <div class="flex flex-col gap-2 bg-default px-6 py-[18px]">
          <div class="eyebrow">
            Hosting Cost{{ hosting.droplet_count ? ` · ${hosting.droplet_count} droplet${hosting.droplet_count === 1 ? '' : 's'}` : '' }}
          </div>
          <span class="text-[22px] font-bold leading-none tracking-tight text-highlighted tabular-nums">{{ formatMoney(hosting.monthly_cost ?? 0) }}</span>
        </div>
        <div class="flex flex-col gap-2 bg-default px-6 py-[18px]">
          <div class="eyebrow">
            Margin
          </div>
          <span
            class="text-[22px] font-bold leading-none tracking-tight tabular-nums"
            :class="(hosting.margin ?? 0) >= 0 ? 'text-success' : 'text-error'"
          >{{ formatMoney(hosting.margin ?? 0) }}<span
            v-if="hosting.margin_pct != null"
            class="ml-1.5 text-[12px] font-semibold text-muted"
          >({{ hosting.margin_pct }}%)</span></span>
        </div>
      </div>
    </div>

    <InvoiceDrawer
      v-model:invoice-id="openInvoiceId"
      @changed="loadInvoices"
    />
  </div>
</template>
