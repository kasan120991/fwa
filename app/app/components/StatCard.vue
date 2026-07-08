<script setup lang="ts">
// FWA StatCard — white, hairline border, 16px radius. Matches the design-system spec.
withDefaults(defineProps<{
  label: string
  value: string | number
  delta?: string | null
  deltaTone?: 'success' | 'error' | 'muted'
}>(), {
  delta: null,
  deltaTone: 'success'
})

const toneClass: Record<string, string> = {
  success: 'text-success',
  error: 'text-error',
  muted: 'text-muted'
}
</script>

<template>
  <div class="rounded-card bg-default p-5 ring ring-default">
    <div class="mb-2.5 text-[13px] text-muted">{{ label }}</div>
    <div class="flex items-baseline gap-2.5">
      <div class="font-display text-[28px] font-medium leading-none tracking-tight text-highlighted tabular-nums">
        {{ value }}
      </div>
      <div v-if="delta != null" class="text-[13px] font-semibold" :class="toneClass[deltaTone]">
        {{ delta }}
      </div>
    </div>
  </div>
</template>
