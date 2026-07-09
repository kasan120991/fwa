<script setup lang="ts">
const mobileOpen = useSidebarMobileOpen()
</script>

<template>
  <div class="flex min-h-screen w-full overflow-x-hidden bg-muted">
    <!-- mobile drawer backdrop -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-40 bg-ink-950/50 lg:hidden"
      @click="mobileOpen = false"
    />
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopBar />
      <main class="flex-1 p-4 sm:p-5 lg:p-[26px]">
        <div class="mx-auto flex max-w-[1260px] flex-col gap-5">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
