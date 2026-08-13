<script setup lang="ts">
const route = useRoute()
const api = useApi()

interface Site {
  id: number
  name: string
  domain: string
  url: string | null
  health_state: 'up' | 'degraded' | 'down' | 'unknown'
  uptime_pct: number | null
  top_pages: { path: string, views: number }[]
  top_sources: { source: string, visits: number }[]
}
interface Summary { visitors_30d: number, pageviews_30d: number, conversions_30d: number, conv_rate: number | null, visitors_delta_pct: number | null }
interface Point { date: string, visitors: number, pageviews: number }
interface CheckPoint { date: string, uptime: number | null, response_ms: number | null }

const site = ref<Site | null>(null)
const summary = ref<Summary | null>(null)
const series = ref<Point[]>([])
const checks = ref<CheckPoint[]>([])
const pending = ref(true)
const notFound = ref(false)

useHead({ title: () => `${site.value?.name || 'Website'} · Francis Web Agency` })

onMounted(async () => {
  try {
    const { data } = await api<{ data: { site: Site, summary: Summary, series: Point[], checks: CheckPoint[] } }>(`/portal/websites/${route.params.id}`)
    site.value = data.site
    summary.value = data.summary
    series.value = data.series
    checks.value = data.checks
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
})

const HEALTH: Record<string, { label: string, class: string }> = {
  up: { label: 'Online', class: 'bg-success/10 text-success' },
  degraded: { label: 'Slow', class: 'bg-warning/10 text-warning' },
  down: { label: 'Down', class: 'bg-error/10 text-error' },
  unknown: { label: 'Checking', class: 'bg-mist text-muted' }
}

// Visitors chart — area + line + endpoint, no chart lib.
const CHART_W = 600
const CHART_H = 150
const chart = computed(() => {
  const pts = series.value
  if (pts.length < 2) return null
  const max = Math.max(...pts.map(p => p.visitors), 1)
  const step = CHART_W / (pts.length - 1)
  const coords = pts.map((p, i) => ({
    x: Number((i * step).toFixed(1)),
    y: Number((CHART_H - (p.visitors / max) * (CHART_H - 12) - 6).toFixed(1))
  }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const last = coords[coords.length - 1]!
  return {
    line,
    area: `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`,
    end: last
  }
})

const stats = computed(() => {
  if (!summary.value) return []
  const s = summary.value
  return [
    { label: 'Visitors · 30d', value: s.visitors_30d.toLocaleString(), delta: s.visitors_delta_pct },
    { label: 'Pageviews · 30d', value: s.pageviews_30d.toLocaleString() },
    { label: 'Conversions · 30d', value: s.conversions_30d.toLocaleString(), note: s.conv_rate != null ? `${s.conv_rate}% rate` : undefined },
    { label: 'Uptime · 30d', value: site.value?.uptime_pct != null ? `${Number(site.value.uptime_pct).toFixed(2)}%` : '—' }
  ]
})

const avgResponse = computed(() => {
  const vals = checks.value.map(c => c.response_ms).filter((v): v is number => v != null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
})
const maxResponse = computed(() => Math.max(...checks.value.map(c => c.response_ms ?? 0), 1))
const hasUptimeData = computed(() => checks.value.some(c => c.uptime != null))

function uptimeCell(c: CheckPoint) {
  if (c.uptime == null) return 'bg-mist'
  if (c.uptime >= 99) return 'bg-success/50'
  if (c.uptime >= 90) return 'bg-warning/60'
  return 'bg-error/60'
}
function respHeight(c: CheckPoint) {
  if (c.response_ms == null) return '2px'
  return `${Math.max(6, Math.round((c.response_ms / maxResponse.value) * 100))}%`
}
function normPages(raw: Site['top_pages']) {
  return (raw || []).slice(0, 5).map(p => ({ label: p.path, count: p.views ?? null }))
}
function normSources(raw: Site['top_sources']) {
  return (raw || []).slice(0, 5).map(s => ({ label: s.source, count: s.visits ?? null }))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <NuxtLink
      to="/websites"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      Websites
    </NuxtLink>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="notFound || !site"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Website not found
      </h3>
    </div>

    <template v-else>
      <!-- header row -->
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <div class="min-w-0">
          <h1 class="font-display text-[1.6rem] font-semibold leading-tight tracking-tight text-highlighted">
            {{ site.name }}
          </h1>
          <a
            v-if="site.url"
            :href="site.url"
            target="_blank"
            rel="noopener"
            class="mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-highlighted underline decoration-(--ui-border-accented) decoration-1 underline-offset-4 hover:decoration-citrine hover:decoration-2"
          >
            {{ site.domain }}
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
          <span
            v-else
            class="mt-0.5 block text-[13px] text-muted"
          >{{ site.domain }}</span>
        </div>
        <span
          class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
          :class="(HEALTH[site.health_state] || HEALTH.unknown)!.class"
        >{{ (HEALTH[site.health_state] || HEALTH.unknown)!.label }}</span>
      </div>

      <!-- stat band -->
      <div class="mt-2 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div
          v-for="s in stats"
          :key="s.label"
          class="relative overflow-hidden rounded-card bg-default px-4.5 pb-4 pt-4.5 ring ring-default before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-citrine"
        >
          <div class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {{ s.label }}
          </div>
          <div class="mt-1.5 font-display text-[1.5rem] font-bold leading-tight tabular-nums text-highlighted">
            {{ s.value }}
            <span
              v-if="s.delta != null"
              class="text-[12px] font-semibold"
              :class="s.delta >= 0 ? 'text-success' : 'text-warning'"
            >{{ s.delta >= 0 ? '+' : '' }}{{ s.delta }}%</span>
            <span
              v-else-if="s.note"
              class="text-[12px] font-medium text-muted"
            >· {{ s.note }}</span>
          </div>
        </div>
      </div>

      <!-- chart + health history -->
      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div
          v-if="chart"
          class="rounded-card bg-default p-5 ring ring-default"
        >
          <div class="flex items-center justify-between pb-3">
            <p class="eyebrow">
              Visitors · Last 30 Days
            </p>
            <span
              v-if="summary?.visitors_delta_pct != null"
              class="text-[12px] font-semibold"
              :class="summary.visitors_delta_pct >= 0 ? 'text-success' : 'text-warning'"
            >{{ summary.visitors_delta_pct >= 0 ? '+' : '' }}{{ summary.visitors_delta_pct }}% vs prior 30 days</span>
          </div>
          <svg
            :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
            class="h-44 w-full"
            preserveAspectRatio="none"
          >
            <line
              v-for="y in [37, 74, 111]"
              :key="y"
              x1="0"
              :y1="y"
              x2="600"
              :y2="y"
              stroke="var(--ui-border)"
              stroke-width="1"
            />
            <path
              :d="chart.area"
              fill="var(--surface-mist)"
            />
            <path
              :d="chart.line"
              fill="none"
              stroke="var(--ui-primary)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle
              :cx="Math.min(chart.end.x, CHART_W - 4)"
              :cy="chart.end.y"
              r="3.5"
              fill="var(--ui-primary)"
            />
          </svg>
          <div class="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>{{ shortDate(series[0]?.date) }}</span>
            <span>{{ shortDate(series[series.length - 1]?.date) }}</span>
          </div>
        </div>

        <div
          v-if="checks.length"
          class="flex flex-col gap-4"
        >
          <div
            v-if="hasUptimeData"
            class="rounded-card bg-default p-5 ring ring-default"
          >
            <p class="eyebrow">
              Uptime · Last 30 Days
            </p>
            <div class="mt-3 flex gap-[3px]">
              <span
                v-for="c in checks"
                :key="c.date"
                class="h-[22px] flex-1 rounded-[3px]"
                :class="uptimeCell(c)"
                :title="`${shortDate(c.date)} · ${c.uptime != null ? c.uptime + '%' : 'no data'}`"
              />
            </div>
            <div class="mt-1.5 flex justify-between text-[11px] text-muted">
              <span>{{ shortDate(checks[0]?.date) }}</span>
              <span>{{ shortDate(checks[checks.length - 1]?.date) }}</span>
            </div>
          </div>

          <div
            v-if="avgResponse != null"
            class="rounded-card bg-default p-5 ring ring-default"
          >
            <p class="eyebrow">
              Response Time · Avg {{ avgResponse }}ms
            </p>
            <div class="mt-3 flex h-11 items-end gap-[2px]">
              <span
                v-for="c in checks"
                :key="c.date"
                class="flex-1 rounded-t-[2px]"
                :class="c.response_ms != null && c.response_ms >= maxResponse ? 'bg-[var(--ui-border-accented)]' : 'bg-mist'"
                :style="{ height: respHeight(c) }"
                :title="`${shortDate(c.date)} · ${c.response_ms != null ? c.response_ms + 'ms' : 'no data'}`"
              />
            </div>
            <div class="mt-1.5 flex justify-between text-[11px] text-muted">
              <span>{{ shortDate(checks[0]?.date) }}</span>
              <span>{{ shortDate(checks[checks.length - 1]?.date) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- top pages / sources -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          v-if="normPages(site.top_pages).length"
          class="rounded-card bg-default px-5 pb-2 pt-4 ring ring-default"
        >
          <p class="eyebrow pb-1.5">
            Top Pages
          </p>
          <div
            v-for="p in normPages(site.top_pages)"
            :key="p.label"
            class="flex items-center justify-between gap-3 border-t border-default py-2.5"
          >
            <span class="truncate text-[13px] text-default">{{ p.label }}</span>
            <span
              v-if="p.count != null"
              class="text-[12.5px] text-muted tabular-nums"
            >{{ p.count.toLocaleString() }}</span>
          </div>
        </div>
        <div
          v-if="normSources(site.top_sources).length"
          class="rounded-card bg-default px-5 pb-2 pt-4 ring ring-default"
        >
          <p class="eyebrow pb-1.5">
            Top Sources
          </p>
          <div
            v-for="s in normSources(site.top_sources)"
            :key="s.label"
            class="flex items-center justify-between gap-3 border-t border-default py-2.5"
          >
            <span class="truncate text-[13px] text-default">{{ s.label }}</span>
            <span
              v-if="s.count != null"
              class="text-[12.5px] text-muted tabular-nums"
            >{{ s.count.toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
