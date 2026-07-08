<script setup lang="ts">
// Reusable area/line trend chart with hover: a transparent overlay tracks the
// cursor, snaps to the nearest point, and shows a vertical marker + dot + tooltip
// (same visual language as the dashboard Revenue chart). Renders via spark().
const props = withDefaults(defineProps<{
  points: number[]
  labels: string[]
  formatValue?: (n: number) => string
  color?: string
  areaColor?: string
  height?: number
}>(), {
  formatValue: (n: number) => String(n),
  color: 'var(--color-teal-500)',
  areaColor: 'var(--color-mist)',
  height: 150
})

const H = computed(() => props.height)
const chart = computed(() => spark(props.points, 1000, H.value))

const hoverIdx = ref<number | null>(null)
const root = ref<HTMLElement | null>(null)

function onMove(e: MouseEvent) {
  const el = root.value
  const n = props.points.length
  if (!el || n < 2) return
  const rect = el.getBoundingClientRect()
  const rel = (e.clientX - rect.left) / rect.width
  hoverIdx.value = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))))
}

// Marker geometry as % of the box, mirroring spark()'s y mapping.
const marker = computed(() => {
  const i = hoverIdx.value
  if (i == null || props.points.length < 2) return null
  const arr = props.points
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  const span = (max - min) || 1
  const xPct = (i / (arr.length - 1)) * 100
  const yView = H.value - ((arr[i] - min) / span) * (H.value - 4) - 2
  const yPct = (yView / H.value) * 100
  return { xPct, yPct, value: arr[i], label: props.labels[i] ?? '' }
})
</script>

<template>
  <div
    ref="root"
    class="relative"
    @mousemove="onMove"
    @mouseleave="hoverIdx = null"
  >
    <svg
      :viewBox="`0 0 1000 ${H}`"
      preserveAspectRatio="none"
      class="w-full"
      :style="{ height: H + 'px' }"
    >
      <polyline
        :points="chart.area"
        :fill="areaColor"
        stroke="none"
      />
      <polyline
        :points="chart.line"
        fill="none"
        :stroke="color"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- hover marker + dot -->
    <template v-if="marker">
      <span
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-accented"
        :style="{ left: marker.xPct + '%' }"
      />
      <span
        class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-default"
        :style="{ left: marker.xPct + '%', top: marker.yPct + '%', backgroundColor: color }"
      />
      <!-- tooltip -->
      <div
        class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-inverted px-2.5 py-1.5 text-center shadow-lg"
        :style="{ left: marker.xPct + '%', top: 'calc(' + marker.yPct + '% - 8px)' }"
      >
        <div class="text-[13px] font-semibold text-white tabular-nums">
          {{ formatValue(marker.value) }}
        </div>
        <div class="font-mono text-[10px] uppercase tracking-[0.04em] text-white/60">
          {{ marker.label }}
        </div>
      </div>
    </template>
  </div>
</template>
