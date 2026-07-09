<script setup lang="ts">
// Website detail — identity + analytics for one site (GET /websites/:id and
// /websites/:id/metrics). Mirrors the client-detail layout.
type Env = 'live' | 'staging' | 'dev'
type Health = 'up' | 'degraded' | 'down' | 'unknown'
interface Detail {
  id: number
  name: string
  domain: string
  url: string | null
  environment: Env
  status: string
  connected: boolean
  analytics_provider: string
  client_id: number
  client: string
  project_id: number | null
  project_name: string | null
  project_code: string | null
  conversion_goal: string | null
  health_state: Health
  uptime_pct: number | null
  perf_score: number | null
  avg_lcp_ms: number | null
  last_checked_at: string | null
  last_synced_at: string | null
  launched_at: string | null
  notes: string | null
  top_pages: { path: string, views: number }[]
  top_sources: { source: string, visits: number }[]
  visitors_30d: number
  pageviews_30d: number
  conversions_30d: number
  conv_rate: number
  visitors_delta_pct: number | null
}
interface MetricDay { date: string, label: string, visitors: number, pageviews: number, conversions: number }

const route = useRoute()
const api = useApi()
const toast = useToast()

const ENV_META: Record<Env, { label: string, class: string }> = {
  live: { label: 'Live', class: 'text-success' },
  staging: { label: 'Staging', class: 'text-warning' },
  dev: { label: 'Dev', class: 'text-muted' }
}
const HEALTH_META: Record<Health, { label: string, status: 'success' | 'warning' | 'error' | 'neutral' }> = {
  up: { label: 'Operational', status: 'success' },
  degraded: { label: 'Degraded', status: 'warning' },
  down: { label: 'Down', status: 'error' },
  unknown: { label: 'No data', status: 'neutral' }
}
const compactNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

const site = ref<Detail | null>(null)
const metrics = ref<MetricDay[]>([])
const pending = ref(true)
const range = ref<7 | 30 | 90>(30)
const metric = ref<'visitors' | 'pageviews'>('visitors')
const formOpen = ref(false)

async function loadSite() {
  pending.value = true
  try {
    const { data } = await api<{ data: Detail }>(`/websites/${route.params.id}`)
    site.value = data
  } catch {
    site.value = null
  } finally {
    pending.value = false
  }
}
async function loadMetrics() {
  const { data } = await api<{ data: MetricDay[] }>(`/websites/${route.params.id}/metrics`, { query: { days: range.value } })
  metrics.value = data
}
interface CheckDay { date: string, label: string, uptime: number | null, response_ms: number | null }
const checks = ref<CheckDay[]>([])
async function loadChecks() {
  const { data } = await api<{ data: CheckDay[] }>(`/websites/${route.params.id}/checks`, { query: { days: range.value } })
  checks.value = data
}
watch(range, () => { loadMetrics(); loadChecks() })
function refreshDetail() {
  loadSite()
  loadMetrics()
  loadChecks()
}
const socket = useSocket()
onMounted(() => {
  refreshDetail()
  socket.on('website:changed', refreshDetail)
})
onBeforeUnmount(() => socket.off('website:changed', refreshDetail))
useHead({ title: () => `${site.value?.name ?? 'Website'} · Francis Web Agency` })

function onSaved() {
  refreshDetail()
}
const uptimeAvg = computed(() => {
  const vals = checks.value.map(c => c.uptime).filter((u): u is number => u != null)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
})

const syncing = ref(false)
async function syncNow() {
  if (syncing.value) return
  syncing.value = true
  try {
    const { data } = await api<{ data: { synced: boolean, configured?: boolean, reason?: string } }>(`/websites/${route.params.id}/sync`, { method: 'POST' })
    if (data.configured === false) toast.add({ title: 'Analytics not configured', description: 'Add a Plausible API key to pull live data.', color: 'neutral' })
    else if (data.synced) toast.add({ title: 'Analytics synced', color: 'success' })
    else toast.add({ title: data.reason || 'Nothing to sync', color: 'neutral' })
    refreshDetail()
  } catch {
    toast.add({ title: 'Sync failed', description: 'Check the connection and try again.', color: 'error' })
  } finally {
    syncing.value = false
  }
}
const actions = computed(() => [[
  { label: 'Edit Website', icon: 'i-lucide-pencil', onSelect: () => { formOpen.value = true } },
  { label: syncing.value ? 'Syncing…' : 'Sync now', icon: 'i-lucide-refresh-cw', onSelect: syncNow },
  { label: 'Open Site', icon: 'i-lucide-external-link', onSelect: () => { if (site.value?.url) window.open(site.value.url, '_blank') } }
]])

const tiles = computed(() => {
  const s = site.value
  if (!s) return []
  return [
    { key: 'v', label: 'Visitors · 30d', value: compactNum(s.visitors_30d), delta: s.visitors_delta_pct, sub: '' },
    { key: 'p', label: 'Pageviews · 30d', value: compactNum(s.pageviews_30d), delta: null as number | null, sub: 'total' },
    { key: 'c', label: 'Conversions · 30d', value: String(s.conversions_30d), delta: null as number | null, sub: `${s.conv_rate}% rate` },
    { key: 'u', label: 'Uptime', value: s.uptime_pct != null ? `${s.uptime_pct}%` : '—', delta: null as number | null, sub: HEALTH_META[s.health_state].label }
  ]
})
const pagesMax = computed(() => Math.max(1, ...(site.value?.top_pages.map(p => p.views) ?? [1])))
const sourcesMax = computed(() => Math.max(1, ...(site.value?.top_sources.map(s => s.visits) ?? [1])))
</script>

<template>
  <div v-if="pending" class="flex min-h-[60vh] items-center justify-center text-sm text-muted">
    Loading website…
  </div>

  <div v-else-if="!site" class="flex min-h-[60vh] items-center justify-center">
    <div class="flex max-w-md flex-col items-center rounded-card bg-default px-10 py-14 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon name="i-lucide-globe" class="size-6" /></span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">
        Website Not Found
      </h2>
      <p class="mt-2 text-[15px] text-muted">
        We couldn't find that website.
      </p>
      <UButton to="/websites" variant="soft" color="primary" class="mt-6" icon="i-lucide-arrow-left">
        Back To Websites
      </UButton>
    </div>
  </div>

  <template v-else>
    <NuxtLink to="/websites" class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-highlighted">
      <UIcon name="i-lucide-arrow-left" class="size-4" />Websites
    </NuxtLink>

    <!-- identity header -->
    <div class="mt-4 flex flex-wrap items-start justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <span class="inline-flex size-[52px] flex-none items-center justify-center rounded-[14px] bg-mist text-primary"><UIcon name="i-lucide-globe" class="size-7" /></span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">
              {{ site.name }}
            </h1>
            <span class="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.05em]" :class="ENV_META[site.environment].class">{{ ENV_META[site.environment].label }}</span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-3.5 text-sm">
            <a :href="site.url || `https://${site.domain}`" target="_blank" class="inline-flex items-center gap-1.5 font-medium text-primary hover:text-primary/80">
              {{ site.domain }}<UIcon name="i-lucide-external-link" class="size-[15px]" />
            </a>
            <NuxtLink :to="`/clients/${site.client_id}`" class="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-highlighted">
              <UIcon name="i-lucide-building-2" class="size-[15px]" />{{ site.client }}
            </NuxtLink>
          </div>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton :to="site.url || `https://${site.domain}`" target="_blank" color="neutral" variant="outline" class="rounded-full" icon="i-lucide-external-link">
          Open Site
        </UButton>
        <UDropdownMenu :items="actions">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="outline" square aria-label="Website actions" />
        </UDropdownMenu>
      </div>
    </div>

    <!-- not-connected banner -->
    <div v-if="!site.connected" class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card bg-muted px-5 py-4 ring ring-default">
      <div class="flex items-center gap-3">
        <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-default text-muted ring ring-default"><UIcon name="i-lucide-plug" class="size-[17px]" /></span>
        <div>
          <div class="text-sm font-semibold text-highlighted">Analytics not connected</div>
          <div class="text-[13px] text-muted">Connect an analytics provider to track visitors, conversions, and health for this site.</div>
        </div>
      </div>
      <UButton color="primary" class="rounded-full" icon="i-lucide-plus" @click="() => { formOpen = true }">
        Connect Analytics
      </UButton>
    </div>

    <template v-else>
      <!-- KPI tiles -->
      <div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="t in tiles" :key="t.key" class="rounded-[14px] border border-default bg-default p-4">
          <span class="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">{{ t.label }}</span>
          <div class="mt-2.5 flex items-baseline gap-2">
            <span class="font-display text-[26px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ t.value }}</span>
            <span v-if="t.delta != null" class="text-[12.5px] font-semibold" :class="t.delta >= 0 ? 'text-success' : 'text-muted'">{{ t.delta >= 0 ? '+' : '' }}{{ t.delta }}%</span>
            <span v-else class="text-[12.5px] text-muted">{{ t.sub }}</span>
          </div>
        </div>
      </div>

      <!-- traffic trend -->
      <div class="mt-5 rounded-card bg-default p-5 ring ring-default">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
            <button
              v-for="m in (['visitors', 'pageviews'] as const)"
              :key="m"
              class="rounded-lg px-3 py-1 text-[12.5px] capitalize transition-colors"
              :class="metric === m ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
              @click="metric = m"
            >{{ m }}</button>
          </div>
          <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
            <button
              v-for="r in ([7, 30, 90] as const)"
              :key="r"
              class="rounded-lg px-2.5 py-1 text-[12px] transition-colors"
              :class="range === r ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
              @click="range = r"
            >{{ r }}D</button>
          </div>
        </div>
        <TrendChart
          :points="metrics.map(d => d[metric])"
          :labels="metrics.map(d => d.label)"
          :format-value="(n) => n.toLocaleString() + ' ' + metric"
          :height="160"
        />
        <div v-if="metrics.length" class="mt-2 flex justify-between font-mono text-[10.5px] text-muted">
          <span>{{ metrics[0].label }}</span>
          <span>{{ metrics[metrics.length - 1].label }}</span>
        </div>
      </div>

      <!-- top pages + sources -->
      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Top pages</div>
          <div class="flex flex-col gap-3">
            <div v-for="p in site.top_pages" :key="p.path">
              <div class="mb-1 flex items-center justify-between gap-3 text-[13px]">
                <span class="truncate font-medium text-highlighted">{{ p.path }}</span>
                <span class="flex-none text-muted tabular-nums">{{ p.views.toLocaleString() }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-teal-500" :style="{ width: (p.views / pagesMax * 100) + '%' }" />
              </div>
            </div>
          </div>
        </div>
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Top sources</div>
          <div class="flex flex-col gap-3">
            <div v-for="s in site.top_sources" :key="s.source">
              <div class="mb-1 flex items-center justify-between gap-3 text-[13px]">
                <span class="truncate font-medium text-highlighted">{{ s.source }}</span>
                <span class="flex-none text-muted tabular-nums">{{ s.visits.toLocaleString() }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-teal-400" :style="{ width: (s.visits / sourcesMax * 100) + '%' }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- uptime & response-time history -->
      <div class="mt-5 rounded-card bg-default p-5 ring ring-default">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div class="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Response time</div>
          <div class="text-[13px] text-muted">
            <span class="font-semibold text-highlighted tabular-nums">{{ uptimeAvg != null ? uptimeAvg + '%' : '—' }}</span> uptime · last {{ range }} days
          </div>
        </div>
        <TrendChart
          :points="checks.map(c => c.response_ms ?? 0)"
          :labels="checks.map(c => c.label)"
          :format-value="(n) => Math.round(n) + ' ms'"
          color="var(--color-teal-600)"
          :height="120"
        />
      </div>

      <!-- health + related -->
      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-3.5 flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Health &amp; performance</span>
            <StatusChip :status="HEALTH_META[site.health_state].status">{{ HEALTH_META[site.health_state].label }}</StatusChip>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <div class="font-display text-[22px] font-medium text-highlighted tabular-nums">{{ site.uptime_pct != null ? site.uptime_pct + '%' : '—' }}</div>
              <div class="mt-0.5 text-xs text-muted">Uptime</div>
            </div>
            <div>
              <div class="font-display text-[22px] font-medium text-highlighted tabular-nums">{{ site.perf_score ?? '—' }}</div>
              <div class="mt-0.5 text-xs text-muted">Perf score</div>
            </div>
            <div>
              <div class="font-display text-[22px] font-medium text-highlighted tabular-nums">{{ site.avg_lcp_ms != null ? (site.avg_lcp_ms / 1000).toFixed(1) + 's' : '—' }}</div>
              <div class="mt-0.5 text-xs text-muted">LCP</div>
            </div>
          </div>
          <div class="mt-4 border-t border-default pt-3 text-[13px] text-muted">
            Last checked {{ site.last_checked_at ? timeAgo(site.last_checked_at) : '—' }} · Analytics synced {{ site.last_synced_at ? timeAgo(site.last_synced_at) : '—' }}
          </div>
        </div>
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Details</div>
          <dl class="flex flex-col gap-2.5 text-[13.5px]">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Conversion goal</dt><dd class="font-medium text-highlighted">{{ site.conversion_goal || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Launched</dt><dd class="text-default tabular-nums">{{ site.launched_at ? shortDate(site.launched_at) : '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Built under</dt>
              <dd>
                <NuxtLink v-if="site.project_id" :to="`/projects/${site.project_id}`" class="font-medium text-primary hover:opacity-80">{{ site.project_name }}</NuxtLink>
                <span v-else class="text-muted">—</span>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Provider</dt><dd class="font-medium text-highlighted capitalize">{{ site.analytics_provider }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </template>

    <WebsiteForm
      v-model:open="formOpen"
      mode="edit"
      :website="site"
      :contact-label="site.client"
      @saved="onSaved"
    />
  </template>
</template>
