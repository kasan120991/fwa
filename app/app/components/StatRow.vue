<script setup lang="ts">
// FWA StatRow — one hairline card carrying several §5.6 stat cells side by
// side, under a single 2px citrine rule. The cells are divided by hairlines,
// so a five-metric strip reads as one surface instead of five boxes.
export interface StatRowItem {
  label: string
  value: string | number
  sub?: string | null
  tone?: 'default' | 'error' | 'warning' | 'success'
}

const props = defineProps<{ items: StatRowItem[] }>()

// The last cell stretches to fill an uneven final row (five metrics over a
// two- or three-column grid), so no hairline-coloured gap shows through.
const lastSpan = computed(() => {
  const n = props.items.length
  return [
    n % 2 ? 'col-span-2' : '',
    n % 3 === 1 ? 'md:col-span-3' : n % 3 === 2 ? 'md:col-span-2' : 'md:col-span-1',
    'xl:col-span-1'
  ]
})

const toneClass: Record<NonNullable<StatRowItem['tone']>, string> = {
  default: 'text-highlighted',
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success'
}
</script>

<template>
  <!-- gap-px over the border colour draws the hairline grid at every breakpoint -->
  <div class="grid grid-cols-2 gap-px overflow-hidden rounded-card border-t-2 border-citrine bg-[var(--ui-border)] ring ring-default md:grid-cols-3 xl:grid-cols-5">
    <div
      v-for="(m, i) in items"
      :key="m.label"
      class="flex flex-col gap-2 bg-default px-6 py-[18px]"
      :class="i === items.length - 1 ? lastSpan : ''"
    >
      <div class="eyebrow whitespace-nowrap">
        {{ m.label }}
      </div>
      <div class="flex items-baseline gap-2">
        <span
          class="font-display text-[28px] font-bold leading-none tracking-tight tabular-nums"
          :class="toneClass[m.tone ?? 'default']"
        >{{ m.value }}</span>
        <span
          v-if="m.sub"
          class="text-xs text-muted"
        >{{ m.sub }}</span>
      </div>
    </div>
  </div>
</template>
