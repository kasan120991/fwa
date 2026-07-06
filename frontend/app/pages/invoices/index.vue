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
  contact_id: number
  contact_name: string | null
  contact_company: string | null
}
interface LineItem { id: number, name_snapshot: string, unit_price_snapshot: number, qty: number, line_total: number }
interface Payment { id: number, amount: number, method: string, note: string | null, paid_at: string | null }
interface InvoiceDetail extends Invoice { contact_email: string | null, items: LineItem[], payments: Payment[] }

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
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']
const clientName = (i: { contact_company: string | null, contact_name: string | null }) => i.contact_company || i.contact_name || 'Unknown'

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

// ---- detail drawer ----
const openId = ref<number | null>(null)
const detail = ref<InvoiceDetail | null>(null)
const detailLoading = ref(false)
const drawerOpen = computed({
  get: () => openId.value != null,
  set: (v) => {
    if (!v) openId.value = null
  }
})
watch(openId, async (id) => {
  if (id == null) {
    detail.value = null
    return
  }
  detailLoading.value = true
  try {
    const { data } = await api<{ data: InvoiceDetail }>(`/invoices/${id}`)
    detail.value = data
  } finally {
    detailLoading.value = false
  }
})

async function voidInvoice(id: number) {
  try {
    await api(`/invoices/${id}/void`, { method: 'POST' })
    toast.add({ title: 'Invoice voided', color: 'success' })
    refresh()
    if (openId.value === id) {
      const { data } = await api<{ data: InvoiceDetail }>(`/invoices/${id}`)
      detail.value = data
    }
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not void invoice', description: e?.data?.error?.message, color: 'error' })
  }
}
function copyLink(url: string) {
  navigator.clipboard?.writeText(url)
  toast.add({ title: 'Invoice link copied', color: 'success' })
}

// ---- record payment modal ----
const payOpen = ref(false)
const payAmount = ref<number | null>(null)
const payMethod = ref('manual')
const payNote = ref('')
const paying = ref(false)
const METHOD_ITEMS = [
  { label: 'Manual / offline', value: 'manual' },
  { label: 'Card', value: 'card' },
  { label: 'Bank transfer', value: 'bank' },
  { label: 'Other', value: 'other' }
]
function openPay() {
  if (!detail.value) return
  payAmount.value = Math.round((detail.value.amount_due - detail.value.amount_paid) * 100) / 100
  payMethod.value = 'manual'
  payNote.value = ''
  payOpen.value = true
}
async function submitPay() {
  if (!detail.value || paying.value) return
  paying.value = true
  try {
    await api(`/invoices/${detail.value.id}/pay`, { method: 'POST', body: { amount: payAmount.value, method: payMethod.value, note: payNote.value || undefined } })
    toast.add({ title: 'Payment recorded', color: 'success' })
    payOpen.value = false
    const id = detail.value.id
    refresh()
    const { data } = await api<{ data: InvoiceDetail }>(`/invoices/${id}`)
    detail.value = data
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not record payment', description: e?.data?.error?.message, color: 'error' })
  } finally {
    paying.value = false
  }
}

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
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ counts.all }}</span>
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
        New invoice
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
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-mist text-teal-700"><UIcon
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
        :class="tab === t.key ? 'border-teal-600 bg-mist font-semibold text-teal-700' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span
          class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          :class="tab === t.key ? 'bg-default text-teal-700' : 'bg-muted text-muted'"
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
                      :class="AVATAR[i.contact_id % AVATAR.length]"
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
          No invoices here
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Nothing matches this filter. Create an invoice or switch filters.
        </p>
      </div>
    </div>

    <!-- detail drawer -->
    <USlideover
      v-model:open="drawerOpen"
      :ui="{ content: 'w-[480px] max-w-[94vw]' }"
    >
      <template #content>
        <div
          v-if="detail"
          class="flex h-full flex-col"
        >
          <!-- header -->
          <div class="flex-none border-b border-default px-6 py-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[17px] font-semibold leading-tight text-highlighted">
                  {{ detail.number || 'Draft invoice' }}
                </div>
                <NuxtLink
                  :to="`/clients/${detail.contact_id}`"
                  class="mt-1.5 inline-flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <span
                    class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[9.5px] font-semibold"
                    :class="AVATAR[detail.contact_id % AVATAR.length]"
                  >{{ initials(clientName(detail)) }}</span>
                  <span class="text-[13px] font-medium text-teal-700">{{ clientName(detail) }}</span>
                </NuxtLink>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="outline"
                square
                size="sm"
                aria-label="Close"
                @click="() => { openId = null }"
              />
            </div>
            <div class="mt-3.5 flex flex-wrap items-center gap-2">
              <StatusChip :status="chip(detail).status">
                {{ chip(detail).label }}
              </StatusChip>
              <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted">{{ detail.kind }}</span>
            </div>
            <div class="mt-3.5 flex items-baseline gap-2">
              <span class="font-display text-[26px] font-medium tracking-tight text-highlighted tabular-nums">{{ formatMoney(detail.amount_due) }}</span>
              <span class="text-[13px] text-muted">{{ detail.amount_paid > 0 ? `${formatMoney(detail.amount_paid)} paid` : 'due' }}</span>
            </div>
          </div>

          <!-- body -->
          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Line items
            </div>
            <div class="mb-6 overflow-hidden rounded-xl ring-1 ring-default">
              <div
                v-for="li in detail.items"
                :key="li.id"
                class="flex items-center justify-between gap-3.5 border-b border-default px-3.5 py-3 last:border-b-0"
              >
                <div class="min-w-0">
                  <div class="truncate text-[13.5px] font-medium text-highlighted">
                    {{ li.name_snapshot }}
                  </div>
                  <div class="mt-0.5 text-xs text-muted tabular-nums">
                    {{ li.qty }} × {{ formatMoney(li.unit_price_snapshot) }}
                  </div>
                </div>
                <span class="whitespace-nowrap text-[13.5px] font-semibold text-highlighted tabular-nums">{{ formatMoney(li.line_total) }}</span>
              </div>
              <div class="flex items-center justify-between bg-muted px-3.5 py-3">
                <span class="text-[13px] font-semibold text-highlighted">Total</span>
                <span class="text-[15px] font-bold text-highlighted tabular-nums">{{ formatMoney(detail.amount_due) }}</span>
              </div>
            </div>

            <div
              v-if="detail.payments.length"
              class="mb-6"
            >
              <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
                Payments
              </div>
              <div class="flex flex-col gap-2">
                <div
                  v-for="p in detail.payments"
                  :key="p.id"
                  class="flex items-center justify-between rounded-lg bg-muted px-3.5 py-2.5"
                >
                  <span class="inline-flex items-center gap-2 text-[13px] text-default">
                    <UIcon
                      name="i-lucide-check-circle-2"
                      class="size-4 text-success"
                    />
                    <span class="capitalize">{{ p.method }}</span>
                    <span
                      v-if="p.note"
                      class="text-muted"
                    >· {{ p.note }}</span>
                  </span>
                  <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ formatMoney(p.amount) }}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2 text-[13px]">
              <div class="flex justify-between">
                <span class="text-muted">Due date</span><span class="text-default tabular-nums">{{ detail.due_date ? shortDate(detail.due_date) : '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Issued</span><span class="text-default tabular-nums">{{ detail.finalized_at ? shortDate(detail.finalized_at) : '—' }}</span>
              </div>
              <div
                v-if="detail.paid_at"
                class="flex justify-between"
              >
                <span class="text-muted">Paid</span><span class="text-default tabular-nums">{{ shortDate(detail.paid_at) }}</span>
              </div>
            </div>
          </div>

          <!-- footer actions -->
          <div class="flex-none border-t border-default px-6 py-4">
            <div class="flex flex-wrap items-center justify-end gap-2.5">
              <UButton
                v-if="detail.hosted_invoice_url"
                color="neutral"
                variant="outline"
                class="rounded-full"
                icon="i-lucide-link"
                @click="copyLink(detail.hosted_invoice_url!)"
              >
                Copy link
              </UButton>
              <UButton
                v-if="detail.hosted_invoice_url"
                :to="detail.hosted_invoice_url"
                target="_blank"
                color="neutral"
                variant="outline"
                class="rounded-full"
                icon="i-lucide-external-link"
              >
                View
              </UButton>
              <UButton
                v-if="detail.status === 'open' || detail.status === 'draft'"
                color="neutral"
                variant="outline"
                class="rounded-full"
                icon="i-lucide-ban"
                @click="voidInvoice(detail.id)"
              >
                Void
              </UButton>
              <UButton
                v-if="detail.status === 'open'"
                color="primary"
                class="rounded-full"
                icon="i-lucide-hand-coins"
                @click="openPay"
              >
                Record payment
              </UButton>
            </div>
          </div>
        </div>
        <div
          v-else
          class="flex h-full items-center justify-center text-sm text-muted"
        >
          {{ detailLoading ? 'Loading…' : 'Select an invoice' }}
        </div>
      </template>
    </USlideover>

    <!-- record payment modal -->
    <UModal
      v-model:open="payOpen"
      title="Record payment"
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
          <UFormField label="Note (optional)">
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
            class="rounded-full"
            @click="() => { payOpen = false }"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            class="rounded-full"
            :loading="paying"
            @click="submitPay"
          >
            Record payment
          </UButton>
        </div>
      </template>
    </UModal>

    <InvoiceForm
      v-model:open="formOpen"
      @created="onCreated"
    />
  </div>
</template>
