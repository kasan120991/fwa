<script setup lang="ts">
useHead({ title: 'Leads · Francis Web Agency' })

// Leads = contacts with a pre-client stage. source website/call = Inbound,
// manual = Outreach. Data comes from GET /api/contacts?group=leads.
type Source = 'website' | 'call' | 'manual'
type Stage = 'new' | 'qualifying' | 'to_contact' | 'contacted' | 'engaged' | 'qualified' | 'proposal'

interface ApiContact {
  id: number
  source: Source
  stage: Stage
  name: string
  email: string | null
  phone: string | null
  company: string | null
  message: string | null
  created_at: string
  last_contacted_at: string | null
  next_action_at: string | null
}

interface Lead {
  id: number
  name: string
  business: string
  initials: string
  email: string
  phone: string
  source: Source
  stage: Stage
  ci: number
  unread: boolean
  inquiry: string
  received: string
  days: number
  list: string
  next: string
  overdue: boolean
  last: string
  lastDays: number
}

const api = useApi()
const toast = useToast()

const STAGE_LABEL: Record<Stage, string> = { new: 'New', qualifying: 'Qualifying', to_contact: 'To contact', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified', proposal: 'Proposal' }
const INBOUND_STAGES: Stage[] = ['new', 'qualifying', 'qualified', 'proposal']
const OUTREACH_STAGES: Stage[] = ['to_contact', 'contacted', 'engaged', 'qualified', 'proposal']

function stageChipClass(k: Stage) {
  if (k === 'new' || k === 'to_contact') return 'bg-muted text-default'
  if (k === 'qualifying' || k === 'contacted' || k === 'engaged') return 'bg-info/10 text-info'
  if (k === 'qualified') return 'bg-success/10 text-success'
  return 'bg-mist text-teal-700'
}
const AVATAR = ['bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default', 'bg-warning/10 text-warning']

function mapContact(c: ApiContact, index: number): Lead {
  const isManual = c.source === 'manual'
  const nextAt = c.next_action_at
  const overdue = !!nextAt && new Date(nextAt.replace(' ', 'T')).getTime() < Date.now()
  let next = '—'
  if (nextAt) {
    const d = daysFromNow(nextAt) ?? 0
    next = overdue ? `Follow-up · ${Math.abs(d)}d overdue` : `Follow up in ${d}d`
  } else if (c.stage === 'to_contact') next = 'Start outreach'
  else if (c.stage === 'qualified') next = 'Send proposal'

  return {
    id: c.id,
    name: c.name,
    business: c.company || '',
    initials: initials(c.name),
    email: c.email || '',
    phone: c.phone || '',
    source: c.source,
    stage: c.stage,
    ci: index % AVATAR.length,
    unread: !isManual && c.stage === 'new',
    inquiry: c.message || '',
    received: timeAgo(c.created_at),
    days: -(daysFromNow(c.created_at) ?? -999),
    list: 'Manual',
    next,
    overdue,
    last: c.last_contacted_at ? timeAgo(c.last_contacted_at) : '—',
    lastDays: c.last_contacted_at ? -(daysFromNow(c.last_contacted_at) ?? -999) : 999
  }
}

const leads = ref<Lead[]>([])
const pending = ref(true)
async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiContact[] }>('/contacts', { query: { group: 'leads', limit: 200 } })
    leads.value = data.map(mapContact)
  } finally {
    pending.value = false
  }
}
onMounted(load)

// ---- state ----
const section = ref<'inbound' | 'outreach' | 'all'>('inbound')
const stageFilter = ref<Stage | 'all'>('all')
const search = ref('')
const sortKey = ref<'recent' | 'name' | 'stage'>('recent')
const sortDir = ref<'asc' | 'desc'>('asc')
const selected = ref<Record<number, boolean>>({})
const convertTarget = ref<Lead | null>(null)

const inbound = computed(() => leads.value.filter(l => l.source !== 'manual'))
const outreach = computed(() => leads.value.filter(l => l.source === 'manual'))
const secCount = computed(() => ({ inbound: inbound.value.length, outreach: outreach.value.length, all: leads.value.length }))
const base = computed(() => section.value === 'inbound' ? inbound.value : section.value === 'outreach' ? outreach.value : leads.value)

const stagePills = computed(() => {
  if (section.value === 'all') return []
  const defs = section.value === 'outreach' ? OUTREACH_STAGES : INBOUND_STAGES
  const countOf = (k: Stage) => base.value.filter(c => c.stage === k).length
  return [{ key: 'all' as const, label: 'All stages', count: base.value.length }, ...defs.map(k => ({ key: k, label: STAGE_LABEL[k], count: countOf(k) }))]
})

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = [...base.value]
  if (section.value !== 'all' && stageFilter.value !== 'all') rows = rows.filter(c => c.stage === stageFilter.value)
  if (q) rows = rows.filter(c => `${c.name} ${c.business} ${c.email} ${c.phone}`.toLowerCase().includes(q))
  const dir = sortDir.value === 'asc' ? 1 : -1
  const recency = (c: Lead) => c.source === 'manual' ? c.lastDays : c.days
  rows.sort((a, b) => {
    let r = 0
    if (sortKey.value === 'name') r = a.name.localeCompare(b.name)
    else if (sortKey.value === 'stage') r = a.stage.localeCompare(b.stage)
    else r = recency(a) - recency(b)
    return r * dir
  })
  return rows
})

const headerCount = computed(() => secCount.value.all)
const secondaryOf = (c: Lead) => c.email || c.phone || '—'

const selCount = computed(() => Object.values(selected.value).filter(Boolean).length)
const allChecked = computed(() => visibleRows.value.length > 0 && visibleRows.value.every(c => selected.value[c.id]))
function toggleAll() {
  const next = { ...selected.value }
  if (allChecked.value) visibleRows.value.forEach(c => delete next[c.id])
  else visibleRows.value.forEach(c => { next[c.id] = true })
  selected.value = next
}
function setSection(s: 'inbound' | 'outreach' | 'all') {
  section.value = s
  stageFilter.value = 'all'
  selected.value = {}
}

// ---- mutations ----
async function changeStage(row: Lead, k: Stage) {
  if (row.stage === k) return
  const prev = row.stage
  row.stage = k
  try { await api(`/contacts/${row.id}`, { method: 'PATCH', body: { stage: k } }) } catch { row.stage = prev }
}
async function confirmConvert() {
  const row = convertTarget.value
  if (!row) return
  const prev = row.stage
  row.stage = 'proposal'
  try {
    await api(`/contacts/${row.id}`, { method: 'PATCH', body: { stage: 'proposal' } })
    toast.add({ title: 'Converted to proposal', description: `${row.name} moved to the Proposal stage.`, color: 'success' })
  } catch {
    row.stage = prev
    toast.add({ title: "Couldn't convert", color: 'error' })
  } finally {
    convertTarget.value = null
  }
}

// ---- menus ----
function stageItems(c: Lead) {
  const defs = c.source === 'manual' ? OUTREACH_STAGES : INBOUND_STAGES
  return [defs.map(k => ({ label: STAGE_LABEL[k], icon: c.stage === k ? 'i-lucide-check' : undefined, onSelect: () => changeStage(c, k) }))]
}
function rowMenuItems(c: Lead) {
  return [[
    { label: 'Edit lead', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/leads/${c.id}/edit`) },
    { label: 'Convert to proposal', icon: 'i-lucide-check', onSelect: () => { convertTarget.value = c } },
    { label: 'Add tag', icon: 'i-lucide-tag' },
    { label: 'Move section', icon: 'i-lucide-arrow-right' }
  ], [
    { label: 'Delete lead', icon: 'i-lucide-trash-2', color: 'error' as const }
  ]]
}
const overflowItems = [[{ label: 'Import prospecting list', icon: 'i-lucide-upload' }, { label: 'Export CSV', icon: 'i-lucide-download' }]]
const sortItems = computed(() => [[
  { label: 'Most recent', icon: sortKey.value === 'recent' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'recent' } },
  { label: 'Name', icon: sortKey.value === 'name' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'name' } },
  { label: 'Stage', icon: sortKey.value === 'stage' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'stage' } }
], [
  { label: 'Ascending', icon: sortDir.value === 'asc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'asc' } },
  { label: 'Descending', icon: sortDir.value === 'desc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'desc' } }
]])
const filterItems = [[{ label: 'Website form', icon: 'i-lucide-layout-panel-top' }, { label: 'Receptionist call', icon: 'i-lucide-phone' }, { label: 'Manual', icon: 'i-lucide-pencil' }], [{ label: 'Overdue follow-ups', icon: 'i-lucide-triangle-alert' }]]
</script>

<template>
  <!-- header -->
  <div class="flex items-start justify-between gap-4">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">Leads</h1>
        <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ headerCount }}</span>
      </div>
      <p class="mt-1.5 text-sm text-muted">Everyone in the pipeline before they become a client — inbound inquiries and outreach prospects.</p>
    </div>
    <div class="flex flex-none items-center gap-2.5">
      <UDropdownMenu :items="overflowItems">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" square aria-label="More actions" />
      </UDropdownMenu>
      <UButton to="/leads/new" icon="i-lucide-plus" color="primary">Add lead</UButton>
    </div>
  </div>

  <!-- section switch -->
  <div class="inline-flex items-center gap-1 self-start rounded-xl border border-default bg-muted p-1">
    <button
      v-for="s in (['inbound','outreach','all'] as const)"
      :key="s"
      class="inline-flex items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold capitalize transition-colors"
      :class="section === s ? 'bg-teal-800 text-white' : 'text-muted hover:text-highlighted'"
      @click="setSection(s)"
    >
      <UIcon v-if="s === 'inbound'" name="i-lucide-arrow-down-to-line" class="size-4" />
      <UIcon v-else-if="s === 'outreach'" name="i-lucide-arrow-up-from-line" class="size-4" />
      {{ s === 'all' ? 'All' : s }}
      <span class="rounded-full px-2 py-px text-[11px] tabular-nums" :class="section === s ? 'bg-white/20 text-white' : 'border border-default bg-default text-muted'">{{ secCount[s] }}</span>
    </button>
  </div>

  <!-- controls -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="p in stagePills"
        :key="p.key"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
        :class="stageFilter === p.key ? 'border-teal-600 bg-mist font-semibold text-teal-700' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
        @click="stageFilter = p.key"
      >
        {{ p.label }}
        <span class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums" :class="stageFilter === p.key ? 'bg-default text-teal-700' : 'bg-muted text-muted'">{{ p.count }}</span>
      </button>
    </div>
    <div class="flex items-center gap-2.5">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search name, business, email…" class="w-[250px]" :ui="{ base: 'rounded-full' }" />
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
    <div v-if="selCount > 0" class="flex items-center justify-between gap-4 border-b border-teal-100 bg-mist px-[18px] py-3">
      <div class="flex items-center gap-3">
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Clear selection" @click="selected = {}" />
        <span class="text-sm font-semibold text-teal-800">{{ selCount }} selected</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-arrow-down" color="neutral" variant="outline" size="xs" class="rounded-full">Change stage</UButton>
        <UButton icon="i-lucide-tag" color="neutral" variant="outline" size="xs" class="rounded-full">Add tag</UButton>
        <UButton icon="i-lucide-trash-2" color="error" variant="outline" size="xs" class="rounded-full">Delete</UButton>
      </div>
    </div>

    <div v-if="pending" class="px-6 py-16 text-center text-sm text-muted">Loading leads…</div>

    <template v-else-if="visibleRows.length > 0">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-default">
              <th class="w-11 py-3 pl-[18px] pr-2 text-left">
                <UCheckbox :model-value="allChecked" aria-label="Select all" @update:model-value="toggleAll" />
              </th>
              <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Contact / business</th>
              <template v-if="section === 'inbound'">
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Source</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Inquiry</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Received</th>
              </template>
              <template v-else-if="section === 'outreach'">
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">List / source</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Next action</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Last contacted</th>
              </template>
              <template v-else>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Motion</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Source / list</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Activity</th>
              </template>
              <th class="w-24" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.id"
              class="border-b border-default transition-colors last:border-b-0"
              :class="selected[row.id] ? 'bg-mist' : (row.unread ? 'bg-teal-600/[0.045] hover:bg-muted' : 'hover:bg-muted')"
            >
              <td class="relative w-11 py-3.5 pl-[18px] pr-2">
                <span v-if="row.unread" class="absolute inset-y-2 left-0 w-[3px] rounded-r bg-teal-500" />
                <UCheckbox :model-value="!!selected[row.id]" :aria-label="`Select ${row.name}`" @update:model-value="selected[row.id] = Boolean($event)" />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] text-[13px] font-semibold" :class="AVATAR[row.ci]">{{ row.initials }}</span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span v-if="row.unread" class="size-[7px] flex-none rounded-full bg-teal-500" />
                      <span class="whitespace-nowrap text-sm text-highlighted" :class="row.unread ? 'font-bold' : 'font-semibold'">{{ row.name }}</span>
                    </div>
                    <div class="whitespace-nowrap text-[13px] text-muted">{{ row.business }} · {{ secondaryOf(row) }}</div>
                  </div>
                </div>
              </td>

              <template v-if="section === 'inbound'">
                <td class="hidden px-4 py-3 lg:table-cell">
                  <NuxtLink
                    v-if="row.source === 'call'"
                    to="/receptionist"
                    class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[13px] font-medium text-default transition-colors hover:bg-elevated"
                  >
                    <UIcon name="i-lucide-phone" class="size-3.5" />Call<UIcon name="i-lucide-arrow-up-right" class="size-3 opacity-55" />
                  </NuxtLink>
                  <span v-else class="inline-flex items-center gap-1.5 text-[13px] text-default"><UIcon name="i-lucide-layout-panel-top" class="size-3.5 text-muted" />Website</span>
                </td>
                <td class="hidden max-w-[320px] px-4 py-3 lg:table-cell"><span class="block truncate text-[13px] text-default">{{ row.inquiry }}</span></td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(row.stage)">{{ STAGE_LABEL[row.stage] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.received }}</td>
              </template>

              <template v-else-if="section === 'outreach'">
                <td class="hidden px-4 py-3 lg:table-cell"><span class="inline-flex items-center gap-1.5 text-[13px] text-default"><UIcon name="i-lucide-calendar" class="size-3.5 text-muted" />{{ row.list }}</span></td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(row.stage)">{{ STAGE_LABEL[row.stage] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm" :class="row.overdue ? 'font-semibold text-warning' : 'text-default'">
                    <UIcon v-if="row.overdue" name="i-lucide-triangle-alert" class="size-3.5 flex-none" />{{ row.next }}
                  </span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.last }}</td>
              </template>

              <template v-else>
                <td class="hidden px-4 py-3 lg:table-cell">
                  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" :class="row.source === 'manual' ? 'bg-muted text-default' : 'bg-info/10 text-info'">{{ row.source === 'manual' ? 'Outreach' : 'Inbound' }}</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-[13px] text-default lg:table-cell">{{ row.source === 'manual' ? row.list : (row.source === 'call' ? 'Call' : 'Website') }}</td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(row.stage)">{{ STAGE_LABEL[row.stage] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.source === 'manual' ? row.last : row.received }}</td>
              </template>

              <td class="w-24 px-3 py-3 text-right" @click.stop>
                <div class="inline-flex items-center gap-0.5">
                  <UButton icon="i-lucide-check" color="primary" variant="ghost" size="xs" title="Convert to proposal" @click="convertTarget = row" />
                  <UDropdownMenu :items="rowMenuItems(row)">
                    <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" :aria-label="`Actions for ${row.name}`" />
                  </UDropdownMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
        <span class="text-[13px] text-muted tabular-nums">Showing {{ visibleRows.length }} of {{ base.length }} {{ section === 'all' ? 'leads' : section }}</span>
        <div class="flex items-center gap-1.5">
          <UButton color="neutral" variant="outline" size="xs" disabled>Prev</UButton>
          <span class="rounded-lg bg-muted px-2.5 py-1 text-[13px] font-semibold text-highlighted">1</span>
          <UButton color="neutral" variant="outline" size="xs">Next</UButton>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center px-6 py-20 text-center">
      <span class="mb-4 inline-flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted"><UIcon name="i-lucide-search" class="size-6" /></span>
      <h3 class="font-display text-xl font-medium text-highlighted">No leads match</h3>
      <p class="mt-1.5 max-w-xs text-sm text-muted">Try a different search or clear the stage filter to see everyone.</p>
      <UButton color="neutral" variant="outline" class="mt-5 rounded-full" @click="search = ''; stageFilter = 'all'">Clear filters</UButton>
    </div>
  </div>

  <!-- convert modal -->
  <UModal :open="!!convertTarget" title="Convert to proposal" @update:open="v => { if (!v) convertTarget = null }">
    <template #body>
      <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-mist text-teal-700"><UIcon name="i-lucide-check" class="size-5" /></span>
      <p class="text-[14.5px] leading-relaxed text-default">
        Move <strong class="text-highlighted">{{ convertTarget?.name }}</strong> to the Proposal stage and start a proposal.
        They stay in Leads until the proposal is won — then they become a client.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2.5">
        <UButton color="neutral" variant="outline" class="rounded-full" @click="convertTarget = null">Cancel</UButton>
        <UButton icon="i-lucide-check" color="primary" class="rounded-full" @click="confirmConvert">Convert &amp; draft proposal</UButton>
      </div>
    </template>
  </UModal>
</template>
