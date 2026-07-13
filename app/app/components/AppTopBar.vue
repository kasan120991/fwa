<script setup lang="ts">
const collapsed = useSidebarCollapsed()
const mobileOpen = useSidebarMobileOpen()
const route = useRoute()
const { user, logout } = useAuth()

// --- Color mode -----------------------------------------------------------
// Follows the OS by default (nuxt.config `preference: 'system'`); toggling here
// pins a manual override that @nuxtjs/color-mode persists across sessions.
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleColorMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const displayName = computed(() => user.value?.name || 'Account')
const initials = computed(() => {
  const parts = (user.value?.name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
})
const roleLabel = computed(() => {
  const r = user.value?.role
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
})

async function onSignOut() {
  closeSocket()
  await logout()
  await navigateTo('/login')
}

// Header is derived from the route so SSR and client agree. A page may override
// the title via `definePageMeta({ title, breadcrumb })` (e.g. a dynamic detail page).
const header = computed<PageMeta>(() => {
  if (typeof route.meta.title === 'string') {
    return { title: route.meta.title, breadcrumb: route.meta.breadcrumb as string | undefined }
  }
  return resolvePageMeta(route.path)
})

const accountItems = computed(() => [
  [
    { label: displayName.value, slot: 'account' as const, type: 'label' as const }
  ],
  [
    { label: 'Profile', icon: 'i-lucide-user', to: '/settings?section=profile' },
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
  ],
  [
    { label: 'Sign Out', icon: 'i-lucide-log-out', onSelect: onSignOut }
  ]
])

// --- Quick create -----------------------------------------------------------
// The modal forms (project/ticket/invoice/expense) are mounted once here so
// they're available app-wide; the Create trigger now lives on the dashboard.
// Shared open-state via useQuickCreate lets both that button and the ⌘K palette
// open them. Leads/clients use dedicated /new pages instead of modals.
const {
  project: projectFormOpen,
  ticket: ticketFormOpen,
  invoice: invoiceFormOpen,
  expense: expenseFormOpen,
  open: openQuickCreate
} = useQuickCreate()

// --- Global search (⌘K command palette) -----------------------------------
const searchOpen = ref(false)
defineShortcuts({
  meta_k: () => { searchOpen.value = !searchOpen.value }
})
function onSearchAction(key: string) {
  if (key === 'project' || key === 'ticket' || key === 'invoice' || key === 'expense') openQuickCreate(key)
}

function onProjectCreated(p: { id: number }) {
  navigateTo(`/projects/${p.id}`)
}
function onTicketCreated(t: { id: number }) {
  navigateTo(`/support/${t.id}`)
}
function onInvoiceCreated() {
  navigateTo('/invoices')
}

// --- Notifications (backed by GET/PATCH /api/notifications) ---------------
type NotifTone = 'brand' | 'success' | 'warning' | 'info' | 'error'
interface Notification {
  id: number
  icon: string
  tone: NotifTone
  title: string
  body: string
  createdAt: string
  read: boolean
  to?: string
}
// Raw API row shape (see server/src/repositories/notifications.repo.js).
interface ApiNotification {
  id: number
  category: string
  tone: NotifTone
  icon: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  read: boolean
  // Transient (live emit only): the user who triggered this via a foreground
  // action they already saw a local toast for. Present → skip re-toasting here.
  actor_user_id?: number | null
}

const api = useApi()
const toast = useToast()
const notifications = ref<Notification[]>([])

// Map a notification tone to a Nuxt UI toast color.
const toneColor: Record<NotifTone, 'primary' | 'success' | 'warning' | 'info' | 'error'> = {
  brand: 'primary',
  success: 'success',
  warning: 'warning',
  info: 'info',
  error: 'error'
}

function mapNotification(n: ApiNotification): Notification {
  return {
    id: n.id,
    icon: n.icon,
    tone: n.tone,
    title: n.title,
    body: n.body ?? '',
    to: n.link ?? undefined,
    createdAt: n.created_at,
    read: n.read
  }
}

async function loadNotifications() {
  try {
    const { data } = await api<{ data: ApiNotification[] }>('/notifications')
    notifications.value = data.map(mapNotification)
  } catch {
    // Non-fatal: leave the feed empty and the bell shows no unread.
  }
}

// Live updates over Socket.IO — new alerts appear instantly and read state
// stays in sync across the user's open tabs.
const socket = useSocket()

function onRemoteNew(raw: ApiNotification) {
  if (notifications.value.some(n => n.id === raw.id)) return
  const n = mapNotification(raw)
  notifications.value.unshift(n)
  // Skip the toast for an action this user just performed themselves (they
  // already got a local toast); still surface background events — webhook
  // payments, inbound leads, other users' actions — as a transient toast.
  if (raw.actor_user_id != null && raw.actor_user_id === user.value?.id) return
  toast.add({
    title: n.title,
    description: n.body || undefined,
    icon: n.icon,
    color: toneColor[n.tone],
    ...(n.to ? { actions: [{ label: 'View', to: n.to, color: 'neutral', variant: 'outline' }] } : {})
  })
}
function onRemoteRead(payload: { id: number }) {
  const hit = notifications.value.find(n => n.id === payload.id)
  if (hit) hit.read = true
}
function onRemoteReadAll() {
  notifications.value.forEach((n) => {
    n.read = true
  })
}
function onRemoteCleared() {
  notifications.value = []
}

onMounted(() => {
  loadNotifications()
  socket.on('notification:new', onRemoteNew)
  socket.on('notification:read', onRemoteRead)
  socket.on('notification:read-all', onRemoteReadAll)
  socket.on('notification:cleared', onRemoteCleared)
})
onBeforeUnmount(() => {
  socket.off('notification:new', onRemoteNew)
  socket.off('notification:read', onRemoteRead)
  socket.off('notification:read-all', onRemoteReadAll)
  socket.off('notification:cleared', onRemoteCleared)
})

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

// Popover + slide-over open state (the popover's "View all" opens the panel).
const notifPopoverOpen = ref(false)
const notifPanelOpen = ref(false)

// Slide-over filter — All / Unread.
const notifFilter = ref<'all' | 'unread'>('all')
const visibleNotifications = computed(() =>
  notifFilter.value === 'unread'
    ? notifications.value.filter(n => !n.read)
    : notifications.value
)

// Icon tint per tone — reuses the semantic ramps from the design system.
const toneClass: Record<NotifTone, string> = {
  brand: 'bg-mist text-primary',
  success: 'bg-success-50 text-success',
  warning: 'bg-warning-50 text-warning',
  info: 'bg-info-50 text-info',
  error: 'bg-error-50 text-error'
}

// Optimistic writes with rollback on failure (mirrors the receptionist page).
async function markAllRead() {
  const prev = notifications.value.map(n => n.read)
  notifications.value.forEach((n) => {
    n.read = true
  })
  try {
    await api('/notifications/mark-all-read', { method: 'POST' })
  } catch {
    notifications.value.forEach((n, i) => {
      n.read = prev[i] ?? n.read
    })
  }
}

// Optimistic clear-all with rollback on failure.
async function clearAll() {
  if (!notifications.value.length) return
  const prev = notifications.value
  notifications.value = []
  try {
    await api('/notifications', { method: 'DELETE' })
  } catch {
    notifications.value = prev
    toast.add({ title: 'Could not clear notifications', color: 'error' })
  }
}

function markRead(n: Notification) {
  if (n.read) return
  n.read = true
  api(`/notifications/${n.id}`, { method: 'PATCH', body: { read: true } })
    .catch(() => { n.read = false })
}

function onNotifClick(n: Notification) {
  markRead(n)
}

function openNotifPanel() {
  notifPopoverOpen.value = false
  notifPanelOpen.value = true
}

// Slide-over row: mark read and dismiss the panel on navigate.
function onNotifOpen(n: Notification) {
  markRead(n)
  notifPanelOpen.value = false
}
</script>

<template>
  <header class="sticky top-0 z-20 flex h-16 flex-none items-center justify-between gap-3 border-b border-default bg-default px-4 sm:gap-4 sm:px-5 lg:px-[26px]">
    <!-- left: toggle + title -->
    <div class="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
      <!-- mobile: open the drawer -->
      <button
        aria-label="Open menu"
        class="inline-flex size-[38px] flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted lg:hidden"
        @click="mobileOpen = true"
      >
        <UIcon
          name="i-lucide-menu"
          class="size-[18px]"
        />
      </button>
      <!-- desktop: collapse the rail -->
      <button
        aria-label="Toggle sidebar"
        class="hidden size-[38px] flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted lg:inline-flex"
        @click="collapsed = !collapsed"
      >
        <UIcon
          name="i-lucide-panel-left"
          class="size-[18px]"
        />
      </button>
      <div class="min-w-0">
        <div
          v-if="header.breadcrumb"
          class="hidden font-mono text-[11px] uppercase tracking-[0.05em] text-muted sm:block"
        >
          {{ header.breadcrumb }}
        </div>
        <h1 class="mt-px truncate font-display text-[19px] font-medium tracking-tight text-highlighted sm:text-[22px]">
          {{ header.title }}
        </h1>
      </div>
    </div>

    <!-- right: search, create, notifications, account -->
    <div class="flex flex-none items-center gap-3">
      <button
        class="hidden w-[260px] cursor-text items-center gap-2.5 rounded-full border border-default bg-muted py-2 pl-3.5 pr-2.5 text-left transition-colors hover:border-accented md:flex"
        aria-label="Search"
        @click="searchOpen = true"
      >
        <UIcon
          name="i-lucide-search"
          class="size-4 flex-none text-muted"
        />
        <span class="flex-1 text-sm text-muted">Search clients, projects…</span>
        <span class="rounded-md border border-default bg-default px-1.5 py-px font-mono text-[11px] text-muted">⌘K</span>
      </button>

      <button
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        class="inline-flex size-10 flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted"
        @click="toggleColorMode"
      >
        <ClientOnly>
          <UIcon
            :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            class="size-[18px]"
          />
          <template #fallback>
            <UIcon
              name="i-lucide-moon"
              class="size-[18px]"
            />
          </template>
        </ClientOnly>
      </button>

      <UPopover
        v-model:open="notifPopoverOpen"
        :content="{ align: 'end', sideOffset: 8 }"
        :ui="{ content: 'w-[380px] max-w-[calc(100vw-2rem)]' }"
      >
        <button
          aria-label="Notifications"
          class="relative inline-flex size-10 flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted"
        >
          <UIcon
            name="i-lucide-bell"
            class="size-[18px]"
          />
          <span
            v-if="unreadCount"
            class="absolute right-2.5 top-2 size-[7px] rounded-full border-[1.5px] border-[var(--ui-bg)] bg-error"
          />
        </button>

        <template #content>
          <!-- header -->
          <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-3">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">
                Notifications
              </h2>
              <span
                v-if="unreadCount"
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mist px-1.5 text-[11px] font-semibold text-primary"
              >{{ unreadCount }}</span>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="unreadCount"
                class="text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                @click="markAllRead"
              >
                Mark All Read
              </button>
              <button
                v-if="notifications.length"
                class="text-[13px] font-medium text-muted transition-colors hover:text-highlighted"
                @click="clearAll"
              >
                Clear All
              </button>
            </div>
          </div>

          <!-- list -->
          <div class="max-h-[380px] divide-y divide-default overflow-y-auto">
            <NuxtLink
              v-for="n in notifications"
              :key="n.id"
              :to="n.to"
              class="flex gap-3 px-4 py-3 transition-colors hover:bg-muted"
              :class="!n.read && 'bg-mist/40'"
              @click="onNotifClick(n)"
            >
              <span
                class="mt-0.5 inline-flex size-9 flex-none items-center justify-center rounded-full"
                :class="toneClass[n.tone]"
              >
                <UIcon
                  :name="n.icon"
                  class="size-[18px]"
                />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <p class="truncate text-[13px] font-semibold text-highlighted">{{ n.title }}</p>
                  <span
                    v-if="!n.read"
                    class="mt-1.5 size-2 flex-none rounded-full bg-primary"
                    aria-label="Unread"
                  />
                </div>
                <p class="mt-0.5 text-[13px] leading-snug text-muted">{{ n.body }}</p>
                <p class="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-dimmed">{{ timeAgo(n.createdAt) }}</p>
              </div>
            </NuxtLink>

            <!-- empty state -->
            <div
              v-if="!notifications.length"
              class="flex flex-col items-center px-4 py-12 text-center"
            >
              <UIcon
                name="i-lucide-bell-off"
                class="size-6 text-dimmed"
              />
              <p class="mt-2 text-[13px] text-muted">
                You're all caught up.
              </p>
            </div>
          </div>

          <!-- footer -->
          <div class="border-t border-default px-2 py-1.5">
            <UButton
              block
              variant="ghost"
              color="neutral"
              size="sm"
              trailing-icon="i-lucide-arrow-right"
              class="justify-center font-medium"
              @click="openNotifPanel"
            >
              View All Notifications
            </UButton>
          </div>
        </template>
      </UPopover>

      <!-- Notifications slide-over (full list) -->
      <USlideover
        v-model:open="notifPanelOpen"
        title="Notifications"
        description="Everything from across your workspace"
        :ui="{ content: 'w-[460px] max-w-[94vw]' }"
      >
        <template #content>
          <div class="flex h-full flex-col">
            <!-- header -->
            <div class="flex-none border-b border-default px-6 py-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="font-display text-[22px] font-medium tracking-tight text-highlighted">
                    Notifications
                  </h2>
                  <p class="mt-1 text-[13px] text-muted">
                    {{ unreadCount ? `${unreadCount} unread` : 'You’re all caught up' }}
                  </p>
                </div>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="outline"
                  square
                  size="sm"
                  aria-label="Close"
                  @click="notifPanelOpen = false"
                />
              </div>

              <!-- filter + actions -->
              <div class="mt-4 flex items-center justify-between gap-3">
                <div class="inline-flex items-center gap-1 rounded-xl border border-default bg-muted p-1">
                  <button
                    v-for="f in (['all', 'unread'] as const)"
                    :key="f"
                    class="inline-flex items-center gap-2 rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-colors"
                    :class="notifFilter === f ? 'bg-teal-800 text-white' : 'text-muted hover:text-highlighted'"
                    @click="notifFilter = f"
                  >
                    {{ f }}
                    <span
                      class="rounded-full px-1.5 py-px text-[11px] tabular-nums"
                      :class="notifFilter === f ? 'bg-white/20 text-white' : 'border border-default bg-default text-muted'"
                    >{{ f === 'unread' ? unreadCount : notifications.length }}</span>
                  </button>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    v-if="unreadCount"
                    class="whitespace-nowrap text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                    @click="markAllRead"
                  >
                    Mark All Read
                  </button>
                  <button
                    v-if="notifications.length"
                    class="whitespace-nowrap text-[13px] font-medium text-muted transition-colors hover:text-highlighted"
                    @click="clearAll"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            <!-- list -->
            <div class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
              <NuxtLink
                v-for="n in visibleNotifications"
                :key="n.id"
                :to="n.to"
                class="flex gap-3.5 px-6 py-4 transition-colors hover:bg-muted"
                :class="!n.read && 'bg-mist/40'"
                @click="onNotifOpen(n)"
              >
                <span
                  class="mt-0.5 inline-flex size-10 flex-none items-center justify-center rounded-full"
                  :class="toneClass[n.tone]"
                >
                  <UIcon
                    :name="n.icon"
                    class="size-5"
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-sm font-semibold text-highlighted">
                      {{ n.title }}
                    </p>
                    <span
                      v-if="!n.read"
                      class="mt-1.5 size-2 flex-none rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  </div>
                  <p class="mt-0.5 text-[13px] leading-snug text-muted">
                    {{ n.body }}
                  </p>
                  <p class="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-dimmed">
                    {{ timeAgo(n.createdAt) }}
                  </p>
                </div>
              </NuxtLink>

              <!-- empty state -->
              <div
                v-if="!visibleNotifications.length"
                class="flex flex-col items-center px-6 py-16 text-center"
              >
                <span class="inline-flex size-12 items-center justify-center rounded-full bg-mist text-primary">
                  <UIcon
                    name="i-lucide-check"
                    class="size-6"
                  />
                </span>
                <p class="mt-3 text-sm font-semibold text-highlighted">
                  {{ notifFilter === 'unread' ? 'No unread notifications' : 'Nothing here yet' }}
                </p>
                <p class="mt-1 max-w-[260px] text-[13px] text-muted">
                  {{ notifFilter === 'unread' ? 'You’re all caught up — new alerts will show here.' : 'Activity across your workspace will appear here.' }}
                </p>
              </div>
            </div>
          </div>
        </template>
      </USlideover>

      <UDropdownMenu
        :items="accountItems"
        :ui="{ content: 'w-52' }"
      >
        <button
          aria-label="Account menu"
          class="flex items-center gap-1.5 rounded-[10px] p-0.5 transition-colors hover:bg-muted"
        >
          <span class="inline-flex size-[34px] flex-none items-center justify-center rounded-full bg-teal-600 text-[13px] font-semibold text-white">
            <ClientOnly fallback="—">{{ initials }}</ClientOnly>
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 text-muted"
          />
        </button>

        <template #account>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-highlighted">{{ displayName }}</span>
            <span class="text-xs text-muted">{{ roleLabel }} · Francis Web Agency</span>
          </div>
        </template>
      </UDropdownMenu>
    </div>

    <!-- Quick-create forms (portal to body; opened from the dashboard Create
         menu or the ⌘K palette via the shared useQuickCreate state) -->
    <ProjectForm
      v-model:open="projectFormOpen"
      mode="create"
      @saved="onProjectCreated"
    />
    <TicketForm
      v-model:open="ticketFormOpen"
      mode="create"
      @saved="onTicketCreated"
    />
    <InvoiceForm
      v-model:open="invoiceFormOpen"
      @created="onInvoiceCreated"
    />
    <ExpenseForm
      v-model:open="expenseFormOpen"
      @saved="() => navigateTo('/expenses')"
    />

    <!-- Global ⌘K command palette -->
    <GlobalSearch
      v-model:open="searchOpen"
      @action="onSearchAction"
    />
  </header>
</template>
