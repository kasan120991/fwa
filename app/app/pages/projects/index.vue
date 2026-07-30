<script setup lang="ts">
useHead({ title: 'Projects · Francis Web Agency' })

// Projects — every project across the agency. Each belongs to a client and holds
// its Statement of Work (the project is the hub that originates its contract).
// Backed by the /projects API; each row rolls up its tasks for progress.
type Status = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'

// The list endpoint returns full project rows (SELECT p.*); this declares the
// display fields plus the SOW fields the edit form needs.
interface ApiProject {
  id: number
  code: string | null
  name: string
  status: Status
  project_type_id: number
  project_fee: number | null
  hourly_rate: number | null
  target_launch_date: string | null
  content_deadline: string | null
  start_date: string | null
  goals: string | null
  pages_included: string | null
  key_features: string | null
  design_deliverables: string | null
  content_provided_by: string | null
  revision_rounds: number
  third_party_costs: string | null
  special_terms: string | null
  inactivity_days: number
  feedback_days: number
  late_fee_days: number
  bugfix_days: number
  updated_at: string
  task_total: number
  task_done: number
  client_id: number
  client_company: string | null
  client_name: string | null
}

interface Project {
  id: number
  name: string
  code: string
  client: string
  contactId: number
  ci: number
  status: Status
  done: number
  total: number
  due: string // ISO date ('' when none)
  value: number
  updated: string // human "2d ago"
  up: number // recency weight for sorting (smaller = more recent)
  raw: ApiProject
}

const STATUS_ORDER: Status[] = ['planning', 'awaiting_signature', 'awaiting_deposit', 'in_progress', 'in_review', 'awaiting_final', 'on_hold', 'completed']
const STATUS: Record<Status, { label: string, chip: string, dot: string, bar: string }> = {
  planning: { label: 'Planning', chip: 'bg-muted text-default', dot: 'bg-ink-400', bar: 'bg-ink-400' },
  awaiting_signature: { label: 'Awaiting Signature', chip: 'bg-info/10 text-info', dot: 'bg-info', bar: 'bg-info' },
  awaiting_deposit: { label: 'Awaiting Deposit', chip: 'bg-warning/10 text-warning', dot: 'bg-warning', bar: 'bg-warning' },
  in_progress: { label: 'In Progress', chip: 'bg-info/10 text-info', dot: 'bg-info', bar: 'bg-primary' },
  in_review: { label: 'In Review', chip: 'bg-mist text-primary', dot: 'bg-primary', bar: 'bg-primary' },
  awaiting_final: { label: 'Awaiting Final Payment', chip: 'bg-warning/10 text-warning', dot: 'bg-warning', bar: 'bg-warning' },
  on_hold: { label: 'On Hold', chip: 'bg-warning/10 text-warning', dot: 'bg-warning', bar: 'bg-warning' },
  completed: { label: 'Completed', chip: 'bg-success/10 text-success', dot: 'bg-success', bar: 'bg-success' }
}
// Avatar tints, mirroring the design system palette.
const AVATAR = ['bg-primary text-inverted', 'bg-elevated text-default', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const api = useApi()
const socket = useSocket()
const toast = useToast()

function mapProject(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    code: p.code || '—',
    client: p.client_company || p.client_name || 'Unknown',
    contactId: p.client_id,
    ci: p.client_id % AVATAR.length,
    status: p.status,
    done: p.task_done,
    total: p.task_total,
    due: p.target_launch_date ? String(p.target_launch_date).slice(0, 10) : '',
    value: p.project_fee ?? 0,
    updated: timeAgo(p.updated_at),
    up: Date.now() - new Date(String(p.updated_at).replace(' ', 'T')).getTime(),
    raw: p
  }
}

// Local status overrides so board drag-and-drop feels instant before the PATCH
// round-trips (and the socket echo) land.
const overrides = reactive<Record<number, Status>>({})
const projects = ref<Project[]>([])
const pending = ref(true)
const eff = (p: Project): Status => overrides[p.id] ?? p.status
const pct = (p: Project) => (p.total ? Math.round((p.done / p.total) * 100) : 0)
const dueDate = (d: string) => new Date(d + 'T12:00:00')
const isOverdue = (p: Project) => !!p.due && dueDate(p.due).getTime() < Date.now() && eff(p) !== 'completed'

async function load() {
  try {
    const { data } = await api<{ data: ApiProject[] }>('/projects')
    projects.value = data.map(mapProject)
  } catch {
    toast.add({ title: 'Could not load projects', color: 'error' })
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  load()
  socket.on('project:created', load)
  socket.on('project:updated', load)
  socket.on('project:deleted', load)
})
onBeforeUnmount(() => {
  socket.off('project:created', load)
  socket.off('project:updated', load)
  socket.off('project:deleted', load)
})

// ---- create / edit form ----
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editing = ref<ApiProject | null>(null)
function openNew() {
  formMode.value = 'create'
  editing.value = null
  formOpen.value = true
}
function openEdit(p: Project) {
  formMode.value = 'edit'
  editing.value = p.raw
  formOpen.value = true
}
function onSaved() {
  load()
}

// ---- state ----
const view = ref<'table' | 'board'>('table')
const statusTab = ref<Status | 'all'>('all')
const search = ref('')
const sortKey = ref<'updated' | 'due' | 'name' | 'progress'>('updated')
const sortDir = ref<'asc' | 'desc'>('asc')
const clientFilter = ref<string | null>(null)
const overdueOnly = ref(false)

const counts = computed<Record<string, number>>(() => {
  const c: Record<string, number> = { all: projects.value.length }
  for (const k of STATUS_ORDER) c[k] = projects.value.filter(p => eff(p) === k).length
  return c
})
const statusTabs = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.all },
  ...STATUS_ORDER.map(k => ({ key: k, label: STATUS[k].label, count: counts.value[k] }))
])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = projects.value.filter((p) => {
    if (statusTab.value !== 'all' && eff(p) !== statusTab.value) return false
    if (clientFilter.value && p.client !== clientFilter.value) return false
    if (overdueOnly.value && !isOverdue(p)) return false
    if (q && !`${p.name} ${p.client} ${p.code}`.toLowerCase().includes(q)) return false
    return true
  })
  const dir = sortDir.value === 'asc' ? 1 : -1
  rows = [...rows].sort((a, b) => {
    let r = 0
    if (sortKey.value === 'name') r = a.name.localeCompare(b.name)
    else if (sortKey.value === 'due') r = dueDate(a.due).getTime() - dueDate(b.due).getTime()
    else if (sortKey.value === 'progress') r = a.done / a.total - b.done / b.total
    else r = a.up - b.up
    return r * dir
  })
  return rows
})

const boardColumns = computed(() => STATUS_ORDER.map(k => ({
  key: k,
  label: STATUS[k].label,
  dot: STATUS[k].dot,
  cards: filtered.value.filter(p => eff(p) === k)
})))

const clientOptions = computed(() => {
  const seen = new Map<string, number>()
  for (const p of projects.value) if (!seen.has(p.client)) seen.set(p.client, p.ci)
  return [...seen.entries()].slice(0, 6).map(([client, ci]) => ({ client, ci }))
})
const filterActive = computed(() => !!clientFilter.value || overdueOnly.value)

// ---- menus (Nuxt UI dropdowns) ----
const filterItems = computed(() => [
  clientOptions.value.map(o => ({
    label: o.client,
    icon: clientFilter.value === o.client ? 'i-lucide-check' : undefined,
    onSelect: () => { clientFilter.value = clientFilter.value === o.client ? null : o.client }
  })),
  [{
    label: 'Overdue Only',
    icon: overdueOnly.value ? 'i-lucide-check' : 'i-lucide-triangle-alert',
    onSelect: () => { overdueOnly.value = !overdueOnly.value }
  }]
])
const sortItems = computed(() => [
  [
    { label: 'Last Updated', icon: sortKey.value === 'updated' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'updated' } },
    { label: 'Due Date', icon: sortKey.value === 'due' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'due' } },
    { label: 'Project Name', icon: sortKey.value === 'name' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'name' } },
    { label: 'Progress', icon: sortKey.value === 'progress' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'progress' } }
  ],
  [
    { label: 'Ascending', icon: sortDir.value === 'asc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'asc' } },
    { label: 'Descending', icon: sortDir.value === 'desc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'desc' } }
  ]
])
function rowMenuItems(p: Project) {
  return [[
    { label: 'View Project', icon: 'i-lucide-eye', onSelect: () => navigateTo(`/projects/${p.id}`) },
    { label: 'Edit Scope / SOW', icon: 'i-lucide-pencil', onSelect: () => openEdit(p) },
    { label: 'Open Client', icon: 'i-lucide-building-2', onSelect: () => navigateTo(`/clients/${p.contactId}`) }
  ]]
}

function clearFilters() {
  search.value = ''
  statusTab.value = 'all'
  clientFilter.value = null
  overdueOnly.value = false
}

// ---- board drag & drop ----
const dragId = ref<number | null>(null)
const dragOverCol = ref<Status | null>(null)
async function onDrop(status: Status) {
  const id = dragId.value
  dragId.value = null
  dragOverCol.value = null
  if (id == null) return
  const project = projects.value.find(p => p.id === id)
  if (!project || project.status === status) return
  overrides[id] = status // optimistic
  try {
    await api(`/projects/${id}`, { method: 'PATCH', body: { status } })
  } catch {
    overrides[id] = project.status // revert to the original status on failure
    toast.add({ title: 'Could not move project', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <PageHeader
      icon="i-lucide-folder-kanban"
      title="Projects"
      :count="projects.length"
      subtitle="Every project across the agency. Each one belongs to an active client and rolls up its tasks."
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openNew"
        >
          New Project
        </UButton>
      </template>
    </PageHeader>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors"
          :class="statusTab === t.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
          @click="statusTab = t.key"
        >
          {{ t.label }}
          <span
            class="rounded-chip px-1.5 text-[11px] font-semibold tabular-nums"
            :class="statusTab === t.key ? 'bg-default text-primary' : 'bg-muted text-muted'"
          >{{ t.count }}</span>
        </button>
      </div>

      <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search project or client…"
          class="w-full sm:w-[240px]"
          :ui="{ base: 'rounded-full' }"
        />
        <UDropdownMenu
          :items="filterItems"
          :ui="{ content: 'w-56' }"
        >
          <UButton
            icon="i-lucide-filter"
            color="neutral"
            variant="outline"
            class="rounded-full"
          >
            Filter
            <span
              v-if="filterActive"
              class="size-1.5 rounded-full bg-citrine"
            />
          </UButton>
        </UDropdownMenu>
        <UDropdownMenu :items="sortItems">
          <UButton
            icon="i-lucide-arrow-down-wide-narrow"
            color="neutral"
            variant="outline"
            class="rounded-full"
          >
            Sort
          </UButton>
        </UDropdownMenu>
        <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
          <button
            v-for="v in (['table', 'board'] as const)"
            :key="v"
            :title="v === 'table' ? 'Table view' : 'Board view'"
            class="inline-flex h-[30px] w-[34px] items-center justify-center rounded-lg transition-colors"
            :class="view === v ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
            @click="view = v"
          >
            <UIcon
              :name="v === 'table' ? 'i-lucide-table' : 'i-lucide-columns-3'"
              class="size-4"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- table view -->
    <div
      v-if="view === 'table'"
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <template v-if="filtered.length > 0">
        <!-- mobile cards -->
        <ul class="divide-y divide-default sm:hidden">
          <li
            v-for="p in filtered"
            :key="p.id"
            class="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted"
            @click="navigateTo(`/projects/${p.id}`)"
          >
            <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] text-[12px] font-semibold" :class="AVATAR[p.ci]">{{ initials(p.client) }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-highlighted">{{ p.name }}</div>
              <div class="truncate text-[12.5px] text-muted">{{ p.client }}</div>
            </div>
            <div class="flex flex-none flex-col items-end gap-1">
              <span class="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold" :class="STATUS[eff(p)].chip">
                <span class="size-1.5 rounded-full" :class="STATUS[eff(p)].dot" />{{ STATUS[eff(p)].label }}
              </span>
              <span class="text-[12px] tabular-nums" :class="isOverdue(p) ? 'font-semibold text-warning' : 'text-muted'">{{ shortDate(p.due) }}</span>
            </div>
          </li>
        </ul>

        <!-- table (sm+) -->
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Project
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Client
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Status
                </th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted md:table-cell">
                  Progress
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Due
                </th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted md:table-cell">
                  Open tasks
                </th>
                <th class="hidden px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted lg:table-cell">
                  Value
                </th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted lg:table-cell">
                  Updated
                </th>
                <th class="w-12" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in filtered"
                :key="p.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                @click="navigateTo(`/projects/${p.id}`)"
              >
                <td class="px-4 py-3.5">
                  <div class="whitespace-nowrap text-sm font-semibold text-highlighted">
                    {{ p.name }}
                  </div>
                  <div class="mt-0.5 text-[11px] tracking-[0.03em] text-muted">
                    {{ p.code }}
                  </div>
                </td>
                <td
                  class="px-4 py-3.5"
                  @click.stop
                >
                  <NuxtLink
                    :to="`/clients/${p.contactId}`"
                    class="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
                  >
                    <span
                      class="inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold"
                      :class="AVATAR[p.ci]"
                    >{{ initials(p.client) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ p.client }}</span>
                  </NuxtLink>
                </td>
                <td class="px-4 py-3.5">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold"
                    :class="STATUS[eff(p)].chip"
                  >
                    <span
                      class="size-1.5 rounded-full"
                      :class="STATUS[eff(p)].dot"
                    />{{ STATUS[eff(p)].label }}
                  </span>
                </td>
                <td class="hidden min-w-[140px] px-4 py-3.5 md:table-cell">
                  <div class="flex items-center gap-2.5">
                    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full transition-[width] duration-300"
                        :class="STATUS[eff(p)].bar"
                        :style="{ width: pct(p) + '%' }"
                      />
                    </div>
                    <span class="w-8 text-right text-[12.5px] font-semibold text-default tabular-nums">{{ pct(p) }}%</span>
                  </div>
                </td>
                <td class="whitespace-nowrap px-4 py-3.5">
                  <span
                    class="inline-flex items-center gap-1.5 text-[13.5px] tabular-nums"
                    :class="isOverdue(p) ? 'font-semibold text-warning' : 'text-default'"
                  >
                    <UIcon
                      v-if="isOverdue(p)"
                      name="i-lucide-triangle-alert"
                      class="size-3.5 flex-none"
                    />{{ shortDate(p.due) }}
                  </span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-default tabular-nums md:table-cell">
                  {{ p.total - p.done }} open
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-highlighted tabular-nums lg:table-cell">
                  {{ formatMoney(p.value) }}
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-muted tabular-nums lg:table-cell">
                  {{ p.updated }}
                </td>
                <td
                  class="w-12 px-3 py-3.5 text-right"
                  @click.stop
                >
                  <UDropdownMenu :items="rowMenuItems(p)">
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Actions for ${p.name}`"
                    />
                  </UDropdownMenu>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ projects.length }} projects</span>
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="outline"
            size="xs"
            class="rounded-full"
          >
            Load More
          </UButton>
        </div>
      </template>

      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-search"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-semibold text-highlighted">
          No Projects Match
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Try a different search or clear the status filter.
        </p>
        <UButton
          color="neutral"
          variant="outline"
          class="mt-5 rounded-full"
          @click="clearFilters"
        >
          Clear Filters
        </UButton>
      </div>
    </div>

    <!-- board view -->
    <div
      v-else
      class="overflow-x-auto pb-1.5"
    >
      <div class="flex min-w-min items-start gap-3.5">
        <div
          v-for="col in boardColumns"
          :key="col.key"
          class="w-[280px] flex-none rounded-[14px] border p-3.5 transition-colors"
          :class="dragOverCol === col.key ? 'border-citrine bg-mist' : 'border-default bg-muted'"
          @dragover.prevent="dragOverCol = col.key"
          @dragleave="dragOverCol === col.key && (dragOverCol = null)"
          @drop.prevent="onDrop(col.key)"
        >
          <div class="flex items-center gap-2 px-1 pb-3">
            <span
              class="size-2 flex-none rounded-full"
              :class="col.dot"
            />
            <span class="text-[13px] font-semibold text-highlighted">{{ col.label }}</span>
            <span class="rounded-chip border border-default bg-default px-2 py-px text-xs font-semibold text-muted tabular-nums">{{ col.cards.length }}</span>
          </div>
          <div class="flex min-h-[60px] flex-col gap-2.5">
            <div
              v-for="c in col.cards"
              :key="c.id"
              draggable="true"
              class="cursor-grab rounded-xl border bg-default p-3.5 transition-[border-color,box-shadow,opacity]"
              :class="dragId === c.id ? 'border-primary opacity-50' : 'border-default hover:shadow-sm'"
              @dragstart="dragId = c.id"
              @dragend="dragId = null; dragOverCol = null"
              @click="navigateTo(`/projects/${c.id}`)"
            >
              <div class="mb-2 text-sm font-semibold leading-snug text-highlighted">
                {{ c.name }}
              </div>
              <div class="mb-3 flex items-center gap-2">
                <span
                  class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[10px] font-semibold"
                  :class="AVATAR[c.ci]"
                >{{ initials(c.client) }}</span>
                <span class="truncate text-[12.5px] text-muted">{{ c.client }}</span>
              </div>
              <div class="mb-3 flex items-center gap-2">
                <div class="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full"
                    :class="STATUS[eff(c)].bar"
                    :style="{ width: pct(c) + '%' }"
                  />
                </div>
                <span class="text-[11.5px] font-semibold text-default tabular-nums">{{ pct(c) }}%</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <span
                  class="inline-flex items-center gap-1.5 text-[11.5px] tabular-nums"
                  :class="isOverdue(c) ? 'font-semibold text-warning' : 'text-default'"
                >
                  <UIcon
                    v-if="isOverdue(c)"
                    name="i-lucide-triangle-alert"
                    class="size-3 flex-none"
                  />{{ shortDate(c.due) }}
                </span>
                <span class="inline-flex items-center gap-1 text-[11.5px] text-muted tabular-nums">
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-3 flex-none"
                  />{{ c.total - c.done }}
                </span>
              </div>
            </div>
            <div
              v-if="col.cards.length === 0"
              class="rounded-xl border border-dashed border-default px-4 py-[18px] text-center text-[12.5px] text-muted"
            >
              Drop here
            </div>
          </div>
        </div>
      </div>
    </div>

    <ProjectForm
      v-model:open="formOpen"
      :mode="formMode"
      :project="editing"
      @saved="onSaved"
    />
  </div>
</template>
