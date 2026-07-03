<script setup lang="ts">
const collapsed = useSidebarCollapsed()
const route = useRoute()

// Header is derived from the route so SSR and client agree. A page may override
// the title via `definePageMeta({ title, breadcrumb })` (e.g. a dynamic detail page).
const header = computed<PageMeta>(() => {
  if (typeof route.meta.title === 'string') {
    return { title: route.meta.title, breadcrumb: route.meta.breadcrumb as string | undefined }
  }
  return resolvePageMeta(route.path)
})

const accountItems = [
  [
    { label: 'Jordan Rivera', slot: 'account' as const, type: 'label' as const }
  ],
  [
    { label: 'Profile', icon: 'i-lucide-user' },
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
  ],
  [
    { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => navigateTo('/login') }
  ]
]
</script>

<template>
  <header class="sticky top-0 z-20 flex h-16 flex-none items-center justify-between gap-4 border-b border-default bg-default px-[26px]">
    <!-- left: toggle + title -->
    <div class="flex min-w-0 items-center gap-3.5">
      <button
        aria-label="Toggle sidebar"
        class="inline-flex size-[38px] flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted"
        @click="collapsed = !collapsed"
      >
        <UIcon name="i-lucide-panel-left" class="size-[18px]" />
      </button>
      <div class="min-w-0">
        <div v-if="header.breadcrumb" class="hidden font-mono text-[11px] uppercase tracking-[0.05em] text-muted sm:block">
          {{ header.breadcrumb }}
        </div>
        <h1 class="mt-px whitespace-nowrap font-display text-[22px] font-medium tracking-tight text-highlighted">
          {{ header.title }}
        </h1>
      </div>
    </div>

    <!-- right: search, create, notifications, account -->
    <div class="flex flex-none items-center gap-3">
      <button
        class="hidden w-[260px] cursor-text items-center gap-2.5 rounded-full border border-default bg-muted py-2 pl-3.5 pr-2.5 text-left transition-colors hover:border-accented md:flex"
        aria-label="Search"
      >
        <UIcon name="i-lucide-search" class="size-4 flex-none text-muted" />
        <span class="flex-1 text-sm text-muted">Search clients, projects…</span>
        <span class="rounded-md border border-default bg-default px-1.5 py-px font-mono text-[11px] text-muted">⌘K</span>
      </button>

      <UButton icon="i-lucide-plus" color="primary" class="whitespace-nowrap">Create</UButton>

      <button
        aria-label="Notifications"
        class="relative inline-flex size-10 flex-none items-center justify-center rounded-[10px] border border-default bg-default text-highlighted transition-colors hover:bg-muted"
      >
        <UIcon name="i-lucide-bell" class="size-[18px]" />
        <span class="absolute right-2.5 top-2 size-[7px] rounded-full border-[1.5px] border-white bg-error" />
      </button>

      <UDropdownMenu :items="accountItems" :ui="{ content: 'w-52' }">
        <button
          aria-label="Account menu"
          class="flex items-center gap-1.5 rounded-[10px] p-0.5 transition-colors hover:bg-muted"
        >
          <span class="inline-flex size-[34px] flex-none items-center justify-center rounded-full bg-teal-600 text-[13px] font-semibold text-white">JR</span>
          <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" />
        </button>

        <template #account>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-highlighted">Jordan Rivera</span>
            <span class="text-xs text-muted">Owner · Francis Web Agency</span>
          </div>
        </template>
      </UDropdownMenu>
    </div>
  </header>
</template>
