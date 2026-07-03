<script setup lang="ts">
useHead({ title: 'Leads · Francis Web Agency' })

// Leads = contacts whose stage is pre-client (per CLAUDE.md).
//   source website/call = Inbound,  source manual = Outreach.
// Stage keys match the schema enum (to_contact, not the prototype's tocontact).
type Source = 'website' | 'call' | 'manual'
type Stage = 'new' | 'qualifying' | 'to_contact' | 'contacted' | 'engaged' | 'qualified' | 'proposal'
interface Lead {
  id: string
  name: string
  business: string
  initials: string
  email: string
  phone: string
  source: Source
  callId?: string
  stage: Stage
  ci: number
  // inbound
  unread?: boolean
  inquiry?: string
  received?: string
  days?: number
  // outreach
  list?: string
  next?: string
  overdue?: boolean
  last?: string
  lastDays?: number
}

const INBOUND: Lead[] = [
  { id: 'delta', name: 'Rachel Munoz', business: 'Delta Kitchens', initials: 'RM', email: '', phone: '(415) 555-0148', source: 'call', callId: 'delta', stage: 'new', unread: true, inquiry: 'Wants a new site plus online booking for her remodeling business — current site is six years old.', received: '12m ago', days: 0.008, ci: 0 },
  { id: 'brooks', name: 'Aiden Brooks', business: 'Brooks Law', initials: 'AB', email: 'aiden@brookslaw.com', phone: '', source: 'website', stage: 'new', unread: true, inquiry: 'Looking for a redesign focused on getting more consultation requests from the site.', received: '1h ago', days: 0.04, ci: 2 },
  { id: 'bloom', name: 'Sofia Nguyen', business: 'Bloom Floral', initials: 'SN', email: '', phone: '(212) 555-0173', source: 'call', callId: 'bloom', stage: 'qualifying', unread: false, inquiry: 'Called about e-commerce for her flower shop — wants same-day delivery scheduling.', received: '5h ago', days: 0.2, ci: 1 },
  { id: 'webb', name: 'Marcus Webb', business: 'Webb Fitness', initials: 'MW', email: 'marcus@webbfit.com', phone: '', source: 'website', stage: 'qualifying', unread: false, inquiry: 'Needs a landing page for a personal-training program launching next month.', received: '1d ago', days: 1, ci: 3 },
  { id: 'anand', name: 'Priya Anand', business: 'Anand Dental', initials: 'PA', email: 'priya@ananddental.com', phone: '', source: 'website', stage: 'qualified', unread: false, inquiry: 'Wants a full site plus patient portal. Budget approved by the partners.', received: '2d ago', days: 2, ci: 4 },
  { id: 'fielder', name: 'Tom Fielder', business: 'Fielder Roofing', initials: 'TF', email: '', phone: '(503) 555-0192', source: 'call', callId: 'fielder', stage: 'proposal', unread: false, inquiry: 'Wants a lead-gen site with quote forms; ready to move fast, comparing two agencies.', received: '3d ago', days: 3, ci: 0 },
  { id: 'okafor', name: 'Grace Okafor', business: 'Okafor Realty', initials: 'GO', email: 'grace@okaforrealty.com', phone: '', source: 'website', stage: 'qualifying', unread: false, inquiry: 'Real-estate listings site with IDX integration; asked about ongoing maintenance.', received: '4d ago', days: 4, ci: 1 }
]

const OUTREACH: Lead[] = [
  { id: 'cho', name: 'Daniel Cho', business: 'Cho Orthodontics', initials: 'DC', email: 'daniel@choortho.com', phone: '', source: 'manual', list: 'Local dentists · Q3', stage: 'to_contact', next: 'Start outreach', overdue: false, last: '—', lastDays: 999, ci: 2 },
  { id: 'lawson', name: 'Emma Lawson', business: 'Lawson Interiors', initials: 'EL', email: 'emma@lawsonint.com', phone: '', source: 'manual', list: 'Interior designers', stage: 'contacted', next: 'Follow-up · 3d overdue', overdue: true, last: '9d ago', lastDays: 9, ci: 4 },
  { id: 'reyes', name: 'Victor Reyes', business: 'Reyes Auto Group', initials: 'VR', email: 'victor@reyesauto.com', phone: '', source: 'manual', list: 'Manual', stage: 'engaged', next: 'Follow up in 2d', overdue: false, last: '2d ago', lastDays: 2, ci: 0 },
  { id: 'schmidt', name: 'Hannah Schmidt', business: 'Schmidt Bakery', initials: 'HS', email: 'hannah@schmidtbakery.com', phone: '', source: 'manual', list: 'SMB list · Austin', stage: 'contacted', next: 'Follow-up · 1d overdue', overdue: true, last: '6d ago', lastDays: 6, ci: 1 },
  { id: 'barnes', name: 'Owen Barnes', business: 'Barnes Consulting', initials: 'OB', email: 'owen@barnesco.com', phone: '', source: 'manual', list: 'Referral', stage: 'qualified', next: 'Send proposal', overdue: false, last: '1d ago', lastDays: 1, ci: 3 },
  { id: 'chen', name: 'Lily Chen', business: 'Chen Studio', initials: 'LC', email: 'lily@chenstudio.com', phone: '', source: 'manual', list: 'Creative studios', stage: 'to_contact', next: 'Start outreach', overdue: false, last: '—', lastDays: 999, ci: 2 },
  { id: 'patel', name: 'Noah Patel', business: 'Patel Realty', initials: 'NP', email: 'noah@patelrealty.com', phone: '', source: 'manual', list: 'Manual', stage: 'engaged', next: 'Follow up in 5d', overdue: false, last: '4d ago', lastDays: 4, ci: 0 }
]

const CALLS: Record<string, { title: string, when: string, duration: string, phone: string, summary: string, tags: string[] }> = {
  delta: { title: 'Rachel Munoz · Delta Kitchens', when: 'Today, 9:12 AM', duration: '4:12', phone: '(415) 555-0148', summary: 'Rachel runs a kitchen-remodeling business and wants a new website with online consultation booking. Her current site is about six years old and not mobile-friendly. She mentioned an approximate budget and hopes to launch before spring.', tags: ['Booking', 'Redesign', 'Budget mentioned'] },
  bloom: { title: 'Sofia Nguyen · Bloom Floral', when: 'Today, 6:40 AM', duration: '3:28', phone: '(212) 555-0173', summary: 'Sofia owns a flower shop and wants to add e-commerce with same-day delivery scheduling. She currently takes orders by phone and is losing evening sales. Interested in a phased build starting with the storefront.', tags: ['E-commerce', 'Delivery'] },
  fielder: { title: 'Tom Fielder · Fielder Roofing', when: '3 days ago, 2:05 PM', duration: '5:47', phone: '(503) 555-0192', summary: 'Tom wants a lead-generation site with quote-request forms. He is ready to move fast and is comparing two agencies, so a fast proposal matters. Emphasized ranking locally for roofing searches.', tags: ['Lead gen', 'SEO', 'Competitive'] }
}

const STAGE_LABEL: Record<Stage, string> = { new: 'New', qualifying: 'Qualifying', to_contact: 'To contact', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified', proposal: 'Proposal' }
const INBOUND_STAGES: Stage[] = ['new', 'qualifying', 'qualified', 'proposal']
const OUTREACH_STAGES: Stage[] = ['to_contact', 'contacted', 'engaged', 'qualified', 'proposal']

function stageChipClass(k: Stage) {
  if (k === 'new' || k === 'to_contact') return 'bg-muted text-default'
  if (k === 'qualifying' || k === 'contacted' || k === 'engaged') return 'bg-info/10 text-info'
  if (k === 'qualified') return 'bg-success/10 text-success'
  return 'bg-mist text-teal-700' // proposal
}
const AVATAR = ['bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default', 'bg-warning/10 text-warning']

// ---- state ----
const section = ref<'inbound' | 'outreach' | 'all'>('inbound')
const stageFilter = ref<Stage | 'all'>('all')
const search = ref('')
const sortKey = ref<'recent' | 'name' | 'stage'>('recent')
const sortDir = ref<'asc' | 'desc'>('asc')
const selected = ref<Record<string, boolean>>({})
const stages = ref<Record<string, Stage>>({})
const callPeek = ref<string | null>(null)
const convertTarget = ref<Lead | null>(null)

const toast = useToast()
function effStage(c: Lead): Stage { return stages.value[c.id] ?? c.stage }

const secCount = computed(() => ({ inbound: INBOUND.length, outreach: OUTREACH.length, all: INBOUND.length + OUTREACH.length }))
const base = computed(() => section.value === 'inbound' ? INBOUND : section.value === 'outreach' ? OUTREACH : [...INBOUND, ...OUTREACH])

const stagePills = computed(() => {
  if (section.value === 'all') return []
  const defs = section.value === 'outreach' ? OUTREACH_STAGES : INBOUND_STAGES
  const countOf = (k: Stage) => base.value.filter(c => effStage(c) === k).length
  return [
    { key: 'all' as const, label: 'All stages', count: base.value.length },
    ...defs.map(k => ({ key: k, label: STAGE_LABEL[k], count: countOf(k) }))
  ]
})

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = [...base.value]
  if (section.value !== 'all' && stageFilter.value !== 'all') rows = rows.filter(c => effStage(c) === stageFilter.value)
  if (q) rows = rows.filter(c => `${c.name} ${c.business} ${c.email} ${c.phone}`.toLowerCase().includes(q))
  const dir = sortDir.value === 'asc' ? 1 : -1
  const recency = (c: Lead) => c.source === 'manual' ? (c.lastDays ?? 999) : (c.days ?? 999)
  rows.sort((a, b) => {
    let r = 0
    if (sortKey.value === 'name') r = a.name.localeCompare(b.name)
    else if (sortKey.value === 'stage') r = effStage(a).localeCompare(effStage(b))
    else r = recency(a) - recency(b)
    return r * dir
  })
  return rows
})

const headerCount = computed(() => secCount.value.all)
const secondaryOf = (c: Lead) => c.email || c.phone || '—'

// ---- selection ----
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

// ---- menus ----
function stageItems(c: Lead) {
  const defs = c.source === 'manual' ? OUTREACH_STAGES : INBOUND_STAGES
  return [defs.map(k => ({
    label: STAGE_LABEL[k],
    icon: effStage(c) === k ? 'i-lucide-check' : undefined,
    onSelect: () => { stages.value = { ...stages.value, [c.id]: k } }
  }))]
}
function rowMenuItems(c: Lead) {
  return [[
    { label: 'Open lead', icon: 'i-lucide-eye' },
    { label: 'Convert to proposal', icon: 'i-lucide-check', onSelect: () => { convertTarget.value = c } },
    { label: 'Add tag', icon: 'i-lucide-tag' },
    { label: 'Move section', icon: 'i-lucide-arrow-right' }
  ], [
    { label: 'Delete lead', icon: 'i-lucide-trash-2', color: 'error' as const }
  ]]
}
const overflowItems = [[
  { label: 'Import prospecting list', icon: 'i-lucide-upload' },
  { label: 'Export CSV', icon: 'i-lucide-download' }
]]
const sortItems = computed(() => [[
  { label: 'Most recent', icon: sortKey.value === 'recent' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'recent' } },
  { label: 'Name', icon: sortKey.value === 'name' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'name' } },
  { label: 'Stage', icon: sortKey.value === 'stage' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'stage' } }
], [
  { label: 'Ascending', icon: sortDir.value === 'asc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'asc' } },
  { label: 'Descending', icon: sortDir.value === 'desc' ? 'i-lucide-check' : undefined, onSelect: () => { sortDir.value = 'desc' } }
]])
const filterItems = [[
  { label: 'Website form', icon: 'i-lucide-layout-panel-top' },
  { label: 'Receptionist call', icon: 'i-lucide-phone' },
  { label: 'Manual', icon: 'i-lucide-pencil' }
], [
  { label: 'Overdue follow-ups', icon: 'i-lucide-triangle-alert' }
]]

function confirmConvert() {
  if (!convertTarget.value) return
  stages.value = { ...stages.value, [convertTarget.value.id]: 'proposal' }
  toast.add({ title: 'Converted to proposal', description: `${convertTarget.value.name} moved to the Proposal stage.`, color: 'success' })
  convertTarget.value = null
}

const peekCall = computed(() => callPeek.value ? CALLS[callPeek.value] : null)
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
      <UButton icon="i-lucide-plus" color="primary">Add lead</UButton>
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
    <!-- bulk toolbar -->
    <div v-if="selCount > 0" class="flex items-center justify-between gap-4 border-b border-teal-100 bg-mist px-[18px] py-3">
      <div class="flex items-center gap-3">
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Clear selection" @click="selected = {}" />
        <span class="text-sm font-semibold text-teal-800">{{ selCount }} selected</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-arrow-down" color="neutral" variant="outline" size="xs" class="rounded-full">Change stage</UButton>
        <UButton icon="i-lucide-tag" color="neutral" variant="outline" size="xs" class="rounded-full">Add tag</UButton>
        <UButton icon="i-lucide-arrow-right" color="neutral" variant="outline" size="xs" class="rounded-full">Move section</UButton>
        <UButton icon="i-lucide-trash-2" color="error" variant="outline" size="xs" class="rounded-full">Delete</UButton>
      </div>
    </div>

    <template v-if="visibleRows.length > 0">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-default">
              <th class="w-11 py-3 pl-[18px] pr-2 text-left">
                <UCheckbox :model-value="allChecked" aria-label="Select all" @update:model-value="toggleAll" />
              </th>
              <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Contact / business</th>
              <!-- Inbound cols -->
              <template v-if="section === 'inbound'">
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Source</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Inquiry</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Received</th>
              </template>
              <!-- Outreach cols -->
              <template v-else-if="section === 'outreach'">
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">List / source</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Next action</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Last contacted</th>
              </template>
              <!-- All cols -->
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
              <!-- checkbox + unread bar -->
              <td class="relative w-11 py-3.5 pl-[18px] pr-2">
                <span v-if="row.unread" class="absolute inset-y-2 left-0 w-[3px] rounded-r bg-teal-500" />
                <UCheckbox :model-value="!!selected[row.id]" :aria-label="`Select ${row.name}`" @update:model-value="selected[row.id] = Boolean($event)" />
              </td>
              <!-- contact -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] text-[13px] font-semibold" :class="AVATAR[row.ci % AVATAR.length]">{{ row.initials }}</span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span v-if="row.unread" class="size-[7px] flex-none rounded-full bg-teal-500" />
                      <span class="whitespace-nowrap text-sm text-highlighted" :class="row.unread ? 'font-bold' : 'font-semibold'">{{ row.name }}</span>
                    </div>
                    <div class="whitespace-nowrap text-[13px] text-muted">{{ row.business }} · {{ secondaryOf(row) }}</div>
                  </div>
                </div>
              </td>

              <!-- Inbound cells -->
              <template v-if="section === 'inbound'">
                <td class="hidden px-4 py-3 lg:table-cell">
                  <button
                    v-if="row.source === 'call'"
                    class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[13px] font-medium text-default transition-colors hover:bg-elevated"
                    @click="callPeek = row.callId!"
                  >
                    <UIcon name="i-lucide-phone" class="size-3.5" />Call<UIcon name="i-lucide-arrow-up-right" class="size-3 opacity-55" />
                  </button>
                  <span v-else class="inline-flex items-center gap-1.5 text-[13px] text-default">
                    <UIcon name="i-lucide-layout-panel-top" class="size-3.5 text-muted" />Website
                  </span>
                </td>
                <td class="hidden max-w-[320px] px-4 py-3 lg:table-cell"><span class="block truncate text-[13px] text-default">{{ row.inquiry }}</span></td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(effStage(row))">{{ STAGE_LABEL[effStage(row)] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.received }}</td>
              </template>

              <!-- Outreach cells -->
              <template v-else-if="section === 'outreach'">
                <td class="hidden px-4 py-3 lg:table-cell"><span class="inline-flex items-center gap-1.5 text-[13px] text-default"><UIcon name="i-lucide-calendar" class="size-3.5 text-muted" />{{ row.list }}</span></td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(effStage(row))">{{ STAGE_LABEL[effStage(row)] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm" :class="row.overdue ? 'font-semibold text-warning' : 'text-default'">
                    <UIcon v-if="row.overdue" name="i-lucide-triangle-alert" class="size-3.5 flex-none" />{{ row.next }}
                  </span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.last }}</td>
              </template>

              <!-- All cells -->
              <template v-else>
                <td class="hidden px-4 py-3 lg:table-cell">
                  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" :class="row.source === 'manual' ? 'bg-muted text-default' : 'bg-info/10 text-info'">{{ row.source === 'manual' ? 'Outreach' : 'Inbound' }}</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-[13px] text-default lg:table-cell">{{ row.source === 'manual' ? (row.list || 'Manual') : (row.source === 'call' ? 'Call' : 'Website') }}</td>
                <td class="px-4 py-3">
                  <UDropdownMenu :items="stageItems(row)">
                    <button class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-semibold" :class="stageChipClass(effStage(row))">{{ STAGE_LABEL[effStage(row)] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" /></button>
                  </UDropdownMenu>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3 text-sm text-muted tabular-nums lg:table-cell">{{ row.source === 'manual' ? (row.last || '—') : row.received }}</td>
              </template>

              <!-- actions -->
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

      <!-- footer -->
      <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
        <span class="text-[13px] text-muted tabular-nums">Showing {{ visibleRows.length }} of {{ base.length }} {{ section === 'all' ? 'leads' : section }}</span>
        <div class="flex items-center gap-1.5">
          <UButton color="neutral" variant="outline" size="xs" disabled>Prev</UButton>
          <span class="rounded-lg bg-muted px-2.5 py-1 text-[13px] font-semibold text-highlighted">1</span>
          <UButton color="neutral" variant="outline" size="xs">Next</UButton>
        </div>
      </div>
    </template>

    <!-- no results -->
    <div v-else class="flex flex-col items-center px-6 py-20 text-center">
      <span class="mb-4 inline-flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted"><UIcon name="i-lucide-search" class="size-6" /></span>
      <h3 class="font-display text-xl font-medium text-highlighted">No leads match</h3>
      <p class="mt-1.5 max-w-xs text-sm text-muted">Try a different search or clear the stage filter to see everyone.</p>
      <UButton color="neutral" variant="outline" class="mt-5 rounded-full" @click="search = ''; stageFilter = 'all'">Clear filters</UButton>
    </div>
  </div>

  <!-- call peek slideover -->
  <USlideover :open="!!callPeek" :title="peekCall?.title" @update:open="v => { if (!v) callPeek = null }">
    <template #body>
      <div v-if="peekCall" class="flex flex-col">
        <div class="mb-5 flex gap-6">
          <div><div class="mb-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">When</div><div class="text-sm font-medium text-highlighted">{{ peekCall.when }}</div></div>
          <div><div class="mb-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">Duration</div><div class="text-sm font-medium text-highlighted tabular-nums">{{ peekCall.duration }}</div></div>
          <div><div class="mb-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">Phone</div><div class="text-sm font-medium text-highlighted tabular-nums">{{ peekCall.phone }}</div></div>
        </div>
        <div class="mb-5 flex items-center gap-3 rounded-xl bg-muted p-3.5 ring ring-default">
          <UButton icon="i-lucide-play" color="primary" :ui="{ base: 'rounded-full size-9 justify-center' }" aria-label="Play recording" />
          <div class="min-w-0 flex-1">
            <div class="h-1.5 overflow-hidden rounded-full bg-accented"><div class="h-full w-0 bg-teal-500" /></div>
            <div class="mt-1.5 flex justify-between text-[11.5px] text-muted tabular-nums"><span>0:00</span><span>{{ peekCall.duration }}</span></div>
          </div>
        </div>
        <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Summary</div>
        <p class="text-[14.5px] leading-relaxed text-default">{{ peekCall.summary }}</p>
        <div class="mt-3.5 flex flex-wrap gap-2">
          <span v-for="t in peekCall.tags" :key="t" class="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-teal-700">{{ t }}</span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full gap-2.5">
        <UButton to="/receptionist" icon="i-lucide-phone" color="primary" class="flex-1 justify-center rounded-full">Open call details</UButton>
        <UButton color="neutral" variant="outline" class="rounded-full" @click="callPeek = null">Close</UButton>
      </div>
    </template>
  </USlideover>

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
