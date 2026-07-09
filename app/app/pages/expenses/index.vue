<script setup lang="ts">
useHead({ title: 'Expenses · Francis Web Agency' })

// Expenses — money out, across client costs, business overhead, and recurring
// subscriptions. List + create/edit modal. Live via the expense:changed socket.
type Category = 'client' | 'business' | 'subscription'
interface Expense {
  id: number
  category: Category
  client_id: number | null
  client_name: string | null
  client_company: string | null
  vendor: string
  description: string | null
  amount: number
  currency: string
  expense_date: string
  payment_method: string
  billable: boolean
  reimbursed_at: string | null
  receipt_url: string | null
  billing_interval: string | null
  next_renewal_at: string | null
  status: 'active' | 'cancelled'
}
interface Stats {
  this_month: number
  by_category: { client: number, business: number, subscription: number }
  monthly_burn: number
  upcoming_renewals: number
  billable_outstanding: number
}

const api = useApi()
const socket = useSocket()
const toast = useToast()

const CATEGORY_META: Record<Category, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  client: { label: 'Client', status: 'info' },
  business: { label: 'Business', status: 'neutral' },
  subscription: { label: 'Subscription', status: 'success' }
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']
const clientName = (e: Expense) => e.client_company || e.client_name || null

const expenses = ref<Expense[]>([])
const stats = ref<Stats>({ this_month: 0, by_category: { client: 0, business: 0, subscription: 0 }, monthly_burn: 0, upcoming_renewals: 0, billable_outstanding: 0 })
const pending = ref(true)

async function loadStats() {
  const { data } = await api<{ data: Stats }>('/expenses/stats')
  stats.value = data
}
async function load() {
  try {
    const { data } = await api<{ data: Expense[] }>('/expenses')
    expenses.value = data
  } catch {
    toast.add({ title: 'Could not load expenses', color: 'error' })
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
  socket.on('expense:changed', refresh)
})
onBeforeUnmount(() => socket.off('expense:changed', refresh))

// ---- filter ----
const tab = ref<'all' | Category>('all')
const counts = computed(() => ({
  all: expenses.value.length,
  client: expenses.value.filter(e => e.category === 'client').length,
  business: expenses.value.filter(e => e.category === 'business').length,
  subscription: expenses.value.filter(e => e.category === 'subscription').length
}))
const tabs = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'client' as const, label: 'Client', count: counts.value.client },
  { key: 'business' as const, label: 'Business', count: counts.value.business },
  { key: 'subscription' as const, label: 'Subscriptions', count: counts.value.subscription }
])
const filtered = computed(() => expenses.value.filter(e => tab.value === 'all' || e.category === tab.value))

const tiles = computed(() => [
  { key: 'month', label: 'This Month', icon: 'i-lucide-calendar-days', value: formatMoney(stats.value.this_month, { cents: true }), sub: 'spent', apply: () => { tab.value = 'all' } },
  { key: 'burn', label: 'Recurring / mo', icon: 'i-lucide-repeat', value: formatMoney(stats.value.monthly_burn, { cents: true }), sub: 'subscriptions', apply: () => { tab.value = 'subscription' } },
  { key: 'billable', label: 'To Rebill', icon: 'i-lucide-wallet', value: formatMoney(stats.value.billable_outstanding, { cents: true }), sub: 'client costs', apply: () => { tab.value = 'client' } },
  { key: 'renewals', label: 'Renewals (30d)', icon: 'i-lucide-calendar-clock', value: String(stats.value.upcoming_renewals), sub: 'coming up', apply: () => { tab.value = 'subscription' } }
])

// ---- create / edit ----
const formOpen = ref(false)
const editId = ref<number | null>(null)
function openNew() {
  editId.value = null
  formOpen.value = true
}
function openEdit(e: Expense) {
  editId.value = e.id
  formOpen.value = true
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <PageHeader
      icon="i-lucide-wallet"
      title="Expenses"
      :count="counts.all"
      subtitle="What the agency spends — client costs, overhead, and third-party subscriptions."
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openNew"
        >
          New Expense
        </UButton>
      </template>
    </PageHeader>

    <!-- tiles -->
    <div class="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
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

    <!-- category pills -->
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
        Loading expenses…
      </div>
      <template v-else-if="filtered.length > 0">
        <!-- mobile cards -->
        <ul class="divide-y divide-default sm:hidden">
          <li
            v-for="e in filtered"
            :key="e.id"
            class="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted"
            :class="e.status === 'cancelled' ? 'opacity-60' : ''"
            @click="openEdit(e)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
                <span class="truncate">{{ e.vendor }}</span>
                <UIcon v-if="e.receipt_url" name="i-lucide-paperclip" class="size-3.5 flex-none text-muted" />
              </div>
              <div class="truncate text-[12.5px] text-muted">{{ clientName(e) || e.description || '—' }}</div>
            </div>
            <div class="flex flex-none flex-col items-end gap-1">
              <span class="text-sm font-semibold text-highlighted tabular-nums">
                {{ formatMoney(e.amount, { cents: true }) }}<span v-if="e.category === 'subscription'" class="ml-0.5 text-[11px] font-normal text-muted">/{{ e.billing_interval === 'yearly' ? 'yr' : 'mo' }}</span>
              </span>
              <StatusChip :status="CATEGORY_META[e.category].status">{{ CATEGORY_META[e.category].label }}</StatusChip>
            </div>
          </li>
        </ul>

        <!-- table (sm+) -->
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Vendor
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Type
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Client
                </th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Amount
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in filtered"
                :key="e.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                :class="e.status === 'cancelled' ? 'opacity-60' : ''"
                @click="openEdit(e)"
              >
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
                    {{ e.vendor }}
                    <UIcon
                      v-if="e.receipt_url"
                      name="i-lucide-paperclip"
                      class="size-3.5 text-muted"
                    />
                  </div>
                  <div class="mt-0.5 max-w-[240px] truncate text-[12.5px] text-muted">
                    {{ e.description || '—' }}
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-2">
                    <StatusChip :status="CATEGORY_META[e.category].status">
                      {{ CATEGORY_META[e.category].label }}
                    </StatusChip>
                    <StatusChip
                      v-if="e.category === 'subscription' && e.status === 'cancelled'"
                      status="neutral"
                    >
                      Cancelled
                    </StatusChip>
                    <StatusChip
                      v-else-if="e.category === 'client' && e.billable"
                      :status="e.reimbursed_at ? 'success' : 'warning'"
                    >
                      {{ e.reimbursed_at ? 'Rebilled' : 'Billable' }}
                    </StatusChip>
                  </div>
                </td>
                <td class="hidden px-4 py-3.5 md:table-cell">
                  <div
                    v-if="clientName(e)"
                    class="inline-flex items-center gap-2.5"
                  >
                    <span
                      class="inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold"
                      :class="AVATAR[(e.client_id || 0) % AVATAR.length]"
                    >{{ initials(clientName(e) as string) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ clientName(e) }}</span>
                  </div>
                  <span
                    v-else
                    class="text-[13.5px] text-muted"
                  >—</span>
                </td>
                <td class="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-highlighted tabular-nums">
                  {{ formatMoney(e.amount, { cents: true }) }}
                  <span
                    v-if="e.category === 'subscription'"
                    class="ml-0.5 text-[11px] font-normal text-muted"
                  >/{{ e.billing_interval === 'yearly' ? 'yr' : 'mo' }}</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-muted tabular-nums lg:table-cell">
                  <template v-if="e.category === 'subscription' && e.next_renewal_at">
                    renews {{ shortDate(e.next_renewal_at) }}
                  </template>
                  <template v-else>
                    {{ shortDate(e.expense_date) }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ expenses.length }} expenses</span>
        </div>
      </template>
      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-wallet"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          No Expenses Here
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Nothing matches this filter. Record an expense or switch filters.
        </p>
      </div>
    </div>

    <ExpenseForm
      v-model:open="formOpen"
      :expense-id="editId"
      @saved="refresh"
    />
  </div>
</template>
