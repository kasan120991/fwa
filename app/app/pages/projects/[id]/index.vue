<script setup lang="ts">
// Project detail — a task-delivery command center. A full-width hero with a
// milestone stepper + progress, a main column optimized for tasks, and a
// persistent rail for money/timeline/contract. The project is the hub: its
// Statement of Work (Scope tab) feeds contract generation, its tasks roll up
// here. Backed by /projects/:id. All API calls live here; the extracted
// components (ProjectStepper, TaskCard, ProjectMoneyCard, ProjectTimelineCard,
// ProjectActivity) take plain props and emit actions back.
const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()

type Status = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

interface ApiProject {
  id: number
  client_id: number
  project_type_id: number
  code: string | null
  name: string
  status: Status
  goals: string | null
  pages_included: string | null
  key_features: string | null
  design_deliverables: string | null
  content_provided_by: string | null
  revision_rounds: number
  third_party_costs: string | null
  project_fee: number | null
  deposit_pct: number
  hourly_rate: number | null
  content_deadline: string | null
  start_date: string | null
  target_launch_date: string | null
  special_terms: string | null
  inactivity_days: number
  feedback_days: number
  late_fee_days: number
  bugfix_days: number
  task_total: number
  task_done: number
  client_company: string | null
  client_name: string | null
  type_name: string | null
  created_at: string | null
}
interface Task {
  id: number
  project_id: number | null
  title: string
  description: string | null
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  position: number
  completed_at: string | null
  checklist_total: number
  checklist_done: number
}
interface Doc { id: number, title: string, status: string, total: number | null, created_at: string, sent_at: string | null, signed_at: string | null }
type InvStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
interface ProjectInvoice { id: number, kind: 'deposit' | 'balance' | 'custom', status: InvStatus, number: string | null, amount_due: number, amount_paid: number, is_overdue: boolean, created_at: string | null, finalized_at: string | null, paid_at: string | null }

const STATUS_META: Record<Status, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  planning: { label: 'Planning', status: 'neutral' },
  awaiting_signature: { label: 'Awaiting Signature', status: 'info' },
  awaiting_deposit: { label: 'Awaiting Deposit', status: 'warning' },
  in_progress: { label: 'In Progress', status: 'info' },
  in_review: { label: 'In Review', status: 'info' },
  awaiting_final: { label: 'Awaiting Final Payment', status: 'warning' },
  on_hold: { label: 'On Hold', status: 'warning' },
  completed: { label: 'Completed', status: 'success' }
}
const TASK_META: Record<TaskStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' }> = {
  todo: { label: 'To Do', status: 'neutral' },
  in_progress: { label: 'In Progress', status: 'info' },
  blocked: { label: 'Blocked', status: 'warning' },
  done: { label: 'Done', status: 'success' }
}
const TASK_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']
const DOC_STATUS: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral', sent: 'info', viewed: 'info', signed: 'success', accepted: 'success',
  declined: 'error', expired: 'warning', voided: 'error'
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const project = ref<ApiProject | null>(null)
const tasks = ref<Task[]>([])
const contracts = ref<Doc[]>([])
const proposals = ref<Doc[]>([])
const invoices = ref<ProjectInvoice[]>([])
const pending = ref(true)
const notFound = ref(false)

// Billing indicators: the deposit + final (balance) invoice for this project, if raised.
const depositInvoice = computed(() => invoices.value.find(i => i.kind === 'deposit'))
const finalInvoice = computed(() => invoices.value.find(i => i.kind === 'balance'))
// A project owns a single contract; expose it as a narrowable ref for the embed.
const contract = computed(() => contracts.value[0] ?? null)

const clientLabel = computed(() => project.value?.client_company || project.value?.client_name || 'Client')
const pct = computed(() => project.value && project.value.task_total ? Math.round((project.value.task_done / project.value.task_total) * 100) : 0)

useHead({ title: () => `${project.value?.name || 'Project'} · Francis Web Agency` })

async function loadProject() {
  try {
    const { data } = await api<{ data: ApiProject }>(`/projects/${route.params.id}`)
    project.value = data
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
}
async function loadTasks() {
  const { data } = await api<{ data: Task[] }>(`/projects/${route.params.id}/tasks`)
  tasks.value = data.map(t => ({ ...t, checklist_total: Number(t.checklist_total ?? 0), checklist_done: Number(t.checklist_done ?? 0) }))
}
async function loadDocs() {
  const [c, p] = await Promise.all([
    api<{ data: Doc[] }>('/contracts', { query: { project_id: route.params.id } }),
    api<{ data: Doc[] }>('/proposals', { query: { project_id: route.params.id } })
  ])
  contracts.value = c.data
  proposals.value = p.data
}
async function loadInvoices() {
  try {
    const { data } = await api<{ data: ProjectInvoice[] }>('/invoices', { query: { project_id: route.params.id } })
    invoices.value = data
  } catch {
    invoices.value = []
  }
}

// Live updates: reload the task list on any task event, and refresh the header
// rollup on project changes. Cheap given the single-admin scope.
function onTaskEvent() {
  loadTasks()
}
function onProjectEvent() {
  loadProject()
}
// Contract/invoice changes drive the lifecycle (auto-transitions + auto deposit
// invoice), so refresh the contract embed + money panel when they fire.
function onContractEvent() {
  loadDocs()
}
function onInvoiceEvent() {
  loadInvoices()
}

onMounted(async () => {
  await loadProject()
  if (!notFound.value) {
    await Promise.all([loadTasks(), loadDocs(), loadInvoices()])
  }
  socket.on('task:created', onTaskEvent)
  socket.on('task:updated', onTaskEvent)
  socket.on('task:deleted', onTaskEvent)
  socket.on('project:updated', onProjectEvent)
  socket.on('contract:changed', onContractEvent)
  socket.on('invoice:changed', onInvoiceEvent)
})
onBeforeUnmount(() => {
  socket.off('task:created', onTaskEvent)
  socket.off('task:updated', onTaskEvent)
  socket.off('task:deleted', onTaskEvent)
  socket.off('project:updated', onProjectEvent)
  socket.off('contract:changed', onContractEvent)
  socket.off('invoice:changed', onInvoiceEvent)
})

// ---- status change (stepper + Actions menu) ----
const STATUS_ORDER: Status[] = ['planning', 'awaiting_signature', 'awaiting_deposit', 'in_progress', 'in_review', 'awaiting_final', 'on_hold', 'completed']
const statusItems = computed(() => [STATUS_ORDER.map(s => ({
  label: STATUS_META[s].label,
  icon: project.value?.status === s ? 'i-lucide-check' : undefined,
  onSelect: () => setStatus(s)
}))])
async function setStatus(s: Status) {
  if (!project.value || project.value.status === s) return
  const prev = project.value.status
  project.value.status = s // optimistic
  try {
    await api(`/projects/${route.params.id}`, { method: 'PATCH', body: { status: s } })
  } catch {
    project.value.status = prev
    toast.add({ title: 'Could not update status', color: 'error' })
  }
}

// ---- tabs ----
const activeTab = ref<'tasks' | 'scope' | 'contract' | 'activity'>('tasks')
const tabs = computed(() => [
  { key: 'tasks' as const, label: 'Tasks', badge: tasks.value.length || null },
  { key: 'scope' as const, label: 'Scope', badge: null },
  { key: 'contract' as const, label: 'Contract', badge: contracts.value.length || null },
  { key: 'activity' as const, label: 'Activity', badge: null }
])

const groupedTasks = computed(() => TASK_ORDER.map(s => ({
  status: s,
  meta: TASK_META[s],
  items: tasks.value.filter(t => t.status === s)
})).filter(g => g.items.length))

// Overdue or due-within-3-days, not done — the "what's next" focus strip.
const focusTasks = computed(() => tasks.value
  .filter(t => t.status !== 'done')
  .filter((t) => {
    const d = daysFromNow(t.due_date)
    return d != null && d <= 3
  })
  .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')))

// ---- task inline actions ----
const newTaskTitle = ref('')
const addingTask = ref(false)
async function addTask() {
  const title = newTaskTitle.value.trim()
  if (!title || addingTask.value) return
  addingTask.value = true
  try {
    await api('/tasks', { method: 'POST', body: { title, project_id: Number(route.params.id) } })
    newTaskTitle.value = ''
    await loadTasks()
  } catch {
    toast.add({ title: 'Could not add task', color: 'error' })
  } finally {
    addingTask.value = false
  }
}
async function toggleTask(t: Task) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'todo' : 'done' } })
    await loadTasks()
  } catch {
    toast.add({ title: 'Could not update task', color: 'error' })
  }
}
async function setTaskStatus(t: Task, status: TaskStatus) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status } })
    await loadTasks()
  } catch {
    toast.add({ title: 'Could not update task', color: 'error' })
  }
}
async function deleteTask(t: Task) {
  try {
    await api(`/tasks/${t.id}`, { method: 'DELETE' })
    await loadTasks()
  } catch {
    toast.add({ title: 'Could not delete task', color: 'error' })
  }
}
function taskMenu(t: Task) {
  return [TASK_ORDER.map(s => ({
    label: `Move to ${TASK_META[s].label}`,
    icon: t.status === s ? 'i-lucide-check' : undefined,
    onSelect: () => setTaskStatus(t, s)
  })), [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteTask(t) }]]
}

// ---- edit ----
const formOpen = ref(false)
function openEdit() {
  formOpen.value = true
}
function onSaved() {
  loadProject()
}

// ---- due date (inline edit; API already supports due_date on PATCH) ----
async function setDue(t: Task, value: string | null) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { due_date: value || null } })
    await loadTasks()
  } catch {
    toast.add({ title: 'Could not update due date', color: 'error' })
  }
}

// ---- checklists ----
interface ChecklistItem { id: number, task_id: number, title: string, done: boolean, position: number }
const expanded = reactive<Record<number, boolean>>({})
const checklist = reactive<Record<number, ChecklistItem[]>>({})

async function loadChecklist(taskId: number) {
  const { data } = await api<{ data: ChecklistItem[] }>(`/tasks/${taskId}/checklist`)
  checklist[taskId] = data
}
async function toggleExpand(t: Task) {
  expanded[t.id] = !expanded[t.id]
  if (expanded[t.id] && !checklist[t.id]) await loadChecklist(t.id)
}
async function toggleItem(taskId: number, item: ChecklistItem) {
  item.done = !item.done // optimistic; task:updated socket re-rolls the bar
  try {
    await api(`/tasks/${taskId}/checklist/${item.id}`, { method: 'PATCH', body: { done: item.done } })
  } catch {
    item.done = !item.done
    toast.add({ title: 'Could not update item', color: 'error' })
  }
}
async function addChecklistItem(taskId: number, title: string) {
  const t = title.trim()
  if (!t) return
  try {
    const { data } = await api<{ data: ChecklistItem }>(`/tasks/${taskId}/checklist`, { method: 'POST', body: { title: t } })
    ;(checklist[taskId] ??= []).push(data)
  } catch {
    toast.add({ title: 'Could not add item', color: 'error' })
  }
}
async function removeChecklistItem(taskId: number, item: ChecklistItem) {
  try {
    await api(`/tasks/${taskId}/checklist/${item.id}`, { method: 'DELETE' })
    checklist[taskId] = (checklist[taskId] ?? []).filter(i => i.id !== item.id)
  } catch {
    toast.add({ title: 'Could not remove item', color: 'error' })
  }
}

// ---- generate contract ----
// Opens the confirm modal (GenerateContractModal), which POSTs the contract and
// routes to the viewer. Needs a name + fee before it's worth generating.
const contractModalOpen = ref(false)
const canGenerate = computed(() => !!project.value?.name && project.value?.project_fee != null)
function openContractModal() {
  if (!canGenerate.value) return
  contractModalOpen.value = true
}

// ---- request deposit (Stripe) ----
const requestingDeposit = ref(false)
const hasPricing = computed(() => project.value?.project_fee != null && project.value.project_fee > 0)
async function requestDeposit() {
  if (!hasPricing.value || requestingDeposit.value) return
  requestingDeposit.value = true
  try {
    const { data } = await api<{ data: { hosted_invoice_url: string | null, amount: number } }>(`/projects/${route.params.id}/deposit-invoice`, { method: 'POST' })
    await loadInvoices()
    toast.add({
      title: 'Deposit invoice sent',
      description: `A $${data.amount.toLocaleString('en-US')} invoice was sent to ${clientLabel.value}.`,
      color: 'success',
      actions: data.hosted_invoice_url ? [{ label: 'View Invoice', to: data.hosted_invoice_url, target: '_blank' }] : undefined
    })
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send deposit invoice', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    requestingDeposit.value = false
  }
}

// ---- send final invoice (Stripe) — the balance after the deposit ----
const requestingFinal = ref(false)
async function sendFinalInvoice() {
  if (!hasPricing.value || requestingFinal.value) return
  requestingFinal.value = true
  try {
    const { data } = await api<{ data: { hosted_invoice_url: string | null, amount: number } }>(`/projects/${route.params.id}/final-invoice`, { method: 'POST' })
    await loadInvoices()
    toast.add({
      title: 'Final invoice sent',
      description: `A $${data.amount.toLocaleString('en-US')} invoice was sent to ${clientLabel.value}.`,
      color: 'success',
      actions: data.hosted_invoice_url ? [{ label: 'View Invoice', to: data.hosted_invoice_url, target: '_blank' }] : undefined
    })
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send final invoice', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    requestingFinal.value = false
  }
}

// One contextual billing button: request the deposit first, then — once it's
// been raised — send the final invoice.
const billingAction = computed(() => {
  if (!hasPricing.value) return null
  if (!depositInvoice.value) return { label: 'Request Deposit', icon: 'i-lucide-hand-coins', run: requestDeposit, loading: requestingDeposit.value }
  if (!finalInvoice.value) return { label: 'Send Final Invoice', icon: 'i-lucide-send', run: sendFinalInvoice, loading: requestingFinal.value }
  return null
})

// The hero's single contextual primary action. Billing (deposit/final invoice)
// lives in the Project Fee card, so the hero only surfaces contract generation.
const primaryAction = computed(() => {
  if (!contracts.value.length && canGenerate.value) {
    return { label: 'Generate Contract', icon: 'i-lucide-file-signature', run: openContractModal, loading: false }
  }
  return null
})

// The Actions kebab: edit + generate, plus the full status list as a second
// group so out-of-order changes (and on_hold) stay reachable beyond the stepper.
const headerMenu = computed(() => [
  [
    { label: 'Edit Scope', icon: 'i-lucide-pencil', onSelect: openEdit },
    { label: 'Generate Contract', icon: 'i-lucide-file-signature', onSelect: openContractModal, disabled: !canGenerate.value }
  ],
  ...statusItems.value
])

// SOW read-only field list for the Scope tab (fee/timeline live in the rail).
const scopeFields = computed(() => project.value
  ? [
      { label: 'Goals / Description', value: project.value.goals },
      { label: 'Pages Included', value: project.value.pages_included },
      { label: 'Key Features', value: project.value.key_features },
      { label: 'Design Deliverables', value: project.value.design_deliverables },
      { label: 'Content Provided By', value: project.value.content_provided_by ? project.value.content_provided_by.charAt(0).toUpperCase() + project.value.content_provided_by.slice(1) : null },
      { label: 'Revision Rounds', value: String(project.value.revision_rounds) },
      { label: 'Third-Party Costs', value: project.value.third_party_costs },
      { label: 'Inactivity Window', value: `${project.value.inactivity_days} days` },
      { label: 'Feedback Window', value: `${project.value.feedback_days} days` },
      { label: 'Late Fee After', value: `${project.value.late_fee_days} days` },
      { label: 'Bug-Fix Window', value: `${project.value.bugfix_days} days` },
      { label: 'Special Terms', value: project.value.special_terms }
    ]
  : [])
</script>

<template>
  <div>
    <!-- loading -->
    <div
      v-if="pending"
      class="py-24 text-center text-sm text-muted"
    >
      Loading project…
    </div>

    <!-- not found -->
    <div
      v-else-if="notFound || !project"
      class="mx-auto flex max-w-[560px] flex-col items-center rounded-card bg-default px-10 py-16 text-center ring ring-default"
    >
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          name="i-lucide-folder-x"
          class="size-6"
        />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">
        Project Not Found
      </h2>
      <UButton
        to="/projects"
        variant="soft"
        color="primary"
        class="mt-6"
        icon="i-lucide-arrow-left"
      >
        Back To Projects
      </UButton>
    </div>

    <template v-else>
      <div class="flex flex-col gap-5">
        <!-- ======================= HERO ======================= -->
        <div class="rounded-card bg-default p-5 ring ring-default sm:p-6">
          <!-- breadcrumb -->
          <nav class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
            <NuxtLink
              to="/projects"
              class="font-medium transition-colors hover:text-highlighted"
            >Projects</NuxtLink>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 opacity-50"
            />
            <span class="font-semibold text-highlighted">{{ project.name }}</span>
          </nav>

          <!-- title row -->
          <div class="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <h1 class="font-display text-[28px] font-medium leading-tight tracking-tight text-highlighted">
                {{ project.name }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-3.5">
                <span
                  v-if="project.code"
                  class="font-mono text-[12px] tracking-[0.03em] text-muted"
                >{{ project.code }}</span>
                <NuxtLink
                  :to="`/clients/${project.client_id}`"
                  class="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <span
                    class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[10px] font-semibold"
                    :class="AVATAR[project.client_id % AVATAR.length]"
                  >{{ initials(clientLabel) }}</span>
                  <span class="text-[13px] font-medium text-primary">{{ clientLabel }}</span>
                </NuxtLink>
                <span
                  v-if="project.type_name"
                  class="text-[13px] text-muted"
                >{{ project.type_name }}</span>
              </div>
            </div>

            <div class="flex flex-none items-center gap-2.5">
              <UButton
                v-if="primaryAction"
                color="primary"
                class="rounded-full"
                :icon="primaryAction.icon"
                :loading="primaryAction.loading"
                @click="primaryAction.run"
              >
                {{ primaryAction.label }}
              </UButton>
              <UDropdownMenu
                :items="headerMenu"
                :content="{ align: 'end' }"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  class="rounded-full"
                  icon="i-lucide-ellipsis"
                  square
                  aria-label="Project actions"
                />
              </UDropdownMenu>
            </div>
          </div>

          <!-- milestone stepper -->
          <div class="mt-6">
            <ProjectStepper
              :status="project.status"
              @advance="setStatus"
            />
          </div>

          <!-- progress bar -->
          <div class="mt-5 flex items-center gap-3 border-t border-default pt-4">
            <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Progress</span>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-teal-500 transition-[width] duration-500"
                :style="{ width: pct + '%' }"
              />
            </div>
            <span class="text-[13px] font-semibold text-highlighted tabular-nums">{{ pct }}%</span>
            <span class="whitespace-nowrap text-[13px] text-muted tabular-nums">{{ project.task_done }}/{{ project.task_total }} tasks</span>
          </div>
        </div>

        <!-- ================= MAIN + RAIL ================= -->
        <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <!-- MAIN COLUMN -->
          <div class="flex min-w-0 flex-col gap-5">
            <!-- tab bar -->
            <div class="flex items-center gap-1 overflow-x-auto border-b border-default">
              <button
                v-for="t in tabs"
                :key="t.key"
                class="inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-3 pt-2.5 text-sm transition-colors"
                :class="activeTab === t.key ? 'border-teal-400 font-semibold text-highlighted' : 'border-transparent font-medium text-muted hover:text-highlighted'"
                @click="activeTab = t.key"
              >
                {{ t.label }}
                <span
                  v-if="t.badge != null"
                  class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
                  :class="activeTab === t.key ? 'bg-mist text-primary' : 'bg-muted text-muted'"
                >{{ t.badge }}</span>
              </button>
            </div>

            <!-- TASKS -->
            <div
              v-if="activeTab === 'tasks'"
              class="flex flex-col gap-4"
            >
              <div class="flex items-center gap-2.5 rounded-card bg-default p-3 ring ring-default">
                <UInput
                  v-model="newTaskTitle"
                  placeholder="Add a task and press Enter…"
                  icon="i-lucide-plus"
                  class="flex-1"
                  :ui="{ base: 'rounded-full' }"
                  @keydown.enter="addTask"
                />
                <UButton
                  color="primary"
                  class="rounded-full"
                  :loading="addingTask"
                  :disabled="!newTaskTitle.trim()"
                  @click="addTask"
                >
                  Add Task
                </UButton>
              </div>

              <!-- empty state -->
              <div
                v-if="!tasks.length"
                class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
              >
                <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                  name="i-lucide-list-checks"
                  class="size-6"
                /></span>
                <h3 class="font-display text-lg font-medium text-highlighted">
                  No Tasks Yet
                </h3>
                <p class="mt-1.5 max-w-xs text-sm text-muted">
                  Add the first task above to start tracking this project's work.
                </p>
              </div>

              <template v-else>
                <!-- due-soon / overdue focus strip -->
                <div
                  v-if="focusTasks.length"
                  class="overflow-hidden rounded-card bg-warning/[0.06] ring ring-warning/20"
                >
                  <div class="flex items-center gap-2 border-b border-warning/20 px-4 py-2.5">
                    <UIcon
                      name="i-lucide-flame"
                      class="size-4 text-warning"
                    />
                    <span class="text-[12.5px] font-semibold text-highlighted">Due soon</span>
                    <span class="text-[12px] text-muted tabular-nums">{{ focusTasks.length }}</span>
                  </div>
                  <TaskCard
                    v-for="t in focusTasks"
                    :key="`focus-${t.id}`"
                    :task="t"
                    :expanded="!!expanded[t.id]"
                    :checklist-items="checklist[t.id] ?? []"
                    :menu="taskMenu(t)"
                    @toggle="toggleTask(t)"
                    @set-due="(v) => setDue(t, v)"
                    @toggle-expand="toggleExpand(t)"
                    @add-item="(title) => addChecklistItem(t.id, title)"
                    @toggle-item="(item) => toggleItem(t.id, item)"
                    @remove-item="(item) => removeChecklistItem(t.id, item)"
                  />
                </div>

                <!-- grouped by status -->
                <div
                  v-for="g in groupedTasks"
                  :key="g.status"
                  class="overflow-hidden rounded-card bg-default ring ring-default"
                >
                  <div class="flex items-center gap-2 border-b border-default px-4 py-2.5">
                    <StatusChip :status="g.meta.status">
                      {{ g.meta.label }}
                    </StatusChip>
                    <span class="text-[12px] text-muted tabular-nums">{{ g.items.length }}</span>
                  </div>
                  <TaskCard
                    v-for="t in g.items"
                    :key="t.id"
                    :task="t"
                    :expanded="!!expanded[t.id]"
                    :checklist-items="checklist[t.id] ?? []"
                    :menu="taskMenu(t)"
                    @toggle="toggleTask(t)"
                    @set-due="(v) => setDue(t, v)"
                    @toggle-expand="toggleExpand(t)"
                    @add-item="(title) => addChecklistItem(t.id, title)"
                    @toggle-item="(item) => toggleItem(t.id, item)"
                    @remove-item="(item) => removeChecklistItem(t.id, item)"
                  />
                </div>
              </template>
            </div>

            <!-- SCOPE -->
            <div
              v-else-if="activeTab === 'scope'"
              class="rounded-card bg-default ring ring-default"
            >
              <div class="flex items-center justify-between border-b border-default px-5 py-4">
                <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                  Statement of work
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  @click="openEdit"
                >
                  Edit
                </UButton>
              </div>
              <dl class="divide-y divide-default">
                <div
                  v-for="f in scopeFields"
                  :key="f.label"
                  class="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[180px_1fr]"
                >
                  <dt class="text-[13px] text-muted">
                    {{ f.label }}
                  </dt>
                  <dd class="whitespace-pre-line text-[13.5px] text-default">
                    {{ f.value || '—' }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- CONTRACT -->
            <div
              v-else-if="activeTab === 'contract'"
              class="flex flex-col gap-4"
            >
              <!-- no contract yet: generate CTA + empty state -->
              <template v-if="!contract">
                <div class="flex items-center justify-between">
                  <p class="text-sm text-muted">
                    Generate the agreement from this project's scope.
                  </p>
                  <UButton
                    icon="i-lucide-file-signature"
                    color="primary"
                    size="sm"
                    class="rounded-full"
                    :disabled="!canGenerate"
                    @click="openContractModal"
                  >
                    New Contract
                  </UButton>
                </div>
                <div class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default">
                  <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                    name="i-lucide-file-text"
                    class="size-6"
                  /></span>
                  <h3 class="font-display text-lg font-medium text-highlighted">
                    No Contracts Yet
                  </h3>
                  <p class="mt-1.5 max-w-xs text-sm text-muted">
                    Generate the Website Design &amp; Development Agreement from this project's scope.
                  </p>
                </div>
              </template>

              <!-- one contract: embed the document -->
              <template v-else>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <span class="truncate text-sm font-semibold text-highlighted">{{ contract.title }}</span>
                    <StatusChip :status="DOC_STATUS[contract.status] || 'neutral'">
                      <span class="capitalize">{{ contract.status }}</span>
                    </StatusChip>
                  </div>
                  <NuxtLink
                    :to="`/contracts/${contract.id}`"
                    class="inline-flex flex-none items-center gap-1.5 text-[13px] font-semibold text-primary transition-opacity hover:opacity-80"
                  >
                    Open full contract <UIcon
                      name="i-lucide-arrow-up-right"
                      class="size-3.5"
                    />
                  </NuxtLink>
                </div>
                <ContractEmbed :contract-id="contract.id" />
              </template>
            </div>

            <!-- ACTIVITY -->
            <ProjectActivity
              v-else
              :project="{ code: project.code, status: project.status, created_at: project.created_at, client_label: clientLabel }"
              :proposals="proposals"
              :contracts="contracts"
              :invoices="invoices"
              :tasks="tasks"
            />
          </div>

          <!-- RIGHT RAIL -->
          <div class="flex flex-col gap-4">
            <ProjectMoneyCard
              :project="project"
              :invoices="invoices"
              :billing-action="billingAction"
              @billing="billingAction?.run()"
            />
            <ProjectTimelineCard :project="project" />

            <!-- contract mini -->
            <div class="rounded-card bg-default p-[18px] ring ring-default">
              <div class="mb-3 flex items-center justify-between gap-2">
                <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Contract</span>
                <StatusChip
                  v-if="contract"
                  :status="DOC_STATUS[contract.status] || 'neutral'"
                >
                  <span class="capitalize">{{ contract.status }}</span>
                </StatusChip>
              </div>
              <NuxtLink
                v-if="contract"
                :to="`/contracts/${contract.id}`"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-opacity hover:opacity-80"
              >
                Open contract
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="size-3.5"
                />
              </NuxtLink>
              <template v-else>
                <p class="mb-3 text-[13px] text-muted">
                  No contract generated yet.
                </p>
                <UButton
                  block
                  color="primary"
                  size="sm"
                  variant="soft"
                  icon="i-lucide-file-signature"
                  class="rounded-full"
                  :disabled="!canGenerate"
                  @click="openContractModal"
                >
                  Generate contract
                </UButton>
              </template>
            </div>

            <!-- quick action -->
            <UButton
              block
              color="neutral"
              variant="outline"
              icon="i-lucide-pencil"
              class="rounded-full"
              @click="openEdit"
            >
              Edit scope
            </UButton>
          </div>
        </div>
      </div>

      <ProjectForm
        v-model:open="formOpen"
        mode="edit"
        :project="project"
        @saved="onSaved"
      />

      <GenerateContractModal
        v-model:open="contractModalOpen"
        :project="project"
        @created="loadDocs"
      />
    </template>
  </div>
</template>
