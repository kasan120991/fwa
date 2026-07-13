<script setup lang="ts">
// Portal shell — a light top bar (brand, nav, account) over the page slot.
// Deliberately not the admin AppSidebar/AppTopBar; clients get a calmer surface.
const user = useAuthUser()
const { logout } = useAuth()
const route = useRoute()

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
        <div class="ms-auto">
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
