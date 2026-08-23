<script setup lang="ts">
const route = useRoute()
const api = useApi()

interface Project {
  id: number
  name: string
  code: string | null
  status: string
  type_name: string | null
  task_total: number
  task_done: number
  start_date: string | null
  target_launch_date: string | null
}
type MilestoneState = 'upcoming' | 'in_progress' | 'complete'
interface Milestone {
  id: number
  title: string
  description: string | null
  state: MilestoneState
  target_date: string | null
  completed_at: string | null
  task_total: number
  task_done: number
}
interface FileRow {
  id: number
  name: string
  project_id: number | null
  size_bytes: number | null
  created_at: string | null
}

const project = ref<Project | null>(null)
const milestones = ref<Milestone[]>([])
const files = ref<FileRow[]>([])
const pending = ref(true)
const notFound = ref(false)

useHead({ title: () => `${project.value?.name || 'Project'} · Francis Web Agency` })

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
// A finished phase used to render as a bare title. Now that state is derived
// from the work itself rather than set by hand, it can say what it finished and
// when — so each phase carries its own one-line receipt.
function receipt(m: Milestone) {
  if (m.state === 'complete') {
    const items = m.task_total ? `All ${m.task_total} ${m.task_total === 1 ? 'item' : 'items'} complete` : 'Complete'
    return m.completed_at ? `${items} · finished ${shortDate(m.completed_at)}` : items
  }
  if (m.state === 'in_progress') return m.target_date ? `Due ${shortDate(m.target_date)}` : 'In progress'
  return m.target_date ? `Target ${shortDate(m.target_date)}` : 'Up next'
}

const timelineItems = computed(() => milestones.value.map(m => ({
  title: m.title,
  date: receipt(m),
  icon: m.state === 'complete' ? 'i-lucide-check' : m.state === 'in_progress' ? 'i-lucide-loader' : 'i-lucide-circle',
  // Only the active phase needs a custom body (description + progress); the
  // named slot reads from `currentPhase` in scope rather than slot props.
  slot: m.state === 'in_progress' ? ('active' as const) : undefined,
  value: m.id
})))

// Colour the rail up to and including the phase in flight.
const activeIndex = computed(() => {
  const i = milestones.value.findIndex(m => m.state === 'in_progress')
  if (i >= 0) return i
  const lastDone = milestones.value.map(m => m.state).lastIndexOf('complete')
  return lastDone >= 0 ? lastDone : 0
})

// Delivery work happens in ClickUp, so a milestone bar can move while this page
// is open. The server pushes project:updated / milestone:changed into the
// client's own room; individual tasks are never sent, only the derived counts.
const socket = useSocket()
async function loadProject() {
  const { data } = await api<{ data: { project: Project, milestones: Milestone[] } }>(`/portal/projects/${route.params.id}`)
  project.value = data.project
  milestones.value = data.milestones.map(m => ({ ...m, task_total: Number(m.task_total ?? 0), task_done: Number(m.task_done ?? 0) }))
}
const refresh = () => {
  loadProject().catch(() => {})
}

onMounted(async () => {
  try {
    await loadProject()
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
  socket.on('milestone:changed', refresh)
  socket.on('project:updated', refresh)
  // The files rail rides along quietly — a failure just hides the card.
  if (project.value) {
    try {
      const { data } = await api<{ data: FileRow[] }>('/portal/files')
      files.value = data.filter(f => f.project_id === project.value!.id).slice(0, 5)
    } catch { /* non-fatal */ }
  }
})
onBeforeUnmount(() => {
  socket.off('milestone:changed', refresh)
  socket.off('project:updated', refresh)
})

const overallPct = computed(() => project.value && project.value.task_total
  ? Math.round((project.value.task_done / project.value.task_total) * 100)
  : 0)
const currentPhase = computed(() =>
  milestones.value.find(m => m.state === 'in_progress') || milestones.value.find(m => m.state === 'upcoming') || null)
</script>

<template>
  <div class="flex flex-col gap-7">
    <NuxtLink
      to="/projects"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      Projects
    </NuxtLink>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="notFound || !project"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Project not found
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        This project isn't available on your portal.
      </p>
    </div>

    <template v-else>
      <!-- The band — hands off from the projects spotlight -->
      <section class="rounded-band bg-deep p-7 sm:p-9 dark:ring dark:ring-default">
        <p
          v-if="project.code"
          class="eyebrow text-[#8C9096]"
        >
          {{ project.code }}
        </p>
        <h1 class="mt-1.5 font-display text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em] text-paper">
          {{ project.name }}
        </h1>
        <p class="mt-1 text-[13px] text-[#B0B3B0]">
          {{ project.type_name || 'Project' }} · {{ STATUS_LABEL[project.status] || formatStatus(project.status) }}
        </p>
        <div class="mt-6 flex items-center gap-3.5">
          <div class="h-[7px] flex-1 overflow-hidden rounded-full bg-paper/15">
            <div
              class="h-full rounded-full bg-paper transition-[width] duration-500"
              :style="{ width: overallPct + '%' }"
            />
          </div>
          <span class="text-[13px] font-semibold tabular-nums text-paper">{{ overallPct }}%</span>
        </div>
        <div class="mt-6 flex flex-wrap items-end gap-x-11 gap-y-5">
          <div v-if="project.target_launch_date">
            <div class="text-[15px] font-semibold tabular-nums text-paper">
              {{ shortDate(project.target_launch_date) }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Target Launch
            </div>
          </div>
          <div>
            <div class="text-[15px] font-semibold tabular-nums text-paper">
              {{ project.task_done }} of {{ project.task_total }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Tasks Done
            </div>
          </div>
          <div v-if="currentPhase">
            <div class="text-[15px] font-semibold text-paper">
              {{ currentPhase.title }}
            </div>
            <div class="mb-1.5 mt-2 h-0.5 w-6 bg-citrine" />
            <div class="text-[11.5px] font-medium text-[#B0B3B0]">
              Current Phase
            </div>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
        <!-- milestones — open rail timeline -->
        <div>
          <h2 class="mb-4 font-display text-[1.15rem] font-semibold text-highlighted">
            Milestones
          </h2>

          <div
            v-if="!milestones.length"
            class="rounded-card bg-default px-6 py-12 text-center text-sm text-muted ring ring-default"
          >
            Milestones for this project will appear here as we plan the work.
          </div>

          <UTimeline
            v-else
            :items="timelineItems"
            :default-value="activeIndex"
            value-key="value"
            color="primary"
            size="sm"
          >
            <template #active-description>
              <p
                v-if="currentPhase?.description"
                class="max-w-[640px] text-[13.5px] leading-relaxed text-muted"
              >
                {{ currentPhase.description }}
              </p>
              <div
                v-if="currentPhase"
                class="mt-2.5 flex max-w-[420px] items-center gap-2.5"
              >
                <UProgress
                  :model-value="currentPhase.task_done"
                  :max="Math.max(currentPhase.task_total, 1)"
                  size="xs"
                  class="flex-1"
                />
                <span class="whitespace-nowrap text-[12px] font-semibold tabular-nums text-muted">
                  {{ currentPhase.task_done }} of {{ currentPhase.task_total }}
                </span>
              </div>
            </template>
          </UTimeline>
        </div>

        <!-- project files rail -->
        <aside
          v-if="files.length"
          class="rounded-card bg-default p-5 pb-2 ring ring-default"
        >
          <div class="flex items-center justify-between pb-2">
            <p class="eyebrow">
              Project Files
            </p>
            <NuxtLink
              to="/files"
              class="text-[12px] font-medium text-primary hover:underline"
            >
              All files
            </NuxtLink>
          </div>
          <NuxtLink
            v-for="f in files"
            :key="f.id"
            to="/files"
            class="flex items-center gap-3 border-t border-default py-2.5"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-medium text-highlighted">
                {{ f.name }}
              </div>
              <div class="text-[11.5px] text-muted">
                {{ formatBytes(f.size_bytes) }}
              </div>
            </div>
            <span class="text-[11.5px] tabular-nums text-muted">{{ timeAgo(f.created_at) }}</span>
          </NuxtLink>
        </aside>
      </div>
    </template>
  </div>
</template>
