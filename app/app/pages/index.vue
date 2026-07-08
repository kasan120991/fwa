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
type PStatus = 'planning' | 'in_progress' | 'in_review' | 'on_hold' | 'completed'
interface ApiProject { id: number, name: string, status: PStatus, project_fee: number | null, client_company: string | null, client_name: string | null }
interface DueTask { id: number, title: string, status: string, project_id: number | null, project_name: string | null }
interface RevenueMonth { label: string, ym: string, total: number, current: boolean }
interface Revenue { months: RevenueMonth[], total: number, delta_pct: number | null, span: number }
type ChipStatus = 'neutral' | 'info' | 'warning' | 'success' | 'error'
interface AttnItem { id: string, title: string, meta: string, icon: string, tone: string, chip: ChipStatus, chipText: string, to: string }
interface Attention { items: AttnItem[], total: number }

const PROJECT_META: Record<PStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  planning: { label: 'Planning', status: 'neutral' },
  in_progress: { label: 'In Progress', status: 'info' },
  in_review: { label: 'In Review', status: 'info' },
  on_hold: { label: 'On Hold', status: 'warning' },
  completed: { label: 'Completed', status: 'success' }
}

const summary = ref<Summary | null>(null)
const activeProjects = ref<ApiProject[]>([])
const dueToday = ref<DueTask[]>([])
const revenue = ref<Revenue | null>(null)
const range = ref<6 | 12>(6) // window length toggle
const hoverIdx = ref<number | null>(null) // hovered bar, drives tooltip + dim
const attention = ref<AttnItem[]>([])
const attentionTotal = ref(0)
// Tallest month drives bar heights; floor at 1 to avoid divide-by-zero when empty.
const revenueMax = computed(() => Math.max(1, ...(revenue.value?.months.map(m => m.total) ?? [0])))

const compactMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : formatMoney(n))
const clientName = (p: ApiProject) => p.client_company || p.client_name || 'Unknown'

async function loadSummary() {
  const { data } = await api<{ data: Summary }>('/dashboard/summary')
  summary.value = data
}
async function loadProjects() {
  const { data } = await api<{ data: ApiProject[] }>('/projects', { query: { active: 1, limit: 5 } })
  activeProjects.value = data
}
async function loadDueToday() {
  const { data } = await api<{ data: DueTask[] }>('/tasks', { query: { due: 'today' } })
  dueToday.value = data
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
function onTask() { loadAttention(); loadSummary(); loadDueToday() }
function onCall() { loadAttention() }
function onProject() { loadSummary(); loadProjects() }
function onTicket() { loadAttention() }
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
  ['ticket:deleted', onTicket]
]

onMounted(() => {
  loadSummary()
  loadProjects()
  loadDueToday()
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
  await Promise.all([loadDueToday(), loadSummary()])
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
              <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                Revenue collected
              </div>
              <div class="flex items-baseline gap-2.5">
                <span class="font-display text-[30px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ revenue ? compactMoney(revenue.total) : '—' }}</span>
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
                <span class="size-[9px] rounded-[2px] bg-teal-600" />This month (to date)
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
                class="pointer-events-none absolute left-1/2 top-0 z-10 -mt-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-inverted px-2.5 py-1.5 text-center shadow-lg"
              >
                <div class="text-[13px] font-semibold text-white tabular-nums">
                  {{ formatMoney(bar.total) }}
                </div>
                <div class="font-mono text-[10px] uppercase tracking-[0.04em] text-white/60">
                  {{ bar.label }}{{ bar.current ? ' · to date' : '' }}
                </div>
              </div>
              <div
                class="w-full max-w-[44px] rounded-t-[7px] transition-[height,opacity] duration-300"
                :class="[bar.current ? 'bg-teal-600' : 'bg-teal-400', hoverIdx !== null && hoverIdx !== i ? 'opacity-40' : 'opacity-100']"
                :style="{ height: (bar.total / revenueMax * 100) + '%' }"
              />
              <span
                class="font-mono text-[11px]"
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
          <table
            v-if="activeProjects.length"
            class="w-full border-collapse"
          >
            <thead>
              <tr>
                <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Project
                </th>
                <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Status
                </th>
                <th class="px-[22px] py-[11px] text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
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
          <div
            v-else
            class="px-[22px] py-12 text-center text-sm text-muted"
          >
            No active projects.
          </div>
        </div>
      </div>

      <!-- RIGHT: needs attention + due today -->
      <div class="flex min-w-0 flex-col gap-5">
        <!-- needs attention (live: overdue invoices, agreements, tasks, follow-ups, calls) -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Needs Attention
            </h2>
            <span
              class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-[7px] text-xs font-bold tabular-nums"
              :class="attentionTotal > 0 ? 'bg-error/10 text-error' : 'bg-mist text-teal-700'"
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

        <!-- due today (wired) -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Due Today
            </h2>
            <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-mist px-[7px] text-xs font-bold text-teal-700 tabular-nums">{{ dueToday.length }}</span>
          </div>
          <div
            v-if="dueToday.length"
            class="flex flex-col"
          >
            <div
              v-for="(t, i) in dueToday"
              :key="t.id"
              class="flex items-center gap-3 px-5 py-3.5"
              :class="i < dueToday.length - 1 ? 'border-b border-default' : ''"
            >
              <button
                type="button"
                class="flex size-[18px] flex-none items-center justify-center rounded-full border border-accented transition-colors hover:border-primary"
                aria-label="Mark done"
                @click="toggleTask(t)"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-highlighted">
                  {{ t.title }}
                </div>
                <NuxtLink
                  v-if="t.project_id"
                  :to="`/projects/${t.project_id}`"
                  class="text-[12.5px] font-medium text-teal-700 hover:opacity-80"
                >{{ t.project_name }}</NuxtLink>
                <span
                  v-else
                  class="text-[12.5px] text-muted"
                >Standalone</span>
              </div>
            </div>
          </div>
          <div
            v-else
            class="flex flex-col items-center px-5 py-10 text-center"
          >
            <span class="mb-2.5 inline-flex size-10 items-center justify-center rounded-[11px] bg-mist text-teal-700"><UIcon
              name="i-lucide-check-check"
              class="size-5"
            /></span>
            <p class="text-sm text-muted">
              Nothing due today.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
