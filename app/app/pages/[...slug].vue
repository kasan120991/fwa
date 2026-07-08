<script setup lang="ts">
// Placeholder for deferred nav destinations. These routes exist in the shell
// (per CLAUDE.md) but are built in a later phase.
const route = useRoute()
const meta = resolvePageMeta(route.path)
useHead({ title: `${meta.title} · Francis Web Agency` })
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center">
    <div class="flex max-w-md flex-col items-center rounded-card bg-default px-10 py-14 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-teal-50 text-primary">
        <UIcon name="i-lucide-hammer" class="size-6" />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">{{ meta.title }}</h2>
      <p class="mt-2 text-[15px] leading-relaxed text-muted">
        This section isn't built yet. It's part of a later phase — the design and data model come after the current pages ship.
      </p>
      <UButton to="/" variant="soft" color="primary" class="mt-6" icon="i-lucide-arrow-left">
        Back To Dashboard
      </UButton>
    </div>
  </div>
</template>
