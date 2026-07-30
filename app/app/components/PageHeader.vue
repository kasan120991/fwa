<script setup lang="ts">
// Shared page header: a large tinted icon badge left of the title, an optional
// count pill + subtitle, and slots for the per-page bits (right-side actions, an
// extra title badge, or a rich subtitle). Used by every section/list page so the
// title treatment stays consistent.
defineProps<{
  icon: string
  title: string
  count?: number | string | null
  subtitle?: string
}>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="flex items-center gap-3.5">
      <span class="inline-flex size-11 flex-none items-center justify-center rounded-[13px] bg-mist text-primary">
        <UIcon
          :name="icon"
          class="size-[22px]"
        />
      </span>
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-semibold tracking-tight text-highlighted">
            {{ title }}
          </h1>
          <span
            v-if="count != null"
            class="rounded-chip bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-primary tabular-nums"
          >{{ count }}</span>
          <slot name="badge" />
        </div>
        <p
          v-if="subtitle"
          class="mt-1.5 text-sm text-muted"
        >
          {{ subtitle }}
        </p>
        <slot name="subtitle" />
      </div>
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-none items-center gap-2.5"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
