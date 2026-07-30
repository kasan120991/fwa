<script setup lang="ts">
// FWA StatCard — hairline card with the signature 2px citrine top rule
// (Highlighter §5.6): eyebrow label, Geist 700 tabular value.
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
  <div class="rounded-card border-t-2 border-citrine bg-default p-5 ring ring-default">
    <div class="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{{ label }}</div>
    <div class="flex items-baseline gap-2.5">
      <div class="text-[28px] font-bold leading-none tracking-tight text-highlighted tabular-nums">
        {{ value }}
      </div>
      <div v-if="delta != null" class="text-[13px] font-semibold" :class="toneClass[deltaTone]">
        {{ delta }}
      </div>
    </div>
  </div>
</template>
