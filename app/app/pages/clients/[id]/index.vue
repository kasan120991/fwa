<script setup lang="ts">
const route = useRoute()
const { user } = useAuth()
const api = useApi()
const { resolveUrl } = useUploads()

// Identity/profile comes from GET /api/clients/:id. The tabs below (projects,
// invoices, websites, …) stay representative sample data until those tables exist.
type Stage = 'active' | 'past'
interface ClientIdentity {
  name: string
  initials: string
  avatar: string
  logo: string
  domain: string
  stage: Stage
  contact: string
  contactTitle: string
  email: string
  phone: string
  address: string[]
  since: string
  sinceShort: string
  tags: { label: string, tone: 'primary' | 'neutral' | 'outline' }[]
}

interface ApiContact {
  id: number
  company: string | null
  name: string
  title: string | null
  email: string | null
  phone: string | null
  website: string | null
  logo_url: string | null
  status: string
  tags: string[] | null
  notes: string | null
  client_since: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
}

const AVATAR = ['bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default', 'bg-warning/10 text-warning']
const TAG_TONE: Record<string, 'primary' | 'neutral' | 'outline'> = { Retainer: 'primary', Priority: 'outline' }

function buildClient(c: ApiContact): ClientIdentity {
  const cityLine = [c.city, [c.region, c.postal_code].filter(Boolean).join(' ').trim()].filter(Boolean).join(', ')
  const address = [c.address_line1, c.address_line2, cityLine, c.country].filter(Boolean) as string[]
  const sinceDate = c.client_since ? new Date(`${c.client_since}T00:00:00`) : null
  return {
    name: c.company || c.name,
    initials: initials(c.company || c.name),
    avatar: AVATAR[c.id % AVATAR.length],
    logo: c.logo_url || '',
    domain: c.website || '',
    stage: c.status === 'past' ? 'past' : 'active',
    contact: c.name,
    contactTitle: c.title || '',
    email: c.email || '',
    phone: c.phone || '',
    address,
    since: sinceDate ? sinceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    sinceShort: sinceDate ? sinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
    tags: (c.tags || []).map(label => ({ label, tone: TAG_TONE[label] || 'neutral' }))
  }
}

const client = ref<ClientIdentity | null>(null)
const pending = ref(true)

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiContact }>(`/clients/${route.params.id}`)
    client.value = buildClient(data)
    notes.value = data.notes || ''
  } catch {
    client.value = null
  } finally {
    pending.value = false
  }
}
const websiteSocket = useSocket()
onMounted(() => {
  load()
  loadContracts()
  loadProjects()
  loadInvoices()
  loadWebsites()
  loadHosting()
  loadTickets()
  loadCalls()
  websiteSocket.on('website:changed', loadWebsites)
  websiteSocket.on('website:changed', loadHosting)
  websiteSocket.on('ticket:created', loadTickets)
  websiteSocket.on('ticket:updated', loadTickets)
  websiteSocket.on('ticket:deleted', loadTickets)
  websiteSocket.on('call:new', loadCalls)
  websiteSocket.on('call:changed', loadCalls)
})
onBeforeUnmount(() => {
  websiteSocket.off('website:changed', loadWebsites)
  websiteSocket.off('ticket:created', loadTickets)
  websiteSocket.off('ticket:updated', loadTickets)
  websiteSocket.off('ticket:deleted', loadTickets)
  websiteSocket.off('call:new', loadCalls)
  websiteSocket.off('call:changed', loadCalls)
})

useHead({ title: () => `${client.value?.name ?? 'Client'} · Francis Web Agency` })

function saveNotes() {
  api(`/clients/${route.params.id}`, { method: 'PATCH', body: { notes: notes.value } }).catch(() => {})
}

function money(n: number) {
  return n === 0 ? '$0' : `$${n.toLocaleString('en-US')}`
}

const STAGE_META: Record<Stage, { status: 'success' | 'neutral', label: string }> = {
  active: { status: 'success', label: 'Active' },
  past: { status: 'neutral', label: 'Past' }
}

const ownerInitials = computed(() => {
  const p = (user.value?.name || 'Jordan Rivera').trim().split(/\s+/)
  return (p[0][0] + (p[1]?.[0] ?? '')).toUpperCase()
})

const notes = ref('')

// ---------- new-project form ----------
const projectFormOpen = ref(false)
function openNewProject() {
  projectFormOpen.value = true
}
function onProjectSaved() {
  loadProjects()
}

// ---------- projects (real, from /projects?client_id=) ----------
type PStatus = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'
interface ApiProject {
  id: number
  name: string
  status: PStatus
  project_fee: number | null
  target_launch_date: string | null
  task_total: number
  task_done: number
}
const PROJECT_META: Record<PStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success', bar: string }> = {
  planning: { label: 'Planning', status: 'neutral', bar: 'bg-ink-400' },
  awaiting_signature: { label: 'Awaiting Signature', status: 'info', bar: 'bg-info' },
  awaiting_deposit: { label: 'Awaiting Deposit', status: 'warning', bar: 'bg-warning' },
  in_progress: { label: 'In Progress', status: 'info', bar: 'bg-info' },
  in_review: { label: 'In Review', status: 'info', bar: 'bg-teal-500' },
  awaiting_final: { label: 'Awaiting Final Payment', status: 'warning', bar: 'bg-warning' },
  on_hold: { label: 'On Hold', status: 'warning', bar: 'bg-warning' },
  completed: { label: 'Completed', status: 'success', bar: 'bg-success' }
}
const projects = ref<{ id: number, name: string, status: 'neutral' | 'info' | 'warning' | 'success', statusLabel: string, progress: number, bar: string, due: string, value: string, tasks: number }[]>([])
async function loadProjects() {
  try {
    const { data } = await api<{ data: ApiProject[] }>('/projects', { query: { client_id: route.params.id } })
    projects.value = data.map((p) => {
      const meta = PROJECT_META[p.status]
      return {
        id: p.id,
        name: p.name,
        status: meta.status,
        statusLabel: meta.label,
        progress: p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0,
        bar: meta.bar,
        due: p.target_launch_date ? shortDate(p.target_launch_date) : '—',
        value: p.project_fee != null ? formatMoney(p.project_fee) : '—',
        tasks: p.task_total - p.task_done
      }
    })
  } catch { /* leave empty on failure */ }
}

// ---------- tab sample data (representative until API) ----------

// Websites — this client's sites, from GET /api/websites?client_id= .
interface ApiWebsite {
  id: number
  name: string
  domain: string
  url: string | null
  environment: 'live' | 'staging' | 'dev'
  connected: boolean
  last_synced_at: string | null
  visitors_30d: number
  delta_pct: number | null
  spark: number[]
}
const websiteRows = ref<ApiWebsite[]>([])
const websiteFormOpen = ref(false)
async function loadWebsites() {
  const { data } = await api<{ data: ApiWebsite[] }>('/websites', { query: { client_id: route.params.id } })
  websiteRows.value = data
}
const ENV_LABEL: Record<string, string> = { live: 'Live', staging: 'Staging', dev: 'Dev' }
const websites = computed(() => websiteRows.value.map((w) => {
  const sp = spark(w.spark, 118, 32)
  return {
    id: w.id,
    name: w.name,
    url: w.domain,
    href: w.url || `https://${w.domain}`,
    connected: w.connected,
    env: ENV_LABEL[w.environment] ?? w.environment,
    synced: w.last_synced_at ? timeAgo(w.last_synced_at) : '',
    visitors: w.visitors_30d.toLocaleString(),
    delta: w.delta_pct != null ? `${w.delta_pct >= 0 ? '+' : ''}${w.delta_pct}%` : '',
    spark: sp.line,
    sparkArea: sp.area
  }
}))
const connectedWebsites = computed(() => websiteRows.value.filter(w => w.connected).length)
const liveWebsites = computed(() => websiteRows.value.filter(w => w.environment === 'live').length)
const envClass = (e: string) => e === 'Live' ? 'text-success' : (e === 'Staging' ? 'text-warning' : 'text-muted')

// Hosting cost & margin — live DigitalOcean droplet cost vs care-plan MRR.
interface Hosting {
  configured: boolean
  monthly_cost?: number
  droplet_count?: number
  mrr?: number
  margin?: number
  margin_pct?: number | null
  error?: string
}
const hosting = ref<Hosting | null>(null)
async function loadHosting() {
  const { data } = await api<{ data: Hosting }>(`/clients/${route.params.id}/hosting`)
  hosting.value = data
}

// Invoices tab — this client's invoices, from GET /api/invoices?client_id= .
type InvStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
type ChipStatus = 'neutral' | 'info' | 'success' | 'error' | 'warning'
interface ApiInvoice {
  id: number
  number: string | null
  status: InvStatus
  amount_due: number
  amount_paid: number
  due_date: string | null
  finalized_at: string | null
  created_at: string
  is_overdue: boolean
}
const INV_STATUS: Record<InvStatus, { label: string, status: ChipStatus }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
function invChip(i: ApiInvoice): { label: string, status: ChipStatus } {
  return i.is_overdue ? { label: 'Overdue', status: 'warning' } : INV_STATUS[i.status]
}

const invoicesRaw = ref<ApiInvoice[]>([])
const invoicesPending = ref(true)
async function loadInvoices() {
  invoicesPending.value = true
  try {
    const { data } = await api<{ data: ApiInvoice[] }>('/invoices', { query: { client_id: route.params.id } })
    invoicesRaw.value = data
  } catch {
    invoicesRaw.value = []
  } finally {
    invoicesPending.value = false
  }
}

interface InvoiceRow { key: number, num: string, issue: string, due: string, amount: string, balance: string, balanceZero: boolean, status: ChipStatus, statusLabel: string, overdue: boolean }
const invoices = computed<InvoiceRow[]>(() => invoicesRaw.value.map((i) => {
  const c = invChip(i)
  const balance = i.amount_due - i.amount_paid
  return {
    key: i.id,
    num: i.number || (i.status === 'draft' ? 'Draft' : '—'),
    issue: shortDate(i.finalized_at || i.created_at),
    due: i.due_date ? shortDate(i.due_date) : '—',
    amount: formatMoney(i.amount_due),
    balance: formatMoney(balance),
    balanceZero: balance <= 0,
    status: c.status,
    statusLabel: c.label,
    overdue: i.is_overdue
  }
}))
// Outstanding = unpaid balance across open invoices; drives the metric strip,
// the tab header, and the overview card.
const outstanding = computed(() => invoicesRaw.value.filter(i => i.status === 'open').reduce((s, i) => s + (i.amount_due - i.amount_paid), 0))
const openCount = computed(() => invoicesRaw.value.filter(i => i.status === 'open').length)
const totalBilled = computed(() => invoicesRaw.value.filter(i => i.status !== 'draft' && i.status !== 'void').reduce((s, i) => s + i.amount_due, 0))
const latestInvoice = computed(() => invoicesRaw.value[0] ?? null)
// Shared invoice slideover — opened by id from the Invoices tab rows.
const openInvoiceId = ref<number | null>(null)

// Contracts tab — this client's proposals + contracts, from the merged
// GET /api/agreements?client_id= view. (Other tabs remain sample data.)
type AgreementStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'declined' | 'expired' | 'voided'
interface ApiAgreementRow {
  kind: 'proposal' | 'contract'
  uid: string
  title: string
  status: AgreementStatus
  total: number
  recurring: boolean
  created_at: string
  closed_at: string | null
  updated_at: string
}
interface ContractRow { key: string, title: string, type: 'Contract' | 'Proposal', status: 'success' | 'info' | 'error' | 'neutral', statusLabel: string, meta: string, value: string }

const AGREEMENT_STATUS: Record<AgreementStatus, { status: ContractRow['status'], label: string }> = {
  draft: { status: 'neutral', label: 'Draft' },
  sent: { status: 'info', label: 'Sent' },
  viewed: { status: 'info', label: 'Viewed' },
  accepted: { status: 'success', label: 'Accepted' },
  signed: { status: 'success', label: 'Signed' },
  declined: { status: 'error', label: 'Declined' },
  expired: { status: 'neutral', label: 'Expired' },
  voided: { status: 'error', label: 'Voided' }
}

function mapContractRow(r: ApiAgreementRow): ContractRow {
  const type = r.kind === 'contract' ? 'Contract' : 'Proposal'
  const m = AGREEMENT_STATUS[r.status]
  let hint = 'Not sent'
  if (r.status === 'accepted' || r.status === 'signed') hint = `${m.label} ${shortDate(r.closed_at)}`
  else if (r.status === 'sent' || r.status === 'viewed') hint = type === 'Contract' ? 'Awaiting signature' : 'Awaiting response'
  else if (r.status === 'declined' || r.status === 'expired' || r.status === 'voided') hint = `${m.label} ${shortDate(r.updated_at)}`
  return {
    key: r.uid,
    title: r.title,
    type,
    status: m.status,
    statusLabel: m.label,
    meta: [type, shortDate(r.created_at), hint].filter(Boolean).join(' · '),
    value: formatMoney(r.total) + (r.recurring ? '/mo' : '')
  }
}

const contracts = ref<ContractRow[]>([])
const contractsPending = ref(true)
async function loadContracts() {
  contractsPending.value = true
  try {
    const { data } = await api<{ data: ApiAgreementRow[] }>('/agreements', { query: { client_id: route.params.id } })
    contracts.value = data.map(mapContractRow)
  } catch {
    contracts.value = []
  } finally {
    contractsPending.value = false
  }
}

const filesCount = ref(0)

const PRIO_CLASS: Record<string, string> = { High: 'bg-error', Medium: 'bg-warning', Low: 'bg-ink-400' }
// Support tickets (real, from /tickets?client_id=). Mapped to a small view model
// so the Support tab + overview widget render without per-row lookups.
interface ApiTicket { id: number, subject: string, status: string, priority: string, created_at: string, last_activity_at: string }
const TICKET_CHIP: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { open: 'info', in_progress: 'info', waiting: 'warning', resolved: 'success', closed: 'neutral' }
const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In Progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' }
const TICKET_PRIO_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' }
const ticketsRaw = ref<ApiTicket[]>([])
async function loadTickets() {
  try {
    const { data } = await api<{ data: ApiTicket[] }>('/tickets', { query: { client_id: route.params.id } })
    ticketsRaw.value = data
  } catch { /* non-fatal */ }
}
const tickets = computed(() => ticketsRaw.value.map(t => ({
  id: t.id,
  code: ticketCode(t.id),
  subject: t.subject,
  status: TICKET_CHIP[t.status] ?? 'neutral',
  statusLabel: TICKET_STATUS_LABEL[t.status] ?? t.status,
  prio: TICKET_PRIO_LABEL[t.priority] ?? 'Medium',
  created: shortDate(t.created_at),
  updated: timeAgo(t.last_activity_at),
  open: t.status !== 'resolved' && t.status !== 'closed'
})))
const openTicketCount = computed(() => tickets.value.filter(t => t.open).length)

const supportFilter = ref<'all' | 'open' | 'resolved' | 'closed'>('all')
const supportFilters = computed(() => [
  { key: 'all' as const, label: 'All', count: tickets.value.length },
  { key: 'open' as const, label: 'Open', count: openTicketCount.value },
  { key: 'resolved' as const, label: 'Resolved', count: tickets.value.filter(t => t.statusLabel === 'Resolved').length },
  { key: 'closed' as const, label: 'Closed', count: tickets.value.filter(t => t.statusLabel === 'Closed').length }
])
const visibleTickets = computed(() => tickets.value.filter((t) => {
  const f = supportFilter.value
  if (f === 'all') return true
  if (f === 'open') return t.open
  if (f === 'resolved') return t.statusLabel === 'Resolved'
  return t.statusLabel === 'Closed'
}))

// ---- new-ticket form (client prefilled) ----
const ticketFormOpen = ref(false)
function openNewTicket() {
  ticketFormOpen.value = true
}

const activity = [
  { icon: 'i-lucide-life-buoy', tone: 'text-warning', text: 'Ticket #4821 moved to In progress', meta: 'by Jordan Rivera', time: '2h ago' },
  { icon: 'i-lucide-receipt-text', tone: 'text-info', text: 'Invoice INV-1042 sent — $4,000', meta: 'Due Jul 20', time: 'Jun 20' },
  { icon: 'i-lucide-file-text', tone: 'text-muted', text: 'Note added: "Client wants launch before Q3."', meta: 'by Jordan Rivera', time: 'Jun 19' },
  { icon: 'i-lucide-file-check-2', tone: 'text-info', text: 'Proposal "Storefront Rebuild SOW" sent', meta: '$9,000', time: 'Jun 18' },
  { icon: 'i-lucide-globe', tone: 'text-primary', text: 'Website "Summer Campaign LP" added', meta: 'Staging environment', time: 'Jun 15' },
  { icon: 'i-lucide-flag', tone: 'text-success', text: 'Status changed Lead → Active', meta: 'by Jordan Rivera', time: 'Mar 14, 2023' }
]

// ---------- calls (real, from /calls?client_id=) ----------
type CallClass = 'inquiry' | 'client' | 'spam' | 'wrong_number' | 'other'
interface ApiCall {
  id: number
  classification: CallClass
  caller_number: string
  caller_name: string | null
  summary: string | null
  duration_seconds: number | null
  recording_url: string | null
  occurred_at: string
}
const CALL_LABEL: Record<CallClass, string> = { inquiry: 'Inquiry', client: 'Client', spam: 'Spam', wrong_number: 'Wrong Number', other: 'Other' }
const CALL_CHIP: Record<CallClass, ChipStatus> = { inquiry: 'info', client: 'success', spam: 'error', wrong_number: 'neutral', other: 'neutral' }
const callsRaw = ref<ApiCall[]>([])
async function loadCalls() {
  try {
    const { data } = await api<{ data: ApiCall[] }>('/calls', { query: { client_id: route.params.id } })
    callsRaw.value = data
  } catch { /* non-fatal */ }
}
const calls = computed(() => callsRaw.value.map(c => ({
  id: c.id,
  who: c.caller_name || formatPhone(c.caller_number),
  summary: c.summary || 'No summary captured.',
  status: CALL_CHIP[c.classification] ?? 'neutral',
  statusLabel: CALL_LABEL[c.classification] ?? c.classification,
  when: shortDate(c.occurred_at),
  ago: timeAgo(c.occurred_at),
  duration: c.duration_seconds ? durationMMSS(c.duration_seconds) : '—',
  hasRecording: !!c.recording_url
})))

// ---------- tabs ----------
const activeTab = ref<'overview' | 'projects' | 'websites' | 'invoices' | 'contracts' | 'files' | 'support' | 'calls' | 'activity'>('overview')
const tabs = computed(() => [
  { key: 'overview' as const, label: 'Overview', badge: null },
  { key: 'projects' as const, label: 'Projects', badge: projects.value.length || null },
  { key: 'websites' as const, label: 'Websites', badge: websites.value.length || null },
  { key: 'invoices' as const, label: 'Invoices', badge: invoicesRaw.value.length || null },
  { key: 'contracts' as const, label: 'Contracts', badge: contracts.value.length || null },
  { key: 'files' as const, label: 'Files', badge: filesCount.value || null },
  { key: 'support' as const, label: 'Support', badge: openTicketCount.value || null },
  { key: 'calls' as const, label: 'Calls', badge: callsRaw.value.length || null },
  { key: 'activity' as const, label: 'Activity', badge: null }
])

const metrics = computed(() => [
  { label: 'Active Projects', value: String(projects.value.length), sub: '', tone: 'text-highlighted' },
  { label: 'Open Tickets', value: String(openTicketCount.value), sub: '', tone: 'text-highlighted' },
  { label: 'Websites', value: String(websites.value.length), sub: liveWebsites.value ? `${liveWebsites.value} live` : '', tone: 'text-highlighted' },
  { label: 'Outstanding', value: money(outstanding.value), sub: openCount.value ? `${openCount.value} unpaid` : '', tone: outstanding.value > 0 ? 'text-error' : 'text-highlighted' },
  { label: 'Total Billed', value: money(totalBilled.value), sub: 'lifetime', tone: 'text-highlighted' }
])

const headerMenu = [[
  { label: 'New Invoice', icon: 'i-lucide-receipt-text' },
  { label: 'New Proposal', icon: 'i-lucide-file-text' },
  { label: 'New Ticket', icon: 'i-lucide-life-buoy', onSelect: openNewTicket },
  { label: 'Add Website', icon: 'i-lucide-globe', onSelect: () => { websiteFormOpen.value = true } }
], [
  { label: 'Archive Client', icon: 'i-lucide-archive', color: 'error' as const }
]]

function websiteMenu(w: { href: string, id: number }) {
  return [[
    { label: 'Visit Site', icon: 'i-lucide-external-link', to: w.href, target: '_blank' },
    { label: 'View Analytics', icon: 'i-lucide-chart-line', onSelect: () => navigateTo(`/websites/${w.id}`) },
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/websites/${w.id}`) }
  ], [
    { label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const }
  ]]
}

const tagVariant = { primary: 'soft', neutral: 'soft', outline: 'outline' } as const
const tagColor = { primary: 'primary', neutral: 'neutral', outline: 'neutral' } as const
</script>

<template>
  <div
    v-if="pending"
    class="flex min-h-[60vh] items-center justify-center text-sm text-muted"
  >
    Loading client…
  </div>

  <div
    v-else-if="!client"
    class="flex min-h-[60vh] items-center justify-center"
  >
    <div class="flex max-w-md flex-col items-center rounded-card bg-default px-10 py-14 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          name="i-lucide-user-x"
          class="size-6"
        />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">
        Client Not Found
      </h2>
      <p class="mt-2 text-[15px] text-muted">
        We couldn't find that client.
      </p>
      <UButton
        to="/clients"
        variant="soft"
        color="primary"
        class="mt-6"
        icon="i-lucide-arrow-left"
      >
        Back To Clients
      </UButton>
    </div>
  </div>

  <template v-else>
    <!-- header identity -->
    <div class="flex flex-wrap items-center justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="client.logo"
          :src="resolveUrl(client.logo)"
          alt=""
          class="size-[58px] flex-none rounded-[14px] object-cover ring ring-default"
        >
        <span
          v-else
          class="inline-flex size-[58px] flex-none items-center justify-center rounded-[14px] font-display text-2xl font-medium tracking-tight"
          :class="client.avatar"
        >{{ client.initials }}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">
              {{ client.name }}
            </h1>
            <StatusChip :status="STAGE_META[client.stage].status">
              {{ STAGE_META[client.stage].label }}
            </StatusChip>
          </div>
          <div class="mt-1.5 flex items-center gap-3.5">
            <a
              :href="`https://${client.domain}`"
              target="_blank"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
            >
              <UIcon
                name="i-lucide-globe"
                class="size-[15px]"
              />{{ client.domain }}
            </a>
            <span class="text-[13px] text-muted">Client since {{ client.sinceShort }}</span>
          </div>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton
          :to="`/clients/${route.params.id}/edit`"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          class="rounded-full"
        >
          Edit
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openNewProject"
        >
          New Project
        </UButton>
        <UDropdownMenu :items="headerMenu">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="outline"
            square
            aria-label="More actions"
          />
        </UDropdownMenu>
      </div>
    </div>

    <!-- metric strip -->
    <div class="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      <div
        v-for="m in metrics"
        :key="m.label"
        class="rounded-[14px] bg-default p-4 ring ring-default"
      >
        <div class="mb-2 whitespace-nowrap text-[12.5px] text-muted">
          {{ m.label }}
        </div>
        <div class="flex items-baseline gap-2">
          <span
            class="font-display text-2xl font-medium leading-none tracking-tight tabular-nums"
            :class="m.tone"
          >{{ m.value }}</span>
          <span
            v-if="m.sub"
            class="text-xs text-muted"
          >{{ m.sub }}</span>
        </div>
      </div>
    </div>

    <!-- body -->
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
      <!-- profile panel -->
      <div class="flex flex-col gap-4 lg:sticky lg:top-4">
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="border-b border-default p-[18px]">
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Primary contact
            </div>
            <div class="mt-2.5 flex items-center gap-3">
              <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-full bg-sand text-[13px] font-semibold text-highlighted">
                {{ client.contact.split(' ').map(w => w[0]).slice(0, 2).join('') }}
              </span>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-highlighted">
                  {{ client.contact }}
                </div>
                <div class="text-[13px] text-muted">
                  {{ client.contactTitle }}
                </div>
              </div>
            </div>
            <div class="mt-3.5 flex flex-col gap-2.5">
              <a
                :href="`mailto:${client.email}`"
                class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
              >
                <UIcon
                  name="i-lucide-mail"
                  class="size-[15px] flex-none text-muted"
                />{{ client.email }}
              </a>
              <a
                :href="`tel:${phoneDigits(client.phone)}`"
                class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
              >
                <UIcon
                  name="i-lucide-phone"
                  class="size-[15px] flex-none text-muted"
                />{{ formatPhone(client.phone) }}
              </a>
            </div>
          </div>

          <div class="border-b border-default p-[18px]">
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Billing address
            </div>
            <div class="mt-2.5 text-[13.5px] leading-relaxed text-default">
              <div
                v-for="line in client.address"
                :key="line"
              >
                {{ line }}
              </div>
            </div>
          </div>

          <div class="border-b border-default p-[18px]">
            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Tags
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="t in client.tags"
                :key="t.label"
                :color="tagColor[t.tone]"
                :variant="tagVariant[t.tone]"
                size="sm"
                class="rounded-full"
              >
                {{ t.label }}
              </UBadge>
            </div>
          </div>

          <div class="flex flex-col gap-3 p-[18px]">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[13px] text-muted">Client since</span>
              <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ client.since }}</span>
            </div>
          </div>
        </div>

        <!-- notes -->
        <div class="rounded-card bg-default p-[18px] ring ring-default">
          <div class="mb-2.5 flex items-center justify-between">
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Internal notes
            </div>
            <span class="text-xs text-muted">{{ notes.length }} chars</span>
          </div>
          <UTextarea
            v-model="notes"
            :rows="4"
            autoresize
            placeholder="Add a private note about this client…"
            class="w-full"
            @blur="saveNotes"
          />
        </div>
      </div>

      <!-- main panel -->
      <div class="flex min-w-0 flex-col gap-[18px]">
        <!-- tab bar -->
        <div class="flex items-center gap-1 overflow-x-auto border-b border-default">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-3 pt-2.5 text-sm transition-colors"
            :class="activeTab === t.key ? 'border-teal-400 font-semibold text-highlighted' : 'border-transparent font-medium text-muted hover:text-highlighted'"
            @click="activeTab = t.key"
          >
            {{ t.label }}
            <span
              v-if="t.badge != null"
              class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
              :class="activeTab === t.key ? 'bg-mist text-primary' : 'bg-muted text-muted'"
            >{{ t.badge }}</span>
          </button>
        </div>

        <!-- OVERVIEW -->
        <div
          v-if="activeTab === 'overview'"
          class="flex flex-col gap-4"
        >
          <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
            <!-- active projects mini -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Active projects</span>
                <button
                  class="text-[13px] font-semibold text-primary"
                  @click="activeTab = 'projects'"
                >
                  View all
                </button>
              </div>
              <div
                v-for="p in projects"
                :key="p.id"
                class="flex items-center gap-3 border-t border-default px-[18px] py-3"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-highlighted">
                    {{ p.name }}
                  </div>
                  <div class="mt-1.5 flex items-center gap-2">
                    <div class="h-[5px] max-w-[150px] flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full"
                        :class="p.bar"
                        :style="{ width: p.progress + '%' }"
                      />
                    </div>
                    <span class="text-xs text-muted tabular-nums">{{ p.progress }}%</span>
                  </div>
                </div>
                <StatusChip :status="p.status">
                  {{ p.statusLabel }}
                </StatusChip>
              </div>
              <div
                v-if="!projects.length"
                class="flex flex-col items-center border-t border-default px-[18px] py-8 text-center"
              >
                <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                  name="i-lucide-folder-plus"
                  class="size-5"
                /></span>
                <p class="text-sm text-muted">
                  No active projects yet.
                </p>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="mt-4 rounded-full"
                  icon="i-lucide-plus"
                  @click="openNewProject"
                >
                  New Project
                </UButton>
              </div>
            </div>
            <!-- latest invoice + websites -->
            <div class="flex flex-col gap-4">
              <div class="rounded-card bg-default p-[18px] ring ring-default">
                <div class="mb-3.5 flex items-center justify-between">
                  <span class="text-[15px] font-semibold text-highlighted">Latest invoice</span>
                  <button
                    class="text-[13px] font-semibold text-primary"
                    @click="activeTab = 'invoices'"
                  >
                    All invoices
                  </button>
                </div>
                <div
                  v-if="latestInvoice"
                  class="flex items-center justify-between gap-3"
                >
                  <div>
                    <div class="text-sm font-semibold text-highlighted tabular-nums">
                      {{ latestInvoice.number || (latestInvoice.status === 'draft' ? 'Draft' : '—') }}
                    </div>
                    <div class="mt-0.5 text-[13px] text-muted">
                      {{ latestInvoice.due_date ? `Due ${shortDate(latestInvoice.due_date)} · ` : '' }}{{ formatMoney(latestInvoice.amount_due) }}
                    </div>
                  </div>
                  <StatusChip :status="invChip(latestInvoice).status">
                    {{ invChip(latestInvoice).label }}
                  </StatusChip>
                </div>
                <div
                  v-else
                  class="py-1 text-[13px] text-muted"
                >
                  No invoices yet.
                </div>
                <div class="my-3.5 border-t border-default" />
                <div class="flex items-center justify-between">
                  <span class="text-[13px] text-muted">Outstanding</span>
                  <span
                    class="text-[15px] font-bold tabular-nums"
                    :class="outstanding > 0 ? 'text-error' : 'text-highlighted'"
                  >{{ money(outstanding) }}</span>
                </div>
              </div>
              <div class="rounded-card bg-default p-[18px] ring ring-default">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-[15px] font-semibold text-highlighted">Websites</span>
                  <button
                    class="text-[13px] font-semibold text-primary"
                    @click="activeTab = 'websites'"
                  >
                    Manage
                  </button>
                </div>
                <div class="flex items-center justify-between text-[13.5px]">
                  <span class="text-default">{{ websites.length }} {{ websites.length === 1 ? 'site' : 'sites' }}</span>
                  <span class="inline-flex items-center gap-1.5 font-semibold text-success"><span class="size-[7px] rounded-full bg-success" />{{ connectedWebsites }} analytics connected</span>
                </div>
              </div>
              <!-- hosting cost & margin -->
              <div class="rounded-card bg-default p-[18px] ring ring-default">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-[15px] font-semibold text-highlighted">Hosting margin</span>
                  <span class="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">Monthly</span>
                </div>
                <p
                  v-if="!hosting"
                  class="text-[13px] text-muted"
                >
                  Loading…
                </p>
                <p
                  v-else-if="!hosting.configured"
                  class="text-[13px] text-muted"
                >
                  Connect DigitalOcean to see hosting cost.
                </p>
                <p
                  v-else-if="hosting.error"
                  class="text-[13px] text-muted"
                >
                  Couldn't load hosting cost.
                </p>
                <template v-else>
                  <div class="flex items-center justify-between text-[13.5px]">
                    <span class="text-muted">Care plan</span>
                    <span class="tabular-nums text-default">{{ formatMoney(hosting.mrr ?? 0) }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between text-[13.5px]">
                    <span class="text-muted">Hosting cost{{ hosting.droplet_count ? ` · ${hosting.droplet_count} droplet${hosting.droplet_count === 1 ? '' : 's'}` : '' }}</span>
                    <span class="tabular-nums text-default">{{ formatMoney(hosting.monthly_cost ?? 0) }}</span>
                  </div>
                  <div class="my-3 border-t border-default" />
                  <div class="flex items-center justify-between">
                    <span class="text-[13px] text-muted">Margin</span>
                    <span
                      class="text-[15px] font-bold tabular-nums"
                      :class="(hosting.margin ?? 0) >= 0 ? 'text-success' : 'text-error'"
                    >
                      {{ formatMoney(hosting.margin ?? 0) }}<span
                        v-if="hosting.margin_pct != null"
                        class="ml-1 text-[12px] font-semibold text-muted"
                      >({{ hosting.margin_pct }}%)</span>
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            <!-- open tickets -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Open tickets</span>
                <button
                  class="text-[13px] font-semibold text-primary"
                  @click="activeTab = 'support'"
                >
                  Support
                </button>
              </div>
              <NuxtLink
                v-for="t in tickets.filter(x => x.open)"
                :key="t.id"
                :to="`/support/${t.id}`"
                class="flex items-center gap-3 border-t border-default px-[18px] py-3 transition-colors hover:bg-muted"
              >
                <span
                  class="size-[9px] flex-none rounded-full"
                  :class="PRIO_CLASS[t.prio]"
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13.5px] font-semibold text-highlighted">
                    {{ t.subject }}
                  </div>
                  <div class="mt-0.5 text-xs text-muted tabular-nums">
                    {{ t.code }} · {{ t.updated }}
                  </div>
                </div>
                <StatusChip :status="t.status">
                  {{ t.statusLabel }}
                </StatusChip>
              </NuxtLink>
              <div
                v-if="!openTicketCount"
                class="border-t border-default px-[18px] py-6 text-center text-[13px] text-muted"
              >
                No open tickets.
              </div>
            </div>
            <!-- recent activity -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Recent activity</span>
                <button
                  class="text-[13px] font-semibold text-primary"
                  @click="activeTab = 'activity'"
                >
                  Timeline
                </button>
              </div>
              <div class="px-[18px] pb-3.5 pt-1.5">
                <div
                  v-for="(a, i) in activity.slice(0, 4)"
                  :key="i"
                  class="flex gap-3 pt-3"
                >
                  <span
                    class="mt-1.5 size-2 flex-none rounded-full"
                    :class="a.tone.replace('text-', 'bg-')"
                  />
                  <div class="min-w-0">
                    <div class="text-[13.5px] leading-snug text-default">
                      {{ a.text }}
                    </div>
                    <div class="mt-0.5 text-xs text-muted">
                      {{ a.time }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PROJECTS -->
        <div v-else-if="activeTab === 'projects'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div><span class="text-base font-semibold text-highlighted">Projects</span><span class="ml-2 text-sm text-muted">{{ projects.length }} active</span></div>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="sm"
              @click="openNewProject"
            >
              New Project
            </UButton>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div class="overflow-x-auto">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b border-default bg-muted/40">
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Project
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Status
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Progress
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Due
                    </th>
                    <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Value
                    </th>
                    <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Tasks
                    </th>
                    <th class="w-11" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="p in projects"
                    :key="p.id"
                    class="cursor-pointer border-t border-default transition-colors hover:bg-muted first:border-t-0"
                    @click="navigateTo(`/projects/${p.id}`)"
                  >
                    <td class="px-4 py-3.5 text-sm font-semibold text-highlighted">
                      {{ p.name }}
                    </td>
                    <td class="px-4 py-3.5">
                      <StatusChip :status="p.status">
                        {{ p.statusLabel }}
                      </StatusChip>
                    </td>
                    <td class="px-4 py-3.5">
                      <div class="flex items-center gap-2.5">
                        <div class="h-1.5 w-[90px] overflow-hidden rounded-full bg-muted">
                          <div
                            class="h-full rounded-full"
                            :class="p.bar"
                            :style="{ width: p.progress + '%' }"
                          />
                        </div>
                        <span class="text-[12.5px] text-muted tabular-nums">{{ p.progress }}%</span>
                      </div>
                    </td>
                    <td class="whitespace-nowrap px-4 py-3.5 text-sm text-default tabular-nums">
                      {{ p.due }}
                    </td>
                    <td class="px-4 py-3.5 text-right text-sm text-highlighted tabular-nums">
                      {{ p.value }}
                    </td>
                    <td class="px-4 py-3.5 text-right text-sm text-default tabular-nums">
                      {{ p.tasks }}
                    </td>
                    <td class="px-3 py-3.5 text-right text-muted">
                      <UIcon
                        name="i-lucide-chevron-right"
                        class="size-4"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="!projects.length"
              class="flex flex-col items-center px-6 py-12 text-center"
            >
              <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-folder-plus"
                class="size-5"
              /></span>
              <p class="text-sm text-muted">
                No projects yet for this client.
              </p>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-4 rounded-full"
                icon="i-lucide-plus"
                @click="openNewProject"
              >
                New Project
              </UButton>
            </div>
          </div>
        </div>

        <!-- WEBSITES -->
        <div v-else-if="activeTab === 'websites'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div><span class="text-base font-semibold text-highlighted">Websites</span><span class="ml-2 text-sm text-muted">{{ websites.length }} sites · {{ connectedWebsites }} connected</span></div>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="sm"
              @click="() => { websiteFormOpen = true }"
            >
              Add Website
            </UButton>
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div
              v-for="w in websites"
              :key="w.id"
              class="rounded-card bg-default p-5 ring ring-default"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2.5">
                    <span class="text-[15px] font-semibold text-highlighted">{{ w.name }}</span>
                    <span
                      class="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em]"
                      :class="envClass(w.env)"
                    >{{ w.env }}</span>
                  </div>
                  <a
                    :href="w.href"
                    target="_blank"
                    class="mt-1 inline-flex items-center gap-1 text-[13px] text-primary hover:text-primary/80"
                  >{{ w.url }}<UIcon
                    name="i-lucide-external-link"
                    class="size-[13px]"
                  /></a>
                </div>
                <UDropdownMenu :items="websiteMenu(w)">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Website actions"
                  />
                </UDropdownMenu>
              </div>
              <div class="my-4 border-t border-default" />
              <div v-if="w.connected">
                <div class="flex items-center justify-between gap-2.5">
                  <StatusChip status="success">
                    Analytics connected
                  </StatusChip>
                  <span class="text-xs text-muted">Synced {{ w.synced }}</span>
                </div>
                <div class="mt-3.5 flex items-end justify-between gap-3.5">
                  <div>
                    <div class="font-display text-[22px] font-medium leading-none tracking-tight text-highlighted tabular-nums">
                      {{ w.visitors }}
                    </div>
                    <div class="mt-1.5 text-xs text-muted">
                      Visitors · 30d <span class="font-semibold text-success">{{ w.delta }}</span>
                    </div>
                  </div>
                  <svg
                    width="120"
                    height="34"
                    viewBox="0 0 120 34"
                    fill="none"
                    preserveAspectRatio="none"
                    class="flex-none"
                  >
                    <polyline
                      :points="w.sparkArea"
                      fill="var(--color-mist)"
                      stroke="none"
                    />
                    <polyline
                      :points="w.spark"
                      fill="none"
                      stroke="var(--color-teal-500)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
                <UButton
                  :to="`/websites/${w.id}`"
                  block
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-chart-line"
                  class="mt-4 rounded-full"
                >
                  View Analytics
                </UButton>
              </div>
              <div v-else>
                <span class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted"><span class="size-1.5 rounded-full bg-ink-400" />Analytics not connected</span>
                <p class="my-3.5 text-[13px] leading-relaxed text-muted">
                  Connect analytics to track visitors and conversions for this site.
                </p>
                <UButton
                  :to="`/websites/${w.id}`"
                  block
                  color="primary"
                  size="sm"
                  icon="i-lucide-plus"
                  class="rounded-full"
                >
                  Connect Analytics
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- INVOICES -->
        <div v-else-if="activeTab === 'invoices'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div class="flex items-center gap-3.5">
              <span class="text-base font-semibold text-highlighted">Invoices</span>
              <span
                v-if="outstanding > 0"
                class="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-3 py-1 text-[13px] font-semibold text-error tabular-nums"
              >{{ money(outstanding) }} outstanding</span>
            </div>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="sm"
            >
              New Invoice
            </UButton>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div
              v-if="invoicesPending"
              class="px-4 py-12 text-center text-sm text-muted"
            >
              Loading invoices…
            </div>
            <div
              v-else-if="!invoices.length"
              class="flex flex-col items-center px-4 py-12 text-center"
            >
              <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-receipt-text"
                class="size-5"
              /></span>
              <p class="text-sm text-muted">
                No invoices yet for this client.
              </p>
            </div>
            <div
              v-else
              class="overflow-x-auto"
            >
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b border-default bg-muted/40">
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Invoice
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Issued
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Due
                    </th>
                    <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Amount
                    </th>
                    <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Balance
                    </th>
                    <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="v in invoices"
                    :key="v.key"
                    class="cursor-pointer border-t border-default transition-colors hover:bg-muted first:border-t-0"
                    @click="openInvoiceId = v.key"
                  >
                    <td class="px-4 py-3 text-sm font-semibold text-highlighted tabular-nums">
                      {{ v.num }}
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-default tabular-nums">
                      {{ v.issue }}
                    </td>
                    <td
                      class="whitespace-nowrap px-4 py-3 text-sm tabular-nums"
                      :class="v.overdue ? 'text-error' : 'text-default'"
                    >
                      {{ v.due }}
                    </td>
                    <td class="px-4 py-3 text-right text-sm text-highlighted tabular-nums">
                      {{ v.amount }}
                    </td>
                    <td
                      class="px-4 py-3 text-right text-sm tabular-nums"
                      :class="v.balanceZero ? 'text-muted' : (v.overdue ? 'font-bold text-error' : 'text-highlighted')"
                    >
                      {{ v.balance }}
                    </td>
                    <td class="px-4 py-3">
                      <StatusChip :status="v.status">
                        {{ v.statusLabel }}
                      </StatusChip>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- CONTRACTS -->
        <div v-else-if="activeTab === 'contracts'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span class="text-base font-semibold text-highlighted">Contracts &amp; proposals</span>
            <div class="flex gap-2.5">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                class="rounded-full"
              >
                New Proposal
              </UButton>
              <UButton
                icon="i-lucide-plus"
                color="primary"
                size="sm"
              >
                New Contract
              </UButton>
            </div>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div
              v-if="contractsPending"
              class="px-4 py-12 text-center text-sm text-muted"
            >
              Loading agreements…
            </div>
            <div
              v-else-if="contracts.length === 0"
              class="flex flex-col items-center px-4 py-12 text-center"
            >
              <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-file-text"
                class="size-5"
              /></span>
              <p class="text-sm text-muted">
                No proposals or contracts yet for this client.
              </p>
            </div>
            <template v-else>
              <div
                v-for="(c, i) in contracts"
                :key="c.key"
                class="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted"
                :class="i > 0 ? 'border-t border-default' : ''"
              >
                <span
                  class="inline-flex size-[38px] flex-none items-center justify-center rounded-[10px]"
                  :class="c.type === 'Contract' ? 'bg-mist text-primary' : 'bg-muted text-muted'"
                >
                  <UIcon
                    :name="c.type === 'Contract' ? 'i-lucide-file-check-2' : 'i-lucide-file-text'"
                    class="size-[18px]"
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-highlighted">
                    {{ c.title }}
                  </div>
                  <div class="mt-0.5 text-[13px] text-muted">
                    {{ c.meta }}
                  </div>
                </div>
                <span class="whitespace-nowrap text-sm text-highlighted tabular-nums">{{ c.value }}</span>
                <div class="flex w-24 justify-end">
                  <StatusChip :status="c.status">
                    {{ c.statusLabel }}
                  </StatusChip>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- FILES -->
        <div v-else-if="activeTab === 'files'">
          <FilesPanel
            :client-id="Number(route.params.id)"
            @update:count="filesCount = $event"
          />
        </div>

        <!-- SUPPORT -->
        <div v-else-if="activeTab === 'support'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span class="text-base font-semibold text-highlighted">Support tickets</span>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="sm"
              @click="openNewTicket"
            >
              New Ticket
            </UButton>
          </div>
          <div class="mb-3.5 inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
            <button
              v-for="f in supportFilters"
              :key="f.key"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
              :class="supportFilter === f.key ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
              @click="supportFilter = f.key"
            >
              {{ f.label }}
              <span
                class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
                :class="supportFilter === f.key ? 'bg-mist text-primary' : 'bg-elevated text-muted'"
              >{{ f.count }}</span>
            </button>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div
              v-for="(t, i) in visibleTickets"
              :key="t.id"
              class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted"
              :class="i > 0 ? 'border-t border-default' : ''"
              @click="navigateTo(`/support/${t.id}`)"
            >
              <span
                class="size-[9px] flex-none rounded-full"
                :class="PRIO_CLASS[t.prio]"
                :title="`${t.prio} priority`"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-highlighted">
                  {{ t.subject }}
                </div>
                <div class="mt-0.5 text-[12.5px] text-muted tabular-nums">
                  {{ t.code }} · opened {{ t.created }}
                </div>
              </div>
              <span class="hidden whitespace-nowrap text-[13px] text-muted tabular-nums sm:block">{{ t.updated }}</span>
              <div class="flex w-[104px] justify-end">
                <StatusChip :status="t.status">
                  {{ t.statusLabel }}
                </StatusChip>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-[17px] text-muted"
              />
            </div>
            <div
              v-if="!visibleTickets.length"
              class="flex flex-col items-center px-6 py-12 text-center"
            >
              <UIcon
                name="i-lucide-life-buoy"
                class="size-6 text-dimmed"
              />
              <p class="mt-2 text-[13px] text-muted">
                {{ tickets.length ? 'No tickets in this view.' : 'No tickets yet for this client.' }}
              </p>
            </div>
          </div>
        </div>

        <!-- CALLS -->
        <div v-else-if="activeTab === 'calls'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div>
              <span class="text-base font-semibold text-highlighted">Call history</span>
              <span class="ml-2 text-sm text-muted">{{ calls.length }} {{ calls.length === 1 ? 'call' : 'calls' }}</span>
            </div>
            <UButton
              to="/receptionist"
              icon="i-lucide-phone-call"
              color="neutral"
              variant="outline"
              size="sm"
              class="rounded-full"
            >
              Open Receptionist
            </UButton>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div
              v-for="(c, i) in calls"
              :key="c.id"
              class="flex gap-3.5 px-4 py-3.5"
              :class="i > 0 ? 'border-t border-default' : ''"
            >
              <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-full bg-mist text-primary">
                <UIcon
                  name="i-lucide-phone"
                  class="size-[17px]"
                />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <span class="truncate text-sm font-semibold text-highlighted">{{ c.who }}</span>
                  <span class="flex-none whitespace-nowrap text-xs text-muted tabular-nums">{{ c.ago }}</span>
                </div>
                <p class="mt-1 line-clamp-2 text-[13px] leading-snug text-default">
                  {{ c.summary }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2.5">
                  <StatusChip :status="c.status">
                    {{ c.statusLabel }}
                  </StatusChip>
                  <span class="inline-flex items-center gap-1 text-xs text-muted tabular-nums"><UIcon
                    name="i-lucide-clock"
                    class="size-3"
                  />{{ c.duration }}</span>
                  <span class="text-xs text-muted tabular-nums">{{ c.when }}</span>
                  <UIcon
                    v-if="c.hasRecording"
                    name="i-lucide-mic"
                    class="size-[13px] text-muted"
                  />
                </div>
              </div>
            </div>
            <div
              v-if="!calls.length"
              class="flex flex-col items-center px-6 py-12 text-center"
            >
              <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-phone-off"
                class="size-5"
              /></span>
              <p class="text-sm text-muted">
                No calls logged for this client yet.
              </p>
            </div>
          </div>
        </div>

        <!-- ACTIVITY -->
        <div v-else-if="activeTab === 'activity'">
          <div class="mb-[18px] flex items-center gap-3 rounded-[14px] bg-default p-3.5 ring ring-default">
            <span class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-teal-600 text-[11px] font-semibold text-white">{{ ownerInitials }}</span>
            <input
              placeholder="Add a note or log activity…"
              class="flex-1 bg-transparent text-sm text-highlighted outline-none placeholder:text-muted"
            >
            <UButton
              color="primary"
              size="sm"
            >
              Add Note
            </UButton>
          </div>
          <div class="relative pl-2">
            <div
              v-for="(a, i) in activity"
              :key="i"
              class="relative flex gap-3.5 pb-5"
            >
              <div class="flex flex-none flex-col items-center">
                <span
                  class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-muted"
                  :class="a.tone"
                >
                  <UIcon
                    :name="a.icon"
                    class="size-4"
                  />
                </span>
                <span
                  v-if="i < activity.length - 1"
                  class="mt-1 w-0.5 flex-1 bg-default"
                />
              </div>
              <div class="min-w-0 pt-1">
                <div class="text-sm leading-snug text-highlighted">
                  {{ a.text }}
                </div>
                <div class="mt-0.5 text-[12.5px] text-muted">
                  {{ a.meta }}
                </div>
              </div>
              <span class="ml-auto whitespace-nowrap pt-1.5 text-[12.5px] text-muted tabular-nums">{{ a.time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ProjectForm
      v-model:open="projectFormOpen"
      mode="create"
      :contact-id="Number(route.params.id)"
      :contact-label="client?.name"
      @saved="onProjectSaved"
    />

    <InvoiceDrawer
      v-model:invoice-id="openInvoiceId"
      @changed="loadInvoices"
    />

    <WebsiteForm
      v-model:open="websiteFormOpen"
      :contact-id="Number(route.params.id)"
      :contact-label="client?.name"
      @created="loadWebsites"
    />

    <TicketForm
      v-model:open="ticketFormOpen"
      mode="create"
      :client-id="Number(route.params.id)"
      :client-label="client?.name"
      @saved="loadTickets"
    />
  </template>
</template>
