<script setup lang="ts">
useHead({ title: 'Projects · Francis Web Agency' })

// Projects — every project across the agency. Each belongs to an active client
// and rolls up its tasks. UI-only for now: the projects backend lands in a later
// phase (a signed project contract is the create trigger — see the proposals/
// contracts build plan), so this page runs on representative sample data and the
// create/edit/archive actions are stubs until those routes exist.
type Status = 'planning' | 'in_progress' | 'in_review' | 'on_hold' | 'completed'

interface Project {
  id: string
  name: string
  code: string
  client: string
  ci: number
  status: Status
  done: number
  total: number
  due: string // ISO date
  value: number
  updated: string // human "2d ago"
  up: number // recency weight for sorting (smaller = more recent)
}

const STATUS_ORDER: Status[] = ['planning', 'in_progress', 'in_review', 'on_hold', 'completed']
const STATUS: Record<Status, { label: string, chip: string, dot: string, bar: string }> = {
  planning: { label: 'Planning', chip: 'bg-muted text-default', dot: 'bg-ink-400', bar: 'bg-ink-400' },
  in_progress: { label: 'In progress', chip: 'bg-info/10 text-info', dot: 'bg-info', bar: 'bg-teal-500' },
  in_review: { label: 'In review', chip: 'bg-mist text-teal-700', dot: 'bg-teal-600', bar: 'bg-teal-500' },
  on_hold: { label: 'On hold', chip: 'bg-warning/10 text-warning', dot: 'bg-warning', bar: 'bg-warning' },
  completed: { label: 'Completed', chip: 'bg-success/10 text-success', dot: 'bg-success', bar: 'bg-success' }
}
// Avatar tints, mirroring the design system palette.
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const SAMPLE: Project[] = [
  { id: 'p1', name: 'Marketing site rebuild', code: 'WEB-104', client: 'Northwind Co.', ci: 0, status: 'in_progress', done: 8, total: 13, due: '2026-07-20', value: 18000, updated: '2d ago', up: 2 },
  { id: 'p2', name: 'E-commerce storefront', code: 'WEB-098', client: 'Bloom Floral', ci: 1, status: 'in_progress', done: 9, total: 20, due: '2026-06-28', value: 24500, updated: '5h ago', up: 0.2 },
  { id: 'p3', name: 'Consultation funnel', code: 'WEB-101', client: 'Brooks Law', ci: 2, status: 'in_review', done: 15, total: 17, due: '2026-07-05', value: 9800, updated: '3h ago', up: 0.12 },
  { id: 'p4', name: 'Booking site', code: 'WEB-110', client: 'Delta Kitchens', ci: 3, status: 'planning', done: 1, total: 9, due: '2026-08-15', value: 12000, updated: '1d ago', up: 1 },
  { id: 'p5', name: 'Patient portal', code: 'WEB-092', client: 'Anand Dental', ci: 4, status: 'in_progress', done: 11, total: 20, due: '2026-06-25', value: 32000, updated: '1d ago', up: 1 },
  { id: 'p6', name: 'Lead-gen site', code: 'WEB-107', client: 'Fielder Roofing', ci: 0, status: 'on_hold', done: 3, total: 10, due: '2026-07-30', value: 14200, updated: '6d ago', up: 6 },
  { id: 'p7', name: 'IDX listings site', code: 'WEB-112', client: 'Okafor Realty', ci: 1, status: 'planning', done: 0, total: 11, due: '2026-09-01', value: 21000, updated: '4d ago', up: 4 },
  { id: 'p8', name: 'Portfolio redesign', code: 'WEB-095', client: 'Chen Studio', ci: 2, status: 'in_review', done: 12, total: 13, due: '2026-07-08', value: 7600, updated: '8h ago', up: 0.33 },
  { id: 'p9', name: 'Program landing page', code: 'WEB-088', client: 'Webb Fitness', ci: 3, status: 'completed', done: 6, total: 6, due: '2026-06-10', value: 4500, updated: '2w ago', up: 14 },
  { id: 'p10', name: 'Inventory site', code: 'WEB-081', client: 'Reyes Auto Group', ci: 4, status: 'completed', done: 14, total: 14, due: '2026-05-20', value: 16800, updated: '3w ago', up: 21 }
]

// Local status overrides so board drag-and-drop feels live without a backend.
const overrides = reactive<Record<string, Status>>({})
const projects = ref<Project[]>(SAMPLE)
const eff = (p: Project): Status => overrides[p.id] ?? p.status
const pct = (p: Project) => Math.round((p.done / p.total) * 100)
const dueDate = (d: string) => new Date(d + 'T12:00:00')
const isOverdue = (p: Project) => dueDate(p.due).getTime() < Date.now() && eff(p) !== 'completed'
const clientHref = '/clients' // project detail is deferred; link the client through for now

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
    label: 'Overdue only',
    icon: overdueOnly.value ? 'i-lucide-check' : 'i-lucide-triangle-alert',
    onSelect: () => { overdueOnly.value = !overdueOnly.value }
  }]
])
const sortItems = computed(() => [
  [
    { label: 'Last updated', icon: sortKey.value === 'updated' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'updated' } },
    { label: 'Due date', icon: sortKey.value === 'due' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'due' } },
    { label: 'Project name', icon: sortKey.value === 'name' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'name' } },
    { label: 'Progress', icon: sortKey.value === 'progress' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'progress' } }
  ],
  [
    { label: 'Ascending', icon: sortDir.value === 'asc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'asc' } },
    { label: 'Descending', icon: sortDir.value === 'desc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'desc' } }
  ]
])
function rowMenuItems() {
  return [[
    { label: 'View project', icon: 'i-lucide-eye', onSelect: () => navigateTo(clientHref) },
    { label: 'Edit', icon: 'i-lucide-pencil' },
    { label: 'New task', icon: 'i-lucide-list-checks' },
    { label: 'New invoice', icon: 'i-lucide-receipt-text' }
  ], [
    { label: 'Archive', icon: 'i-lucide-archive', color: 'error' as const }
  ]]
}

function clearFilters() {
  search.value = ''
  statusTab.value = 'all'
  clientFilter.value = null
  overdueOnly.value = false
}

// ---- board drag & drop ----
const dragId = ref<string | null>(null)
const dragOverCol = ref<Status | null>(null)
function onDrop(status: Status) {
  if (dragId.value) overrides[dragId.value] = status
  dragId.value = null
  dragOverCol.value = null
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Projects
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ projects.length }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Every project across the agency. Each one belongs to an active client and rolls up its tasks.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        class="flex-none"
      >
        New project
      </UButton>
    </div>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
          :class="statusTab === t.key ? 'border-teal-600 bg-mist font-semibold text-teal-700' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
          @click="statusTab = t.key"
        >
          {{ t.label }}
          <span
            class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="statusTab === t.key ? 'bg-default text-teal-700' : 'bg-muted text-muted'"
          >{{ t.count }}</span>
        </button>
      </div>

      <div class="flex items-center gap-2.5">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search project or client…"
          class="w-[240px]"
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
              class="size-1.5 rounded-full bg-teal-500"
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
        <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-[3px]">
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
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Project
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Status
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Progress
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Due
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Open tasks
                </th>
                <th class="hidden px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Value
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Updated
                </th>
                <th class="w-12" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in filtered"
                :key="p.id"
                class="border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              >
                <td class="px-4 py-3.5">
                  <div class="whitespace-nowrap text-sm font-semibold text-highlighted">
                    {{ p.name }}
                  </div>
                  <div class="mt-0.5 font-mono text-[11px] tracking-[0.03em] text-muted">
                    {{ p.code }}
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <NuxtLink
                    :to="clientHref"
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
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
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
                <td class="w-12 px-3 py-3.5 text-right">
                  <UDropdownMenu :items="rowMenuItems()">
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
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ projects.length }} projects</span>
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="outline"
            size="xs"
            class="rounded-full"
          >
            Load more
          </UButton>
        </div>
      </template>

      <div
        v-else
        class="flex flex-col items-center px-6 py-20 text-center"
      >
        <span class="mb-4 inline-flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted"><UIcon
          name="i-lucide-search"
          class="size-6"
        /></span>
        <h3 class="font-display text-xl font-medium text-highlighted">
          No projects match
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
          Clear filters
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
          :class="dragOverCol === col.key ? 'border-teal-200 bg-mist' : 'border-default bg-muted'"
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
            <span class="rounded-full border border-default bg-default px-2 py-px text-xs font-semibold text-muted tabular-nums">{{ col.cards.length }}</span>
          </div>
          <div class="flex min-h-[60px] flex-col gap-2.5">
            <div
              v-for="c in col.cards"
              :key="c.id"
              draggable="true"
              class="cursor-grab rounded-xl border bg-default p-3.5 transition-[border-color,box-shadow,opacity]"
              :class="dragId === c.id ? 'border-teal-500 opacity-50' : 'border-default hover:shadow-sm'"
              @dragstart="dragId = c.id"
              @dragend="dragId = null; dragOverCol = null"
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
  </div>
</template>
