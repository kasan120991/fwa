<script setup lang="ts">
useHead({ title: 'Projects · Francis Web Agency' })
const api = useApi()

interface Project {
  id: number
  name: string
  code: string | null
  status: string
  task_total: number
  task_done: number
  target_launch_date: string | null
  type_name: string | null
}
interface Milestone {
  id: number
  title: string
  state: 'upcoming' | 'in_progress' | 'complete'
}
const projects = ref<Project[]>([])
const pending = ref(true)
const currentPhase = ref<string | null>(null)

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  awaiting_signature: 'Awaiting Signature',
  awaiting_deposit: 'Awaiting Deposit',
  in_progress: 'In Progress',
  in_review: 'In Review',
  awaiting_final: 'Awaiting Final',
  on_hold: 'On Hold',
  completed: 'Completed'
}
const ATTENTION_STATUSES = new Set(['in_review', 'awaiting_signature', 'awaiting_deposit', 'awaiting_final'])

function chip(p: Project) {
  const label = STATUS_LABEL[p.status] || formatStatus(p.status)
  if (p.status === 'completed') return { label, class: 'bg-success/10 text-success' }
  if (p.status === 'on_hold') return { label, class: 'bg-mist text-muted' }
  if (ATTENTION_STATUSES.has(p.status)) return { label, class: 'bg-warning/10 text-warning' }
  return { label, class: 'bg-info/10 text-info' }
}
function pct(p: Project) {
  return p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0
}
function projectMeta(p: Project) {
  return [p.code, p.type_name || 'Project'].filter(Boolean).join(' · ')
}

const inMotion = computed(() => projects.value.filter(p => p.status !== 'completed' && p.status !== 'on_hold'))

// The spotlight: nearest target launch wins; projects without a date queue
// behind, keeping the list endpoint's (most-recently-active) order.
const spotlight = computed(() => {
  const dated = inMotion.value.filter(p => p.target_launch_date)
    .sort((a, b) => String(a.target_launch_date).localeCompare(String(b.target_launch_date)))
  return dated[0] || inMotion.value[0] || null
})
const alsoInMotion = computed(() => inMotion.value.filter(p => p.id !== spotlight.value?.id))
const pausedPast = computed(() => projects.value.filter(p => p.status === 'completed' || p.status === 'on_hold'))

onMounted(async () => {
  try {
    const { data } = await api<{ data: Project[] }>('/portal/projects')
    projects.value = data.map(p => ({ ...p, task_total: Number(p.task_total ?? 0), task_done: Number(p.task_done ?? 0) }))
  } finally {
    pending.value = false
  }
  // One extra request for the spotlight's current phase — worth it, not N+1.
  if (spotlight.value) {
    try {
      const { data } = await api<{ data: { milestones: Milestone[] } }>(`/portal/projects/${spotlight.value.id}`)
      const current = data.milestones.find(m => m.state === 'in_progress') || data.milestones.find(m => m.state === 'upcoming')
      currentPhase.value = current?.title ?? null
    } catch { /* the phase fact just stays hidden */ }
  }
})
</script>

<template>
  <div class="flex flex-col gap-7">
    <div>
      <p class="eyebrow text-primary">
        Your Work
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Projects
      </h1>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!projects.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No projects yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        When we start a project for you, it'll show up here.
      </p>
    </div>

    <template v-else>
      <!-- Spotlight — the page's one ink moment -->
      <section
        v-if="spotlight"
        class="rounded-band bg-deep p-7 sm:p-9 dark:ring dark:ring-default"
      >
        <p class="eyebrow text-[#8C9096]">
          Up Next<template v-if="spotlight.code">
            · {{ spotlight.code }}
          </template>
        </p>
        <h2 class="mt-1.5 font-display text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em] text-paper">
          {{ spotlight.name }}
        </h2>
        <p class="mt-1 text-[13px] text-[#B0B3B0]">
          {{ spotlight.type_name || 'Project' }} · {{ STATUS_LABEL[spotlight.status] || formatStatus(spotlight.status) }}
        </p>
        <div class="mt-6 flex items-center gap-3.5">
          <div class="h-[7px] flex-1 overflow-hidden rounded-full bg-paper/15">
            <div
              class="h-full rounded-full bg-paper"
              :style="{ width: pct(spotlight) + '%' }"
            />
          </div>
          <span class="text-[13px] font-semibold tabular-nums text-paper">{{ pct(spotlight) }}%</span>
        </div>
        <div class="mt-6 flex flex-wrap items-end gap-x-11 gap-y-5">
          <div v-if="spotlight.target_launch_date">
            <div class="text-[15px] font-semibold tabular-nums text-paper">
              {{ shortDate(spotlight.target_launch_date) }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Target Launch
            </div>
          </div>
          <div>
            <div class="text-[15px] font-semibold tabular-nums text-paper">
              {{ spotlight.task_done }} of {{ spotlight.task_total }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Tasks Done
            </div>
          </div>
          <div v-if="currentPhase">
            <div class="text-[15px] font-semibold text-paper">
              {{ currentPhase }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Current Phase
            </div>
          </div>
          <NuxtLink
            :to="`/projects/${spotlight.id}`"
            class="mb-0.5 ml-auto inline-flex items-center rounded-btn bg-paper px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-[#F0F0EC]"
          >
            View Project
          </NuxtLink>
        </div>
      </section>

      <!-- The rest of the queue -->
      <section v-if="alsoInMotion.length">
        <p class="eyebrow">
          Also In Motion
        </p>
        <div class="mt-1">
          <NuxtLink
            v-for="p in alsoInMotion"
            :key="p.id"
            :to="`/projects/${p.id}`"
            class="flex items-center gap-4 border-t border-default py-3.5 transition-colors first:border-t-0 hover:bg-muted/50"
          >
            <span class="text-[13.5px] font-medium text-highlighted">{{ p.name }}</span>
            <span class="text-[12px] text-muted">{{ projectMeta(p) }}</span>
            <span
              class="whitespace-nowrap rounded-chip px-2.5 py-1 text-[11px] font-semibold"
              :class="chip(p).class"
            >{{ chip(p).label }}</span>
            <span class="ml-auto flex items-center gap-4 text-[12.5px] text-muted">
              <span class="h-[5px] w-28 overflow-hidden rounded-full bg-mist">
                <span
                  class="block h-full rounded-full bg-primary"
                  :style="{ width: pct(p) + '%' }"
                />
              </span>
              <span class="tabular-nums">{{ p.task_done }} / {{ p.task_total }}</span>
              <span
                v-if="p.target_launch_date"
                class="tabular-nums"
              >{{ shortDate(p.target_launch_date) }}</span>
              <span class="font-medium text-highlighted underline decoration-1 underline-offset-2">View</span>
            </span>
          </NuxtLink>
        </div>
      </section>

      <section v-if="pausedPast.length">
        <p class="eyebrow">
          Paused &amp; Past
        </p>
        <div class="mt-1">
          <NuxtLink
            v-for="p in pausedPast"
            :key="p.id"
            :to="`/projects/${p.id}`"
            class="flex items-center gap-4 border-t border-default py-3.5 transition-colors first:border-t-0 hover:bg-muted/50"
          >
            <span class="text-[13.5px] font-medium text-highlighted">{{ p.name }}</span>
            <span class="text-[12px] text-muted">{{ projectMeta(p) }}</span>
            <span
              class="whitespace-nowrap rounded-chip px-2.5 py-1 text-[11px] font-semibold"
              :class="chip(p).class"
            >{{ chip(p).label }}</span>
            <span class="ml-auto flex items-center gap-4 text-[12.5px] text-muted">
              <span
                v-if="p.status === 'completed' && p.target_launch_date"
              >Launched {{ shortDate(p.target_launch_date) }}</span>
              <span
                v-else
                class="tabular-nums"
              >{{ p.task_done }} / {{ p.task_total }}</span>
              <span class="font-medium text-highlighted underline decoration-1 underline-offset-2">View</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
