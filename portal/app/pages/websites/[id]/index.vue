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
  unknown: { label: 'Checking', class: 'bg-muted text-muted' }
}

// Inline sparkline path from the 30d visitor series (no chart lib).
const sparkPath = computed(() => {
  const pts = series.value
  if (pts.length < 2) return ''
  const max = Math.max(...pts.map(p => p.visitors), 1)
  const W = 600
  const H = 120
  const step = W / (pts.length - 1)
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - (p.visitors / max) * (H - 8) - 4).toFixed(1)}`)
    .join(' ')
})

const stats = computed(() => summary.value
  ? [
      { label: 'Visitors', value: summary.value.visitors_30d.toLocaleString() },
      { label: 'Pageviews', value: summary.value.pageviews_30d.toLocaleString() },
      { label: 'Conversions', value: summary.value.conversions_30d.toLocaleString() },
      { label: 'Conversion rate', value: summary.value.conv_rate != null ? `${summary.value.conv_rate}%` : '—' }
    ]
  : [])

const avgResponse = computed(() => {
  const vals = checks.value.map(c => c.response_ms).filter((v): v is number => v != null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
})

function normPages(raw: Site['top_pages']) {
  return (raw || []).slice(0, 5).map(p => ({ label: p.path, count: p.views ?? null }))
}
function normSources(raw: Site['top_sources']) {
  return (raw || []).slice(0, 5).map(s => ({ label: s.source, count: s.visits ?? null }))
}
</script>

<template>
  <div class="flex flex-col gap-6">
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
      <h3 class="font-display text-lg font-medium text-highlighted">
        Website not found
      </h3>
    </div>

    <template v-else>
      <!-- header -->
      <div class="rounded-card bg-default p-6 ring ring-default">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-highlighted">
              {{ site.name }}
            </h1>
            <a
              v-if="site.url"
              :href="site.url"
              target="_blank"
              rel="noopener"
              class="mt-1 inline-flex items-center gap-1.5 text-[13.5px] text-primary"
            >
              {{ site.domain }}
              <UIcon
                name="i-lucide-external-link"
                class="size-3.5"
              />
            </a>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              :class="(HEALTH[site.health_state] || HEALTH.unknown)!.class"
            >{{ (HEALTH[site.health_state] || HEALTH.unknown)!.label }}</span>
            <div
              v-if="site.uptime_pct != null"
              class="text-right"
            >
              <div class="text-[11px] text-muted">
                Uptime · 30d
              </div>
              <div class="text-[14px] font-semibold tabular-nums text-highlighted">
                {{ Number(site.uptime_pct).toFixed(2) }}%<span
                  v-if="avgResponse != null"
                  class="font-normal text-muted"
                > · {{ avgResponse }}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 30d stats -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div
          v-for="s in stats"
          :key="s.label"
          class="rounded-card bg-default p-5 ring ring-default"
        >
          <div class="text-[12.5px] text-muted">
            {{ s.label }} <span class="text-[11px]">· 30d</span>
          </div>
          <div class="mt-1 font-display text-[1.4rem] font-medium tabular-nums text-highlighted">
            {{ s.value }}
          </div>
        </div>
      </div>

      <!-- traffic trend -->
      <div
        v-if="sparkPath"
        class="rounded-card bg-default p-6 ring ring-default"
      >
        <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
          Visitors · last 30 days
        </div>
        <svg
          viewBox="0 0 600 120"
          class="h-28 w-full"
          preserveAspectRatio="none"
        >
          <path
            :d="sparkPath"
            fill="none"
            stroke="#0FA08C"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="mt-1 flex justify-between text-[11px] text-muted">
          <span>{{ shortDate(series[0]?.date) }}</span>
          <span>{{ shortDate(series[series.length - 1]?.date) }}</span>
        </div>
      </div>

      <!-- top pages / sources -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          v-if="normPages(site.top_pages).length"
          class="overflow-hidden rounded-card bg-default ring ring-default"
        >
          <div class="border-b border-default px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
            Top pages
          </div>
          <div
            v-for="p in normPages(site.top_pages)"
            :key="p.label"
            class="flex items-center justify-between gap-3 border-b border-default px-5 py-3 last:border-0"
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
          class="overflow-hidden rounded-card bg-default ring ring-default"
        >
          <div class="border-b border-default px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
            Top sources
          </div>
          <div
            v-for="s in normSources(site.top_sources)"
            :key="s.label"
            class="flex items-center justify-between gap-3 border-b border-default px-5 py-3 last:border-0"
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
