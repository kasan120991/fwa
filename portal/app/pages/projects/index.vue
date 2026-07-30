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
const projects = ref<Project[]>([])
const pending = ref(true)

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

onMounted(async () => {
  try {
    const { data } = await api<{ data: Project[] }>('/portal/projects')
    projects.value = data.map(p => ({ ...p, task_total: Number(p.task_total ?? 0), task_done: Number(p.task_done ?? 0) }))
  } finally {
    pending.value = false
  }
})
function pct(p: Project) {
  return p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Your work
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

    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <NuxtLink
        v-for="p in projects"
        :key="p.id"
        :to="`/projects/${p.id}`"
        class="flex flex-col gap-3 rounded-card bg-default p-5 ring ring-default transition-shadow hover:ring-primary/40"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-display text-[1.05rem] font-semibold text-highlighted">
              {{ p.name }}
            </h2>
            <p class="mt-0.5 text-[12.5px] text-muted">
              {{ p.type_name || 'Project' }}
            </p>
          </div>
          <span class="whitespace-nowrap rounded-chip bg-mist px-2.5 py-1 text-[11px] font-semibold text-primary">
            {{ STATUS_LABEL[p.status] || formatStatus(p.status) }}
          </span>
        </div>
        <div class="flex items-center gap-2.5">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: pct(p) + '%' }"
            />
          </div>
          <span class="text-[12px] font-semibold text-highlighted tabular-nums">{{ pct(p) }}%</span>
        </div>
        <p
          v-if="p.target_launch_date"
          class="text-[12.5px] text-muted"
        >
          Target launch {{ shortDate(p.target_launch_date) }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
