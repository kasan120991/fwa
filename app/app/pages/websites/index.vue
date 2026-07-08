<script setup lang="ts">
useHead({ title: 'Websites · Francis Web Agency' })

// Cross-client analytics dashboard of every site FWA builds/maintains. KPIs + an
// aggregate traffic trend + a filterable table, all from /websites (real rows).
type Env = 'live' | 'staging' | 'dev'
type Health = 'up' | 'degraded' | 'down' | 'unknown'
interface Website {
  id: number
  name: string
  domain: string
  url: string | null
  environment: Env
  status: string
  connected: boolean
  client_id: number
  client: string
  health_state: Health
  uptime_pct: number | null
  visitors_30d: number
  pageviews_30d: number
  conversions_30d: number
  delta_pct: number | null
  spark: number[]
}
interface Stats { total_sites: number, live_count: number, connected_count: number, visitors_30d: number, visitors_delta_pct: number | null }
interface TrafficDay { date: string, label: string, visitors: number, pageviews: number }

const api = useApi()
const websites = ref<Website[]>([])
const stats = ref<Stats | null>(null)
const traffic = ref<TrafficDay[]>([])
const pending = ref(true)
const range = ref<30 | 90>(30)
const formOpen = ref(false)

const ENV_META: Record<Env, { label: string, class: string }> = {
  live: { label: 'Live', class: 'text-success' },
  staging: { label: 'Staging', class: 'text-warning' },
  dev: { label: 'Dev', class: 'text-muted' }
}
const HEALTH_META: Record<Health, { label: string, status: 'success' | 'warning' | 'error' | 'neutral' }> = {
  up: { label: 'Up', status: 'success' },
  degraded: { label: 'Degraded', status: 'warning' },
  down: { label: 'Down', status: 'error' },
  unknown: { label: 'No data', status: 'neutral' }
}
const compactNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

async function loadWebsites() {
  try {
    const { data } = await api<{ data: Website[] }>('/websites')
    websites.value = data
  } finally {
    pending.value = false
  }
}
async function loadStats() {
  const { data } = await api<{ data: Stats }>('/websites/stats')
  stats.value = data
}
async function loadTraffic() {
  const { data } = await api<{ data: TrafficDay[] }>('/websites/traffic', { query: { days: range.value } })
  traffic.value = data
}
watch(range, loadTraffic)
function refreshAll() {
  loadWebsites()
  loadStats()
  loadTraffic()
}
const socket = useSocket()
onMounted(() => {
  refreshAll()
  socket.on('website:changed', refreshAll)
})
onBeforeUnmount(() => socket.off('website:changed', refreshAll))
const onCreated = refreshAll

// ---- KPI tiles ----
const tiles = computed(() => {
  const s = stats.value
  return [
    { key: 'sites', label: 'Total sites', icon: 'i-lucide-globe', value: s ? String(s.total_sites) : '—', sub: 'across clients', delta: null as number | null },
    { key: 'visitors', label: 'Visitors · 30d', icon: 'i-lucide-users', value: s ? compactNum(s.visitors_30d) : '—', sub: 'all sites', delta: s?.visitors_delta_pct ?? null },
    { key: 'live', label: 'Live sites', icon: 'i-lucide-signal', value: s ? String(s.live_count) : '—', sub: 'in production', delta: null as number | null },
    { key: 'connected', label: 'Analytics connected', icon: 'i-lucide-plug', value: s ? `${s.connected_count}/${s.total_sites}` : '—', sub: 'tracking', delta: null as number | null }
  ]
})

// ---- aggregate traffic chart (area) ----
const axisLabels = computed(() => {
  const t = traffic.value
  if (!t.length) return []
  return [t[0], t[Math.floor(t.length / 2)], t[t.length - 1]].map(d => d.label)
})

// ---- filters ----
const search = ref('')
const envFilter = ref<'all' | Env>('all')
const connFilter = ref<'all' | 'connected' | 'not'>('all')
const clientFilter = ref<number | null>(null)

const envTabs = computed(() => {
  const count = (e: Env) => websites.value.filter(w => w.environment === e).length
  return [
    { key: 'all' as const, label: 'All', count: websites.value.length },
    { key: 'live' as const, label: 'Live', count: count('live') },
    { key: 'staging' as const, label: 'Staging', count: count('staging') },
    { key: 'dev' as const, label: 'Dev', count: count('dev') }
  ]
})
const clientOptions = computed(() => {
  const seen = new Map<number, string>()
  for (const w of websites.value) if (!seen.has(w.client_id)) seen.set(w.client_id, w.client)
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
})
const clientItems = computed(() => [[
  { label: 'All clients', icon: clientFilter.value === null ? 'i-lucide-check' : undefined, onSelect: () => { clientFilter.value = null } },
  ...clientOptions.value.map(o => ({ label: o.name, icon: clientFilter.value === o.id ? 'i-lucide-check' : undefined, onSelect: () => { clientFilter.value = o.id } }))
]])
const connItems = computed(() => [[
  { label: 'All', icon: connFilter.value === 'all' ? 'i-lucide-check' : undefined, onSelect: () => { connFilter.value = 'all' } },
  { label: 'Analytics connected', icon: connFilter.value === 'connected' ? 'i-lucide-check' : undefined, onSelect: () => { connFilter.value = 'connected' } },
  { label: 'Not connected', icon: connFilter.value === 'not' ? 'i-lucide-check' : undefined, onSelect: () => { connFilter.value = 'not' } }
]])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return websites.value.filter((w) => {
    if (envFilter.value !== 'all' && w.environment !== envFilter.value) return false
    if (connFilter.value === 'connected' && !w.connected) return false
    if (connFilter.value === 'not' && w.connected) return false
    if (clientFilter.value !== null && w.client_id !== clientFilter.value) return false
    if (q && !`${w.name} ${w.domain} ${w.client}`.toLowerCase().includes(q)) return false
    return true
  })
})
const filterActive = computed(() => connFilter.value !== 'all' || clientFilter.value !== null)

function clearFilters() {
  search.value = ''
  envFilter.value = 'all'
  connFilter.value = 'all'
  clientFilter.value = null
}
const rowSpark = (w: Website) => spark(w.spark, 90, 26)
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Websites
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ websites.length }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Analytics across every site you build and maintain — traffic, conversions, and health in one place.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        class="flex-none"
        @click="() => { formOpen = true }"
      >
        Add Website
      </UButton>
    </div>

    <!-- KPI tiles -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border border-default bg-default p-4"
      >
        <div class="flex items-center justify-between gap-2.5">
          <span class="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">{{ t.label }}</span>
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-mist text-teal-700"><UIcon
            :name="t.icon"
            class="size-[15px]"
          /></span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="font-display text-[27px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ t.value }}</span>
          <span
            v-if="t.delta != null"
            class="text-[12.5px] font-semibold"
            :class="t.delta >= 0 ? 'text-success' : 'text-muted'"
          >{{ t.delta >= 0 ? '+' : '' }}{{ t.delta }}%</span>
          <span
            v-else
            class="text-[12.5px] text-muted"
          >{{ t.sub }}</span>
        </div>
      </div>
    </div>

    <!-- aggregate traffic trend -->
    <div class="rounded-card bg-default p-5 ring ring-default">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
            Total traffic
          </div>
          <div class="flex items-baseline gap-2.5">
            <span class="font-display text-[26px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ stats ? compactNum(stats.visitors_30d) : '—' }}</span>
            <span
              v-if="stats && stats.visitors_delta_pct != null"
              class="text-[13px] font-semibold"
              :class="stats.visitors_delta_pct >= 0 ? 'text-success' : 'text-muted'"
            >{{ stats.visitors_delta_pct >= 0 ? '+' : '' }}{{ stats.visitors_delta_pct }}%</span>
          </div>
          <div class="mt-1.5 text-[13px] text-muted">
            Visitors · last {{ range }} days
          </div>
        </div>
        <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
          <button
            v-for="r in ([30, 90] as const)"
            :key="r"
            class="rounded-lg px-2.5 py-1 text-[12px] transition-colors"
            :class="range === r ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
            @click="range = r"
          >{{ r }}D</button>
        </div>
      </div>
      <TrendChart
        :points="traffic.map(d => d.visitors)"
        :labels="traffic.map(d => d.label)"
        :format-value="(n) => n.toLocaleString() + ' visitors'"
        :height="144"
      />
      <div
        v-if="axisLabels.length"
        class="mt-2 flex justify-between font-mono text-[10.5px] text-muted"
      >
        <span v-for="(l, i) in axisLabels" :key="i">{{ l }}</span>
      </div>
    </div>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="t in envTabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
          :class="envFilter === t.key ? 'border-teal-600 bg-mist font-semibold text-teal-700' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
          @click="envFilter = t.key"
        >
          {{ t.label }}
          <span
            class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="envFilter === t.key ? 'bg-default text-teal-700' : 'bg-muted text-muted'"
          >{{ t.count }}</span>
        </button>
      </div>
      <div class="flex items-center gap-2.5">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search site, domain, client…"
          class="w-[230px]"
          :ui="{ base: 'rounded-full' }"
        />
        <UDropdownMenu :items="clientItems" :ui="{ content: 'w-56' }">
          <UButton icon="i-lucide-building-2" color="neutral" variant="outline" class="rounded-full">
            {{ clientFilter === null ? 'All clients' : (clientOptions.find(o => o.id === clientFilter)?.name || 'Client') }}
          </UButton>
        </UDropdownMenu>
        <UDropdownMenu :items="connItems">
          <UButton icon="i-lucide-plug" color="neutral" variant="outline" class="rounded-full">
            Analytics
            <span v-if="connFilter !== 'all'" class="size-1.5 rounded-full bg-teal-500" />
          </UButton>
        </UDropdownMenu>
      </div>
    </div>

    <!-- table -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div v-if="pending" class="px-6 py-16 text-center text-sm text-muted">
        Loading websites…
      </div>
      <template v-else-if="filtered.length > 0">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Site</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">Client</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Visitors · 30d</th>
                <th class="hidden px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">Conv.</th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted sm:table-cell">Trend</th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Health</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="w in filtered"
                :key="w.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                @click="navigateTo(`/websites/${w.id}`)"
              >
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-2.5">
                    <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-mist text-teal-700"><UIcon name="i-lucide-globe" class="size-[17px]" /></span>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="whitespace-nowrap text-sm font-semibold text-highlighted">{{ w.name }}</span>
                        <span class="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em]" :class="ENV_META[w.environment].class">{{ ENV_META[w.environment].label }}</span>
                      </div>
                      <div class="whitespace-nowrap text-[13px] text-muted">{{ w.domain }}</div>
                    </div>
                  </div>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-default md:table-cell">{{ w.client }}</td>
                <td class="whitespace-nowrap px-4 py-3.5 text-right">
                  <template v-if="w.connected">
                    <span class="text-sm font-semibold text-highlighted tabular-nums">{{ w.visitors_30d.toLocaleString() }}</span>
                    <span v-if="w.delta_pct != null" class="ml-1.5 text-xs font-semibold" :class="w.delta_pct >= 0 ? 'text-success' : 'text-muted'">{{ w.delta_pct >= 0 ? '+' : '' }}{{ w.delta_pct }}%</span>
                  </template>
                  <span v-else class="text-[13px] text-muted">Not connected</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-right text-[13.5px] text-default tabular-nums lg:table-cell">{{ w.connected ? w.conversions_30d.toLocaleString() : '—' }}</td>
                <td class="hidden px-4 py-3.5 sm:table-cell">
                  <svg v-if="w.connected && w.spark.length > 1" width="90" height="26" viewBox="0 0 90 26" preserveAspectRatio="none" class="text-teal-500">
                    <polyline :points="rowSpark(w).area" fill="var(--color-mist)" stroke="none" />
                    <polyline :points="rowSpark(w).line" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                  </svg>
                  <span v-else class="text-[13px] text-muted">—</span>
                </td>
                <td class="px-4 py-3.5">
                  <StatusChip :status="HEALTH_META[w.health_state].status">
                    {{ w.health_state === 'unknown' ? '—' : HEALTH_META[w.health_state].label }}
                  </StatusChip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ websites.length }} sites</span>
        </div>
      </template>
      <div v-else class="flex flex-col items-center px-6 py-16 text-center">
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon name="i-lucide-globe" class="size-6" /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          {{ websites.length ? 'No sites match' : 'No websites yet' }}
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          {{ websites.length ? 'Try a different filter or search.' : 'Add a website to start tracking its analytics.' }}
        </p>
        <UButton
          v-if="websites.length && filterActive"
          color="neutral"
          variant="outline"
          class="mt-5 rounded-full"
          @click="clearFilters"
        >
          Clear filters
        </UButton>
      </div>
    </div>

    <WebsiteForm
      v-model:open="formOpen"
      @created="onCreated"
    />
  </div>
</template>
