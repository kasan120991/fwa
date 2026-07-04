<script setup lang="ts">
const route = useRoute()
const { user } = useAuth()
const api = useApi()
const { resolveUrl } = useUploads()

// Identity/profile comes from GET /api/contacts/:id. The tabs below (projects,
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
  outstanding: number
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
  stage: string
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

const AVATAR = ['bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default', 'bg-warning/10 text-warning']
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
    stage: c.stage === 'past' ? 'past' : 'active',
    contact: c.name,
    contactTitle: c.title || '',
    email: c.email || '',
    phone: c.phone || '',
    address,
    since: sinceDate ? sinceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    sinceShort: sinceDate ? sinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
    tags: (c.tags || []).map(label => ({ label, tone: TAG_TONE[label] || 'neutral' })),
    outstanding: 0
  }
}

const client = ref<ClientIdentity | null>(null)
const pending = ref(true)

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiContact }>(`/contacts/${route.params.id}`)
    client.value = buildClient(data)
    notes.value = data.notes || ''
  } catch {
    client.value = null
  } finally {
    pending.value = false
  }
}
onMounted(load)

useHead({ title: () => `${client.value?.name ?? 'Client'} · Francis Web Agency` })

function saveNotes() {
  api(`/contacts/${route.params.id}`, { method: 'PATCH', body: { notes: notes.value } }).catch(() => {})
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

// ---------- tab sample data (representative until API) ----------
const projects = [
  { id: 'p1', name: 'Storefront rebuild', status: 'info', statusLabel: 'In build', progress: 65, bar: 'bg-info', due: 'Aug 14', value: '$9,000', tasks: 4 },
  { id: 'p2', name: 'SEO & analytics setup', status: 'success', statusLabel: 'Live', progress: 100, bar: 'bg-success', due: '—', value: '$3,500', tasks: 0 },
  { id: 'p3', name: 'Email capture flow', status: 'warning', statusLabel: 'Review due', progress: 80, bar: 'bg-warning', due: 'Jul 5', value: '$2,200', tasks: 2 }
] as const

function spark(arr: number[], w: number, h: number) {
  const min = Math.min(...arr), max = Math.max(...arr), span = (max - min) || 1
  const step = w / (arr.length - 1)
  const pts = arr.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`)
  return { line: pts.join(' '), area: `0,${h} ${pts.join(' ')} ${w},${h}` }
}
const s1 = spark([6, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12], 118, 32)
const s3 = spark([2, 3, 3, 4, 5, 4, 6, 5, 7, 6, 8, 9], 118, 32)
const websites = [
  { id: 'w1', name: 'Northwind Storefront', url: 'northwind.com', href: 'https://northwind.com', connected: true, env: 'Live', synced: '2h ago', visitors: '12,480', delta: '+8.2%', spark: s1.line, sparkArea: s1.area },
  { id: 'w2', name: 'Northwind Blog', url: 'blog.northwind.com', href: 'https://blog.northwind.com', connected: false, env: 'Live', synced: '', visitors: '', delta: '', spark: '', sparkArea: '' },
  { id: 'w3', name: 'Summer Campaign LP', url: 'go.northwind.com', href: 'https://go.northwind.com', connected: true, env: 'Staging', synced: '1d ago', visitors: '2,140', delta: '+21%', spark: s3.line, sparkArea: s3.area }
]
const envClass = (e: string) => e === 'Live' ? 'text-success' : (e === 'Staging' ? 'text-warning' : 'text-muted')

const invoices = [
  { num: 'INV-1042', issue: 'Jun 20', due: 'Jul 20', amount: '$4,000', balance: '$4,000', status: 'info', statusLabel: 'Sent', overdue: false },
  { num: 'INV-1039', issue: 'Jun 01', due: 'Jun 15', amount: '$5,000', balance: '$5,000', status: 'error', statusLabel: 'Overdue', overdue: true },
  { num: 'INV-1031', issue: 'May 02', due: 'May 16', amount: '$6,500', balance: '$0', status: 'success', statusLabel: 'Paid', overdue: false },
  { num: 'INV-1024', issue: 'Apr 10', due: 'Apr 24', amount: '$3,500', balance: '$0', status: 'success', statusLabel: 'Paid', overdue: false },
  { num: 'INV-1050', issue: '—', due: '—', amount: '$2,200', balance: '$2,200', status: 'neutral', statusLabel: 'Draft', overdue: false }
] as const

const contracts = [
  { title: '2024 Retainer Agreement', type: 'Contract', status: 'success', statusLabel: 'Signed', meta: 'Contract · Mar 12, 2024 · Signed Mar 14', value: '$48,000' },
  { title: 'Storefront Rebuild SOW', type: 'Proposal', status: 'info', statusLabel: 'Sent', meta: 'Proposal · Jun 18, 2025 · Awaiting signature', value: '$9,000' },
  { title: 'Analytics Add-on', type: 'Proposal', status: 'neutral', statusLabel: 'Draft', meta: 'Proposal · Jun 28, 2025 · Not sent', value: '$3,500' },
  { title: '2023 Build Agreement', type: 'Contract', status: 'neutral', statusLabel: 'Expired', meta: 'Contract · Mar 2023 · Expired Mar 2024', value: '$32,000' }
] as const

const EXT_CLASS: Record<string, string> = { PDF: 'text-error', FIG: 'text-info', ZIP: 'text-warning', XLSX: 'text-success', DOC: 'text-info' }
const fileGroups = [
  { name: 'Brand & Design', files: [
    { name: 'Logo pack.zip', ext: 'ZIP', size: '8.4 MB', meta: 'Uploaded Mar 20 · Dana Cole' },
    { name: 'Brand guidelines.pdf', ext: 'PDF', size: '2.1 MB', meta: 'Uploaded Mar 22 · Jordan Rivera' },
    { name: 'Homepage mockups.fig', ext: 'FIG', size: '14.2 MB', meta: 'Uploaded Apr 02 · Priya Shah' }
  ] },
  { name: 'Contracts', files: [
    { name: '2024 Retainer.pdf', ext: 'PDF', size: '420 KB', meta: 'Uploaded Mar 14 · Jordan Rivera' },
    { name: 'Storefront SOW.pdf', ext: 'PDF', size: '380 KB', meta: 'Uploaded Jun 18 · Jordan Rivera' }
  ] },
  { name: 'Deliverables', files: [
    { name: 'Analytics report Q2.pdf', ext: 'PDF', size: '1.3 MB', meta: 'Uploaded Jul 01 · System' },
    { name: 'Sitemap.xlsx', ext: 'XLSX', size: '88 KB', meta: 'Uploaded May 09 · Priya Shah' }
  ] }
]

const PRIO_CLASS: Record<string, string> = { High: 'bg-error', Medium: 'bg-warning', Low: 'bg-ink-400' }
const tickets = [
  { id: '#4821', subject: 'Checkout button misaligned on mobile', status: 'warning', statusLabel: 'In progress', prio: 'High', created: 'Jun 30', updated: '2h ago', open: true },
  { id: '#4805', subject: 'Add PayPal to checkout options', status: 'info', statusLabel: 'Waiting', prio: 'Medium', created: 'Jun 28', updated: '1d ago', open: true },
  { id: '#4788', subject: '404 on old blog post links', status: 'success', statusLabel: 'Resolved', prio: 'Low', created: 'Jun 20', updated: '5d ago', open: false },
  { id: '#4750', subject: 'SSL certificate renewal question', status: 'neutral', statusLabel: 'Closed', prio: 'Low', created: 'Jun 10', updated: '2w ago', open: false }
] as const

const supportFilter = ref<'all' | 'open' | 'resolved' | 'closed'>('all')
const supportFilters = computed(() => [
  { key: 'all' as const, label: 'All', count: tickets.length },
  { key: 'open' as const, label: 'Open', count: tickets.filter(t => t.open).length },
  { key: 'resolved' as const, label: 'Resolved', count: tickets.filter(t => t.statusLabel === 'Resolved').length },
  { key: 'closed' as const, label: 'Closed', count: tickets.filter(t => t.statusLabel === 'Closed').length }
])
const visibleTickets = computed(() => tickets.filter((t) => {
  const f = supportFilter.value
  if (f === 'all') return true
  if (f === 'open') return t.open
  if (f === 'resolved') return t.statusLabel === 'Resolved'
  return t.statusLabel === 'Closed'
}))

const activity = [
  { icon: 'i-lucide-life-buoy', tone: 'text-warning', text: 'Ticket #4821 moved to In progress', meta: 'by Jordan Rivera', time: '2h ago' },
  { icon: 'i-lucide-receipt-text', tone: 'text-info', text: 'Invoice INV-1042 sent — $4,000', meta: 'Due Jul 20', time: 'Jun 20' },
  { icon: 'i-lucide-file-text', tone: 'text-muted', text: 'Note added: "Client wants launch before Q3."', meta: 'by Jordan Rivera', time: 'Jun 19' },
  { icon: 'i-lucide-file-check-2', tone: 'text-info', text: 'Proposal "Storefront Rebuild SOW" sent', meta: '$9,000', time: 'Jun 18' },
  { icon: 'i-lucide-globe', tone: 'text-primary', text: 'Website "Summer Campaign LP" added', meta: 'Staging environment', time: 'Jun 15' },
  { icon: 'i-lucide-flag', tone: 'text-success', text: 'Status changed Lead → Active', meta: 'by Jordan Rivera', time: 'Mar 14, 2023' }
]

// ---------- tabs ----------
const activeTab = ref<'overview' | 'projects' | 'websites' | 'invoices' | 'contracts' | 'files' | 'support' | 'activity'>('overview')
const tabs = computed(() => [
  { key: 'overview' as const, label: 'Overview', badge: null },
  { key: 'projects' as const, label: 'Projects', badge: projects.length },
  { key: 'websites' as const, label: 'Websites', badge: websites.length },
  { key: 'invoices' as const, label: 'Invoices', badge: null },
  { key: 'contracts' as const, label: 'Contracts', badge: null },
  { key: 'files' as const, label: 'Files', badge: null },
  { key: 'support' as const, label: 'Support', badge: tickets.filter(t => t.open).length },
  { key: 'activity' as const, label: 'Activity', badge: null }
])

const metrics = computed(() => [
  { label: 'Active projects', value: String(projects.length), sub: '', tone: 'text-highlighted' },
  { label: 'Outstanding', value: money(client.value?.outstanding ?? 0), sub: '2 unpaid', tone: (client.value?.outstanding ?? 0) > 0 ? 'text-error' : 'text-highlighted' },
  { label: 'Total billed', value: '$84.5k', sub: 'lifetime', tone: 'text-highlighted' },
  { label: 'Open tickets', value: String(tickets.filter(t => t.open).length), sub: '', tone: 'text-highlighted' },
  { label: 'Websites', value: String(websites.length), sub: '2 live', tone: 'text-highlighted' }
])

const headerMenu = [[
  { label: 'New invoice', icon: 'i-lucide-receipt-text' },
  { label: 'New proposal', icon: 'i-lucide-file-text' },
  { label: 'New ticket', icon: 'i-lucide-life-buoy' },
  { label: 'Add website', icon: 'i-lucide-globe' }
], [
  { label: 'Archive client', icon: 'i-lucide-archive', color: 'error' as const }
]]

function websiteMenu(w: { href: string }) {
  return [[
    { label: 'Visit site', icon: 'i-lucide-external-link', to: w.href, target: '_blank' },
    { label: 'View analytics', icon: 'i-lucide-chart-line' },
    { label: 'Edit', icon: 'i-lucide-pencil' }
  ], [
    { label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const }
  ]]
}

const tagVariant = { primary: 'soft', neutral: 'soft', outline: 'outline' } as const
const tagColor = { primary: 'primary', neutral: 'neutral', outline: 'neutral' } as const
</script>

<template>
  <div v-if="pending" class="flex min-h-[60vh] items-center justify-center text-sm text-muted">
    Loading client…
  </div>

  <div v-else-if="!client" class="flex min-h-[60vh] items-center justify-center">
    <div class="flex max-w-md flex-col items-center rounded-card bg-default px-10 py-14 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon name="i-lucide-user-x" class="size-6" />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">Client not found</h2>
      <p class="mt-2 text-[15px] text-muted">We couldn't find that client.</p>
      <UButton to="/clients" variant="soft" color="primary" class="mt-6" icon="i-lucide-arrow-left">Back to clients</UButton>
    </div>
  </div>

  <template v-else>
    <!-- header identity -->
    <div class="flex flex-wrap items-start justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <img v-if="client.logo" :src="resolveUrl(client.logo)" alt="" class="size-[58px] flex-none rounded-[14px] object-cover ring ring-default">
        <span v-else class="inline-flex size-[58px] flex-none items-center justify-center rounded-[14px] font-display text-2xl font-medium tracking-tight" :class="client.avatar">{{ client.initials }}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">{{ client.name }}</h1>
            <StatusChip :status="STAGE_META[client.stage].status">{{ STAGE_META[client.stage].label }}</StatusChip>
          </div>
          <div class="mt-1.5 flex items-center gap-3.5">
            <a :href="`https://${client.domain}`" target="_blank" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80">
              <UIcon name="i-lucide-globe" class="size-[15px]" />{{ client.domain }}
            </a>
            <span class="text-[13px] text-muted">Client since {{ client.sinceShort }}</span>
          </div>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton :to="`/clients/${route.params.id}/edit`" icon="i-lucide-pencil" color="neutral" variant="outline" class="rounded-full">Edit</UButton>
        <UButton icon="i-lucide-plus" color="primary">New project</UButton>
        <UDropdownMenu :items="headerMenu">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" square aria-label="More actions" />
        </UDropdownMenu>
      </div>
    </div>

    <!-- metric strip -->
    <div class="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      <div v-for="m in metrics" :key="m.label" class="rounded-[14px] bg-default p-4 ring ring-default">
        <div class="mb-2 whitespace-nowrap text-[12.5px] text-muted">{{ m.label }}</div>
        <div class="flex items-baseline gap-2">
          <span class="font-display text-2xl font-medium leading-none tracking-tight tabular-nums" :class="m.tone">{{ m.value }}</span>
          <span v-if="m.sub" class="text-xs text-muted">{{ m.sub }}</span>
        </div>
      </div>
    </div>

    <!-- body -->
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
      <!-- profile panel -->
      <div class="flex flex-col gap-4 lg:sticky lg:top-4">
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="border-b border-default p-[18px]">
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Primary contact</div>
            <div class="mt-2.5 flex items-center gap-3">
              <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-full bg-sand text-[13px] font-semibold text-highlighted">
                {{ client.contact.split(' ').map(w => w[0]).slice(0, 2).join('') }}
              </span>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-highlighted">{{ client.contact }}</div>
                <div class="text-[13px] text-muted">{{ client.contactTitle }}</div>
              </div>
            </div>
            <div class="mt-3.5 flex flex-col gap-2.5">
              <a :href="`mailto:${client.email}`" class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary">
                <UIcon name="i-lucide-mail" class="size-[15px] flex-none text-muted" />{{ client.email }}
              </a>
              <a :href="`tel:${phoneDigits(client.phone)}`" class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary">
                <UIcon name="i-lucide-phone" class="size-[15px] flex-none text-muted" />{{ formatPhone(client.phone) }}
              </a>
            </div>
          </div>

          <div class="border-b border-default p-[18px]">
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Billing address</div>
            <div class="mt-2.5 text-[13.5px] leading-relaxed text-default">
              <div v-for="line in client.address" :key="line">{{ line }}</div>
            </div>
          </div>

          <div class="border-b border-default p-[18px]">
            <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Tags</div>
            <div class="flex flex-wrap gap-2">
              <UBadge v-for="t in client.tags" :key="t.label" :color="tagColor[t.tone]" :variant="tagVariant[t.tone]" size="sm" class="rounded-full">{{ t.label }}</UBadge>
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
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Internal notes</div>
            <span class="text-xs text-muted">{{ notes.length }} chars</span>
          </div>
          <UTextarea v-model="notes" :rows="4" autoresize placeholder="Add a private note about this client…" class="w-full" @blur="saveNotes" />
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
              :class="activeTab === t.key ? 'bg-mist text-teal-700' : 'bg-muted text-muted'"
            >{{ t.badge }}</span>
          </button>
        </div>

        <!-- OVERVIEW -->
        <div v-if="activeTab === 'overview'" class="flex flex-col gap-4">
          <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
            <!-- active projects mini -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Active projects</span>
                <button class="text-[13px] font-semibold text-primary" @click="activeTab = 'projects'">View all</button>
              </div>
              <div v-for="p in projects" :key="p.id" class="flex items-center gap-3 border-t border-default px-[18px] py-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-highlighted">{{ p.name }}</div>
                  <div class="mt-1.5 flex items-center gap-2">
                    <div class="h-[5px] max-w-[150px] flex-1 overflow-hidden rounded-full bg-muted">
                      <div class="h-full rounded-full" :class="p.bar" :style="{ width: p.progress + '%' }" />
                    </div>
                    <span class="text-xs text-muted tabular-nums">{{ p.progress }}%</span>
                  </div>
                </div>
                <StatusChip :status="p.status">{{ p.statusLabel }}</StatusChip>
              </div>
            </div>
            <!-- latest invoice + websites -->
            <div class="flex flex-col gap-4">
              <div class="rounded-card bg-default p-[18px] ring ring-default">
                <div class="mb-3.5 flex items-center justify-between">
                  <span class="text-[15px] font-semibold text-highlighted">Latest invoice</span>
                  <button class="text-[13px] font-semibold text-primary" @click="activeTab = 'invoices'">All invoices</button>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-semibold text-highlighted tabular-nums">INV-1042</div>
                    <div class="mt-0.5 text-[13px] text-muted">Due Jul 20 · $4,000</div>
                  </div>
                  <StatusChip status="info">Sent</StatusChip>
                </div>
                <div class="my-3.5 border-t border-default" />
                <div class="flex items-center justify-between">
                  <span class="text-[13px] text-muted">Outstanding</span>
                  <span class="text-[15px] font-bold text-error tabular-nums">{{ money(client.outstanding) }}</span>
                </div>
              </div>
              <div class="rounded-card bg-default p-[18px] ring ring-default">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-[15px] font-semibold text-highlighted">Websites</span>
                  <button class="text-[13px] font-semibold text-primary" @click="activeTab = 'websites'">Manage</button>
                </div>
                <div class="flex items-center justify-between text-[13.5px]">
                  <span class="text-default">3 sites</span>
                  <span class="inline-flex items-center gap-1.5 font-semibold text-success"><span class="size-[7px] rounded-full bg-success" />2 analytics connected</span>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            <!-- open tickets -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Open tickets</span>
                <button class="text-[13px] font-semibold text-primary" @click="activeTab = 'support'">Support</button>
              </div>
              <div v-for="t in tickets.filter(x => x.open)" :key="t.id" class="flex items-center gap-3 border-t border-default px-[18px] py-3">
                <span class="size-[9px] flex-none rounded-full" :class="PRIO_CLASS[t.prio]" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13.5px] font-semibold text-highlighted">{{ t.subject }}</div>
                  <div class="mt-0.5 text-xs text-muted tabular-nums">{{ t.id }} · {{ t.updated }}</div>
                </div>
                <StatusChip :status="t.status">{{ t.statusLabel }}</StatusChip>
              </div>
            </div>
            <!-- recent activity -->
            <div class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center justify-between px-[18px] py-4">
                <span class="text-[15px] font-semibold text-highlighted">Recent activity</span>
                <button class="text-[13px] font-semibold text-primary" @click="activeTab = 'activity'">Timeline</button>
              </div>
              <div class="px-[18px] pb-3.5 pt-1.5">
                <div v-for="(a, i) in activity.slice(0, 4)" :key="i" class="flex gap-3 pt-3">
                  <span class="mt-1.5 size-2 flex-none rounded-full" :class="a.tone.replace('text-', 'bg-')" />
                  <div class="min-w-0">
                    <div class="text-[13.5px] leading-snug text-default">{{ a.text }}</div>
                    <div class="mt-0.5 text-xs text-muted">{{ a.time }}</div>
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
            <UButton icon="i-lucide-plus" color="primary" size="sm">New project</UButton>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <table class="w-full border-collapse">
              <thead>
                <tr class="border-b border-default bg-muted/40">
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Project</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Status</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Progress</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Due</th>
                  <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Value</th>
                  <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Tasks</th>
                  <th class="w-11" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in projects" :key="p.id" class="cursor-pointer border-t border-default transition-colors hover:bg-muted first:border-t-0">
                  <td class="px-4 py-3.5 text-sm font-semibold text-highlighted">{{ p.name }}</td>
                  <td class="px-4 py-3.5"><StatusChip :status="p.status">{{ p.statusLabel }}</StatusChip></td>
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-2.5">
                      <div class="h-1.5 w-[90px] overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full" :class="p.bar" :style="{ width: p.progress + '%' }" /></div>
                      <span class="text-[12.5px] text-muted tabular-nums">{{ p.progress }}%</span>
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 text-sm text-default tabular-nums">{{ p.due }}</td>
                  <td class="px-4 py-3.5 text-right text-sm text-highlighted tabular-nums">{{ p.value }}</td>
                  <td class="px-4 py-3.5 text-right text-sm text-default tabular-nums">{{ p.tasks }}</td>
                  <td class="px-3 py-3.5 text-right text-muted"><UIcon name="i-lucide-chevron-right" class="size-4" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WEBSITES -->
        <div v-else-if="activeTab === 'websites'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div><span class="text-base font-semibold text-highlighted">Websites</span><span class="ml-2 text-sm text-muted">3 sites · 2 connected</span></div>
            <UButton icon="i-lucide-plus" color="primary" size="sm">Add website</UButton>
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div v-for="w in websites" :key="w.id" class="rounded-card bg-default p-5 ring ring-default">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2.5">
                    <span class="text-[15px] font-semibold text-highlighted">{{ w.name }}</span>
                    <span class="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em]" :class="envClass(w.env)">{{ w.env }}</span>
                  </div>
                  <a :href="w.href" target="_blank" class="mt-1 inline-flex items-center gap-1 text-[13px] text-primary hover:text-primary/80">{{ w.url }}<UIcon name="i-lucide-external-link" class="size-[13px]" /></a>
                </div>
                <UDropdownMenu :items="websiteMenu(w)">
                  <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" aria-label="Website actions" />
                </UDropdownMenu>
              </div>
              <div class="my-4 border-t border-default" />
              <div v-if="w.connected">
                <div class="flex items-center justify-between gap-2.5">
                  <StatusChip status="success">Analytics connected</StatusChip>
                  <span class="text-xs text-muted">Synced {{ w.synced }}</span>
                </div>
                <div class="mt-3.5 flex items-end justify-between gap-3.5">
                  <div>
                    <div class="font-display text-[22px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ w.visitors }}</div>
                    <div class="mt-1.5 text-xs text-muted">Visitors · 30d <span class="font-semibold text-success">{{ w.delta }}</span></div>
                  </div>
                  <svg width="120" height="34" viewBox="0 0 120 34" fill="none" preserveAspectRatio="none" class="flex-none">
                    <polyline :points="w.sparkArea" fill="var(--color-mist)" stroke="none" />
                    <polyline :points="w.spark" fill="none" stroke="var(--color-teal-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
                <UButton block color="neutral" variant="outline" size="sm" icon="i-lucide-chart-line" class="mt-4 rounded-full">View analytics</UButton>
              </div>
              <div v-else>
                <span class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted"><span class="size-1.5 rounded-full bg-ink-400" />Analytics not connected</span>
                <p class="my-3.5 text-[13px] leading-relaxed text-muted">Connect analytics to track visitors and conversions for this site.</p>
                <UButton block color="primary" size="sm" icon="i-lucide-plus" class="rounded-full">Connect analytics</UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- INVOICES -->
        <div v-else-if="activeTab === 'invoices'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <div class="flex items-center gap-3.5">
              <span class="text-base font-semibold text-highlighted">Invoices</span>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-3 py-1 text-[13px] font-semibold text-error tabular-nums">{{ money(client.outstanding) }} outstanding</span>
            </div>
            <UButton icon="i-lucide-plus" color="primary" size="sm">New invoice</UButton>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <table class="w-full border-collapse">
              <thead>
                <tr class="border-b border-default bg-muted/40">
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Invoice</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Issued</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Due</th>
                  <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Amount</th>
                  <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Balance</th>
                  <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in invoices" :key="v.num" class="border-t border-default transition-colors hover:bg-muted first:border-t-0">
                  <td class="px-4 py-3 text-sm font-semibold text-highlighted tabular-nums">{{ v.num }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-default tabular-nums">{{ v.issue }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm tabular-nums" :class="v.overdue ? 'text-error' : 'text-default'">{{ v.due }}</td>
                  <td class="px-4 py-3 text-right text-sm text-highlighted tabular-nums">{{ v.amount }}</td>
                  <td class="px-4 py-3 text-right text-sm tabular-nums" :class="v.balance === '$0' ? 'text-muted' : (v.overdue ? 'font-bold text-error' : 'text-highlighted')">{{ v.balance }}</td>
                  <td class="px-4 py-3"><StatusChip :status="v.status">{{ v.statusLabel }}</StatusChip></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- CONTRACTS -->
        <div v-else-if="activeTab === 'contracts'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span class="text-base font-semibold text-highlighted">Contracts &amp; proposals</span>
            <div class="flex gap-2.5">
              <UButton color="neutral" variant="outline" size="sm" class="rounded-full">New proposal</UButton>
              <UButton icon="i-lucide-plus" color="primary" size="sm">New contract</UButton>
            </div>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div v-for="(c, i) in contracts" :key="c.title" class="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted" :class="i > 0 ? 'border-t border-default' : ''">
              <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-[10px]" :class="c.type === 'Contract' ? 'bg-mist text-teal-700' : 'bg-muted text-muted'">
                <UIcon :name="c.type === 'Contract' ? 'i-lucide-file-check-2' : 'i-lucide-file-text'" class="size-[18px]" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-highlighted">{{ c.title }}</div>
                <div class="mt-0.5 text-[13px] text-muted">{{ c.meta }}</div>
              </div>
              <span class="whitespace-nowrap text-sm text-highlighted tabular-nums">{{ c.value }}</span>
              <div class="flex w-24 justify-end"><StatusChip :status="c.status">{{ c.statusLabel }}</StatusChip></div>
            </div>
          </div>
        </div>

        <!-- FILES -->
        <div v-else-if="activeTab === 'files'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span class="text-base font-semibold text-highlighted">Files</span>
            <UButton icon="i-lucide-upload" color="primary" size="sm">Upload</UButton>
          </div>
          <div class="flex flex-col gap-4">
            <div v-for="g in fileGroups" :key="g.name" class="overflow-hidden rounded-card bg-default ring ring-default">
              <div class="flex items-center gap-2.5 border-b border-default px-4 py-3">
                <UIcon name="i-lucide-folder" class="size-4 text-muted" />
                <span class="text-[13.5px] font-semibold text-highlighted">{{ g.name }}</span>
                <span class="text-[12.5px] text-muted">{{ g.files.length }} files</span>
              </div>
              <div v-for="f in g.files" :key="f.name" class="flex items-center gap-3 border-t border-default px-4 py-3 transition-colors hover:bg-muted first:border-t-0">
                <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-[9px] bg-muted font-mono text-[10px] font-semibold" :class="EXT_CLASS[f.ext] ?? 'text-muted'">{{ f.ext }}</span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-highlighted">{{ f.name }}</div>
                  <div class="mt-0.5 text-[12.5px] text-muted">{{ f.meta }}</div>
                </div>
                <span class="whitespace-nowrap text-[13px] text-muted tabular-nums">{{ f.size }}</span>
                <UButton icon="i-lucide-download" color="neutral" variant="ghost" size="xs" aria-label="Download" />
              </div>
            </div>
          </div>
        </div>

        <!-- SUPPORT -->
        <div v-else-if="activeTab === 'support'">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span class="text-base font-semibold text-highlighted">Support tickets</span>
            <UButton icon="i-lucide-plus" color="primary" size="sm">New ticket</UButton>
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
              <span class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" :class="supportFilter === f.key ? 'bg-mist text-teal-700' : 'bg-elevated text-muted'">{{ f.count }}</span>
            </button>
          </div>
          <div class="overflow-hidden rounded-card bg-default ring ring-default">
            <div v-for="(t, i) in visibleTickets" :key="t.id" class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted" :class="i > 0 ? 'border-t border-default' : ''">
              <span class="size-[9px] flex-none rounded-full" :class="PRIO_CLASS[t.prio]" :title="`${t.prio} priority`" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-highlighted">{{ t.subject }}</div>
                <div class="mt-0.5 text-[12.5px] text-muted tabular-nums">{{ t.id }} · opened {{ t.created }}</div>
              </div>
              <span class="hidden whitespace-nowrap text-[13px] text-muted tabular-nums sm:block">{{ t.updated }}</span>
              <div class="flex w-[104px] justify-end"><StatusChip :status="t.status">{{ t.statusLabel }}</StatusChip></div>
              <UIcon name="i-lucide-chevron-right" class="size-[17px] text-muted" />
            </div>
          </div>
        </div>

        <!-- ACTIVITY -->
        <div v-else-if="activeTab === 'activity'">
          <div class="mb-[18px] flex items-center gap-3 rounded-[14px] bg-default p-3.5 ring ring-default">
            <span class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-teal-600 text-[11px] font-semibold text-white">{{ ownerInitials }}</span>
            <input placeholder="Add a note or log activity…" class="flex-1 bg-transparent text-sm text-highlighted outline-none placeholder:text-muted">
            <UButton color="primary" size="sm">Add note</UButton>
          </div>
          <div class="relative pl-2">
            <div v-for="(a, i) in activity" :key="i" class="relative flex gap-3.5 pb-5">
              <div class="flex flex-none flex-col items-center">
                <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-muted" :class="a.tone">
                  <UIcon :name="a.icon" class="size-4" />
                </span>
                <span v-if="i < activity.length - 1" class="mt-1 w-0.5 flex-1 bg-default" />
              </div>
              <div class="min-w-0 pt-1">
                <div class="text-sm leading-snug text-highlighted">{{ a.text }}</div>
                <div class="mt-0.5 text-[12.5px] text-muted">{{ a.meta }}</div>
              </div>
              <span class="ml-auto whitespace-nowrap pt-1.5 text-[12.5px] text-muted tabular-nums">{{ a.time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
