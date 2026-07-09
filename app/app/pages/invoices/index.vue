<script setup lang="ts">
useHead({ title: 'Invoices · Francis Web Agency' })

// Invoices — local records synced from Stripe. List + detail drawer with
// create/send, record-payment, and void actions. Live via invoice:* sockets.
type Status = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
interface Invoice {
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
  created_at: string
  is_overdue: boolean
  client_id: number
  client_name: string | null
  client_company: string | null
}
const api = useApi()
const socket = useSocket()
const toast = useToast()

const STATUS_META: Record<Status, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
function chip(inv: { status: Status, is_overdue: boolean }) {
  if (inv.is_overdue) return { label: 'Overdue', status: 'warning' as const }
  return STATUS_META[inv.status]
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']
const clientName = (i: { client_company: string | null, client_name: string | null }) => i.client_company || i.client_name || 'Unknown'

const invoices = ref<Invoice[]>([])
const stats = ref<{ outstanding: number, paid_30d: number, overdue_count: number }>({ outstanding: 0, paid_30d: 0, overdue_count: 0 })
const pending = ref(true)

async function loadStats() {
  const { data } = await api<{ data: typeof stats.value }>('/invoices/stats')
  stats.value = data
}
async function load() {
  try {
    const { data } = await api<{ data: Invoice[] }>('/invoices')
    invoices.value = data
  } catch {
    toast.add({ title: 'Could not load invoices', color: 'error' })
  } finally {
    pending.value = false
  }
}
function refresh() {
  load()
  loadStats()
}

onMounted(() => {
  refresh()
  socket.on('invoice:changed', refresh)
})
onBeforeUnmount(() => socket.off('invoice:changed', refresh))

// ---- filter ----
const tab = ref<'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'void'>('all')
const counts = computed(() => ({
  all: invoices.value.length,
  draft: invoices.value.filter(i => i.status === 'draft').length,
  open: invoices.value.filter(i => i.status === 'open' && !i.is_overdue).length,
  overdue: invoices.value.filter(i => i.is_overdue).length,
  paid: invoices.value.filter(i => i.status === 'paid').length,
  void: invoices.value.filter(i => i.status === 'void' || i.status === 'uncollectible').length
}))
const tabs = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'draft' as const, label: 'Draft', count: counts.value.draft },
  { key: 'open' as const, label: 'Open', count: counts.value.open },
  { key: 'overdue' as const, label: 'Overdue', count: counts.value.overdue },
  { key: 'paid' as const, label: 'Paid', count: counts.value.paid },
  { key: 'void' as const, label: 'Void', count: counts.value.void }
])
const filtered = computed(() => invoices.value.filter((i) => {
  if (tab.value === 'all') return true
  if (tab.value === 'overdue') return i.is_overdue
  if (tab.value === 'open') return i.status === 'open' && !i.is_overdue
  if (tab.value === 'void') return i.status === 'void' || i.status === 'uncollectible'
  return i.status === tab.value
}))

const tiles = computed(() => [
  { key: 'outstanding', label: 'Outstanding', icon: 'i-lucide-hourglass', value: formatMoney(stats.value.outstanding), sub: 'unpaid', apply: () => { tab.value = 'open' } },
  { key: 'paid', label: 'Paid (30d)', icon: 'i-lucide-check-circle-2', value: formatMoney(stats.value.paid_30d), sub: 'last 30 days', apply: () => { tab.value = 'paid' } },
  { key: 'overdue', label: 'Overdue', icon: 'i-lucide-triangle-alert', value: String(stats.value.overdue_count), sub: 'past due', apply: () => { tab.value = 'overdue' } }
])

// ---- detail drawer (shared InvoiceDrawer component, opened by id) ----
const openId = ref<number | null>(null)

// ---- create ----
const formOpen = ref(false)
function onCreated() {
  refresh()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Invoices
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-primary tabular-nums">{{ counts.all }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Bills sent to clients, synced with Stripe. Create, send, and reconcile payments.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        class="flex-none"
        @click="() => { formOpen = true }"
      >
        New Invoice
      </UButton>
    </div>

    <!-- tiles -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border border-default bg-default p-4 text-left transition-colors hover:border-accented"
        @click="t.apply"
      >
        <div class="flex items-center justify-between gap-2.5">
          <span class="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">{{ t.label }}</span>
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-mist text-primary"><UIcon
            :name="t.icon"
            class="size-[15px]"
          /></span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="font-display text-[27px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ t.value }}</span>
          <span class="text-[12.5px] text-muted">{{ t.sub }}</span>
        </div>
      </button>
    </div>

    <!-- status pills -->
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
        :class="tab === t.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span
          class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          :class="tab === t.key ? 'bg-default text-primary' : 'bg-muted text-muted'"
        >{{ t.count }}</span>
      </button>
    </div>

    <!-- table -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div
        v-if="pending"
        class="px-6 py-16 text-center text-sm text-muted"
      >
        Loading invoices…
      </div>
      <template v-else-if="filtered.length > 0">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Invoice
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Status
                </th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Amount
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Due
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Issued
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="i in filtered"
                :key="i.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                @click="openId = i.id"
              >
                <td class="px-4 py-3.5">
                  <div class="text-sm font-semibold text-highlighted">
                    {{ i.number || 'Draft' }}
                  </div>
                  <div class="mt-0.5 max-w-[240px] truncate text-[12.5px] text-muted">
                    {{ i.description || '—' }}
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="inline-flex items-center gap-2.5">
                    <span
                      class="inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold"
                      :class="AVATAR[i.client_id % AVATAR.length]"
                    >{{ initials(clientName(i)) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ clientName(i) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <StatusChip :status="chip(i).status">
                    {{ chip(i).label }}
                  </StatusChip>
                </td>
                <td class="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-highlighted tabular-nums">
                  {{ formatMoney(i.amount_due) }}
                </td>
                <td
                  class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] tabular-nums md:table-cell"
                  :class="i.is_overdue ? 'font-semibold text-warning' : 'text-default'"
                >
                  {{ i.due_date ? shortDate(i.due_date) : '—' }}
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-muted tabular-nums lg:table-cell">
                  {{ i.finalized_at ? shortDate(i.finalized_at) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ invoices.length }} invoices</span>
        </div>
      </template>
      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-receipt-text"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          No Invoices Here
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Nothing matches this filter. Create an invoice or switch filters.
        </p>
      </div>
    </div>

    <!-- invoice detail drawer (shared) -->
    <InvoiceDrawer
      v-model:invoice-id="openId"
      @changed="refresh"
    />


    <InvoiceForm
      v-model:open="formOpen"
      @created="onCreated"
    />
  </div>
</template>
