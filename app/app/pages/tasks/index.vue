<script setup lang="ts">
useHead({ title: 'Tasks · Francis Web Agency' })

// Tasks — every task across the agency, plus standalone (no-project) ones.
// Backed by /tasks; live via task:* socket events.
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
interface Task {
  id: number
  project_id: number | null
  project_name: string | null
  project_code: string | null
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  completed_at: string | null
}
interface ProjectOpt { id: number, name: string, code: string | null }

const api = useApi()
const socket = useSocket()
const toast = useToast()

const TASK_META: Record<TaskStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  todo: { label: 'To Do', status: 'neutral' },
  in_progress: { label: 'In Progress', status: 'info' },
  blocked: { label: 'Blocked', status: 'warning' },
  done: { label: 'Done', status: 'success' }
}
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']
const PRIORITY_META: Record<'low' | 'medium' | 'high', { label: string, class: string }> = {
  high: { label: 'High', class: 'bg-warning/10 text-warning' },
  medium: { label: 'Medium', class: 'bg-muted text-muted' },
  low: { label: 'Low', class: 'bg-muted text-muted' }
}

const tasks = ref<Task[]>([])
const projects = ref<ProjectOpt[]>([])
const pending = ref(true)

async function load() {
  try {
    const { data } = await api<{ data: Task[] }>('/tasks')
    tasks.value = data
  } catch {
    toast.add({ title: 'Could not load tasks', color: 'error' })
  } finally {
    pending.value = false
  }
}
async function loadProjects() {
  const { data } = await api<{ data: ProjectOpt[] }>('/projects')
  projects.value = data
}

onMounted(() => {
  load()
  loadProjects()
  socket.on('task:created', load)
  socket.on('task:updated', load)
  socket.on('task:deleted', load)
})
onBeforeUnmount(() => {
  socket.off('task:created', load)
  socket.off('task:updated', load)
  socket.off('task:deleted', load)
})

// ---- filters ----
const statusTab = ref<TaskStatus | 'all' | 'open'>('open')
const projectFilter = ref<number | 'all' | 'none'>('all')

const counts = computed(() => {
  const c: Record<string, number> = { all: tasks.value.length, open: tasks.value.filter(t => t.status !== 'done').length }
  for (const s of STATUS_ORDER) c[s] = tasks.value.filter(t => t.status === s).length
  return c
})
const statusTabs = computed(() => [
  { key: 'open' as const, label: 'Open', count: counts.value.open },
  { key: 'all' as const, label: 'All', count: counts.value.all },
  ...STATUS_ORDER.map(s => ({ key: s, label: TASK_META[s].label, count: counts.value[s] }))
])
const projectItems = computed(() => [
  { label: 'All Projects', icon: projectFilter.value === 'all' ? 'i-lucide-check' : undefined, onSelect: () => { projectFilter.value = 'all' } },
  { label: 'No Project (Standalone)', icon: projectFilter.value === 'none' ? 'i-lucide-check' : undefined, onSelect: () => { projectFilter.value = 'none' } },
  ...projects.value.map(p => ({
    label: p.name,
    icon: projectFilter.value === p.id ? 'i-lucide-check' : undefined,
    onSelect: () => { projectFilter.value = p.id }
  }))
])

const filtered = computed(() => tasks.value.filter((t) => {
  if (statusTab.value === 'open' && t.status === 'done') return false
  if (statusTab.value !== 'all' && statusTab.value !== 'open' && t.status !== statusTab.value) return false
  if (projectFilter.value === 'none' && t.project_id != null) return false
  if (typeof projectFilter.value === 'number' && t.project_id !== projectFilter.value) return false
  return true
}))

// ---- inline create ----
const newTitle = ref('')
const newProject = ref<number | null>(null)
const adding = ref(false)
const projectSelectItems = computed(() => [{ label: 'No Project', value: null as number | null }, ...projects.value.map(p => ({ label: p.name, value: p.id }))])
async function addTask() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  try {
    await api('/tasks', { method: 'POST', body: { title, project_id: newProject.value } })
    newTitle.value = ''
    await load()
  } catch {
    toast.add({ title: 'Could not add task', color: 'error' })
  } finally {
    adding.value = false
  }
}

async function toggleTask(t: Task) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'todo' : 'done' } })
    await load()
  } catch {
    toast.add({ title: 'Could not update task', color: 'error' })
  }
}
async function setStatus(t: Task, status: TaskStatus) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status } })
    await load()
  } catch { toast.add({ title: 'Could not update task', color: 'error' }) }
}
async function removeTask(t: Task) {
  try {
    await api(`/tasks/${t.id}`, { method: 'DELETE' })
    await load()
  } catch { toast.add({ title: 'Could not delete task', color: 'error' }) }
}
function rowMenu(t: Task) {
  return [STATUS_ORDER.map(s => ({ label: `Move to ${TASK_META[s].label}`, icon: t.status === s ? 'i-lucide-check' : undefined, onSelect: () => setStatus(t, s) })),
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeTask(t) }]]
}
function taskOverdue(t: Task) {
  const d = daysFromNow(t.due_date)
  return d != null && d < 0 && t.status !== 'done'
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Tasks
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-primary tabular-nums">{{ counts.open }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Everything on your plate — across projects and standalone.
        </p>
      </div>
    </div>

    <!-- add row -->
    <div class="flex flex-wrap items-center gap-2.5 rounded-card bg-default p-3 ring ring-default">
      <UInput
        v-model="newTitle"
        placeholder="Add a task and press Enter…"
        icon="i-lucide-plus"
        class="min-w-[220px] flex-1"
        :ui="{ base: 'rounded-full' }"
        @keydown.enter="addTask"
      />
      <USelect
        v-model="newProject"
        :items="projectSelectItems"
        placeholder="No project"
        class="w-48"
      />
      <UButton
        color="primary"
        class="rounded-full"
        :loading="adding"
        :disabled="!newTitle.trim()"
        @click="addTask"
      >
        Add Task
      </UButton>
    </div>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
          :class="statusTab === t.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
          @click="statusTab = t.key"
        >
          {{ t.label }}
          <span
            class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="statusTab === t.key ? 'bg-default text-primary' : 'bg-muted text-muted'"
          >{{ t.count }}</span>
        </button>
      </div>
      <UDropdownMenu
        :items="projectItems"
        :ui="{ content: 'w-56' }"
      >
        <UButton
          icon="i-lucide-folder"
          color="neutral"
          variant="outline"
          class="rounded-full"
        >
          {{ projectFilter === 'all' ? 'All projects' : projectFilter === 'none' ? 'Standalone' : (projects.find(p => p.id === projectFilter)?.name || 'Project') }}
        </UButton>
      </UDropdownMenu>
    </div>

    <!-- list -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div
        v-if="pending"
        class="px-6 py-16 text-center text-sm text-muted"
      >
        Loading tasks…
      </div>
      <template v-else-if="filtered.length">
        <div
          v-for="t in filtered"
          :key="t.id"
          class="flex items-center gap-3 border-b border-default px-4 py-3 last:border-b-0 hover:bg-muted"
        >
          <button
            type="button"
            class="flex size-[18px] flex-none items-center justify-center rounded-full border transition-colors"
            :class="t.status === 'done' ? 'border-teal-500 bg-teal-500 text-white' : 'border-accented hover:border-primary'"
            :aria-label="t.status === 'done' ? 'Mark not done' : 'Mark done'"
            @click="toggleTask(t)"
          >
            <UIcon
              v-if="t.status === 'done'"
              name="i-lucide-check"
              class="size-3"
            />
          </button>
          <span
            class="min-w-0 flex-1 text-[13.5px]"
            :class="t.status === 'done' ? 'text-muted line-through' : 'text-highlighted'"
          >{{ t.title }}</span>
          <NuxtLink
            v-if="t.project_id"
            :to="`/projects/${t.project_id}`"
            class="hidden max-w-[180px] truncate text-[12.5px] font-medium text-primary hover:opacity-80 sm:inline"
            @click.stop
          >{{ t.project_name }}</NuxtLink>
          <span
            v-else
            class="hidden text-[12.5px] text-muted sm:inline"
          >Standalone</span>
          <StatusChip :status="TASK_META[t.status].status">
            {{ TASK_META[t.status].label }}
          </StatusChip>
          <span
            v-if="t.priority !== 'medium'"
            class="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            :class="PRIORITY_META[t.priority].class"
          >{{ PRIORITY_META[t.priority].label }}</span>
          <span
            v-if="t.due_date"
            class="hidden whitespace-nowrap text-[12.5px] tabular-nums sm:inline"
            :class="taskOverdue(t) ? 'font-semibold text-warning' : 'text-muted'"
          >{{ shortDate(t.due_date) }}</span>
          <UDropdownMenu :items="rowMenu(t)">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="`Actions for ${t.title}`"
            />
          </UDropdownMenu>
        </div>
      </template>
      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-check-check"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          Nothing Here
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          No tasks match this filter. Add one above or switch filters.
        </p>
      </div>
    </div>
  </div>
</template>
