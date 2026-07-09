<script setup lang="ts">
interface NavItem { label: string, to: string, icon: string }
interface NavGroup { label?: string, items: NavItem[] }

const collapsed = useSidebarCollapsed()
const route = useRoute()
const { user } = useAuth()

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

// New (unreviewed) call count shown against AI Receptionist. Live via the
// call:changed socket event (reviewed / converted) and call:new (fresh ingest).
const api = useApi()
const socket = useSocket()
const newCalls = ref(0)
async function loadNewCalls() {
  try {
    const { data } = await api<{ data: { count: number } }>('/calls/unreviewed-count')
    newCalls.value = data.count
  } catch { /* leave the badge hidden on failure */ }
}
function itemBadge(to: string) {
  return to === '/receptionist' ? newCalls.value : 0
}
onMounted(() => {
  loadNewCalls()
  socket.on('call:changed', loadNewCalls)
  socket.on('call:new', loadNewCalls)
})
onBeforeUnmount(() => {
  socket.off('call:changed', loadNewCalls)
  socket.off('call:new', loadNewCalls)
})

// Nav follows CLAUDE.md (source of truth), which includes Leads and AI Receptionist
// that the original dashboard prototype omitted. ✓ items are in scope this phase;
// the rest are deferred stub routes.
const groups: NavGroup[] = [
  { items: [
    { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-dashboard' },
    { label: 'AI Receptionist', to: '/receptionist', icon: 'i-lucide-phone-call' }
  ] },
  {
    label: 'Clients & Work',
    items: [
      { label: 'Leads', to: '/leads', icon: 'i-lucide-user-plus' },
      { label: 'Clients', to: '/clients', icon: 'i-lucide-users' },
      { label: 'Projects', to: '/projects', icon: 'i-lucide-folder-kanban' },
      { label: 'Tasks', to: '/tasks', icon: 'i-lucide-list-checks' }
    ]
  },
  {
    label: 'Sales',
    items: [
      { label: 'Agreements', to: '/agreements', icon: 'i-lucide-file-signature' }
    ]
  },
  {
    label: 'Billing',
    items: [
      { label: 'Invoices', to: '/invoices', icon: 'i-lucide-receipt-text' },
      { label: 'Payments', to: '/payments', icon: 'i-lucide-credit-card' },
      { label: 'Expenses', to: '/expenses', icon: 'i-lucide-wallet' }
    ]
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Files', to: '/files', icon: 'i-lucide-folder' },
      { label: 'Calendar', to: '/calendar', icon: 'i-lucide-calendar' },
      { label: 'Websites', to: '/websites', icon: 'i-lucide-globe' }
    ]
  }
]

const bottom: NavItem[] = [
  { label: 'Support Tickets', to: '/support', icon: 'i-lucide-life-buoy' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(to + '/')
}

// Nav item classes — mirrors the prototype's active / hover / rest states.
function itemClass(to: string) {
  const active = isActive(to)
  return [
    'group relative flex items-center rounded-[10px] text-sm whitespace-nowrap transition-colors border-l-[3px]',
    collapsed.value ? 'justify-center py-[11px] gap-0' : 'justify-start px-[11px] py-[9px] gap-3',
    active
      ? 'bg-teal-800 text-white font-semibold ' + (collapsed.value ? 'border-transparent' : 'border-teal-400')
      : 'text-teal-200 font-medium border-transparent hover:bg-[#1C2422] hover:text-white'
  ]
}
</script>

<template>
  <aside
    class="sticky top-0 flex h-screen flex-none flex-col overflow-hidden bg-ink-900 text-white transition-[width,padding] duration-200 dark:bg-ink-950"
    :class="collapsed ? 'w-[74px] px-3 py-[18px]' : 'w-[260px] px-4 py-5'"
  >
    <!-- logo -->
    <div class="flex items-center gap-[11px] px-1.5 pb-5 pt-1">
      <span class="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-teal-600">
        <img
          src="/brand/fwa-mark-white.svg"
          alt="FWA"
          class="h-[18px] w-[18px]"
        >
      </span>
      <span
        v-if="!collapsed"
        class="font-display text-[19px] font-medium leading-tight tracking-tight text-white"
      >Francis Web Agency</span>
    </div>

    <!-- scrollable nav -->
    <nav class="-mx-1 flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-1">
      <template
        v-for="(group, gi) in groups"
        :key="gi"
      >
        <!-- divider shown only when collapsed (labels hide) -->
        <div
          v-if="gi > 0 && collapsed"
          class="mx-2.5 mt-3.5 h-px bg-[#1C2422]"
        />
        <div :class="gi > 0 ? 'mt-[18px]' : ''">
          <div
            v-if="group.label && !collapsed"
            class="mb-[7px] px-[11px] font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-teal-200/60"
          >
            {{ group.label }}
          </div>
          <div class="flex flex-col gap-0.5">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :title="item.label"
              :class="itemClass(item.to)"
            >
              <UIcon
                :name="item.icon"
                class="size-[19px] flex-none"
              />
              <span
                v-if="!collapsed"
                class="overflow-hidden"
              >{{ item.label }}</span>
              <span
                v-if="!collapsed && itemBadge(item.to) > 0"
                class="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-teal-500 px-1 text-[11px] font-semibold text-white tabular-nums"
              >{{ itemBadge(item.to) }}</span>
              <span
                v-if="collapsed && itemBadge(item.to) > 0"
                class="absolute right-1.5 top-1.5 size-2 rounded-full bg-teal-400 ring-2 ring-ink-900 dark:ring-ink-950"
              />
            </NuxtLink>
          </div>
        </div>
      </template>
    </nav>

    <!-- pinned bottom -->
    <div class="flex-none">
      <div class="mx-0.5 my-3 h-px bg-[#1C2422]" />
      <div class="flex flex-col gap-0.5">
        <NuxtLink
          v-for="item in bottom"
          :key="item.to"
          :to="item.to"
          :title="item.label"
          :class="itemClass(item.to)"
        >
          <UIcon
            :name="item.icon"
            class="size-[19px] flex-none"
          />
          <span
            v-if="!collapsed"
            class="overflow-hidden"
          >{{ item.label }}</span>
        </NuxtLink>
      </div>

      <div class="mx-0.5 my-3 h-px bg-[#1C2422]" />
      <div class="flex items-center gap-2.5 px-2 py-1.5">
        <span class="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-teal-600 text-[13px] font-semibold text-white">
          <ClientOnly fallback="—">{{ initials }}</ClientOnly>
        </span>
        <div
          v-if="!collapsed"
          class="overflow-hidden leading-tight"
        >
          <div class="whitespace-nowrap text-[13px] font-semibold text-white">
            <ClientOnly fallback="—">
              {{ displayName }}
            </ClientOnly>
          </div>
          <div class="whitespace-nowrap text-xs text-teal-200">
            <ClientOnly fallback="—">
              {{ roleLabel }}
            </ClientOnly>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
