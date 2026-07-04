<script setup lang="ts">
useHead({ title: 'Agreements · Francis Web Agency' })

// Agreements — every proposal and contract across all clients, merged into one
// list (the merge happens here at the view layer; proposals and contracts are
// separate records/tables per the build plan). UI-only for now: the proposals/
// contracts + PandaDoc backend lands in a later phase, so this runs on sample
// data and the generate/send/void actions are stubs until those routes exist.
type Kind = 'proposal' | 'contract'
type Ctype = 'project' | 'care_plan'
type Status = 'draft' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'declined' | 'expired' | 'voided'

interface LineItem { name: string, qty: number, unit: number, custom: boolean }
interface Agreement {
  id: string
  client: string
  ci: number
  kind: Kind
  ctype?: Ctype
  title: string
  status: Status
  total: number
  recurring: boolean
  created: string
  sent?: string
  viewed?: string
  end?: { k: Status, label: string, date: string }
  dateText: string
  dateKind: 'good' | 'expiring' | 'bad' | 'muted'
  sortT: number
  fromProposal?: string
  lineTo?: string
  producedProject?: boolean
  items: LineItem[]
}

const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const STATUS_META: Record<Status, { label: string, chip: string, dot: string }> = {
  draft: { label: 'Draft', chip: 'bg-muted text-default', dot: 'bg-ink-400' },
  sent: { label: 'Sent', chip: 'bg-info/10 text-info', dot: 'bg-info' },
  viewed: { label: 'Viewed', chip: 'bg-mist text-teal-700', dot: 'bg-teal-600' },
  accepted: { label: 'Accepted', chip: 'bg-success/10 text-success', dot: 'bg-success' },
  signed: { label: 'Signed', chip: 'bg-success/10 text-success', dot: 'bg-success' },
  declined: { label: 'Declined', chip: 'bg-error/10 text-error', dot: 'bg-error' },
  expired: { label: 'Expired', chip: 'bg-error/10 text-error', dot: 'bg-error' },
  voided: { label: 'Voided', chip: 'bg-error/10 text-error', dot: 'bg-error' }
}
const STATUS_RANK: Record<Status, number> = { draft: 0, sent: 1, viewed: 2, accepted: 3, signed: 3, declined: 4, expired: 5, voided: 6 }

// Status-group filters (also driven by the summary tiles).
type Group = 'all' | 'positive' | 'inflight' | 'draft' | 'negative'
const GROUP: Record<Exclude<Group, 'all'>, Status[]> = {
  positive: ['accepted', 'signed'],
  inflight: ['sent', 'viewed'],
  draft: ['draft'],
  negative: ['declined', 'expired', 'voided']
}

const BOARD_COLS: { key: string, label: string, statuses: Status[], dot: string }[] = [
  { key: 'draft', label: 'Draft', statuses: ['draft'], dot: 'bg-ink-400' },
  { key: 'sent', label: 'Sent', statuses: ['sent'], dot: 'bg-info' },
  { key: 'viewed', label: 'Viewed', statuses: ['viewed'], dot: 'bg-teal-600' },
  { key: 'won', label: 'Won', statuses: ['accepted', 'signed'], dot: 'bg-success' },
  { key: 'closed', label: 'Closed', statuses: ['declined', 'expired', 'voided'], dot: 'bg-error' }
]

const AGREEMENTS: Agreement[] = [
  { id: 'a1', client: 'Northwind Co.', ci: 0, kind: 'proposal', title: 'Website redesign & SEO', status: 'accepted', total: 18000, recurring: false, created: 'Apr 2', sent: 'Apr 3', viewed: 'Apr 4', end: { k: 'accepted', label: 'Accepted', date: 'Apr 9' }, dateText: 'Accepted Apr 9', dateKind: 'good', sortT: 90, lineTo: 'a2', items: [{ name: 'Discovery & IA', qty: 1, unit: 3500, custom: false }, { name: 'Responsive redesign (8 pages)', qty: 1, unit: 9500, custom: false }, { name: 'Technical SEO setup', qty: 1, unit: 3500, custom: false }, { name: 'Copy polish pass', qty: 1, unit: 1500, custom: true }] },
  { id: 'a2', client: 'Northwind Co.', ci: 0, kind: 'contract', ctype: 'project', title: 'Website redesign & SEO', status: 'signed', total: 18000, recurring: false, created: 'Apr 9', sent: 'Apr 9', viewed: 'Apr 10', end: { k: 'signed', label: 'Signed', date: 'Apr 11' }, dateText: 'Signed Apr 11', dateKind: 'good', sortT: 84, fromProposal: 'a1', producedProject: true, items: [{ name: 'Discovery & IA', qty: 1, unit: 3500, custom: false }, { name: 'Responsive redesign (8 pages)', qty: 1, unit: 9500, custom: false }, { name: 'Technical SEO setup', qty: 1, unit: 3500, custom: false }, { name: 'Copy polish pass', qty: 1, unit: 1500, custom: true }] },
  { id: 'a3', client: 'Bloom Floral', ci: 1, kind: 'contract', ctype: 'care_plan', title: 'Website Care Plan', status: 'signed', total: 99, recurring: true, created: 'Jan 15', sent: 'Jan 15', viewed: 'Jan 16', end: { k: 'signed', label: 'Signed', date: 'Jan 18' }, dateText: 'Signed Jan 18', dateKind: 'good', sortT: 170, items: [{ name: 'Managed hosting & backups', qty: 1, unit: 39, custom: false }, { name: 'Monthly updates & monitoring', qty: 1, unit: 60, custom: false }] },
  { id: 'a4', client: 'Delta Kitchens', ci: 2, kind: 'proposal', title: 'Booking site build', status: 'sent', total: 12000, recurring: false, created: 'Jun 28', sent: 'Jun 30', dateText: 'Expires in 3d', dateKind: 'expiring', sortT: 4, items: [{ name: 'Booking flow design', qty: 1, unit: 4500, custom: false }, { name: 'Calendar integration', qty: 1, unit: 4500, custom: false }, { name: 'Responsive build', qty: 1, unit: 3000, custom: false }] },
  { id: 'a5', client: 'Brooks Law', ci: 3, kind: 'proposal', title: 'Consultation funnel', status: 'viewed', total: 9800, recurring: false, created: 'Jun 27', sent: 'Jun 28', viewed: 'Jul 2', dateText: 'Expires in 2d', dateKind: 'expiring', sortT: 2, items: [{ name: 'Landing + intake form', qty: 1, unit: 5800, custom: false }, { name: 'Email automation setup', qty: 1, unit: 4000, custom: false }] },
  { id: 'a6', client: 'Fielder Roofing', ci: 4, kind: 'proposal', title: 'Lead-gen site', status: 'draft', total: 14200, recurring: false, created: 'Jul 2', dateText: 'Created 2d ago', dateKind: 'muted', sortT: 2, items: [{ name: 'Lead-gen site (6 pages)', qty: 1, unit: 10200, custom: false }, { name: 'Quote request forms', qty: 1, unit: 4000, custom: false }] },
  { id: 'a7', client: 'Anand Dental', ci: 0, kind: 'proposal', title: 'Patient portal', status: 'accepted', total: 32000, recurring: false, created: 'May 20', sent: 'May 21', viewed: 'May 22', end: { k: 'accepted', label: 'Accepted', date: 'May 28' }, dateText: 'Accepted May 28', dateKind: 'good', sortT: 40, lineTo: 'a8', items: [{ name: 'Portal UX & design', qty: 1, unit: 12000, custom: false }, { name: 'Auth & records module', qty: 1, unit: 20000, custom: false }] },
  { id: 'a8', client: 'Anand Dental', ci: 0, kind: 'contract', ctype: 'project', title: 'Patient portal', status: 'sent', total: 32000, recurring: false, created: 'May 28', sent: 'May 29', dateText: 'Awaiting signature', dateKind: 'muted', sortT: 5, fromProposal: 'a7', items: [{ name: 'Portal UX & design', qty: 1, unit: 12000, custom: false }, { name: 'Auth & records module', qty: 1, unit: 20000, custom: false }] },
  { id: 'a9', client: 'Chen Studio', ci: 1, kind: 'contract', ctype: 'care_plan', title: 'Care Plan — Studio', status: 'signed', total: 79, recurring: true, created: 'Mar 3', sent: 'Mar 3', viewed: 'Mar 4', end: { k: 'signed', label: 'Signed', date: 'Mar 6' }, dateText: 'Signed Mar 6', dateKind: 'good', sortT: 123, items: [{ name: 'Hosting & backups', qty: 1, unit: 29, custom: false }, { name: 'Content updates (2/mo)', qty: 1, unit: 50, custom: false }] },
  { id: 'a10', client: 'Bloom Floral', ci: 1, kind: 'proposal', title: 'E-commerce phase 2', status: 'declined', total: 24500, recurring: false, created: 'May 8', sent: 'May 10', viewed: 'May 12', end: { k: 'declined', label: 'Declined', date: 'May 22' }, dateText: 'Declined May 22', dateKind: 'bad', sortT: 43, items: [{ name: 'Storefront rebuild', qty: 1, unit: 18500, custom: false }, { name: 'Subscriptions module', qty: 1, unit: 6000, custom: false }] },
  { id: 'a11', client: 'Delta Kitchens', ci: 2, kind: 'proposal', title: 'Rush microsite', status: 'expired', total: 4000, recurring: false, created: 'Jun 1', sent: 'Jun 2', viewed: 'Jun 3', end: { k: 'expired', label: 'Expired', date: 'Jun 16' }, dateText: 'Expired 18d ago', dateKind: 'bad', sortT: 18, items: [{ name: 'One-page microsite', qty: 1, unit: 4000, custom: false }] },
  { id: 'a12', client: 'Fielder Roofing', ci: 4, kind: 'contract', ctype: 'project', title: 'SEO addendum', status: 'voided', total: 2500, recurring: false, created: 'Mar 4', sent: 'Mar 5', end: { k: 'voided', label: 'Voided', date: 'Mar 8' }, dateText: 'Voided Mar 8', dateKind: 'bad', sortT: 121, items: [{ name: 'Additional keyword targets', qty: 1, unit: 2500, custom: true }] }
]

const byId = (id?: string) => AGREEMENTS.find(a => a.id === id) || null

// ---- presentation helpers ----
const kindLabel = (k: Kind) => (k === 'proposal' ? 'Proposal' : 'Contract')
const kindChip = (k: Kind) => (k === 'proposal'
  ? 'bg-default text-highlighted ring-1 ring-accented'
  : 'bg-teal-800 text-white')
const kindIconWrap = (k: Kind) => (k === 'proposal' ? 'bg-muted text-muted' : 'bg-mist text-teal-700')
const kindIcon = (k: Kind) => (k === 'proposal' ? 'i-lucide-file-text' : 'i-lucide-file-check-2')
const subtypeLabel = (ct?: Ctype) => (ct === 'care_plan' ? 'Care Plan' : 'Project')
const subtypeChip = (ct?: Ctype) => (ct === 'care_plan' ? 'bg-mist text-teal-700' : 'bg-muted text-default')
const subtypeIcon = (ct?: Ctype) => (ct === 'care_plan' ? 'i-lucide-repeat' : 'i-lucide-zap')
const dateClass = (k: Agreement['dateKind']) => {
  if (k === 'bad') return 'font-semibold text-error'
  if (k === 'expiring') return 'font-semibold text-warning'
  if (k === 'good') return 'text-default'
  return 'text-muted'
}
const valueText = (a: Agreement) => formatMoney(a.total)

// ---- state ----
const view = ref<'table' | 'board'>('table')
const seg = ref<'all' | 'proposals' | 'contracts'>('all')
const statusFilter = ref<Group>('all')
const recurringOnly = ref(false)
const sortKey = ref<'recent' | 'value' | 'client' | 'status'>('recent')
const search = ref('')
const openId = ref<string | null>(null)
function openAgreement(id: string) {
  openId.value = id
}

const segCounts = computed(() => ({
  all: AGREEMENTS.length,
  proposals: AGREEMENTS.filter(a => a.kind === 'proposal').length,
  contracts: AGREEMENTS.filter(a => a.kind === 'contract').length
}))

// summary tiles
const awaitingResp = computed(() => AGREEMENTS.filter(a => a.kind === 'proposal' && (a.status === 'sent' || a.status === 'viewed')))
const awaitingSign = computed(() => AGREEMENTS.filter(a => a.kind === 'contract' && (a.status === 'sent' || a.status === 'viewed')))
const inFlightValue = computed(() => AGREEMENTS
  .filter(a => a.status === 'sent' || a.status === 'viewed')
  .reduce((s, a) => s + (a.recurring ? 0 : a.total), 0))

function applyTile(s: 'all' | 'proposals' | 'contracts', sf: Group) {
  seg.value = s
  statusFilter.value = sf
  recurringOnly.value = false
}
const tiles = computed(() => [
  { key: 'resp', label: 'Awaiting response', value: String(awaitingResp.value.length), sub: 'proposals out', icon: 'i-lucide-clock', on: seg.value === 'proposals' && statusFilter.value === 'inflight', apply: () => applyTile('proposals', 'inflight') },
  { key: 'sign', label: 'Awaiting signature', value: String(awaitingSign.value.length), sub: 'contracts out', icon: 'i-lucide-file-check-2', on: seg.value === 'contracts' && statusFilter.value === 'inflight', apply: () => applyTile('contracts', 'inflight') },
  { key: 'val', label: 'Value in flight', value: formatMoney(inFlightValue.value), sub: 'awaiting close', icon: 'i-lucide-dollar-sign', on: seg.value === 'all' && statusFilter.value === 'inflight', apply: () => applyTile('all', 'inflight') }
])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = AGREEMENTS.filter((a) => {
    if (seg.value === 'proposals' && a.kind !== 'proposal') return false
    if (seg.value === 'contracts' && a.kind !== 'contract') return false
    if (statusFilter.value !== 'all' && !GROUP[statusFilter.value].includes(a.status)) return false
    if (recurringOnly.value && !a.recurring) return false
    if (q && !`${a.title} ${a.client}`.toLowerCase().includes(q)) return false
    return true
  })
  list = [...list].sort((a, b) => {
    if (sortKey.value === 'value') return b.total - a.total
    if (sortKey.value === 'client') return a.client.localeCompare(b.client)
    if (sortKey.value === 'status') return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    return a.sortT - b.sortT
  })
  return list
})

const boardColumns = computed(() => BOARD_COLS.map(col => ({
  ...col,
  cards: filtered.value.filter(a => col.statuses.includes(a.status))
})))

const segments = computed(() => ([
  { key: 'all' as const, label: 'All', count: segCounts.value.all },
  { key: 'proposals' as const, label: 'Proposals', count: segCounts.value.proposals },
  { key: 'contracts' as const, label: 'Contracts', count: segCounts.value.contracts }
]))

const filterActive = computed(() => statusFilter.value !== 'all' || recurringOnly.value)
const filterItems = computed(() => [
  ([
    ['all', 'All statuses'],
    ['positive', 'Accepted / Signed'],
    ['inflight', 'Sent / Viewed'],
    ['draft', 'Draft'],
    ['negative', 'Declined / Expired / Voided']
  ] as [Group, string][]).map(([k, label]) => ({
    label,
    icon: statusFilter.value === k ? 'i-lucide-check' : undefined,
    onSelect: () => { statusFilter.value = k }
  })),
  [{
    label: 'Recurring only',
    icon: recurringOnly.value ? 'i-lucide-check' : 'i-lucide-repeat',
    onSelect: () => { recurringOnly.value = !recurringOnly.value }
  }]
])
const sortItems = computed(() => [[
  { label: 'Most recent', icon: sortKey.value === 'recent' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'recent' } },
  { label: 'Value', icon: sortKey.value === 'value' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'value' } },
  { label: 'Client', icon: sortKey.value === 'client' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'client' } },
  { label: 'Status', icon: sortKey.value === 'status' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'status' } }
]])
function rowMenuItems(a: Agreement) {
  const items: { label: string, icon: string, color?: 'error' }[][] = [[
    { label: 'Open in PandaDoc', icon: 'i-lucide-external-link' },
    { label: 'Copy link', icon: 'i-lucide-link' },
    { label: 'Resend', icon: 'i-lucide-rotate-cw' }
  ]]
  if (a.lineTo || a.fromProposal) items[0].push({ label: 'View related agreement', icon: 'i-lucide-link-2' })
  items.push([{ label: 'Void', icon: 'i-lucide-ban', color: 'error' }])
  return items
}

function clearFilters() {
  seg.value = 'all'
  statusFilter.value = 'all'
  recurringOnly.value = false
  search.value = ''
}

const legend = [
  { label: 'Accepted / Signed', dot: 'bg-success' },
  { label: 'Sent / Viewed', dot: 'bg-info' },
  { label: 'Draft', dot: 'bg-ink-400' },
  { label: 'Declined / Expired / Voided', dot: 'bg-error' }
]

// ---- detail drawer ----
const detail = computed(() => byId(openId.value))
const drawerOpen = computed({
  get: () => !!detail.value,
  set: (v: boolean) => { if (!v) openId.value = null }
})

const timeline = computed(() => {
  const a = detail.value
  if (!a) return []
  const steps: { k: Status, label: string, date: string }[] = [{ k: 'draft', label: 'Created', date: a.created }]
  if (a.sent) steps.push({ k: 'sent', label: 'Sent', date: a.sent })
  if (a.viewed) steps.push({ k: 'viewed', label: 'Viewed', date: a.viewed })
  if (a.end) steps.push({ k: a.end.k, label: a.end.label, date: a.end.date })
  const bad: Status[] = ['declined', 'expired', 'voided']
  return steps.map((s, i) => {
    const last = i === steps.length - 1
    const isBad = bad.includes(s.k)
    const good = s.k === 'accepted' || s.k === 'signed'
    return {
      label: s.label,
      date: s.date,
      line: !last,
      showCheck: !(isBad && last),
      dot: isBad && last ? 'bg-error' : (good && last ? 'bg-success' : 'bg-teal-600'),
      text: last ? (isBad ? 'text-error' : (good ? 'text-success' : 'text-highlighted')) : 'text-highlighted'
    }
  })
})

const lineage = computed(() => {
  const a = detail.value
  if (!a) return []
  const out: { kicker: string, label: string, icon: string, wrap: string, open?: () => void }[] = []
  if (a.fromProposal) {
    const p = byId(a.fromProposal)
    out.push({ kicker: 'From proposal', label: p?.title ?? 'Proposal', icon: kindIcon('proposal'), wrap: kindIconWrap('proposal'), open: () => openAgreement(a.fromProposal!) })
  }
  if (a.lineTo) {
    const c = byId(a.lineTo)
    out.push({ kicker: 'Produced contract', label: c?.title ?? 'Contract', icon: kindIcon('contract'), wrap: kindIconWrap('contract'), open: () => openAgreement(a.lineTo!) })
  }
  if (a.producedProject) {
    out.push({ kicker: 'Project created', label: a.title, icon: 'i-lucide-folder-kanban', wrap: kindIconWrap('contract'), open: () => navigateTo('/projects') })
  }
  return out
})

const unitText = (li: LineItem, a: Agreement) => formatMoney(li.unit) + (a.recurring ? '/mo' : '')
const lineTotalText = (li: LineItem, a: Agreement) => formatMoney(li.unit * li.qty) + (a.recurring ? '/mo' : '')
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Agreements
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ AGREEMENTS.length }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Every proposal and contract across all clients, generated and signed through PandaDoc.
        </p>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton
          icon="i-lucide-file-check-2"
          color="neutral"
          variant="outline"
        >
          New contract
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
        >
          New proposal
        </UButton>
      </div>
    </div>

    <!-- summary tiles -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border p-4 text-left transition-colors"
        :class="t.on ? 'border-teal-600 bg-mist' : 'border-default bg-default hover:border-accented'"
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

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-[3px]">
        <button
          v-for="s in segments"
          :key="s.key"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
          :class="seg === s.key ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
          @click="seg = s.key"
        >
          {{ s.label }}
          <span
            class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="seg === s.key ? 'bg-mist text-teal-700' : 'bg-default text-muted'"
          >{{ s.count }}</span>
        </button>
      </div>

      <div class="flex items-center gap-2.5">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search title or client…"
          class="w-[230px]"
          :ui="{ base: 'rounded-full' }"
        />
        <UDropdownMenu
          :items="filterItems"
          :ui="{ content: 'w-60' }"
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
                  Agreement
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Type
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Status
                </th>
                <th class="hidden px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Value
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Date
                </th>
                <th class="w-12" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in filtered"
                :key="a.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                @click="openId = a.id"
              >
                <td class="max-w-[280px] px-4 py-3.5">
                  <div class="flex items-center gap-2.5">
                    <span
                      class="inline-flex size-[30px] flex-none items-center justify-center rounded-lg"
                      :class="kindIconWrap(a.kind)"
                    ><UIcon
                      :name="kindIcon(a.kind)"
                      class="size-4"
                    /></span>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted">
                        {{ a.title }}
                      </div>
                      <div
                        v-if="a.fromProposal || a.lineTo"
                        class="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted"
                      >
                        <UIcon
                          :name="a.fromProposal ? 'i-lucide-corner-up-left' : 'i-lucide-corner-up-right'"
                          class="size-3 flex-none opacity-70"
                        />
                        {{ a.fromProposal ? `from proposal: ${byId(a.fromProposal)?.title}` : 'Produced contract' }}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  class="px-4 py-3.5"
                  @click.stop
                >
                  <NuxtLink
                    to="/clients"
                    class="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
                  >
                    <span
                      class="inline-flex size-[26px] flex-none items-center justify-center rounded-md text-[10px] font-semibold"
                      :class="AVATAR[a.ci]"
                    >{{ initials(a.client) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ a.client }}</span>
                  </NuxtLink>
                </td>
                <td class="px-4 py-3.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                      :class="kindChip(a.kind)"
                    >{{ kindLabel(a.kind) }}</span>
                    <span
                      v-if="a.kind === 'contract'"
                      class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                      :class="subtypeChip(a.ctype)"
                    ><UIcon
                      :name="subtypeIcon(a.ctype)"
                      class="size-3"
                    />{{ subtypeLabel(a.ctype) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                    :class="STATUS_META[a.status].chip"
                  >
                    <span
                      class="size-1.5 rounded-full"
                      :class="STATUS_META[a.status].dot"
                    />{{ STATUS_META[a.status].label }}
                  </span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-right lg:table-cell">
                  <span class="text-sm font-semibold text-highlighted tabular-nums">{{ valueText(a) }}</span>
                  <span
                    v-if="a.recurring"
                    class="text-xs font-medium text-muted"
                  >/mo</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                  <span
                    class="inline-flex items-center gap-1.5 text-[13px] tabular-nums"
                    :class="dateClass(a.dateKind)"
                  >
                    <UIcon
                      v-if="a.dateKind === 'bad' || a.dateKind === 'expiring'"
                      name="i-lucide-triangle-alert"
                      class="size-3 flex-none"
                    />{{ a.dateText }}
                  </span>
                </td>
                <td
                  class="w-12 px-3 py-3.5 text-right"
                  @click.stop
                >
                  <UDropdownMenu :items="rowMenuItems(a)">
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Actions for ${a.title}`"
                    />
                  </UDropdownMenu>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ AGREEMENTS.length }} agreements</span>
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
        class="flex flex-col items-center px-6 py-[72px] text-center"
      >
        <span class="mb-4 inline-flex size-[54px] items-center justify-center rounded-[13px] bg-muted text-muted"><UIcon
          name="i-lucide-search"
          class="size-6"
        /></span>
        <h3 class="font-display text-[19px] font-medium text-highlighted">
          No agreements match
        </h3>
        <p class="mt-1.5 text-[13.5px] text-muted">
          Try a different segment, status, or search.
        </p>
        <UButton
          color="neutral"
          variant="outline"
          class="mt-4 rounded-full"
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
          class="w-[288px] flex-none rounded-[14px] border border-default bg-muted p-3.5"
        >
          <div class="flex items-center gap-2 px-1 pb-3">
            <span
              class="size-2 flex-none rounded-full"
              :class="col.dot"
            />
            <span class="text-[13px] font-semibold text-highlighted">{{ col.label }}</span>
            <span class="rounded-full border border-default bg-default px-2 py-px text-xs font-semibold text-muted tabular-nums">{{ col.cards.length }}</span>
          </div>
          <div class="flex min-h-[50px] flex-col gap-2.5">
            <div
              v-for="a in col.cards"
              :key="a.id"
              class="cursor-pointer rounded-xl border border-default bg-default p-3.5 transition-colors hover:border-accented"
              @click="openId = a.id"
            >
              <div class="mb-2.5 flex items-center gap-1.5">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  :class="kindChip(a.kind)"
                >{{ kindLabel(a.kind) }}</span>
                <span
                  v-if="a.kind === 'contract'"
                  class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                  :class="subtypeChip(a.ctype)"
                ><UIcon
                  :name="subtypeIcon(a.ctype)"
                  class="size-3"
                />{{ subtypeLabel(a.ctype) }}</span>
              </div>
              <div class="mb-2.5 text-sm font-semibold leading-snug text-highlighted">
                {{ a.title }}
              </div>
              <div class="mb-3 flex items-center gap-2">
                <span
                  class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[9.5px] font-semibold"
                  :class="AVATAR[a.ci]"
                >{{ initials(a.client) }}</span>
                <span class="truncate text-[12.5px] text-muted">{{ a.client }}</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ valueText(a) }}<span
                  v-if="a.recurring"
                  class="text-[11.5px] font-medium text-muted"
                >/mo</span></span>
                <span
                  class="inline-flex items-center gap-1.5 text-xs tabular-nums"
                  :class="dateClass(a.dateKind)"
                >
                  <UIcon
                    v-if="a.dateKind === 'bad' || a.dateKind === 'expiring'"
                    name="i-lucide-triangle-alert"
                    class="size-3 flex-none"
                  />{{ a.dateText }}
                </span>
              </div>
            </div>
            <div
              v-if="col.cards.length === 0"
              class="rounded-xl border border-dashed border-default p-4 text-center text-[12.5px] text-muted"
            >
              None
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- status legend -->
    <div
      v-if="view === 'table' && filtered.length > 0"
      class="flex flex-wrap items-center gap-4 px-1"
    >
      <span class="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">Status system</span>
      <span
        v-for="l in legend"
        :key="l.label"
        class="inline-flex items-center gap-1.5 text-xs text-muted"
      >
        <span
          class="size-2 rounded-full"
          :class="l.dot"
        />{{ l.label }}
      </span>
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
              <div class="flex min-w-0 items-center gap-2.5">
                <span
                  class="inline-flex size-[30px] flex-none items-center justify-center rounded-lg"
                  :class="kindIconWrap(detail.kind)"
                ><UIcon
                  :name="kindIcon(detail.kind)"
                  class="size-4"
                /></span>
                <div class="min-w-0">
                  <div class="text-[17px] font-semibold leading-tight text-highlighted">
                    {{ detail.title }}
                  </div>
                  <NuxtLink
                    to="/clients"
                    class="mt-1.5 inline-flex items-center gap-2 transition-opacity hover:opacity-80"
                  >
                    <span
                      class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[9.5px] font-semibold"
                      :class="AVATAR[detail.ci]"
                    >{{ initials(detail.client) }}</span>
                    <span class="text-[13px] font-medium text-teal-700">{{ detail.client }}</span>
                  </NuxtLink>
                </div>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="outline"
                square
                size="sm"
                aria-label="Close"
                @click="openId = null"
              />
            </div>
            <div class="mt-3.5 flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                :class="kindChip(detail.kind)"
              >{{ kindLabel(detail.kind) }}</span>
              <span
                v-if="detail.kind === 'contract'"
                class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                :class="subtypeChip(detail.ctype)"
              ><UIcon
                :name="subtypeIcon(detail.ctype)"
                class="size-3"
              />{{ subtypeLabel(detail.ctype) }}</span>
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="STATUS_META[detail.status].chip"
              ><span
                class="size-1.5 rounded-full"
                :class="STATUS_META[detail.status].dot"
              />{{ STATUS_META[detail.status].label }}</span>
            </div>
            <div class="mt-3.5 flex items-baseline gap-2">
              <span class="font-display text-[26px] font-medium tracking-tight text-highlighted tabular-nums">{{ valueText(detail) }}</span>
              <span
                v-if="detail.recurring"
                class="text-sm font-medium text-muted"
              >/mo · recurring</span>
              <span
                v-else
                class="text-[13px] text-muted"
              >one-time total</span>
            </div>
          </div>

          <!-- body -->
          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Line items
            </div>
            <div class="mb-6 overflow-hidden rounded-xl ring-1 ring-default">
              <div
                v-for="(li, i) in detail.items"
                :key="i"
                class="flex items-center justify-between gap-3.5 border-b border-default px-3.5 py-3 last:border-b-0"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 text-[13.5px] font-medium text-highlighted">
                    {{ li.name }}
                    <span
                      v-if="li.custom"
                      class="rounded px-1.5 py-px text-[10px] font-semibold text-muted ring-1 ring-default"
                    >Custom</span>
                    <span
                      v-else
                      class="rounded bg-mist px-1.5 py-px text-[10px] font-semibold text-teal-700"
                    >Service</span>
                  </div>
                  <div class="mt-0.5 text-xs text-muted tabular-nums">
                    {{ li.qty }} × {{ unitText(li, detail) }}
                  </div>
                </div>
                <span class="whitespace-nowrap text-[13.5px] font-semibold text-highlighted tabular-nums">{{ lineTotalText(li, detail) }}</span>
              </div>
              <div class="flex items-center justify-between bg-muted px-3.5 py-3">
                <span class="text-[13px] font-semibold text-highlighted">Total</span>
                <span class="text-[15px] font-bold text-highlighted tabular-nums">{{ valueText(detail) }}<span
                  v-if="detail.recurring"
                  class="text-xs font-medium text-muted"
                >/mo</span></span>
              </div>
            </div>

            <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Status timeline
            </div>
            <div class="mb-2 flex flex-col">
              <div
                v-for="(ev, i) in timeline"
                :key="i"
                class="flex gap-3.5"
              >
                <div class="flex flex-none flex-col items-center">
                  <span
                    class="inline-flex size-5 items-center justify-center rounded-full text-white"
                    :class="ev.dot"
                  >
                    <UIcon
                      v-if="ev.showCheck"
                      name="i-lucide-check"
                      class="size-3"
                    />
                  </span>
                  <span
                    v-if="ev.line"
                    class="min-h-[22px] w-0.5 flex-1 bg-default"
                  />
                </div>
                <div class="pb-4">
                  <div
                    class="text-[13.5px] font-semibold leading-tight"
                    :class="ev.text"
                  >
                    {{ ev.label }}
                  </div>
                  <div class="mt-0.5 text-xs text-muted tabular-nums">
                    {{ ev.date }}
                  </div>
                </div>
              </div>
            </div>

            <template v-if="lineage.length > 0">
              <div class="mb-2.5 mt-4 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
                Related
              </div>
              <div class="flex flex-col gap-2">
                <button
                  v-for="(ln, i) in lineage"
                  :key="i"
                  class="flex items-center gap-3 rounded-xl bg-default px-3.5 py-3 text-left ring-1 ring-default transition-colors hover:bg-muted"
                  @click="ln.open && ln.open()"
                >
                  <span
                    class="inline-flex size-[30px] flex-none items-center justify-center rounded-lg"
                    :class="ln.wrap"
                  ><UIcon
                    :name="ln.icon"
                    class="size-4"
                  /></span>
                  <div class="min-w-0 flex-1">
                    <div class="font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
                      {{ ln.kicker }}
                    </div>
                    <div class="mt-px truncate text-[13.5px] font-semibold text-highlighted">
                      {{ ln.label }}
                    </div>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4 flex-none text-muted"
                  />
                </button>
              </div>
            </template>
          </div>

          <!-- footer -->
          <div class="flex flex-none items-center gap-2.5 border-t border-default px-6 py-3.5">
            <UButton
              icon="i-lucide-external-link"
              color="primary"
              class="flex-1 justify-center"
            >
              Open in PandaDoc
            </UButton>
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              square
              size="lg"
              aria-label="Download PDF"
            />
            <UButton
              icon="i-lucide-rotate-cw"
              color="neutral"
              variant="outline"
              square
              size="lg"
              aria-label="Resend"
            />
            <UButton
              icon="i-lucide-ban"
              color="error"
              variant="outline"
              square
              size="lg"
              aria-label="Void"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
