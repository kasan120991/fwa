<template>
  <div class="flex min-h-screen w-full bg-muted">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopBar />
      <main class="flex-1 overflow-y-auto p-[26px]">
        <div class="mx-auto flex max-w-[1260px] flex-col gap-5">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
