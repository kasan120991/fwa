<script setup lang="ts">
useHead({ title: 'Clients · Francis Web Agency' })

// Clients = the clients table (status active/past), from GET /api/clients.
// `projects` is the count of the client's active (non-completed) projects, and
// `outstanding`/`overdue` are the sum of open invoices (overdue = any past due),
// all returned by the list endpoint.
type Stage = 'active' | 'past'
interface Client {
  id: number
  name: string
  domain: string
  initials: string
  logo: string
  stage: Stage
  contact: string
  email: string
  projects: number
  outstanding: number
  overdue: boolean
  activity: string
  days: number
  color: number
}

interface ApiClient {
  id: number
  company: string | null
  name: string
  email: string | null
  website: string | null
  logo_url: string | null
  status: string
  updated_at: string
  last_contacted_at: string | null
  active_projects: number
  outstanding: number | string
  overdue_count: number | string
}

const api = useApi()
const { resolveUrl } = useUploads()
const clients = ref<Client[]>([])
const pending = ref(true)

function mapClient(c: ApiClient, i: number): Client {
  const activityAt = c.last_contacted_at || c.updated_at
  return {
    id: c.id,
    name: c.company || c.name,
    domain: c.website || '',
    initials: initials(c.company || c.name),
    logo: c.logo_url || '',
    stage: c.status === 'past' ? 'past' : 'active',
    contact: c.name,
    email: c.email || '',
    projects: Number(c.active_projects) || 0,
    outstanding: Number(c.outstanding) || 0,
    overdue: Number(c.overdue_count) > 0,
    activity: timeAgo(activityAt) || '—',
    days: -(daysFromNow(activityAt) ?? -999),
    color: i % 5
  }
}

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiClient[] }>('/clients', { query: { limit: 200 } })
    clients.value = data.map(mapClient)
  } finally {
    pending.value = false
  }
}
onMounted(load)

const STAGE_META: Record<Stage, { status: 'success' | 'neutral', label: string }> = {
  active: { status: 'success', label: 'Active' },
  past: { status: 'neutral', label: 'Past' }
}

// Avatar tint pairs (mist/sand/info/cloud/warning) from the design system.
const AVATAR = [
  'bg-teal-800 text-white',
  'bg-mist text-primary',
  'bg-sand text-highlighted',
  'bg-info/10 text-info',
  'bg-muted text-default'
]

type Tab = 'all' | 'active' | 'past'
const tab = ref<Tab>('all')
const search = ref('')
const sortKey = ref<'name' | 'outstanding' | 'days'>('name')
const sortDir = ref<'asc' | 'desc'>('asc')
const selected = ref<Record<number, boolean>>({})

const counts = computed(() => ({
  all: clients.value.length,
  active: clients.value.filter(c => c.stage === 'active').length,
  past: clients.value.filter(c => c.stage === 'past').length
}))

const tabs = computed(() => ([
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'active' as const, label: 'Active', count: counts.value.active },
  { key: 'past' as const, label: 'Past', count: counts.value.past }
]))

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = tab.value === 'all' ? clients.value.slice() : clients.value.filter(c => c.stage === tab.value)
  if (q) {
    rows = rows.filter(c => `${c.name} ${c.contact} ${c.domain} ${c.email}`.toLowerCase().includes(q))
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    let r = 0
    if (sortKey.value === 'name') r = a.name.localeCompare(b.name)
    else if (sortKey.value === 'outstanding') r = a.outstanding - b.outstanding
    else r = a.days - b.days
    return r * dir
  })
  return rows
})

function money(n: number) {
  return n === 0 ? '—' : `$${n.toLocaleString('en-US')}`
}

// ---- sorting ----
function setSort(key: 'name' | 'outstanding' | 'days') {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}
function sortArrow(key: string) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}

const sortItems = computed(() => [
  [
    { label: 'Client Name', icon: sortKey.value === 'name' ? 'i-lucide-check' : undefined, onSelect: () => setSort('name') },
    { label: 'Outstanding', icon: sortKey.value === 'outstanding' ? 'i-lucide-check' : undefined, onSelect: () => setSort('outstanding') },
    { label: 'Last Activity', icon: sortKey.value === 'days' ? 'i-lucide-check' : undefined, onSelect: () => setSort('days') }
  ],
  [
    { label: 'Ascending', icon: sortDir.value === 'asc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'asc' } },
    { label: 'Descending', icon: sortDir.value === 'desc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'desc' } }
  ]
])

const filterItems = computed(() => [[
  { label: 'Active', onSelect: () => { tab.value = 'active' } },
  { label: 'Past', onSelect: () => { tab.value = 'past' } }
]])

const overflowItems = [[
  { label: 'Import Clients', icon: 'i-lucide-upload' },
  { label: 'Export CSV', icon: 'i-lucide-download' }
]]

function rowMenuItems(c: Client) {
  return [
    [
      { label: 'View Client', icon: 'i-lucide-eye', onSelect: () => navigateTo(`/clients/${c.id}`) },
      { label: 'Edit', icon: 'i-lucide-pencil' },
      { label: 'New Project', icon: 'i-lucide-folder-plus' },
      { label: 'New Invoice', icon: 'i-lucide-receipt-text' }
    ],
    [
      { label: 'Archive', icon: 'i-lucide-archive', color: 'error' as const }
    ]
  ]
}

// ---- selection ----
const selectedIds = computed(() => Object.keys(selected.value).filter(id => selected.value[id]))
const selCount = computed(() => selectedIds.value.length)
const allChecked = computed(() =>
  visibleRows.value.length > 0 && visibleRows.value.every(r => selected.value[r.id])
)
function toggleAll(value: boolean) {
  const next = { ...selected.value }
  for (const r of visibleRows.value) {
    if (value) next[r.id] = true
    else delete next[r.id]
  }
  selected.value = next
}
function clearSelection() {
  selected.value = {}
}

function openClient(id: number) {
  navigateTo(`/clients/${id}`)
}
</script>

<template>
  <!-- page header -->
  <PageHeader
    icon="i-lucide-users"
    title="Clients"
    :count="counts.all"
    subtitle="Active and past client relationships."
  >
    <template #actions>
      <UDropdownMenu :items="overflowItems">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" square aria-label="More actions" />
      </UDropdownMenu>
      <UButton to="/clients/new" icon="i-lucide-plus" color="primary">Add Client</UButton>
    </template>
  </PageHeader>

  <!-- controls -->
  <div class="flex flex-wrap items-center justify-between gap-4">
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

    <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search name, contact, domain…"
        class="w-full sm:w-[250px]"
        :ui="{ base: 'rounded-full' }"
      />
      <UDropdownMenu :items="filterItems">
        <UButton icon="i-lucide-filter" color="neutral" variant="outline" class="rounded-full">Filter</UButton>
      </UDropdownMenu>
      <UDropdownMenu :items="sortItems">
        <UButton icon="i-lucide-arrow-down-wide-narrow" color="neutral" variant="outline" class="rounded-full">Sort</UButton>
      </UDropdownMenu>
    </div>
  </div>

  <!-- table card -->
  <div class="overflow-hidden rounded-card bg-default ring ring-default">
    <!-- bulk toolbar -->
    <div
      v-if="selCount > 0"
      class="flex items-center justify-between gap-4 border-b border-primary/20 bg-mist px-[18px] py-3"
    >
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Clear selection"
          @click="clearSelection"
        />
        <span class="text-sm font-semibold text-primary">{{ selCount }} selected</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-archive" color="neutral" variant="outline" size="xs" class="rounded-full">Archive</UButton>
        <UButton icon="i-lucide-tag" color="neutral" variant="outline" size="xs" class="rounded-full">Add Tag</UButton>
        <UButton icon="i-lucide-download" color="neutral" variant="outline" size="xs" class="rounded-full">Export…</UButton>
      </div>
    </div>

    <!-- table -->
    <div v-if="pending" class="px-6 py-16 text-center text-sm text-muted">Loading clients…</div>

    <template v-else-if="visibleRows.length > 0">
      <!-- mobile cards -->
      <ul class="divide-y divide-default sm:hidden">
        <li
          v-for="row in visibleRows"
          :key="row.id"
          class="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted"
          @click="openClient(row.id)"
        >
          <img v-if="row.logo" :src="resolveUrl(row.logo)" alt="" class="size-9 flex-none rounded-[9px] object-cover ring ring-default">
          <span v-else class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] text-[13px] font-semibold" :class="AVATAR[row.color]">{{ row.initials }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-highlighted">{{ row.name }}</div>
            <div class="truncate text-[13px] text-muted">{{ row.domain }}</div>
          </div>
          <div class="flex flex-none flex-col items-end gap-1">
            <StatusChip :status="STAGE_META[row.stage].status">{{ STAGE_META[row.stage].label }}</StatusChip>
            <span v-if="row.outstanding > 0" class="text-[13px] font-semibold tabular-nums" :class="row.overdue ? 'text-error' : 'text-highlighted'">{{ money(row.outstanding) }}</span>
          </div>
        </li>
      </ul>

      <!-- table (sm+) -->
      <div class="hidden overflow-x-auto sm:block">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-default">
              <th class="w-11 py-3 pl-[18px] pr-2 text-left">
                <UCheckbox :model-value="allChecked" aria-label="Select all" @update:model-value="toggleAll(Boolean($event))" />
              </th>
              <th class="cursor-pointer select-none px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted" @click="setSort('name')">
                Client <span class="text-primary">{{ sortArrow('name') }}</span>
              </th>
              <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Status</th>
              <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Primary contact</th>
              <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Projects</th>
              <th class="cursor-pointer select-none px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted" @click="setSort('outstanding')">
                Outstanding <span class="text-primary">{{ sortArrow('outstanding') }}</span>
              </th>
              <th class="hidden cursor-pointer select-none px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell" @click="setSort('days')">
                Last activity <span class="text-primary">{{ sortArrow('days') }}</span>
              </th>
              <th class="w-[52px] px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.id"
              class="cursor-pointer border-b border-default transition-colors last:border-b-0"
              :class="selected[row.id] ? 'bg-mist' : 'hover:bg-muted'"
              @click="openClient(row.id)"
            >
              <td class="w-11 py-3.5 pl-[18px] pr-2" @click.stop>
                <UCheckbox
                  :model-value="!!selected[row.id]"
                  :aria-label="`Select ${row.name}`"
                  @update:model-value="selected[row.id] = Boolean($event)"
                />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <img v-if="row.logo" :src="resolveUrl(row.logo)" alt="" class="size-9 flex-none rounded-[9px] object-cover ring ring-default">
                  <span v-else class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] text-[13px] font-semibold" :class="AVATAR[row.color]">
                    {{ row.initials }}
                  </span>
                  <div class="min-w-0">
                    <div class="whitespace-nowrap text-sm font-semibold text-highlighted">{{ row.name }}</div>
                    <div class="whitespace-nowrap text-[13px] text-muted">{{ row.domain }}</div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <StatusChip :status="STAGE_META[row.stage].status">{{ STAGE_META[row.stage].label }}</StatusChip>
              </td>
              <td class="hidden px-4 py-3 lg:table-cell">
                <div class="min-w-0">
                  <div class="whitespace-nowrap text-sm text-default">{{ row.contact }}</div>
                  <div class="whitespace-nowrap text-[13px] text-muted">{{ row.email }}</div>
                </div>
              </td>
              <td class="hidden whitespace-nowrap px-4 py-3 text-sm tabular-nums lg:table-cell" :class="row.projects > 0 ? 'text-default' : 'text-muted'">
                {{ row.projects > 0 ? `${row.projects} active` : '—' }}
              </td>
              <td
                class="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums"
                :class="row.overdue ? 'font-semibold text-error' : (row.outstanding === 0 ? 'text-muted' : 'text-highlighted')"
              >
                {{ money(row.outstanding) }}
              </td>
              <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.activity }}</td>
              <td class="w-[52px] px-4 py-3 text-right" @click.stop>
                <UDropdownMenu :items="rowMenuItems(row)">
                  <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" :aria-label="`Actions for ${row.name}`" />
                </UDropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- footer -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-default px-5 py-3.5">
        <span class="text-[13px] text-muted tabular-nums">Showing {{ visibleRows.length }} of {{ counts.all }} clients</span>
        <div class="flex items-center gap-1.5">
          <UButton color="neutral" variant="outline" size="xs" disabled>Prev</UButton>
          <span class="rounded-lg bg-muted px-2.5 py-1 text-[13px] font-semibold text-highlighted">1</span>
          <UButton color="neutral" variant="outline" size="xs">Next</UButton>
        </div>
      </div>
    </template>

    <!-- no results -->
    <div v-else class="flex flex-col items-center px-6 py-16 text-center">
      <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon name="i-lucide-search" class="size-6" />
      </span>
      <h3 class="font-display text-lg font-medium text-highlighted">No Clients Match</h3>
      <p class="mt-1.5 max-w-xs text-sm text-muted">Try a different search or clear the filters to see everyone.</p>
      <UButton color="neutral" variant="outline" class="mt-5 rounded-full" @click="search = ''; tab = 'all'">Clear Filters</UButton>
    </div>
  </div>
</template>
