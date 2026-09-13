<script setup lang="ts">
// Client detail — the area-rail layout (the Settings pattern). The page owns
// the header identity, the stat row (from /summary), a sticky rail of areas
// with a compact contact card, and the full profile as a slide-over. Each area
// is a lazy-mounted component that fetches its own data on first activation
// and renders full width (Overview · Projects & Sites · Sales & Billing ·
// Support & Calls · Files).
import type { ClientSummary } from '~/utils/clientDetail'
import type { StatRowItem } from '~/components/StatRow.vue'

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
    avatar: AVATAR[c.id % AVATAR.length] ?? AVATAR[0]!,
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

// ---- summary (GET /clients/:id/summary) — stat row + area counts ----
const summary = ref<ClientSummary | null>(null)
async function loadSummary() {
  try {
    const { data } = await api<{ data: ClientSummary }>(`/clients/${clientId.value}/summary`)
    summary.value = data
  } catch { /* non-fatal */ }
}

const metrics = computed<StatRowItem[]>(() => {
  const s = summary.value
  return [
    {
      label: 'Outstanding',
      value: formatMoney(s?.outstanding ?? 0),
      sub: s?.invoices_open ? `${s.invoices_open} unpaid` : '',
      tone: (s?.outstanding ?? 0) > 0 ? 'error' : 'default'
    },
    { label: 'Active Projects', value: String(s?.projects_active ?? 0) },
    { label: 'Open Tickets', value: String(s?.tickets_open ?? 0), tone: s?.tickets_open ? 'warning' : 'default' },
    { label: 'Websites', value: String(s?.websites_total ?? 0), sub: s?.websites_live ? `${s.websites_live} live` : '' },
    { label: 'Total Billed', value: formatMoney(s?.total_billed ?? 0), sub: 'lifetime' }
  ]
})

// ---- areas (deep-linkable via ?tab=; overview is the clean URL) ----
type AreaKey = 'overview' | 'work' | 'money' | 'comms' | 'files'
const AREA_KEYS: AreaKey[] = ['overview', 'work', 'money', 'comms', 'files']

function areaFromRoute(): AreaKey {
  const t = String(route.query.tab ?? '')
  return (AREA_KEYS as string[]).includes(t) ? t as AreaKey : 'overview'
}
const activeArea = ref<AreaKey>(areaFromRoute())
// Areas mount on first visit and stay mounted (v-show) so switching back is instant.
const visited = ref<Record<AreaKey, boolean>>({ overview: false, work: false, money: false, comms: false, files: false })
visited.value[activeArea.value] = true

function showArea(key: AreaKey) {
  activeArea.value = key
  visited.value[key] = true
  router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } })
}
watch(() => route.query.tab, () => {
  const t = areaFromRoute()
  if (t !== activeArea.value) {
    activeArea.value = t
    visited.value[t] = true
  }
})

const areas = computed(() => {
  const s = summary.value
  return [
    { key: 'overview' as const, label: 'Overview', icon: 'i-lucide-layout-dashboard', count: null },
    { key: 'work' as const, label: 'Projects & Sites', icon: 'i-lucide-layers', count: (s?.projects_total ?? 0) + (s?.websites_total ?? 0) || null },
    { key: 'money' as const, label: 'Sales & Billing', icon: 'i-lucide-receipt-text', count: (s?.invoices_total ?? 0) + (s?.agreements_total ?? 0) || null },
    { key: 'comms' as const, label: 'Support & Calls', icon: 'i-lucide-life-buoy', count: s?.tickets_open || null },
    { key: 'files' as const, label: 'Files', icon: 'i-lucide-folder', count: s?.files_total || null }
  ]
})

// ---- profile slide-over ----
const profileOpen = ref(false)
function openProfile() {
  profileOpen.value = true
}

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

// ---- forms (owned here; opened from the header menu and area components) ----
const projectFormOpen = ref(false)
const carePlanFormOpen = ref(false)
function openProjectForm() {
  projectFormOpen.value = true
}
const websiteFormOpen = ref(false)
const ticketFormOpen = ref(false)

const headerMenu = computed(() => [[
  { label: 'New Invoice', icon: 'i-lucide-receipt-text', onSelect: () => showArea('money') },
  { label: 'New Care Plan', icon: 'i-lucide-heart-pulse', onSelect: () => { carePlanFormOpen.value = true } },
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
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-card bg-muted text-muted">
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

  <!-- display: contents keeps the header, stat row and body as direct children of
       the layout column (its gap does the spacing) while giving v-else one root -->
  <div
    v-else
    class="contents"
  >
    <!-- header identity -->
    <div class="flex flex-wrap items-center justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="client.logo"
          :src="resolveUrl(client.logo)"
          alt=""
          class="size-[58px] flex-none rounded-card object-cover ring ring-default"
        >
        <span
          v-else
          class="inline-flex size-[58px] flex-none items-center justify-center rounded-card font-display text-2xl font-semibold tracking-tight"
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
          <div class="mt-1.5 flex flex-wrap items-center gap-3.5">
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
            <span
              v-if="client.sinceShort"
              class="text-[13px] text-muted"
            >Client since {{ client.sinceShort }}</span>
          </div>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton
          :to="`/clients/${clientId}/edit`"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
        >
          Edit
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openProjectForm"
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

    <!-- stat row -->
    <StatRow :items="metrics" />

    <!-- rail + area -->
    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-7">
      <!-- area rail -->
      <nav class="flex gap-1 overflow-x-auto lg:sticky lg:top-2 lg:flex-col lg:overflow-visible">
        <button
          v-for="a in areas"
          :key="a.key"
          type="button"
          class="flex flex-none items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors"
          :class="activeArea === a.key
            ? 'border-primary/25 bg-mist font-semibold text-primary'
            : 'border-transparent text-toned hover:bg-default'"
          @click="showArea(a.key)"
        >
          <UIcon
            :name="a.icon"
            class="size-[17px] flex-none"
            :class="activeArea === a.key ? 'text-primary' : 'text-muted'"
          />
          <span class="flex-1 whitespace-nowrap">{{ a.label }}</span>
          <span
            v-if="a.count != null"
            class="text-[11px] font-semibold text-muted tabular-nums"
          >{{ a.count }}</span>
        </button>

        <!-- compact contact card; the full profile is a slide-over -->
        <div class="mt-5 hidden rounded-card bg-sand p-5 lg:block">
          <div class="eyebrow">
            Primary Contact
          </div>
          <div class="mt-2.5 flex items-center gap-2.5">
            <span class="inline-flex size-[34px] flex-none items-center justify-center rounded-btn bg-default text-[12px] font-semibold text-highlighted ring ring-default">
              {{ client.contact.split(' ').map(w => w[0]).slice(0, 2).join('') }}
            </span>
            <div class="min-w-0">
              <div class="truncate text-[13.5px] font-semibold text-highlighted">
                {{ client.contact }}
              </div>
              <div
                v-if="client.contactTitle"
                class="truncate text-[12.5px] text-muted"
              >
                {{ client.contactTitle }}
              </div>
            </div>
          </div>
          <div class="mt-3 flex flex-col gap-1.5 text-[13px]">
            <a
              v-if="client.email"
              :href="`mailto:${client.email}`"
              class="truncate text-default hover:text-primary"
            >{{ client.email }}</a>
            <a
              v-if="client.phone"
              :href="`tel:${phoneDigits(client.phone)}`"
              class="text-default hover:text-primary tabular-nums"
            >{{ formatPhone(client.phone) }}</a>
          </div>
          <div
            v-if="client.tags.length"
            class="mt-3 flex flex-wrap gap-1.5"
          >
            <span
              v-for="t in client.tags"
              :key="t.label"
              class="inline-flex items-center rounded-chip bg-default px-2 py-0.5 text-[11.5px] font-medium text-muted ring ring-default"
            >{{ t.label }}</span>
          </div>
          <button
            type="button"
            class="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
            @click="openProfile"
          >
            Full Profile
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </button>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-user"
          class="flex-none lg:hidden"
          @click="openProfile"
        >
          Profile
        </UButton>
      </nav>

      <!-- active area -->
      <div class="flex min-w-0 flex-col">
        <div v-show="activeArea === 'overview'">
          <ClientsClientOverviewTab
            v-if="visited.overview"
            :client-id="clientId"
            :summary="summary"
            @go="showArea($event as AreaKey)"
            @new-project="openProjectForm"
          />
        </div>
        <div v-show="activeArea === 'work'">
          <ClientsClientWorkTab
            v-if="visited.work"
            :client-id="clientId"
            @new-project="openProjectForm"
            @add-website="websiteFormOpen = true"
          />
        </div>
        <div v-show="activeArea === 'money'">
          <ClientsClientMoneyTab
            v-if="visited.money"
            :client-id="clientId"
            @new-care-plan="carePlanFormOpen = true"
          />
        </div>
        <div v-show="activeArea === 'comms'">
          <ClientsClientCommsTab
            v-if="visited.comms"
            :client-id="clientId"
            @new-ticket="ticketFormOpen = true"
          />
        </div>
        <div v-show="activeArea === 'files'">
          <FilesPanel
            v-if="visited.files"
            :client-id="clientId"
          />
        </div>
      </div>
    </div>

    <ClientsClientProfileSlideover
      v-model:open="profileOpen"
      v-model:notes="notes"
      :client="client"
      :portal="portalAccount"
      :edit-to="`/clients/${clientId}/edit`"
      @save-notes="saveNotes"
      @invite="inviteToPortal"
    />

    <CarePlanForm
      v-model:open="carePlanFormOpen"
      :client-id="clientId"
      :client-label="client?.name"
      @saved="showArea('money')"
    />

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
  </div>
</template>
