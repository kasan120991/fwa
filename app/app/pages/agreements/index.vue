<script setup lang="ts">
useHead({ title: 'Agreements · Francis Web Agency' })

// Agreements — every proposal and contract across all clients. Data comes from
// GET /api/agreements (the proposal+contract merge happens server-side at the
// query layer). A row's line items + full timeline load on demand from
// /api/proposals/:id or /api/contracts/:id when its drawer opens. The
// generate/send/void actions remain stubs pending the PandaDoc UI.
type Kind = 'proposal' | 'contract'
type Ctype = 'project' | 'care_plan'
type Status = 'draft' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'declined' | 'expired' | 'voided'

// Shape returned by GET /api/agreements (the merged view).
interface ApiAgreement {
  kind: Kind
  id: number
  uid: string
  client_id: number
  title: string
  status: Status
  total: number
  ctype: Ctype | null
  billing_interval: string
  proposal_id: number | null
  expires_at: string | null
  sent_at: string | null
  viewed_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  client: string
  recurring: boolean
}
// Full record (with line items + all timestamps) from /api/proposals|contracts/:id.
interface ApiLineItem { name_snapshot: string, qty: number, unit_price_snapshot: number, service_id: number | null }
interface ApiRecord {
  id: number
  items: ApiLineItem[]
  created_at: string
  sent_at: string | null
  viewed_at: string | null
  accepted_at?: string | null
  signed_at?: string | null
  declined_at: string | null
  expires_at: string | null
  updated_at: string
}

interface LineItem { name: string, qty: number, unit: number, custom: boolean }
interface Agreement {
  id: string // uid, unique across the union (e.g. "proposal-3")
  numId: number
  contactId: number
  kind: Kind
  ctype?: Ctype
  title: string
  client: string
  ci: number
  status: Status
  total: number
  recurring: boolean
  ts: number // created_at as ms — drives the "recent" sort
  dateText: string
  dateKind: 'good' | 'expiring' | 'bad' | 'muted'
  fromProposal?: string
  lineTo?: string
  producedProject?: boolean
}

const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const STATUS_META: Record<Status, { label: string, chip: string, dot: string }> = {
  draft: { label: 'Draft', chip: 'bg-muted text-default', dot: 'bg-ink-400' },
  sent: { label: 'Sent', chip: 'bg-info/10 text-info', dot: 'bg-info' },
  viewed: { label: 'Viewed', chip: 'bg-mist text-primary', dot: 'bg-teal-600' },
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

const api = useApi()

// Stable avatar tint derived from the client name.
const hashCi = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length

// Human date label + tone for the table's Date column, from status + timestamps.
function deriveDate(r: ApiAgreement): { text: string, kind: Agreement['dateKind'] } {
  const label = STATUS_META[r.status].label
  if (r.status === 'accepted' || r.status === 'signed') return { text: `${label} ${shortDate(r.closed_at)}`, kind: 'good' }
  if (r.status === 'declined' || r.status === 'expired' || r.status === 'voided') return { text: `${label} ${shortDate(r.updated_at)}`, kind: 'bad' }
  if (r.status === 'sent' || r.status === 'viewed') {
    if (r.expires_at) {
      const d = daysFromNow(r.expires_at) ?? 0
      if (d < 0) return { text: `Expired ${Math.abs(d)}d ago`, kind: 'bad' }
      return { text: `Expires in ${d}d`, kind: d <= 5 ? 'expiring' : 'muted' }
    }
    return { text: r.kind === 'proposal' ? 'Awaiting response' : 'Awaiting signature', kind: 'muted' }
  }
  return { text: `Created ${timeAgo(r.created_at)}`, kind: 'muted' }
}

function mapAgreement(r: ApiAgreement): Agreement {
  const d = deriveDate(r)
  return {
    id: r.uid,
    numId: r.id,
    contactId: r.client_id,
    kind: r.kind,
    ctype: r.ctype ?? undefined,
    title: r.title,
    client: r.client,
    ci: hashCi(r.client || '#'),
    status: r.status,
    total: r.total,
    recurring: r.recurring,
    ts: Date.parse((r.created_at || '').replace(' ', 'T')) || 0,
    dateText: d.text,
    dateKind: d.kind
  }
}

const agreements = ref<Agreement[]>([])
const pending = ref(true)
async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiAgreement[] }>('/agreements', { query: { limit: 300 } })
    const rows = data.map(mapAgreement)
    // Cross-reference lineage from the full set: a contract points back to its
    // proposal; a proposal points forward to the contract it produced; a signed
    // project contract produced a project.
    const proposalUid = new Map<number, string>()
    const contractForProposal = new Map<number, ApiAgreement>()
    for (const r of data) {
      if (r.kind === 'proposal') proposalUid.set(r.id, r.uid)
      else if (r.proposal_id != null) contractForProposal.set(r.proposal_id, r)
    }
    rows.forEach((row, i) => {
      const raw = data[i]
      if (raw.kind === 'contract') {
        if (raw.proposal_id != null && proposalUid.has(raw.proposal_id)) row.fromProposal = proposalUid.get(raw.proposal_id)
        if (raw.ctype === 'project' && raw.status === 'signed') row.producedProject = true
      } else {
        const c = contractForProposal.get(raw.id)
        if (c) row.lineTo = c.uid
      }
    })
    agreements.value = rows
  } finally {
    pending.value = false
  }
}
const socket = useSocket()
function onContractChanged() {
  load()
}
onMounted(() => {
  load()
  socket.on('contract:changed', onContractChanged)
})
onBeforeUnmount(() => socket.off('contract:changed', onContractChanged))

const byId = (id?: string | null) => agreements.value.find(a => a.id === id) || null

// ---- presentation helpers ----
const kindLabel = (k: Kind) => (k === 'proposal' ? 'Proposal' : 'Contract')
const kindChip = (k: Kind) => (k === 'proposal'
  ? 'bg-default text-highlighted ring-1 ring-accented'
  : 'bg-teal-800 text-white')
const kindIconWrap = (k: Kind) => (k === 'proposal' ? 'bg-muted text-muted' : 'bg-mist text-primary')
const kindIcon = (k: Kind) => (k === 'proposal' ? 'i-lucide-file-text' : 'i-lucide-file-check-2')
const subtypeLabel = (ct?: Ctype) => (ct === 'care_plan' ? 'Care Plan' : 'Project')
const subtypeChip = (ct?: Ctype) => (ct === 'care_plan' ? 'bg-mist text-primary' : 'bg-muted text-default')
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
// Row click: contracts get a dedicated viewer page (embedded PandaDoc + send/sign);
// proposals still open the quick-peek drawer.
function openRow(a: Agreement) {
  if (a.kind === 'contract') {
    navigateTo(`/contracts/${a.numId}`)
    return
  }
  openId.value = a.id
}

const segCounts = computed(() => ({
  all: agreements.value.length,
  proposals: agreements.value.filter(a => a.kind === 'proposal').length,
  contracts: agreements.value.filter(a => a.kind === 'contract').length
}))

// summary tiles
const awaitingResp = computed(() => agreements.value.filter(a => a.kind === 'proposal' && (a.status === 'sent' || a.status === 'viewed')))
const awaitingSign = computed(() => agreements.value.filter(a => a.kind === 'contract' && (a.status === 'sent' || a.status === 'viewed')))
const inFlightValue = computed(() => agreements.value
  .filter(a => a.status === 'sent' || a.status === 'viewed')
  .reduce((s, a) => s + (a.recurring ? 0 : a.total), 0))

function applyTile(s: 'all' | 'proposals' | 'contracts', sf: Group) {
  seg.value = s
  statusFilter.value = sf
  recurringOnly.value = false
}
const tiles = computed(() => [
  { key: 'resp', label: 'Awaiting Response', value: String(awaitingResp.value.length), sub: 'proposals out', icon: 'i-lucide-clock', on: seg.value === 'proposals' && statusFilter.value === 'inflight', apply: () => applyTile('proposals', 'inflight') },
  { key: 'sign', label: 'Awaiting Signature', value: String(awaitingSign.value.length), sub: 'contracts out', icon: 'i-lucide-file-check-2', on: seg.value === 'contracts' && statusFilter.value === 'inflight', apply: () => applyTile('contracts', 'inflight') },
  { key: 'val', label: 'Value In Flight', value: formatMoney(inFlightValue.value), sub: 'awaiting close', icon: 'i-lucide-dollar-sign', on: seg.value === 'all' && statusFilter.value === 'inflight', apply: () => applyTile('all', 'inflight') }
])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = agreements.value.filter((a) => {
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
    return b.ts - a.ts
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
    label: 'Recurring Only',
    icon: recurringOnly.value ? 'i-lucide-check' : 'i-lucide-repeat',
    onSelect: () => { recurringOnly.value = !recurringOnly.value }
  }]
])
const sortItems = computed(() => [[
  { label: 'Most Recent', icon: sortKey.value === 'recent' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'recent' } },
  { label: 'Value', icon: sortKey.value === 'value' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'value' } },
  { label: 'Client', icon: sortKey.value === 'client' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'client' } },
  { label: 'Status', icon: sortKey.value === 'status' ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = 'status' } }
]])
function rowMenuItems(a: Agreement) {
  const items: { label: string, icon: string, color?: 'error', onSelect?: () => void }[][] = [[
    { label: 'Open In PandaDoc', icon: 'i-lucide-external-link' },
    { label: 'Copy Link', icon: 'i-lucide-link' },
    { label: 'Resend', icon: 'i-lucide-rotate-cw' }
  ]]
  const related = a.lineTo || a.fromProposal
  if (related) items[0].push({ label: 'View Related Agreement', icon: 'i-lucide-link-2', onSelect: () => openAgreement(related) })
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
// The row (from the list) drives the header/chips immediately; the full record
// (line items + all lifecycle timestamps) loads on demand when the drawer opens.
const detail = computed(() => byId(openId.value))
const drawerOpen = computed({
  get: () => !!detail.value,
  set: (v: boolean) => { if (!v) openId.value = null }
})

const detailRecord = ref<ApiRecord | null>(null)
const detailLoading = ref(false)
watch(openId, async (id) => {
  detailRecord.value = null
  const row = byId(id)
  if (!row) return
  detailLoading.value = true
  try {
    const path = row.kind === 'proposal' ? `/proposals/${row.numId}` : `/contracts/${row.numId}`
    const { data } = await api<{ data: ApiRecord }>(path)
    detailRecord.value = data
  } catch {
    detailRecord.value = null
  } finally {
    detailLoading.value = false
  }
})

const detailItems = computed<LineItem[]>(() => {
  const items = detailRecord.value?.items
  if (!items) return []
  return items.map(li => ({ name: li.name_snapshot, qty: li.qty, unit: li.unit_price_snapshot, custom: li.service_id == null }))
})

const timeline = computed(() => {
  const rec = detailRecord.value
  const row = detail.value
  if (!rec || !row) return []
  const steps: { k: Status, label: string, date: string }[] = [{ k: 'draft', label: 'Created', date: shortDate(rec.created_at) }]
  if (rec.sent_at) steps.push({ k: 'sent', label: 'Sent', date: shortDate(rec.sent_at) })
  if (rec.viewed_at) steps.push({ k: 'viewed', label: 'Viewed', date: shortDate(rec.viewed_at) })
  const terminalDate: Record<string, string | null | undefined> = {
    accepted: rec.accepted_at, signed: rec.signed_at, declined: rec.declined_at, expired: rec.expires_at, voided: rec.updated_at
  }
  if (['accepted', 'signed', 'declined', 'expired', 'voided'].includes(row.status)) {
    steps.push({ k: row.status, label: STATUS_META[row.status].label, date: shortDate(terminalDate[row.status] || rec.updated_at) })
  }
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
    <PageHeader
      icon="i-lucide-file-signature"
      title="Agreements"
      :count="agreements.length"
      subtitle="Every proposal and contract across all clients, generated and signed through PandaDoc."
    >
      <template #actions>
        <UButton
          icon="i-lucide-file-check-2"
          color="neutral"
          variant="outline"
        >
          New Contract
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
        >
          New Proposal
        </UButton>
      </template>
    </PageHeader>

    <!-- summary tiles -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border p-4 text-left transition-colors"
        :class="t.on ? 'border-primary bg-mist' : 'border-default bg-default hover:border-accented'"
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

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
        <button
          v-for="s in segments"
          :key="s.key"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
          :class="seg === s.key ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
          @click="seg = s.key"
        >
          {{ s.label }}
          <span
            class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
            :class="seg === s.key ? 'bg-mist text-primary' : 'bg-elevated text-muted'"
          >{{ s.count }}</span>
        </button>
      </div>

      <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search title or client…"
          class="w-full sm:w-[230px]"
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
      <div
        v-if="pending"
        class="px-6 py-16 text-center text-sm text-muted"
      >
        Loading agreements…
      </div>
      <template v-else-if="filtered.length > 0">
        <!-- mobile cards -->
        <ul class="divide-y divide-default sm:hidden">
          <li
            v-for="a in filtered"
            :key="a.id"
            class="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted"
            @click="openRow(a)"
          >
            <span class="inline-flex size-9 flex-none items-center justify-center rounded-lg" :class="kindIconWrap(a.kind)"><UIcon :name="kindIcon(a.kind)" class="size-4" /></span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-highlighted">{{ a.title }}</div>
              <div class="truncate text-[12.5px] text-muted">{{ kindLabel(a.kind) }} · {{ a.client }}</div>
            </div>
            <span class="inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" :class="STATUS_META[a.status].chip">
              <span class="size-1.5 rounded-full" :class="STATUS_META[a.status].dot" />{{ STATUS_META[a.status].label }}
            </span>
          </li>
        </ul>

        <!-- table (sm+) -->
        <div class="hidden overflow-x-auto sm:block">
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
                @click="openRow(a)"
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
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ agreements.length }} agreements</span>
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
        <h3 class="font-display text-lg font-medium text-highlighted">
          No Agreements Match
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Try a different segment, status, or search.
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
              @click="openRow(a)"
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
                    <span class="text-[13px] font-medium text-primary">{{ detail.client }}</span>
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
                v-if="detailLoading && !detailItems.length"
                class="px-3.5 py-4 text-center text-xs text-muted"
              >
                Loading line items…
              </div>
              <div
                v-for="(li, i) in detailItems"
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
                      class="rounded bg-mist px-1.5 py-px text-[10px] font-semibold text-primary"
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
            <!-- Contracts open the dedicated viewer (embedded PandaDoc + send/sign). -->
            <UButton
              v-if="detail.kind === 'contract'"
              icon="i-lucide-file-signature"
              color="primary"
              class="flex-1 justify-center"
              :to="`/contracts/${detail.numId}`"
            >
              Open Contract
            </UButton>
            <template v-else>
              <UButton
                icon="i-lucide-external-link"
                color="primary"
                class="flex-1 justify-center"
              >
                Open In PandaDoc
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
            </template>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
