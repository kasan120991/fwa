<script setup lang="ts">
useHead({ title: 'Dashboard · Francis Web Agency' })

const api = useApi()

// ---- live data ----
interface Summary {
  active_clients: number
  new_clients_30d: number
  active_projects: number
  new_projects_30d: number
  open_tasks: number
  tasks_due_today: number
  outstanding: number
  unpaid_count: number
}
type PStatus = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'
interface ApiProject { id: number, name: string, status: PStatus, project_fee: number | null, client_company: string | null, client_name: string | null }
interface DueTask { id: number, title: string, status: string, due_date: string, project_id: number | null, project_name: string | null }
interface RevenueMonth { label: string, ym: string, total: number, current: boolean }
interface Revenue { months: RevenueMonth[], total: number, delta_pct: number | null, span: number }
type ChipStatus = 'neutral' | 'info' | 'warning' | 'success' | 'error'
interface AttnItem { id: string, title: string, meta: string, icon: string, tone: string, chip: ChipStatus, chipText: string, to: string }
interface Attention { items: AttnItem[], total: number }

const PROJECT_META: Record<PStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  planning: { label: 'Planning', status: 'neutral' },
  awaiting_signature: { label: 'Awaiting Signature', status: 'info' },
  awaiting_deposit: { label: 'Awaiting Deposit', status: 'warning' },
  in_progress: { label: 'In Progress', status: 'info' },
  in_review: { label: 'In Review', status: 'info' },
  awaiting_final: { label: 'Awaiting Final Payment', status: 'warning' },
  on_hold: { label: 'On Hold', status: 'warning' },
  completed: { label: 'Completed', status: 'success' }
}

const summary = ref<Summary | null>(null)
const activeProjects = ref<ApiProject[]>([])
const dueTasks = ref<DueTask[]>([])
const revenue = ref<Revenue | null>(null)
const range = ref<6 | 12>(6) // window length toggle
const hoverIdx = ref<number | null>(null) // hovered bar, drives tooltip + dim
const attention = ref<AttnItem[]>([])
const attentionTotal = ref(0)
// Tallest month drives bar heights; floor at 1 to avoid divide-by-zero when empty.
const revenueMax = computed(() => Math.max(1, ...(revenue.value?.months.map(m => m.total) ?? [0])))

const compactMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : formatMoney(n))
const clientName = (p: ApiProject) => p.client_company || p.client_name || 'Unknown'

// ---- greeting header ----
const { user } = useAuth()
const { open: openQuickCreate } = useQuickCreate()

// Four periods, incl. a late-night branch (12am–5am).
const period = computed<'night' | 'morning' | 'afternoon' | 'evening'>(() => {
  const h = new Date().getHours()
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
})
const greeting = computed(() => ({ night: 'Working late', morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[period.value]))
const timeIcon = computed(() => ({ night: 'i-lucide-moon', morning: 'i-lucide-sunrise', afternoon: 'i-lucide-sun', evening: 'i-lucide-sunset' }[period.value]))
const firstName = computed(() => user.value?.name?.trim().split(/\s+/)[0] || '')
const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

// Live status from data the dashboard already loads.
const statusLine = computed(() => {
  const parts: string[] = []
  const a = attentionTotal.value
  const t = summary.value?.tasks_due_today ?? 0
  if (a) parts.push(`${a} item${a === 1 ? '' : 's'} need${a === 1 ? 's' : ''} your attention`)
  if (t) parts.push(`${t} task${t === 1 ? '' : 's'} due today`)
  return parts.length ? parts.join(' · ') : 'You’re all caught up'
})

const createItems = [[
  { label: 'New Lead', icon: 'i-lucide-user-plus', onSelect: () => navigateTo('/leads/new') },
  { label: 'New Client', icon: 'i-lucide-building-2', onSelect: () => navigateTo('/clients/new') },
  { label: 'New Project', icon: 'i-lucide-folder-plus', onSelect: () => openQuickCreate('project') },
  { label: 'New Ticket', icon: 'i-lucide-life-buoy', onSelect: () => openQuickCreate('ticket') },
  { label: 'New Invoice', icon: 'i-lucide-receipt-text', onSelect: () => openQuickCreate('invoice') },
  { label: 'New Expense', icon: 'i-lucide-wallet', onSelect: () => openQuickCreate('expense') }
]]

async function loadSummary() {
  const { data } = await api<{ data: Summary }>('/dashboard/summary')
  summary.value = data
}
async function loadProjects() {
  const { data } = await api<{ data: ApiProject[] }>('/projects', { query: { active: 1, limit: 5 } })
  activeProjects.value = data
}
// Everything whose due date has arrived — late or due today. Needs Attention
// deliberately no longer carries tasks, so this card is their only home.
// Re-sorted most-overdue-first: /tasks orders by `position` (the drag-to-reorder
// sequence project boards rely on), which is arbitrary once dates are mixed.
async function loadDueTasks() {
  const { data } = await api<{ data: DueTask[] }>('/tasks', { query: { due: 'by_today' } })
  dueTasks.value = [...data].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
}
async function loadRevenue() {
  const { data } = await api<{ data: Revenue }>('/dashboard/revenue', { query: { months: range.value } })
  revenue.value = data
}
watch(range, loadRevenue)
async function loadAttention() {
  const { data } = await api<{ data: Attention }>('/dashboard/attention')
  attention.value = data.items
  attentionTotal.value = data.total
}

// Realtime: refetch the affected sections as records change elsewhere in the app.
// Events are the server's Socket.IO emits. (Proposals/contracts and leads have no
// socket events yet, so those attention signals refresh on the next load.)
const socket = useSocket()
function onInvoice() { loadAttention(); loadSummary() }
function onPayment() { loadAttention(); loadSummary(); loadRevenue() }
function onTask() { loadAttention(); loadSummary(); loadDueTasks() }
function onCall() { loadAttention() }
function onProject() { loadSummary(); loadProjects() }
function onTicket() { loadAttention() }
function onExpense() { loadAttention() }
const SOCKET_EVENTS: [string, (...args: unknown[]) => void][] = [
  ['invoice:changed', onInvoice],
  ['payment:created', onPayment],
  ['task:created', onTask],
  ['task:updated', onTask],
  ['task:deleted', onTask],
  ['call:changed', onCall],
  ['call:new', onCall],
  ['project:created', onProject],
  ['project:updated', onProject],
  ['project:deleted', onProject],
  ['ticket:created', onTicket],
  ['ticket:updated', onTicket],
  ['ticket:deleted', onTicket],
  ['expense:changed', onExpense]
]

onMounted(() => {
  loadSummary()
  loadProjects()
  loadDueTasks()
  loadRevenue()
  loadAttention()
  for (const [event, handler] of SOCKET_EVENTS) socket.on(event, handler)
})
onBeforeUnmount(() => {
  for (const [event, handler] of SOCKET_EVENTS) socket.off(event, handler)
})

const cards = computed(() => {
  const s = summary.value
  return [
    { label: 'Active Clients', value: s ? String(s.active_clients) : '—', delta: s && s.new_clients_30d > 0 ? `+${s.new_clients_30d}` : null, tone: 'success' as const },
    { label: 'Active Projects', value: s ? String(s.active_projects) : '—', delta: s && s.new_projects_30d > 0 ? `+${s.new_projects_30d}` : null, tone: 'success' as const },
    { label: 'Open Tasks', value: s ? String(s.open_tasks) : '—', delta: s && s.tasks_due_today > 0 ? `${s.tasks_due_today} due today` : null, tone: 'muted' as const },
    { label: 'Outstanding Invoices', value: s ? compactMoney(s.outstanding) : '—', delta: s && s.unpaid_count > 0 ? `${s.unpaid_count} unpaid` : null, tone: 'muted' as const }
  ]
})

async function toggleTask(t: DueTask) {
  await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'todo' : 'done' } })
  await Promise.all([loadDueTasks(), loadSummary()])
}

// due_date is a date-only 'YYYY-MM-DD' string, so compare it against the local
// date the same way rather than via Date maths — parsing a bare date yields UTC
// midnight, which would report a task due today as a day late west of UTC.
const today = new Date().toLocaleDateString('en-CA')
const daysLate = (due: string) => Math.round((Date.parse(today) - Date.parse(due)) / 86400e3)
const dueMeta = (t: DueTask) => {
  const d = daysLate(t.due_date)
  return `${t.project_name || 'Standalone'} · ${d > 0 ? `${d} ${d === 1 ? 'day' : 'days'} late` : 'due today'}`
}

const attentionTone: Record<string, string> = {
  error: 'bg-error/10 text-error',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  neutral: 'bg-muted text-default'
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- greeting -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span class="inline-flex size-11 flex-none items-center justify-center rounded-[13px] bg-mist text-primary">
          <UIcon
            :name="timeIcon"
            class="size-[22px]"
          />
        </span>
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-semibold tracking-tight text-highlighted">
            {{ greeting }}{{ firstName ? `, ${firstName}` : '' }}
          </h1>
          <p class="mt-1.5 text-sm text-muted">
            {{ dateLine }} · {{ statusLine }}
          </p>
        </div>
      </div>
      <UDropdownMenu
        :items="createItems"
        :content="{ align: 'end' }"
        :ui="{ content: 'w-48' }"
      >
        <UButton
          icon="i-lucide-plus"
          color="primary"
          trailing-icon="i-lucide-chevron-down"
          class="whitespace-nowrap"
        >
          Create
        </UButton>
      </UDropdownMenu>
    </div>

    <!-- KPI row -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        v-for="c in cards"
        :key="c.label"
        :label="c.label"
        :value="c.value"
        :delta="c.delta"
        :delta-tone="c.tone"
      />
    </div>

    <!-- two-column region -->
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
      <!-- LEFT: chart + projects -->
      <div class="flex min-w-0 flex-col gap-5 lg:col-span-2">
        <!-- revenue collected (cash received, from payments) -->
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-[22px] flex items-start justify-between gap-4">
            <div>
              <div class="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Revenue collected
              </div>
              <div class="flex items-baseline gap-2.5">
                <span class="font-display text-[30px] font-semibold leading-none tracking-tight text-highlighted tabular-nums">{{ revenue ? compactMoney(revenue.total) : '—' }}</span>
                <span
                  v-if="revenue && revenue.delta_pct != null"
                  class="text-[13px] font-semibold"
                  :class="revenue.delta_pct >= 0 ? 'text-success' : 'text-muted'"
                >{{ revenue.delta_pct >= 0 ? '+' : '' }}{{ revenue.delta_pct }}%</span>
              </div>
              <div class="mt-1.5 text-[13px] text-muted">
                Last {{ revenue?.span ?? range }} months · vs. prior period
              </div>
            </div>
            <div class="flex flex-col items-end gap-3">
              <!-- range toggle -->
              <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
                <button
                  v-for="r in ([6, 12] as const)"
                  :key="r"
                  class="rounded-lg px-2.5 py-1 text-[12px] transition-colors"
                  :class="range === r ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
                  @click="range = r"
                >{{ r }}M</button>
              </div>
              <span class="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
                <span class="size-[9px] rounded-[2px] bg-citrine" />This month (to date)
              </span>
            </div>
          </div>
          <div
            class="flex h-[172px] items-end"
            :class="range === 12 ? 'gap-2' : 'gap-4'"
          >
            <div
              v-for="(bar, i) in (revenue?.months ?? [])"
              :key="bar.ym"
              class="group relative flex h-full flex-1 flex-col items-center justify-end gap-2.5"
              @mouseenter="hoverIdx = i"
              @mouseleave="hoverIdx = null"
            >
              <!-- hover tooltip -->
              <div
                v-show="hoverIdx === i"
                class="pointer-events-none absolute left-1/2 top-0 z-10 -mt-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-center shadow-lg dark:bg-ink-700"
              >
                <div class="text-[13px] font-semibold text-white tabular-nums">
                  {{ formatMoney(bar.total) }}
                </div>
                <div class="text-[10px] font-medium uppercase tracking-[0.06em] text-white/60">
                  {{ bar.label }}{{ bar.current ? ' · to date' : '' }}
                </div>
              </div>
              <div
                class="w-full max-w-[44px] rounded-t-[7px] transition-[height,opacity] duration-300"
                :class="[bar.current ? 'bg-citrine' : 'bg-primary/25', hoverIdx !== null && hoverIdx !== i ? 'opacity-40' : 'opacity-100']"
                :style="{ height: (bar.total / revenueMax * 100) + '%' }"
              />
              <span
                class="text-[11px]"
                :class="bar.current ? 'font-semibold text-highlighted' : 'text-muted'"
              >{{ bar.label }}</span>
            </div>
          </div>
        </div>

        <!-- active projects table -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-[22px] py-[18px]">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                Active Projects
              </h2>
              <p class="mt-0.5 text-[13px] text-muted">
                {{ summary?.active_projects ?? 0 }} active
              </p>
            </div>
            <NuxtLink
              to="/projects"
              class="text-[13px] font-semibold text-primary"
            >View all</NuxtLink>
          </div>
          <!-- mobile cards -->
          <ul
            v-if="activeProjects.length"
            class="divide-y divide-default sm:hidden"
          >
            <li
              v-for="row in activeProjects"
              :key="row.id"
              class="flex items-center gap-3 px-[18px] py-3 transition-colors active:bg-muted"
              @click="navigateTo(`/projects/${row.id}`)"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-highlighted">{{ row.name }}</div>
                <div class="truncate text-[12.5px] text-muted">{{ clientName(row) }}</div>
              </div>
              <StatusChip :status="PROJECT_META[row.status].status">{{ PROJECT_META[row.status].label }}</StatusChip>
            </li>
          </ul>
          <!-- table (sm+) -->
          <div
            v-if="activeProjects.length"
            class="hidden overflow-x-auto sm:block"
          >
            <table class="w-full border-collapse">
              <thead>
                <tr>
                  <th class="px-[22px] py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Project
                  </th>
                <th class="px-[22px] py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Client
                </th>
                <th class="px-[22px] py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Status
                </th>
                <th class="px-[22px] py-[11px] text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in activeProjects"
                :key="row.id"
                class="cursor-pointer border-t border-default transition-colors hover:bg-muted"
                @click="navigateTo(`/projects/${row.id}`)"
              >
                <td class="px-[22px] py-3.5 text-sm font-semibold text-highlighted">
                  {{ row.name }}
                </td>
                <td class="px-[22px] py-3.5 text-sm text-default">
                  {{ clientName(row) }}
                </td>
                <td class="px-[22px] py-3.5">
                  <StatusChip :status="PROJECT_META[row.status].status">
                    {{ PROJECT_META[row.status].label }}
                  </StatusChip>
                </td>
                <td class="px-[22px] py-3.5 text-right text-sm text-highlighted tabular-nums">
                  {{ row.project_fee != null ? formatMoney(row.project_fee) : '—' }}
                </td>
              </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="!activeProjects.length"
            class="px-[22px] py-12 text-center text-sm text-muted"
          >
            No active projects.
          </div>
        </div>
      </div>

      <!-- RIGHT: needs attention + tasks due -->
      <div class="flex min-w-0 flex-col gap-5">
        <!-- needs attention (live: overdue invoices, agreements, tasks, follow-ups, calls) -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Needs Attention
            </h2>
            <span
              class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-chip px-[7px] text-xs font-bold tabular-nums"
              :class="attentionTotal > 0 ? 'bg-error/10 text-error' : 'bg-mist text-primary'"
            >{{ attentionTotal }}</span>
          </div>
          <div
            v-if="attention.length"
            class="flex flex-col"
          >
            <NuxtLink
              v-for="(item, i) in attention"
              :key="item.id"
              :to="item.to"
              class="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted"
              :class="i < attention.length - 1 ? 'border-b border-default' : ''"
            >
              <span
                class="inline-flex size-8 flex-none items-center justify-center rounded-[9px]"
                :class="attentionTone[item.tone]"
              >
                <UIcon
                  :name="item.icon"
                  class="size-[17px]"
                />
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold leading-tight text-highlighted">
                  {{ item.title }}
                </div>
                <div class="mt-0.5 text-[13px] text-muted tabular-nums">
                  {{ item.meta }}
                </div>
              </div>
              <StatusChip :status="item.chip">
                {{ item.chipText }}
              </StatusChip>
            </NuxtLink>
          </div>
          <div
            v-else
            class="flex flex-col items-center px-5 py-10 text-center"
          >
            <span class="mb-2.5 inline-flex size-10 items-center justify-center rounded-[11px] bg-success/10 text-success"><UIcon
              name="i-lucide-check-check"
              class="size-5"
            /></span>
            <p class="text-sm text-muted">
              You're all caught up.
            </p>
          </div>
        </div>

        <!-- tasks due (wired) — late or due today; the only home for tasks -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Tasks Due
            </h2>
            <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-chip bg-mist px-[7px] text-xs font-bold text-primary tabular-nums">{{ dueTasks.length }}</span>
          </div>
          <div
            v-if="dueTasks.length"
            class="flex flex-col"
          >
            <div
              v-for="(t, i) in dueTasks"
              :key="t.id"
              class="flex items-start gap-3 px-5 py-3.5"
              :class="i < dueTasks.length - 1 ? 'border-b border-default' : ''"
            >
              <button
                type="button"
                class="mt-1 flex size-[18px] flex-none items-center justify-center rounded-full border border-accented transition-colors hover:border-primary"
                :aria-label="`Mark “${t.title}” done`"
                @click="toggleTask(t)"
              />
              <NuxtLink
                :to="t.project_id ? `/projects/${t.project_id}` : '/tasks'"
                class="min-w-0 flex-1"
              >
                <div class="truncate text-sm font-medium text-highlighted">
                  {{ t.title }}
                </div>
                <div class="mt-0.5 truncate text-[13px] text-muted tabular-nums">
                  {{ dueMeta(t) }}
                </div>
              </NuxtLink>
              <StatusChip :status="daysLate(t.due_date) > 0 ? 'warning' : 'info'">
                {{ daysLate(t.due_date) > 0 ? 'Overdue' : 'Today' }}
              </StatusChip>
            </div>
          </div>
          <div
            v-else
            class="flex flex-col items-center px-5 py-10 text-center"
          >
            <span class="mb-2.5 inline-flex size-10 items-center justify-center rounded-[11px] bg-mist text-primary"><UIcon
              name="i-lucide-check-check"
              class="size-5"
            /></span>
            <p class="text-sm text-muted">
              Nothing due right now.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
