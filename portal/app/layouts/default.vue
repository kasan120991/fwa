<script setup lang="ts">
// Portal shell — a light top bar (brand, nav, account) over the page slot.
// Deliberately not the admin AppSidebar/AppTopBar; clients get a calmer surface.
const user = useAuthUser()
const { logout } = useAuth()
const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()

const nav = [
  { label: 'Home', to: '/', icon: 'i-lucide-home' },
  { label: 'Projects', to: '/projects', icon: 'i-lucide-folder-kanban' },
  { label: 'Invoices', to: '/invoices', icon: 'i-lucide-receipt-text' },
  { label: 'Agreements', to: '/agreements', icon: 'i-lucide-file-signature' },
  { label: 'Files', to: '/files', icon: 'i-lucide-folder' },
  { label: 'Support', to: '/support', icon: 'i-lucide-life-buoy' },
  { label: 'Websites', to: '/websites', icon: 'i-lucide-globe' }
]
function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(to + '/')
}

async function onLogout() {
  closeSocket()
  await logout()
  await navigateTo('/login')
}
const accountItems = [[
  { label: 'Account', icon: 'i-lucide-user', onSelect: () => { navigateTo('/account') } }
], [
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: onLogout }
]]

// ---- notification bell ----
interface PortalNotification {
  id: number
  tone: string
  icon: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string | null
}
const notifications = ref<PortalNotification[]>([])
const unread = computed(() => notifications.value.filter(n => !n.read).length)

async function loadNotifications() {
  try {
    const { data } = await api<{ data: PortalNotification[] }>('/portal/notifications', { query: { limit: 30 } })
    notifications.value = data
  } catch { /* non-fatal */ }
}
function onNotificationNew(raw: PortalNotification & { actor_user_id?: number | null }) {
  if (notifications.value.some(n => n.id === raw.id)) return
  notifications.value.unshift({ ...raw, read: false })
  toast.add({ title: raw.title, description: raw.body || undefined, icon: raw.icon, color: 'info' })
}
async function markAllRead() {
  if (!unread.value) return
  notifications.value = notifications.value.map(n => ({ ...n, read: true }))
  try { await api('/portal/notifications/mark-all-read', { method: 'POST' }) } catch { /* non-fatal */ }
}
async function openNotification(n: PortalNotification) {
  if (!n.read) {
    n.read = true
    try { await api(`/portal/notifications/${n.id}`, { method: 'PATCH', body: { read: true } }) } catch { /* non-fatal */ }
  }
  if (n.link) await navigateTo(n.link)
}

onMounted(() => {
  loadNotifications()
  socket.on('notification:new', onNotificationNew)
})
onBeforeUnmount(() => socket.off('notification:new', onNotificationNew))
</script>

<template>
  <div class="flex min-h-screen w-full flex-col bg-muted">
    <header class="sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-[1100px] items-center gap-6 px-5">
        <NuxtLink
          to="/"
          class="flex items-center gap-2.5"
        >
          <span class="inline-flex size-8 items-center justify-center rounded-[9px] bg-deep">
            <img
              src="/brand/fwa-mark-white.svg"
              alt=""
              class="size-4"
            >
          </span>
          <span class="font-display text-[15px] font-medium text-highlighted">Client Portal</span>
        </NuxtLink>
        <nav class="flex items-center gap-1">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
            :class="isActive(item.to) ? 'bg-mist text-primary' : 'text-muted hover:text-highlighted'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <div class="ms-auto flex items-center gap-1">
          <UPopover :ui="{ content: 'w-80' }">
            <button
              class="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted hover:text-highlighted"
              aria-label="Notifications"
            >
              <UIcon
                name="i-lucide-bell"
                class="size-5"
              />
              <span
                v-if="unread"
                class="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-default"
              />
            </button>
            <template #content>
              <div class="flex items-center justify-between border-b border-default px-4 py-2.5">
                <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Notifications</span>
                <button
                  v-if="unread"
                  class="text-[12px] font-medium text-primary hover:underline"
                  @click="markAllRead"
                >
                  Mark all read
                </button>
              </div>
              <div class="max-h-[60vh] overflow-y-auto">
                <p
                  v-if="!notifications.length"
                  class="px-4 py-8 text-center text-[13px] text-muted"
                >
                  You're all caught up.
                </p>
                <button
                  v-for="n in notifications"
                  :key="n.id"
                  class="flex w-full items-start gap-3 border-b border-default px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
                  :class="n.read ? '' : 'bg-mist/40'"
                  @click="openNotification(n)"
                >
                  <UIcon
                    :name="n.icon || 'i-lucide-bell'"
                    class="mt-0.5 size-4 flex-none text-primary"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-medium text-highlighted">
                      {{ n.title }}
                    </div>
                    <div
                      v-if="n.body"
                      class="truncate text-[12.5px] text-muted"
                    >
                      {{ n.body }}
                    </div>
                    <div class="mt-0.5 text-[11px] text-muted">
                      {{ timeAgo(n.created_at) }}
                    </div>
                  </div>
                  <span
                    v-if="!n.read"
                    class="mt-1 size-2 flex-none rounded-full bg-primary"
                  />
                </button>
              </div>
            </template>
          </UPopover>

          <UDropdownMenu :items="accountItems">
            <UButton
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-chevron-down"
            >
              {{ user?.name || 'Account' }}
            </UButton>
          </UDropdownMenu>
        </div>
      </div>
    </header>
    <main class="mx-auto w-full max-w-[1100px] flex-1 px-5 py-8">
      <slot />
    </main>
  </div>
</template>
