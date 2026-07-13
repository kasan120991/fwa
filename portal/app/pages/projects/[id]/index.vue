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
  task_total: number
  task_done: number
}

const project = ref<Project | null>(null)
const milestones = ref<Milestone[]>([])
const pending = ref(true)
const notFound = ref(false)

useHead({ title: () => `${project.value?.name || 'Project'} · Francis Web Agency` })

const STATE_META: Record<MilestoneState, { label: string, dot: string, chip: string }> = {
  upcoming: { label: 'Upcoming', dot: 'bg-muted-foreground/40', chip: 'bg-muted text-muted' },
  in_progress: { label: 'In Progress', dot: 'bg-teal-500', chip: 'bg-mist text-primary' },
  complete: { label: 'Complete', dot: 'bg-success', chip: 'bg-success/10 text-success' }
}

onMounted(async () => {
  try {
    const { data } = await api<{ data: { project: Project, milestones: Milestone[] } }>(`/portal/projects/${route.params.id}`)
    project.value = data.project
    milestones.value = data.milestones.map(m => ({ ...m, task_total: Number(m.task_total ?? 0), task_done: Number(m.task_done ?? 0) }))
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
})
function pct(m: Milestone) {
  return m.task_total ? Math.round((m.task_done / m.task_total) * 100) : 0
}
const overallPct = computed(() => project.value && project.value.task_total
  ? Math.round((project.value.task_done / project.value.task_total) * 100)
  : 0)
</script>

<template>
  <div class="flex flex-col gap-6">
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
      <h3 class="font-display text-lg font-medium text-highlighted">
        Project not found
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        This project isn't available on your portal.
      </p>
    </div>

    <template v-else>
      <!-- header -->
      <div class="rounded-card bg-default p-6 ring ring-default">
        <p
          v-if="project.code"
          class="eyebrow text-primary"
        >
          {{ project.code }}
        </p>
        <h1 class="mt-1 font-display text-[1.9rem] font-medium leading-tight tracking-tight text-highlighted">
          {{ project.name }}
        </h1>
        <p class="mt-1 text-[0.9375rem] text-muted">
          {{ project.type_name || 'Project' }}
        </p>

        <div class="mt-5 flex items-center gap-3 border-t border-default pt-4">
          <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Progress</span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-teal-500 transition-[width] duration-500"
              :style="{ width: overallPct + '%' }"
            />
          </div>
          <span class="text-[13px] font-semibold tabular-nums text-highlighted">{{ overallPct }}%</span>
        </div>
        <p
          v-if="project.target_launch_date"
          class="mt-3 text-[13px] text-muted"
        >
          Target launch {{ shortDate(project.target_launch_date) }}
        </p>
      </div>

      <!-- milestone timeline -->
      <div>
        <h2 class="mb-3 font-display text-[1.15rem] font-medium text-highlighted">
          Milestones
        </h2>

        <div
          v-if="!milestones.length"
          class="rounded-card bg-default px-6 py-12 text-center text-sm text-muted ring ring-default"
        >
          Milestones for this project will appear here as we plan the work.
        </div>

        <ol
          v-else
          class="relative flex flex-col"
        >
          <li
            v-for="(m, i) in milestones"
            :key="m.id"
            class="relative flex gap-4 pb-6 last:pb-0"
          >
            <!-- rail + dot -->
            <div class="relative flex flex-none flex-col items-center">
              <span
                class="mt-1 size-3 flex-none rounded-full ring-4 ring-muted"
                :class="STATE_META[m.state].dot"
              />
              <span
                v-if="i < milestones.length - 1"
                class="mt-1 w-px flex-1 bg-default"
              />
            </div>
            <!-- card -->
            <div class="mb-0 flex-1 rounded-card bg-default p-4 ring ring-default">
              <div class="flex flex-wrap items-center gap-2.5">
                <span
                  class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  :class="STATE_META[m.state].chip"
                >
                  {{ STATE_META[m.state].label }}
                </span>
                <span class="font-display text-[15px] font-medium text-highlighted">{{ m.title }}</span>
                <span
                  v-if="m.target_date"
                  class="ms-auto inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-muted"
                >
                  <UIcon
                    name="i-lucide-calendar"
                    class="size-3.5"
                  />
                  {{ shortDate(m.target_date) }}
                </span>
              </div>
              <p
                v-if="m.description"
                class="mt-2 text-[13.5px] leading-relaxed text-muted"
              >
                {{ m.description }}
              </p>
              <div class="mt-3 flex items-center gap-2.5">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-teal-500"
                    :style="{ width: pct(m) + '%' }"
                  />
                </div>
                <span class="text-[12px] font-semibold tabular-nums text-highlighted">{{ pct(m) }}%</span>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </template>
  </div>
</template>
