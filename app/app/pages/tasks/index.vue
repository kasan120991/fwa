<script setup lang="ts">
useHead({ title: 'Tasks · Francis Web Agency' })

// Tasks — the cross-project attention list.
//
// Delivery work lives in ClickUp now, so this page stopped being an inventory
// you manage and became a triage view: it answers "what needs me?" rather than
// "list every task". Rows group into lanes by what you'd actually do about
// them, and every synced row is one click from ClickUp.
//
// Backed by /tasks; live via task:* socket events.
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
interface Task {
  id: number
  project_id: number | null
  milestone_id: number | null
  milestone_title: string | null
  project_name: string | null
  project_code: string | null
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  completed_at: string | null
  checklist_total: number
  checklist_done: number
  clickup_task_id: string | null
  clickup_sync_error: string | null
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

const tasks = ref<Task[]>([])
const projects = ref<ProjectOpt[]>([])
const pending = ref(true)

async function load() {
  try {
    const { data } = await api<{ data: Task[] }>('/tasks', { query: { limit: 500 } })
    tasks.value = data.map(t => ({
      ...t,
      checklist_total: Number(t.checklist_total ?? 0),
      checklist_done: Number(t.checklist_done ?? 0)
    }))
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

// ---- scope ----
const projectFilter = ref<number | 'all' | 'none'>('all')
const showDone = ref(false)

const projectItems = computed(() => [
  { label: 'All Projects', value: 'all' as const },
  { label: 'Standalone (No Project)', value: 'none' as const },
  ...projects.value.map(p => ({ label: p.code ? `${p.code} · ${p.name}` : p.name, value: p.id }))
])

const scoped = computed(() => tasks.value.filter((t) => {
  if (projectFilter.value === 'all') return true
  if (projectFilter.value === 'none') return t.project_id == null
  return t.project_id === projectFilter.value
}))

// ---- lanes ----
// A task falls into the FIRST lane it matches, so the order is the priority
// order. "Not On A Milestone" is data hygiene rather than urgency, but it earns
// its place: those tasks count toward nothing the client sees, and there is
// otherwise no way to notice them.
type LaneKey = 'overdue' | 'today' | 'blocked' | 'unmilestoned' | 'active' | 'next'
interface Lane {
  key: LaneKey
  label: string
  hint: string
  accent: string // left rail colour
}
const LANES: Lane[] = [
  { key: 'overdue', label: 'Overdue', hint: 'Past their due date', accent: 'bg-error' },
  { key: 'today', label: 'Due Today', hint: '', accent: 'bg-warning' },
  { key: 'blocked', label: 'Blocked', hint: 'Waiting on something', accent: 'bg-inverted' },
  { key: 'unmilestoned', label: 'Not On A Milestone', hint: 'Invisible to the client’s progress', accent: 'bg-info' },
  { key: 'active', label: 'In Flight', hint: '', accent: 'bg-muted' },
  { key: 'next', label: 'Up Next', hint: '', accent: 'bg-muted' }
]

function laneFor(t: Task): LaneKey | null {
  if (t.status === 'done') return null
  const days = daysFromNow(t.due_date)
  if (days != null && days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (t.status === 'blocked') return 'blocked'
  if (t.project_id != null && t.milestone_id == null) return 'unmilestoned'
  if (t.status === 'in_progress') return 'active'
  return 'next'
}

const byLane = computed(() => {
  const out: Record<LaneKey, Task[]> = {
    overdue: [], today: [], blocked: [], unmilestoned: [], active: [], next: []
  }
  for (const t of scoped.value) {
    const lane = laneFor(t)
    if (lane) out[lane].push(t)
  }
  // Soonest first inside a lane; undated last.
  for (const k of Object.keys(out) as LaneKey[]) {
    out[k].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  }
  return out
})

const doneTasks = computed(() => scoped.value
  .filter(t => t.status === 'done')
  .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')))

const activeLanes = computed(() => LANES.filter(l => byLane.value[l.key].length > 0))
const needsAttention = computed(() =>
  byLane.value.overdue.length + byLane.value.today.length + byLane.value.blocked.length)

// ---- table ----
const columns = [
  { accessorKey: 'title', header: 'Task' },
  { accessorKey: 'milestone_title', header: 'Milestone' },
  { accessorKey: 'due_date', header: 'Due' },
  { id: 'actions', header: '' }
]

function clickupUrl(t: Task) {
  return t.clickup_task_id ? `https://app.clickup.com/t/${t.clickup_task_id}` : null
}
function dueLabel(t: Task) {
  const d = daysFromNow(t.due_date)
  if (d == null) return null
  if (d < 0) return `${Math.abs(d)}d late`
  if (d === 0) return 'Today'
  return shortDate(t.due_date)
}

// ---- mutations ----
// Status is only settable on tasks with no checklist — a checklist makes it
// derived (services/delivery.service.js), so setting it here would be undone.
async function setStatus(t: Task, status: TaskStatus) {
  const prev = t.status
  t.status = status
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status } })
  } catch (err: unknown) {
    t.status = prev
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not update the task', description: e?.data?.error?.message, color: 'error' })
  }
}
async function removeTask(t: Task) {
  try {
    await api(`/tasks/${t.id}`, { method: 'DELETE' })
    tasks.value = tasks.value.filter(x => x.id !== t.id)
  } catch {
    toast.add({ title: 'Could not delete the task', color: 'error' })
  }
}
function rowMenu(t: Task) {
  const status = t.checklist_total > 0
    ? [{ label: 'Status follows the checklist', icon: 'i-lucide-list-checks', disabled: true, onSelect: () => {} }]
    : (['todo', 'in_progress', 'blocked', 'done'] as TaskStatus[]).map(s => ({
        label: `Move to ${TASK_META[s].label}`,
        icon: t.status === s ? 'i-lucide-check' : undefined,
        onSelect: () => setStatus(t, s)
      }))
  const links = []
  if (t.project_id) links.push({ label: 'Open Project', icon: 'i-lucide-folder', to: `/projects/${t.project_id}` })
  const url = clickupUrl(t)
  if (url) links.push({ label: 'Open in ClickUp', icon: 'i-lucide-external-link', to: url, target: '_blank' })
  return [status, ...(links.length ? [links] : []), [
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeTask(t) }
  ]]
}

// ---- standalone create ----
// The one creation path that still belongs in Ops: a task with no project is
// never pushed to ClickUp, so it can't originate there.
const newTitle = ref('')
const creating = ref(false)
async function addStandalone() {
  const title = newTitle.value.trim()
  if (!title) return
  creating.value = true
  try {
    await api('/tasks', { method: 'POST', body: { title, project_id: null } })
    newTitle.value = ''
    await load()
  } catch {
    toast.add({ title: 'Could not create the task', color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight text-highlighted">
          Tasks
        </h1>
        <p class="mt-1 text-sm text-muted">
          <template v-if="pending">
            Loading…
          </template>
          <template v-else-if="needsAttention">
            {{ needsAttention }} {{ needsAttention === 1 ? 'task needs' : 'tasks need' }} attention
          </template>
          <template v-else>
            Nothing overdue, due today, or blocked.
          </template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="projectFilter"
          :items="projectItems"
          value-key="value"
          size="sm"
          class="w-56"
        />
        <UButton
          :icon="showDone ? 'i-lucide-eye-off' : 'i-lucide-check-check'"
          color="neutral"
          variant="outline"
          size="sm"
          @click="showDone = !showDone"
        >
          {{ showDone ? 'Hide Completed' : 'Completed' }}
        </UButton>
      </div>
    </div>

    <!-- standalone create -->
    <form
      class="flex items-center gap-2 rounded-card bg-default p-2.5 ring ring-default"
      @submit.prevent="addStandalone"
    >
      <UInput
        v-model="newTitle"
        placeholder="Add a standalone task — something not tied to a project…"
        icon="i-lucide-plus"
        size="sm"
        variant="none"
        class="flex-1"
      />
      <UButton
        type="submit"
        size="sm"
        color="neutral"
        variant="outline"
        :loading="creating"
        :disabled="!newTitle.trim()"
      >
        Add
      </UButton>
    </form>

    <!-- empty -->
    <div
      v-if="!pending && !activeLanes.length && !(showDone && doneTasks.length)"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <UIcon
        name="i-lucide-check-check"
        class="size-7 text-muted"
      />
      <p class="mt-3 font-display text-[15px] font-semibold text-highlighted">
        Nothing waiting on you
      </p>
      <p class="mt-1 text-sm text-muted">
        Open tasks appear here as they're created in ClickUp.
      </p>
    </div>

    <!-- lanes -->
    <section
      v-for="lane in activeLanes"
      :key="lane.key"
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <div class="flex items-center gap-2.5 border-b border-default px-4 py-2.5">
        <span
          class="h-3.5 w-[3px] rounded-full"
          :class="lane.accent"
        />
        <span class="text-[11px] font-semibold uppercase tracking-wider text-highlighted">{{ lane.label }}</span>
        <span class="text-[12px] text-muted tabular-nums">{{ byLane[lane.key].length }}</span>
        <span
          v-if="lane.hint"
          class="hidden text-[12px] text-muted sm:inline"
        >· {{ lane.hint }}</span>
      </div>

      <UTable
        :data="byLane[lane.key]"
        :columns="columns"
        :ui="{ thead: 'hidden', td: 'py-2.5' }"
      >
        <template #title-cell="{ row }">
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-[13.5px] font-medium text-highlighted">{{ row.original.title }}</span>
              <UTooltip
                v-if="row.original.clickup_sync_error"
                :text="row.original.clickup_sync_error"
              >
                <UIcon
                  name="i-lucide-triangle-alert"
                  class="size-3.5 shrink-0 text-error"
                />
              </UTooltip>
            </div>
            <div class="flex items-center gap-2 text-[12px] text-muted">
              <NuxtLink
                v-if="row.original.project_id"
                :to="`/projects/${row.original.project_id}`"
                class="truncate hover:text-highlighted"
              >
                {{ row.original.project_code || row.original.project_name }}
              </NuxtLink>
              <span v-else>Standalone</span>
              <template v-if="row.original.checklist_total > 0">
                <UProgress
                  :model-value="row.original.checklist_done"
                  :max="row.original.checklist_total"
                  size="2xs"
                  class="w-14"
                />
                <span class="tabular-nums">{{ row.original.checklist_done }}/{{ row.original.checklist_total }}</span>
              </template>
            </div>
          </div>
        </template>

        <template #milestone_title-cell="{ row }">
          <UBadge
            v-if="row.original.milestone_title"
            color="neutral"
            variant="outline"
            size="sm"
          >
            {{ row.original.milestone_title }}
          </UBadge>
          <UBadge
            v-else-if="row.original.project_id"
            color="info"
            variant="soft"
            size="sm"
          >
            No Milestone
          </UBadge>
        </template>

        <template #due_date-cell="{ row }">
          <span
            v-if="dueLabel(row.original)"
            class="whitespace-nowrap text-[12px] tabular-nums"
            :class="lane.key === 'overdue' ? 'font-semibold text-error' : lane.key === 'today' ? 'font-semibold text-warning' : 'text-muted'"
          >{{ dueLabel(row.original) }}</span>
          <StatusChip
            v-else-if="lane.key === 'blocked'"
            :status="TASK_META[row.original.status].status"
          >
            {{ TASK_META[row.original.status].label }}
          </StatusChip>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-0.5">
            <UTooltip
              v-if="clickupUrl(row.original)"
              text="Open in ClickUp"
            >
              <UButton
                :to="clickupUrl(row.original)!"
                target="_blank"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Open in ClickUp"
              />
            </UTooltip>
            <UDropdownMenu :items="rowMenu(row.original)">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="`Actions for ${row.original.title}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>
    </section>

    <!-- completed -->
    <section
      v-if="showDone && doneTasks.length"
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <div class="flex items-center gap-2.5 border-b border-default px-4 py-2.5">
        <span class="h-3.5 w-[3px] rounded-full bg-success" />
        <span class="text-[11px] font-semibold uppercase tracking-wider text-highlighted">Completed</span>
        <span class="text-[12px] text-muted tabular-nums">{{ doneTasks.length }}</span>
      </div>
      <UTable
        :data="doneTasks"
        :columns="columns"
        :ui="{ thead: 'hidden', td: 'py-2.5' }"
      >
        <template #title-cell="{ row }">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-[13.5px] text-muted line-through">{{ row.original.title }}</span>
          </div>
        </template>
        <template #milestone_title-cell="{ row }">
          <UBadge
            v-if="row.original.milestone_title"
            color="neutral"
            variant="outline"
            size="sm"
          >
            {{ row.original.milestone_title }}
          </UBadge>
        </template>
        <template #due_date-cell="{ row }">
          <span
            v-if="row.original.completed_at"
            class="whitespace-nowrap text-[12px] text-muted tabular-nums"
          >{{ shortDate(row.original.completed_at) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UTooltip
              v-if="clickupUrl(row.original)"
              text="Open in ClickUp"
            >
              <UButton
                :to="clickupUrl(row.original)!"
                target="_blank"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Open in ClickUp"
              />
            </UTooltip>
          </div>
        </template>
      </UTable>
    </section>
  </div>
</template>
