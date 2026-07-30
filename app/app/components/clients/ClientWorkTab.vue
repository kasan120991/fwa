<script setup lang="ts">
// Client detail › Projects & Sites — the client's projects table + website
// cards, merged from the old Projects and Websites tabs. Fetches on mount
// (the parent mounts it lazily on first activation) and stays fresh via sockets.
import { PROJECT_META, type PStatus } from '~/utils/clientDetail'

const props = defineProps<{ clientId: number }>()
const emit = defineEmits<{ 'new-project': [], 'add-website': [] }>()

const api = useApi()

// ---- projects ----
interface ApiProject {
  id: number
  name: string
  status: PStatus
  project_fee: number | null
  target_launch_date: string | null
  task_total: number
  task_done: number
}
const projectsRaw = ref<ApiProject[]>([])
const projectsPending = ref(true)
const projects = computed(() => projectsRaw.value.map((p) => {
  const meta = PROJECT_META[p.status]
  return {
    id: p.id,
    name: p.name,
    status: meta.status,
    statusLabel: meta.label,
    progress: p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0,
    bar: meta.bar,
    due: p.target_launch_date ? shortDate(p.target_launch_date) : '—',
    value: p.project_fee != null ? formatMoney(p.project_fee) : '—',
    tasks: p.task_total - p.task_done
  }
}))
const activeCount = computed(() => projectsRaw.value.filter(p => p.status !== 'completed').length)

async function loadProjects() {
  try {
    const { data } = await api<{ data: ApiProject[] }>('/projects', { query: { client_id: props.clientId } })
    projectsRaw.value = data
  } catch { /* leave as-is on failure */ } finally {
    projectsPending.value = false
  }
}

// ---- websites ----
interface ApiWebsite {
  id: number
  name: string
  domain: string
  url: string | null
  environment: 'live' | 'staging' | 'dev'
  connected: boolean
  last_synced_at: string | null
  visitors_30d: number
  delta_pct: number | null
  spark: number[]
}
const websiteRows = ref<ApiWebsite[]>([])
const ENV_LABEL: Record<string, string> = { live: 'Live', staging: 'Staging', dev: 'Dev' }
const websites = computed(() => websiteRows.value.map((w) => {
  const sp = spark(w.spark, 118, 32)
  return {
    id: w.id,
    name: w.name,
    url: w.domain,
    href: w.url || `https://${w.domain}`,
    connected: w.connected,
    env: ENV_LABEL[w.environment] ?? w.environment,
    synced: w.last_synced_at ? timeAgo(w.last_synced_at) : '',
    visitors: w.visitors_30d.toLocaleString(),
    delta: w.delta_pct != null ? `${w.delta_pct >= 0 ? '+' : ''}${w.delta_pct}%` : '',
    spark: sp.line,
    sparkArea: sp.area
  }
}))
const connectedCount = computed(() => websiteRows.value.filter(w => w.connected).length)
const envClass = (e: string) => e === 'Live' ? 'text-success' : (e === 'Staging' ? 'text-warning' : 'text-muted')

async function loadWebsites() {
  try {
    const { data } = await api<{ data: ApiWebsite[] }>('/websites', { query: { client_id: props.clientId } })
    websiteRows.value = data
  } catch { /* non-fatal */ }
}

function websiteMenu(w: { href: string, id: number }) {
  return [[
    { label: 'Visit Site', icon: 'i-lucide-external-link', to: w.href, target: '_blank' },
    { label: 'View Analytics', icon: 'i-lucide-chart-line', onSelect: () => navigateTo(`/websites/${w.id}`) },
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/websites/${w.id}`) }
  ]]
}

const socket = useSocket()
onMounted(() => {
  loadProjects()
  loadWebsites()
  socket.on('project:created', loadProjects)
  socket.on('project:updated', loadProjects)
  socket.on('project:deleted', loadProjects)
  socket.on('website:changed', loadWebsites)
})
onBeforeUnmount(() => {
  socket.off('project:created', loadProjects)
  socket.off('project:updated', loadProjects)
  socket.off('project:deleted', loadProjects)
  socket.off('website:changed', loadWebsites)
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- projects -->
    <div>
      <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
        <div><span class="text-base font-semibold text-highlighted">Projects</span><span class="ml-2 text-sm text-muted">{{ activeCount }} active</span></div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          @click="emit('new-project')"
        >
          New Project
        </UButton>
      </div>
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div
          v-if="projectsPending"
          class="px-4 py-12 text-center text-sm text-muted"
        >
          Loading projects…
        </div>
        <div
          v-else-if="!projects.length"
          class="flex flex-col items-center px-6 py-12 text-center"
        >
          <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
            name="i-lucide-folder-plus"
            class="size-5"
          /></span>
          <p class="text-sm text-muted">
            No projects yet for this client.
          </p>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            class="mt-4 rounded-full"
            icon="i-lucide-plus"
            @click="emit('new-project')"
          >
            New Project
          </UButton>
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default bg-muted/40">
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Project
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Status
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Progress
                </th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Due
                </th>
                <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Value
                </th>
                <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Tasks
                </th>
                <th class="w-11" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in projects"
                :key="p.id"
                class="cursor-pointer border-t border-default transition-colors hover:bg-muted first:border-t-0"
                @click="navigateTo(`/projects/${p.id}`)"
              >
                <td class="px-4 py-3.5 text-sm font-semibold text-highlighted">
                  {{ p.name }}
                </td>
                <td class="px-4 py-3.5">
                  <StatusChip :status="p.status">
                    {{ p.statusLabel }}
                  </StatusChip>
                </td>
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-2.5">
                    <div class="h-1.5 w-[90px] overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full"
                        :class="p.bar"
                        :style="{ width: p.progress + '%' }"
                      />
                    </div>
                    <span class="text-[12.5px] text-muted tabular-nums">{{ p.progress }}%</span>
                  </div>
                </td>
                <td class="whitespace-nowrap px-4 py-3.5 text-sm text-default tabular-nums">
                  {{ p.due }}
                </td>
                <td class="px-4 py-3.5 text-right text-sm text-highlighted tabular-nums">
                  {{ p.value }}
                </td>
                <td class="px-4 py-3.5 text-right text-sm text-default tabular-nums">
                  {{ p.tasks }}
                </td>
                <td class="px-3 py-3.5 text-right text-muted">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- websites -->
    <div>
      <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
        <div><span class="text-base font-semibold text-highlighted">Websites</span><span class="ml-2 text-sm text-muted">{{ websites.length }} {{ websites.length === 1 ? 'site' : 'sites' }} · {{ connectedCount }} connected</span></div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          @click="emit('add-website')"
        >
          Add Website
        </UButton>
      </div>
      <div
        v-if="websites.length"
        class="grid grid-cols-1 gap-4 xl:grid-cols-2"
      >
        <div
          v-for="w in websites"
          :key="w.id"
          class="rounded-card bg-default p-5 ring ring-default"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <span class="text-[15px] font-semibold text-highlighted">{{ w.name }}</span>
                <span
                  class="rounded-chip bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  :class="envClass(w.env)"
                >{{ w.env }}</span>
              </div>
              <a
                :href="w.href"
                target="_blank"
                class="mt-1 inline-flex items-center gap-1 text-[13px] text-primary hover:text-primary/80"
              >{{ w.url }}<UIcon
                name="i-lucide-external-link"
                class="size-[13px]"
              /></a>
            </div>
            <UDropdownMenu :items="websiteMenu(w)">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Website actions"
              />
            </UDropdownMenu>
          </div>
          <div class="my-4 border-t border-default" />
          <div v-if="w.connected">
            <div class="flex items-center justify-between gap-2.5">
              <StatusChip status="success">
                Analytics Connected
              </StatusChip>
              <span class="text-xs text-muted">Synced {{ w.synced }}</span>
            </div>
            <div class="mt-3.5 flex items-end justify-between gap-3.5">
              <div>
                <div class="font-display text-[22px] font-semibold leading-none tracking-tight text-highlighted tabular-nums">
                  {{ w.visitors }}
                </div>
                <div class="mt-1.5 text-xs text-muted">
                  Visitors · 30d <span class="font-semibold text-success">{{ w.delta }}</span>
                </div>
              </div>
              <svg
                width="120"
                height="34"
                viewBox="0 0 120 34"
                fill="none"
                preserveAspectRatio="none"
                class="flex-none"
              >
                <polyline
                  :points="w.sparkArea"
                  fill="var(--color-mist)"
                  stroke="none"
                />
                <polyline
                  :points="w.spark"
                  fill="none"
                  stroke="var(--ui-primary)"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <UButton
              :to="`/websites/${w.id}`"
              block
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-chart-line"
              class="mt-4 rounded-full"
            >
              View Analytics
            </UButton>
          </div>
          <div v-else>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted"><span class="size-1.5 rounded-full bg-ink-400" />Analytics not connected</span>
            <p class="my-3.5 text-[13px] leading-relaxed text-muted">
              Connect analytics to track visitors and conversions for this site.
            </p>
            <UButton
              :to="`/websites/${w.id}`"
              block
              color="primary"
              size="sm"
              icon="i-lucide-plus"
              class="rounded-full"
            >
              Connect Analytics
            </UButton>
          </div>
        </div>
      </div>
      <div
        v-else
        class="flex flex-col items-center rounded-card bg-default px-6 py-12 text-center ring ring-default"
      >
        <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-globe"
          class="size-5"
        /></span>
        <p class="text-sm text-muted">
          No websites yet for this client.
        </p>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 rounded-full"
          icon="i-lucide-plus"
          @click="emit('add-website')"
        >
          Add Website
        </UButton>
      </div>
    </div>
  </div>
</template>
