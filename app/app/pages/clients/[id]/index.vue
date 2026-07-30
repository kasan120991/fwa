<script setup lang="ts">
// Client detail — grouped-workspace layout. The page owns the header identity,
// metric strip (from /summary), profile rail, and the five-tab shell; each tab
// is a lazy-mounted component that fetches its own data on first activation
// (Overview · Projects & Sites · Sales & Billing · Support & Calls · Files).
import type { ClientSummary } from '~/utils/clientDetail'

const route = useRoute()
const router = useRouter()
const api = useApi()
const toast = useToast()
const { resolveUrl } = useUploads()

const clientId = computed(() => Number(route.params.id))

// ---- identity (GET /clients/:id) ----
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
const notes = ref('')

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiContact }>(`/clients/${clientId.value}`)
    client.value = buildClient(data)
    notes.value = data.notes || ''
  } catch {
    client.value = null
  } finally {
    pending.value = false
  }
}

useHead({ title: () => `${client.value?.name ?? 'Client'} · Francis Web Agency` })

function saveNotes() {
  api(`/clients/${clientId.value}`, { method: 'PATCH', body: { notes: notes.value } }).catch(() => {})
}

// ---- summary (GET /clients/:id/summary) — metric strip + tab badges ----
const summary = ref<ClientSummary | null>(null)
async function loadSummary() {
  try {
    const { data } = await api<{ data: ClientSummary }>(`/clients/${clientId.value}/summary`)
    summary.value = data
  } catch { /* non-fatal */ }
}

function money(n: number) {
  return n === 0 ? '$0' : `$${n.toLocaleString('en-US')}`
}

const metrics = computed(() => {
  const s = summary.value
  return [
    {
      label: 'Outstanding',
      value: money(s?.outstanding ?? 0),
      sub: s?.invoices_open ? `${s.invoices_open} unpaid` : '',
      tone: (s?.outstanding ?? 0) > 0 ? 'text-error' : 'text-highlighted'
    },
    { label: 'Active Projects', value: String(s?.projects_active ?? 0), sub: '', tone: 'text-highlighted' },
    { label: 'Open Tickets', value: String(s?.tickets_open ?? 0), sub: '', tone: 'text-highlighted' },
    { label: 'Websites', value: String(s?.websites_total ?? 0), sub: s?.websites_live ? `${s.websites_live} live` : '', tone: 'text-highlighted' },
    { label: 'Total Billed', value: money(s?.total_billed ?? 0), sub: 'lifetime', tone: 'text-highlighted' }
  ]
})

// ---- tabs (deep-linkable via ?tab=) ----
type TabKey = 'overview' | 'work' | 'money' | 'comms' | 'files'
const TAB_KEYS: TabKey[] = ['overview', 'work', 'money', 'comms', 'files']

function tabFromRoute(): TabKey {
  const t = String(route.query.tab ?? '')
  return (TAB_KEYS as string[]).includes(t) ? t as TabKey : 'overview'
}
const activeTab = ref<TabKey>(tabFromRoute())
// Tabs mount on first visit and stay mounted (v-show) so switching back is instant.
const visited = ref<Record<TabKey, boolean>>({ overview: false, work: false, money: false, comms: false, files: false })
visited.value[activeTab.value] = true

function showTab(key: TabKey) {
  activeTab.value = key
  visited.value[key] = true
  router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } })
}
watch(() => route.query.tab, () => {
  const t = tabFromRoute()
  if (t !== activeTab.value) {
    activeTab.value = t
    visited.value[t] = true
  }
})

const tabs = computed(() => {
  const s = summary.value
  return [
    { key: 'overview' as const, label: 'Overview', badge: null },
    { key: 'work' as const, label: 'Projects & Sites', badge: (s?.projects_total ?? 0) + (s?.websites_total ?? 0) || null },
    { key: 'money' as const, label: 'Sales & Billing', badge: (s?.invoices_total ?? 0) + (s?.agreements_total ?? 0) || null },
    { key: 'comms' as const, label: 'Support & Calls', badge: s?.tickets_open || null },
    { key: 'files' as const, label: 'Files', badge: s?.files_total || null }
  ]
})

// ---- portal access ----
const portalAccount = ref<{ invited: boolean, email?: string, last_login_at?: string | null }>({ invited: false })
async function loadPortalAccount() {
  try {
    const { data } = await api<{ data: { invited: boolean, email?: string, last_login_at?: string | null } }>(`/clients/${clientId.value}/portal-account`)
    portalAccount.value = data
  } catch { /* non-fatal */ }
}
const inviting = ref(false)
async function inviteToPortal() {
  if (inviting.value) return
  inviting.value = true
  try {
    const { data } = await api<{ data: { setPasswordUrl: string, email: string } }>(`/clients/${clientId.value}/invite`, { method: 'POST' })
    try {
      await navigator.clipboard?.writeText(data.setPasswordUrl)
    } catch { /* clipboard is a nicety */ }
    toast.add({ title: 'Portal invite sent', description: `Set-password link copied — emailed to ${data.email}.`, color: 'success' })
    loadPortalAccount()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send invite', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    inviting.value = false
  }
}

// ---- forms (owned here; opened from the header menu and tab components) ----
const projectFormOpen = ref(false)
const websiteFormOpen = ref(false)
const ticketFormOpen = ref(false)

const headerMenu = computed(() => [[
  { label: 'New Invoice', icon: 'i-lucide-receipt-text', onSelect: () => showTab('money') },
  { label: 'New Ticket', icon: 'i-lucide-life-buoy', onSelect: () => { ticketFormOpen.value = true } },
  { label: 'Add Website', icon: 'i-lucide-globe', onSelect: () => { websiteFormOpen.value = true } },
  { label: portalAccount.value.invited ? 'Re-send Portal Invite' : 'Invite to Portal', icon: 'i-lucide-user-plus', onSelect: inviteToPortal }
], [
  { label: 'Archive Client', icon: 'i-lucide-archive', color: 'error' as const }
]])

// ---- live refresh: any client-scoped change re-rolls the cheap summary ----
const socket = useSocket()
const SUMMARY_EVENTS = [
  'project:created', 'project:updated', 'project:deleted',
  'ticket:created', 'ticket:updated', 'ticket:deleted',
  'invoice:changed', 'payment:created', 'website:changed',
  'call:new', 'call:changed', 'file:changed', 'client-activity:new'
]
onMounted(() => {
  load()
  loadSummary()
  loadPortalAccount()
  for (const ev of SUMMARY_EVENTS) socket.on(ev, loadSummary)
})
onBeforeUnmount(() => {
  for (const ev of SUMMARY_EVENTS) socket.off(ev, loadSummary)
})

const STAGE_META: Record<Stage, { status: 'success' | 'neutral', label: string }> = {
  active: { status: 'success', label: 'Active' },
  past: { status: 'neutral', label: 'Past' }
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
      <h2 class="font-display text-2xl font-semibold tracking-tight text-highlighted">
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
          class="inline-flex size-[58px] flex-none items-center justify-center rounded-[14px] font-display text-2xl font-semibold tracking-tight"
          :class="client.avatar"
        >{{ client.initials }}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-[28px] font-semibold tracking-tight text-highlighted">
              {{ client.name }}
            </h1>
            <StatusChip :status="STAGE_META[client.stage].status">
              {{ STAGE_META[client.stage].label }}
            </StatusChip>
          </div>
          <div class="mt-1.5 flex items-center gap-3.5">
            <a
              v-if="client.domain"
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
          :to="`/clients/${clientId}/edit`"
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
          @click="projectFormOpen = true"
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
            class="font-display text-2xl font-semibold leading-none tracking-tight tabular-nums"
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
      <!-- profile rail -->
      <div class="flex flex-col gap-4 lg:sticky lg:top-4">
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="border-b border-default p-[18px]">
            <div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
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
              <div
                v-if="portalAccount.invited"
                class="flex items-center gap-2.5 text-[13.5px] text-muted"
              >
                <UIcon
                  name="i-lucide-user-check"
                  class="size-[15px] flex-none text-success"
                />Portal access · {{ portalAccount.last_login_at ? 'active' : 'invited' }}
              </div>
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
            <div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
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
            <div class="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
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
            <div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
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

      <!-- tabbed panel -->
      <div class="flex min-w-0 flex-col gap-[18px]">
        <div class="flex items-center gap-1 overflow-x-auto border-b border-default">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-3 pt-2.5 text-sm transition-colors"
            :class="activeTab === t.key ? 'border-citrine font-semibold text-highlighted' : 'border-transparent font-medium text-muted hover:text-highlighted'"
            @click="showTab(t.key)"
          >
            {{ t.label }}
            <span
              v-if="t.badge != null"
              class="rounded-chip px-1.5 py-px text-[11px] font-semibold tabular-nums"
              :class="activeTab === t.key ? 'bg-mist text-primary' : 'bg-muted text-muted'"
            >{{ t.badge }}</span>
          </button>
        </div>

        <div v-show="activeTab === 'overview'">
          <ClientsClientOverviewTab
            v-if="visited.overview"
            :client-id="clientId"
            :summary="summary"
            @go="showTab($event as TabKey)"
            @new-project="projectFormOpen = true"
          />
        </div>
        <div v-show="activeTab === 'work'">
          <ClientsClientWorkTab
            v-if="visited.work"
            :client-id="clientId"
            @new-project="projectFormOpen = true"
            @add-website="websiteFormOpen = true"
          />
        </div>
        <div v-show="activeTab === 'money'">
          <ClientsClientMoneyTab
            v-if="visited.money"
            :client-id="clientId"
          />
        </div>
        <div v-show="activeTab === 'comms'">
          <ClientsClientCommsTab
            v-if="visited.comms"
            :client-id="clientId"
            @new-ticket="ticketFormOpen = true"
          />
        </div>
        <div v-show="activeTab === 'files'">
          <FilesPanel
            v-if="visited.files"
            :client-id="clientId"
          />
        </div>
      </div>
    </div>

    <ProjectForm
      v-model:open="projectFormOpen"
      mode="create"
      :contact-id="clientId"
      :contact-label="client?.name"
    />

    <WebsiteForm
      v-model:open="websiteFormOpen"
      :contact-id="clientId"
      :contact-label="client?.name"
    />

    <TicketForm
      v-model:open="ticketFormOpen"
      mode="create"
      :client-id="clientId"
      :client-label="client?.name"
    />
  </template>
</template>
