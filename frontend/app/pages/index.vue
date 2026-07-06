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
interface ApiProject { id: number, name: string, status: PStatus, project_fee: number | null, contact_company: string | null, contact_name: string | null }
interface DueTask { id: number, title: string, status: string, project_id: number | null, project_name: string | null }

const PROJECT_META: Record<PStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  planning: { label: 'Planning', status: 'neutral' },
  in_progress: { label: 'In progress', status: 'info' },
  in_review: { label: 'In review', status: 'info' },
  on_hold: { label: 'On hold', status: 'warning' },
  completed: { label: 'Completed', status: 'success' }
}

const summary = ref<Summary | null>(null)
const activeProjects = ref<ApiProject[]>([])
const dueToday = ref<DueTask[]>([])

const compactMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : formatMoney(n))
const clientName = (p: ApiProject) => p.contact_company || p.contact_name || 'Unknown'

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

onMounted(() => {
  loadSummary()
  loadProjects()
  loadDueToday()
})

const cards = computed(() => {
  const s = summary.value
  return [
    { label: 'Active clients', value: s ? String(s.active_clients) : '—', delta: s && s.new_clients_30d > 0 ? `+${s.new_clients_30d}` : null, tone: 'success' as const },
    { label: 'Active projects', value: s ? String(s.active_projects) : '—', delta: s && s.new_projects_30d > 0 ? `+${s.new_projects_30d}` : null, tone: 'success' as const },
    { label: 'Open tasks', value: s ? String(s.open_tasks) : '—', delta: s && s.tasks_due_today > 0 ? `${s.tasks_due_today} due today` : null, tone: 'muted' as const },
    { label: 'Outstanding invoices', value: s ? compactMoney(s.outstanding) : '—', delta: s && s.unpaid_count > 0 ? `${s.unpaid_count} unpaid` : null, tone: 'muted' as const }
  ]
})

async function toggleTask(t: DueTask) {
  await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'todo' : 'done' } })
  await Promise.all([loadDueToday(), loadSummary()])
}

// ---- mock (wired in a later phase) ----
const revenueBars = [
  { month: 'Jan', pct: 52, current: false },
  { month: 'Feb', pct: 61, current: false },
  { month: 'Mar', pct: 50, current: false },
  { month: 'Apr', pct: 72, current: false },
  { month: 'May', pct: 80, current: false },
  { month: 'Jun', pct: 95, current: true }
]
const attention = [
  { title: 'Mintleaf invoice overdue', meta: '$7,200 · 6 days past due', icon: 'i-lucide-triangle-alert', tone: 'error', chip: 'error', chipText: 'Overdue' },
  { title: 'Harborview review due', meta: 'Design review · today', icon: 'i-lucide-clock', tone: 'warning', chip: 'warning', chipText: 'Today' },
  { title: 'Parcel proposal unsigned', meta: '$14,000 · sent 3 days ago', icon: 'i-lucide-file-text', tone: 'info', chip: 'info', chipText: 'Awaiting' },
  { title: '3 tasks due this week', meta: 'Across 2 projects', icon: 'i-lucide-list-checks', tone: 'neutral', chip: 'neutral', chipText: '3 open' }
] as const
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
        <!-- revenue snapshot (mock) -->
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-[22px] flex items-end justify-between gap-4">
            <div>
              <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                Revenue booked
              </div>
              <div class="flex items-baseline gap-2.5">
                <span class="font-display text-[30px] font-medium leading-none tracking-tight text-highlighted tabular-nums">$210k</span>
                <span class="text-[13px] font-semibold text-success">+12%</span>
              </div>
              <div class="mt-1.5 text-[13px] text-muted">
                Last 6 months · vs. prior period
              </div>
            </div>
            <div class="hidden items-center gap-3.5 sm:flex">
              <span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="size-[9px] rounded-[2px] bg-teal-400" />Booked</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="size-[9px] rounded-[2px] bg-teal-600" />This month</span>
            </div>
          </div>
          <div class="flex h-[172px] items-end gap-4">
            <div
              v-for="bar in revenueBars"
              :key="bar.month"
              class="flex h-full flex-1 flex-col items-center justify-end gap-2.5"
            >
              <div
                class="w-full max-w-[44px] rounded-t-[7px]"
                :class="bar.current ? 'bg-teal-600' : 'bg-teal-400'"
                :style="{ height: bar.pct + '%' }"
              />
              <span
                class="font-mono text-[11px]"
                :class="bar.current ? 'font-semibold text-highlighted' : 'text-muted'"
              >{{ bar.month }}</span>
            </div>
          </div>
        </div>

        <!-- active projects table -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-[22px] py-[18px]">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                Active projects
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
        <!-- needs attention (mock) -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Needs attention
            </h2>
            <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-error/10 px-[7px] text-xs font-bold text-error">4</span>
          </div>
          <div class="flex flex-col">
            <div
              v-for="(item, i) in attention"
              :key="item.title"
              class="flex items-start gap-3 px-5 py-3.5"
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
                <div class="text-sm font-semibold leading-tight text-highlighted">
                  {{ item.title }}
                </div>
                <div class="mt-0.5 text-[13px] text-muted tabular-nums">
                  {{ item.meta }}
                </div>
              </div>
              <StatusChip :status="item.chip">
                {{ item.chipText }}
              </StatusChip>
            </div>
          </div>
        </div>

        <!-- due today (wired) -->
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
            <h2 class="text-base font-semibold text-highlighted">
              Due today
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
