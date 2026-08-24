<script setup lang="ts">
// Project detail — a task-delivery command center. A full-width hero with a
// lifecycle stepper (the commercial/billing pipeline) + progress, a main column
// optimized for delivery milestones and their tasks, and a
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
  clickup_task_id: string | null
  clickup_sync_error: string | null
  client_company: string | null
  client_name: string | null
  type_name: string | null
  created_at: string | null
}
interface Task {
  id: number
  project_id: number | null
  milestone_id: number | null
  title: string
  description: string | null
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  position: number
  completed_at: string | null
  checklist_total: number
  checklist_done: number
  clickup_task_id: string | null
  clickup_sync_error: string | null
}
type MilestoneState = 'upcoming' | 'in_progress' | 'complete'
interface Milestone {
  id: number
  project_id: number
  title: string
  description: string | null
  state: MilestoneState
  // 1 = the state was set by hand and is pinned there; auto-pilot (which
  // derives state from the task rollup) skips it until it's released.
  state_manual: 0 | 1
  position: number
  target_date: string | null
  task_total: number
  task_done: number
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
const MILESTONE_STATE_META: Record<MilestoneState, { label: string, status: 'neutral' | 'info' | 'success' }> = {
  upcoming: { label: 'Upcoming', status: 'neutral' },
  in_progress: { label: 'In Progress', status: 'info' },
  complete: { label: 'Complete', status: 'success' }
}
const MILESTONE_STATES: MilestoneState[] = ['upcoming', 'in_progress', 'complete']
const DOC_STATUS: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral', sent: 'info', viewed: 'info', signed: 'success', accepted: 'success',
  declined: 'error', expired: 'warning', voided: 'error'
}
const AVATAR = ['bg-primary text-inverted', 'bg-elevated text-default', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const project = ref<ApiProject | null>(null)
const tasks = ref<Task[]>([])
const milestones = ref<Milestone[]>([])
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
async function loadProjectExtras() {
  await Promise.all([loadTime(), loadNoteCount()])
}

async function loadTasks() {
  const { data } = await api<{ data: Task[] }>(`/projects/${route.params.id}/tasks`)
  tasks.value = data.map(t => ({ ...t, checklist_total: Number(t.checklist_total ?? 0), checklist_done: Number(t.checklist_done ?? 0) }))
  // Fire and forget: the boards render immediately, checklists fill in.
  expandActiveChecklists().catch(() => {})
}
async function loadMilestones() {
  const { data } = await api<{ data: Milestone[] }>('/milestones', { query: { project_id: route.params.id } })
  milestones.value = data.map(m => ({ ...m, task_total: Number(m.task_total ?? 0), task_done: Number(m.task_done ?? 0) }))
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
  loadMilestones() // task changes shift per-milestone progress rollups
}
// Milestone create/edit/delete/reorder — reload both (a delete detaches tasks).
function onMilestoneEvent() {
  loadMilestones()
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
    await Promise.all([loadTasks(), loadMilestones(), loadDocs(), loadInvoices(), loadProjectExtras()])
  }
  socket.on('task:created', onTaskEvent)
  socket.on('task:updated', onTaskEvent)
  socket.on('task:deleted', onTaskEvent)
  socket.on('milestone:created', onMilestoneEvent)
  socket.on('milestone:updated', onMilestoneEvent)
  socket.on('milestone:deleted', onMilestoneEvent)
  socket.on('project:updated', onProjectEvent)
  socket.on('contract:changed', onContractEvent)
  socket.on('invoice:changed', onInvoiceEvent)
})
onBeforeUnmount(() => {
  socket.off('task:created', onTaskEvent)
  socket.off('task:updated', onTaskEvent)
  socket.off('task:deleted', onTaskEvent)
  socket.off('milestone:created', onMilestoneEvent)
  socket.off('milestone:updated', onMilestoneEvent)
  socket.off('milestone:deleted', onMilestoneEvent)
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
const activeTab = ref<'tasks' | 'scope' | 'contract' | 'files' | 'activity'>('tasks')
const filesCount = ref(0)
const tabs = computed(() => [
  { key: 'tasks' as const, label: 'Tasks', badge: tasks.value.length || null },
  { key: 'scope' as const, label: 'Scope', badge: null },
  { key: 'contract' as const, label: 'Contract', badge: contracts.value.length || null },
  { key: 'files' as const, label: 'Files', badge: filesCount.value || null },
  { key: 'activity' as const, label: 'Activity', badge: null }
])

// Tasks board: group by milestone (in order), each with the status sub-grouping
// nested inside. Unassigned tasks fall into a trailing "General" board.
// Tasks used to be banded by status inside each milestone, which cost a header
// row per status — a lot of chrome for two or three tasks. Each row already
// shows its own state, so order carries it instead: unfinished first, then by
// due date, with completed work sinking to the bottom.
const STATUS_RANK: Record<TaskStatus, number> = { in_progress: 0, blocked: 1, todo: 2, done: 3 }
function orderTasks(list: Task[]) {
  return [...list].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || a.position - b.position)
}
const taskBoards = computed(() => {
  const boards = milestones.value.map((m) => {
    const list = tasks.value.filter(t => t.milestone_id === m.id)
    return {
      key: `m-${m.id}`,
      milestone: m as Milestone | null,
      items: orderTasks(list),
      count: list.length,
      // A finished milestone is reference material, not work in progress.
      done: list.length > 0 && list.every(t => t.status === 'done')
    }
  })
  const general = tasks.value.filter(t => t.milestone_id == null)
  if (general.length) {
    boards.push({ key: 'general', milestone: null, items: orderTasks(general), count: general.length, done: false })
  }
  return boards
})

// Completed milestones start collapsed; anything in flight stays open.
const collapsed = reactive<Record<string, boolean>>({})
function boardOpen(board: { key: string, done: boolean }) {
  return collapsed[board.key] === undefined ? !board.done : !collapsed[board.key]
}
function toggleBoard(board: { key: string, done: boolean }) {
  collapsed[board.key] = boardOpen(board)
}

// One add-task field on the page at a time, revealed on demand — a permanent
// input under every milestone was four rows of chrome nobody asked for.
const addingTo = ref<string | null>(null)

// Overdue or due-within-3-days, not done — the "what's next" focus strip.
const focusTasks = computed(() => tasks.value
  .filter(t => t.status !== 'done')
  .filter((t) => {
    const d = daysFromNow(t.due_date)
    return d != null && d <= 3
  })
  .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')))

// ---- task inline actions ----
// Add-task state is keyed per board (a milestone id or 'general').
const newTaskByBoard = reactive<Record<string, string>>({})
const addingByBoard = reactive<Record<string, boolean>>({})
async function addTaskTo(milestoneId: number | null) {
  const key = milestoneId == null ? 'general' : `m-${milestoneId}`
  const title = (newTaskByBoard[key] ?? '').trim()
  if (!title || addingByBoard[key]) return
  addingByBoard[key] = true
  try {
    await api('/tasks', { method: 'POST', body: { title, project_id: Number(route.params.id), milestone_id: milestoneId } })
    newTaskByBoard[key] = ''
    await Promise.all([loadTasks(), loadMilestones()])
  } catch {
    toast.add({ title: 'Could not add task', color: 'error' })
  } finally {
    addingByBoard[key] = false
  }
}
async function setTaskMilestone(t: Task, milestone_id: number | null) {
  try {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { milestone_id } })
    await Promise.all([loadTasks(), loadMilestones()])
  } catch {
    toast.add({ title: 'Could not move task', color: 'error' })
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
  // A task with a checklist has a derived status — offering "Move to Done"
  // would be accepted and then reversed by the rule a second later.
  const statusGroup = t.checklist_total > 0
    ? [{ label: 'Status follows the checklist', icon: 'i-lucide-list-checks', disabled: true, onSelect: () => {} }]
    : TASK_ORDER.map(s => ({
        label: `Move to ${TASK_META[s].label}`,
        icon: t.status === s ? 'i-lucide-check' : undefined,
        onSelect: () => setTaskStatus(t, s)
      }))
  const milestoneGroup = [
    ...milestones.value.map(m => ({
      label: m.title,
      icon: t.milestone_id === m.id ? 'i-lucide-check' : undefined,
      onSelect: () => setTaskMilestone(t, m.id)
    })),
    {
      label: 'General (no milestone)',
      icon: t.milestone_id == null ? 'i-lucide-check' : undefined,
      onSelect: () => setTaskMilestone(t, null)
    }
  ]
  return [statusGroup, milestoneGroup, [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteTask(t) }]]
}

// ---- milestone actions ----
const milestoneFormOpen = ref(false)
const milestoneFormMode = ref<'create' | 'edit'>('create')
const editingMilestone = ref<Milestone | null>(null)
function openAddMilestone() {
  milestoneFormMode.value = 'create'
  editingMilestone.value = null
  milestoneFormOpen.value = true
}
function openEditMilestone(m: Milestone) {
  milestoneFormMode.value = 'edit'
  editingMilestone.value = m
  milestoneFormOpen.value = true
}
function onMilestoneSaved() {
  loadMilestones()
}
async function setMilestoneState(m: Milestone, state: MilestoneState) {
  try {
    await api(`/milestones/${m.id}`, { method: 'PATCH', body: { state } })
    await loadMilestones()
  } catch {
    toast.add({ title: 'Could not update milestone', color: 'error' })
  }
}
async function removeMilestone(m: Milestone) {
  try {
    await api(`/milestones/${m.id}`, { method: 'DELETE' })
    await Promise.all([loadMilestones(), loadTasks()])
  } catch {
    toast.add({ title: 'Could not delete milestone', color: 'error' })
  }
}
async function moveMilestone(m: Milestone, dir: -1 | 1) {
  const ids = milestones.value.map(x => x.id)
  const i = ids.indexOf(m.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  try {
    await api('/milestones/reorder', { method: 'PATCH', body: { project_id: Number(route.params.id), order: ids } })
    await loadMilestones()
  } catch {
    toast.add({ title: 'Could not reorder milestones', color: 'error' })
  }
}
// Releasing a pin hands the milestone back to auto-pilot, which recomputes it
// from the task rollup immediately.
async function resumeAutoMilestone(m: Milestone) {
  await api(`/milestones/${m.id}`, { method: 'PATCH', body: { state_manual: false } })
  await Promise.all([loadMilestones(), loadTasks()])
}

function milestoneMenu(m: Milestone, index: number, total: number) {
  return [
    [
      ...MILESTONE_STATES.map(s => ({
        // Setting a state by hand pins the milestone — say so, rather than
        // letting it silently drop off auto-pilot.
        label: m.state_manual ? `Mark ${MILESTONE_STATE_META[s].label}` : `Mark ${MILESTONE_STATE_META[s].label} (stops auto)`,
        icon: m.state === s ? 'i-lucide-check' : undefined,
        onSelect: () => setMilestoneState(m, s)
      })),
      // Marking a state pins it, so offer the way back out.
      ...(m.state_manual
        ? [{ label: 'Resume Auto', icon: 'i-lucide-refresh-cw', onSelect: () => resumeAutoMilestone(m) }]
        : [])
    ],
    [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditMilestone(m) },
      ...(index > 0 ? [{ label: 'Move up', icon: 'i-lucide-arrow-up', onSelect: () => moveMilestone(m, -1) }] : []),
      ...(index < total - 1 ? [{ label: 'Move down', icon: 'i-lucide-arrow-down', onSelect: () => moveMilestone(m, 1) }] : [])
    ],
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeMilestone(m) }]
  ]
}

// ---- time, notes, density -------------------------------------------------
interface TimeSummary { total_minutes: number, billable_minutes: number, unbilled_minutes: number, unbilled_count: number }
const timeSummary = ref<TimeSummary | null>(null)
const noteCount = ref(0)
const timeOpen = ref(false)
const notesOpen = ref(false)

async function loadTime() {
  try {
    const res = await api<{ summary: TimeSummary }>(`/projects/${route.params.id}/time`)
    timeSummary.value = res.summary
  } catch { /* the money card just falls back to the bare rate */ }
}
async function loadNoteCount() {
  try {
    const { data } = await api<{ data: unknown[] }>(`/projects/${route.params.id}/notes`)
    noteCount.value = data.length
  } catch { /* non-fatal */ }
}

const loggedHours = computed(() => (timeSummary.value
  ? Math.round((timeSummary.value.total_minutes / 60) * 100) / 100
  : 0))

// Row density — a per-device preference, so localStorage rather than the server.
type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'fwa.tasks.density'
const density = ref<Density>('comfortable')
const densityItems = [
  { label: 'Comfortable', value: 'comfortable' as const },
  { label: 'Compact', value: 'compact' as const }
]
onMounted(() => {
  try {
    const saved = localStorage.getItem(DENSITY_KEY)
    if (saved === 'comfortable' || saved === 'compact') density.value = saved
  } catch { /* private mode — the default is fine */ }
})
watch(density, (v) => {
  try {
    localStorage.setItem(DENSITY_KEY, v)
  } catch { /* ignore */ }
})

// Quick actions: two jump to where the thing already lives, two open a panel.
function quickAddTask() {
  activeTab.value = 'tasks'
  const first = taskBoards.value[0]
  if (first) addingTo.value = first.key
}
function quickUploadFile() {
  activeTab.value = 'files'
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

/**
 * Open the checklist of the task you're most likely working on — the first
 * unfinished one that has a checklist, per milestone. Since ticking the last
 * item is what completes the task, the checklist is the task's real state and
 * shouldn't need a click to see. One per milestone keeps the boards short.
 */
async function expandActiveChecklists() {
  // Just the one task you're most likely working on — in progress first, then
  // whatever is furthest along. Opening one per milestone buried the boards.
  const candidates = tasks.value
    .filter(t => t.status !== 'done' && t.checklist_total > 0)
    .sort((a, b) =>
      (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1)
      || (b.checklist_done / b.checklist_total) - (a.checklist_done / a.checklist_total))
  const t = candidates[0]
  if (!t || expanded[t.id]) return
  expanded[t.id] = true
  await loadChecklist(t.id).catch(() => {
    expanded[t.id] = false
  })
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
// One-click DigitalOcean provisioning (creates a droplet + linked website record).
const provisionOpen = ref(false)
function onProvisioned({ website_id, monthly_price }: { website_id: number, monthly_price: number | null, grouped: boolean }) {
  toast.add({
    title: 'Hosting provisioned',
    description: monthly_price != null ? `A $${monthly_price}/mo droplet is spinning up.` : 'The droplet is spinning up.',
    color: 'success',
    actions: [{ label: 'View hosting', to: `/websites/${website_id}` }]
  })
}

// ---- ClickUp -------------------------------------------------------------
// Delivery work happens in ClickUp; this is just the door to it. Linking is
// normally automatic on project create, so the action here is a retry for when
// ClickUp was down at the time (the reason is in clickup_sync_error).
const clickupUrl = computed(() => project.value?.clickup_task_id
  ? `https://app.clickup.com/t/${project.value.clickup_task_id}`
  : null)
async function linkClickup() {
  try {
    const { data } = await api<{ data: { linked: boolean, pushed?: number, error?: string, configured?: boolean } }>(
      `/clickup/projects/${route.params.id}/link`, { method: 'POST' }
    )
    if (data.configured === false) {
      toast.add({ title: 'ClickUp isn\'t connected', description: 'Add a ClickUp API token in the server environment.', color: 'neutral' })
    } else if (data.linked) {
      toast.add({ title: 'Linked to ClickUp', description: data.pushed ? `${data.pushed} task${data.pushed === 1 ? '' : 's'} pushed up.` : 'Already in sync.', color: 'success' })
      await loadProject()
    } else {
      toast.add({ title: 'Link failed', description: data.error ?? 'Check the connection and try again.', color: 'error' })
    }
  } catch (err: unknown) {
    // Surface the server's reason — a 401/404 from ClickUp reads as a generic
    // connection problem otherwise.
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Link failed', description: e?.data?.error?.message || 'Check the connection and try again.', color: 'error' })
  }
}

const headerMenu = computed(() => [
  [
    { label: 'Edit Scope', icon: 'i-lucide-pencil', onSelect: openEdit },
    { label: 'Generate Contract', icon: 'i-lucide-file-signature', onSelect: openContractModal, disabled: !canGenerate.value },
    { label: 'Provision Hosting', icon: 'i-lucide-server-cog', onSelect: () => { provisionOpen.value = true } },
    clickupUrl.value
      ? { label: 'Open in ClickUp', icon: 'i-lucide-external-link', to: clickupUrl.value, target: '_blank' }
      : { label: 'Link to ClickUp', icon: 'i-lucide-link', onSelect: linkClickup }
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
      <h2 class="font-display text-2xl font-semibold tracking-tight text-highlighted">
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
              <h1 class="font-display text-[30px] font-semibold leading-[1.12] tracking-tight text-highlighted sm:text-[34px]">
                {{ project.name }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-3.5">
                <span
                  v-if="project.code"
                  class="text-[12px] tracking-[0.03em] text-muted"
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

          <!-- lifecycle stepper (commercial / billing pipeline) -->
          <div class="mt-6">
            <ProjectStepper
              :status="project.status"
              @advance="setStatus"
            />
          </div>

          <!-- progress bar -->
          <div class="mt-5 flex items-center gap-3 border-t border-default pt-4">
            <span class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Progress</span>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-500"
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
                :class="activeTab === t.key ? 'border-citrine font-semibold text-highlighted' : 'border-transparent font-medium text-muted hover:text-highlighted'"
                @click="activeTab = t.key"
              >
                {{ t.label }}
                <span
                  v-if="t.badge != null"
                  class="rounded-chip px-1.5 py-px text-[11px] font-semibold tabular-nums"
                  :class="activeTab === t.key ? 'bg-mist text-primary' : 'bg-muted text-muted'"
                >{{ t.badge }}</span>
              </button>
            </div>

            <!-- TASKS -->
            <div
              v-if="activeTab === 'tasks'"
              class="flex flex-col gap-4"
            >
              <!-- toolbar -->
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Milestones &amp; tasks</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  class="rounded-full"
                  @click="openAddMilestone"
                >
                  Add milestone
                </UButton>
                <USelectMenu
                  v-model="density"
                  :items="densityItems"
                  value-key="value"
                  size="xs"
                  class="w-[132px]"
                />
              </div>

              <!-- due-soon / overdue focus strip (spans all milestones) -->
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

              <!-- empty: no milestones and no tasks -->
              <div
                v-if="!taskBoards.length"
                class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
              >
                <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                  name="i-lucide-milestone"
                  class="size-6"
                /></span>
                <h3 class="font-display text-lg font-semibold text-highlighted">
                  No Milestones Yet
                </h3>
                <p class="mt-1.5 max-w-xs text-sm text-muted">
                  Add a milestone to start grouping this project's delivery work.
                </p>
                <UButton
                  class="mt-4 rounded-full"
                  color="primary"
                  icon="i-lucide-plus"
                  @click="openAddMilestone"
                >
                  Add Milestone
                </UButton>
              </div>

              <!-- milestone boards (+ trailing General for unassigned tasks) -->
              <div
                v-for="(board, bi) in taskBoards"
                :key="board.key"
                class="overflow-hidden rounded-card bg-default ring ring-default"
              >
                <!-- board header -->
                <div class="border-b border-default px-4 py-3">
                  <div class="flex items-center gap-2.5">
                    <UButton
                      :icon="boardOpen(board) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="boardOpen(board) ? 'Collapse' : 'Expand'"
                      @click="toggleBoard(board)"
                    />
                    <template v-if="board.milestone">
                      <StatusChip :status="MILESTONE_STATE_META[board.milestone.state].status">
                        {{ MILESTONE_STATE_META[board.milestone.state].label }}
                      </StatusChip>
                      <span class="font-display text-[15px] font-semibold text-highlighted">{{ board.milestone.title }}</span>
                      <!-- State is derived from the task rollup. Pinned means it
                           was set by hand and has stopped following the tasks —
                           worth showing, or auto-pilot just looks broken. -->
                      <UTooltip
                        :text="board.milestone.state_manual
                          ? 'Set by hand — no longer follows task progress. Use Resume Auto to release it.'
                          : 'Follows task progress automatically'"
                      >
                        <span
                          class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                          :class="board.milestone.state_manual ? 'text-warning' : 'text-muted'"
                        >
                          <UIcon
                            :name="board.milestone.state_manual ? 'i-lucide-pin' : 'i-lucide-refresh-cw'"
                            class="size-3"
                          />
                          {{ board.milestone.state_manual ? 'Pinned' : 'Auto' }}
                        </span>
                      </UTooltip>
                    </template>
                    <template v-else>
                      <span class="font-display text-[15px] font-semibold text-highlighted">General</span>
                      <UTooltip text="These tasks count toward the project bar but no milestone, so the client never sees them.">
                        <span class="text-[12px] text-muted">Unassigned</span>
                      </UTooltip>
                    </template>
                    <div class="ms-auto flex items-center gap-3">
                      <!-- the milestone's own rollup — what the client sees -->
                      <span
                        v-if="board.milestone"
                        class="hidden items-center gap-2 sm:flex"
                      >
                        <UProgress
                          :model-value="board.milestone.task_done"
                          :max="Math.max(board.milestone.task_total, 1)"
                          size="2xs"
                          :color="board.milestone.state === 'complete' ? 'success' : 'primary'"
                          class="w-16"
                        />
                        <span class="text-[12px] text-muted tabular-nums">
                          {{ board.milestone.task_done }}/{{ board.milestone.task_total }}
                        </span>
                      </span>
                      <span
                        v-else
                        class="text-[12px] text-muted tabular-nums"
                      >{{ board.count }}</span>
                      <span
                        v-if="board.milestone?.target_date"
                        class="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-muted"
                      >
                        <UIcon
                          name="i-lucide-calendar"
                          class="size-3.5"
                        />
                        {{ shortDate(board.milestone.target_date) }}
                      </span>
                      <UDropdownMenu
                        v-if="board.milestone"
                        :items="milestoneMenu(board.milestone, bi, milestones.length)"
                      >
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          icon="i-lucide-ellipsis"
                          square
                          aria-label="Milestone actions"
                        />
                      </UDropdownMenu>
                    </div>
                  </div>
                </div>

                <!-- tasks — ordered, not banded by status: each row already
                     shows its own state, and a header per status cost more
                     room than the tasks it introduced -->
                <template v-if="boardOpen(board)">
                  <TaskCard
                    v-for="t in board.items"
                    :key="t.id"
                    :task="t"
                    :expanded="!!expanded[t.id]"
                    :checklist-items="checklist[t.id] ?? []"
                    :menu="taskMenu(t)"
                    :density="density"
                    @toggle="toggleTask(t)"
                    @set-due="(v) => setDue(t, v)"
                    @toggle-expand="toggleExpand(t)"
                    @add-item="(title) => addChecklistItem(t.id, title)"
                    @toggle-item="(item) => toggleItem(t.id, item)"
                    @remove-item="(item) => removeChecklistItem(t.id, item)"
                  />

                  <!-- add task, on demand -->
                  <div class="px-4 py-2">
                    <UButton
                      v-if="addingTo !== board.key"
                      icon="i-lucide-plus"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="rounded-full"
                      @click="addingTo = board.key"
                    >
                      Add Task
                    </UButton>
                    <div
                      v-else
                      class="flex items-center gap-2"
                    >
                      <UInput
                        v-model="newTaskByBoard[board.key]"
                        placeholder="Task name…"
                        size="sm"
                        autofocus
                        class="flex-1"
                        @keydown.enter="addTaskTo(board.milestone ? board.milestone.id : null)"
                        @keydown.esc="addingTo = null"
                      />
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="soft"
                        class="rounded-full"
                        :loading="addingByBoard[board.key]"
                        :disabled="!(newTaskByBoard[board.key] || '').trim()"
                        @click="addTaskTo(board.milestone ? board.milestone.id : null)"
                      >
                        Add
                      </UButton>
                      <UButton
                        icon="i-lucide-x"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        aria-label="Cancel"
                        @click="addingTo = null"
                      />
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- SCOPE -->
            <div
              v-else-if="activeTab === 'scope'"
              class="rounded-card bg-default ring ring-default"
            >
              <div class="flex items-center justify-between border-b border-default px-5 py-4">
                <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
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
                  <h3 class="font-display text-lg font-semibold text-highlighted">
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

            <!-- FILES -->
            <div v-else-if="activeTab === 'files'">
              <FilesPanel
                :project-id="Number(route.params.id)"
                :client-id="project.client_id"
                @update:count="filesCount = $event"
              />
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
              :time="timeSummary"
              :project="project"
              :invoices="invoices"
              :billing-action="billingAction"
              @billing="billingAction?.run()"
            />
            <ProjectTimelineCard :project="project" />
            <ProjectQuickActions
              :time-hours="loggedHours"
              :note-count="noteCount"
              @add-task="quickAddTask"
              @upload-file="quickUploadFile"
              @log-time="timeOpen = true"
              @note="notesOpen = true"
            />

            <!-- contract mini -->
            <div class="rounded-card bg-default p-[18px] ring ring-default">
              <div class="mb-3 flex items-center justify-between gap-2">
                <span class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Contract</span>
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

      <MilestoneForm
        v-model:open="milestoneFormOpen"
        :mode="milestoneFormMode"
        :project-id="project.id"
        :milestone="editingMilestone"
        @saved="onMilestoneSaved"
      />

      <GenerateContractModal
        v-model:open="contractModalOpen"
        :project="project"
        @created="loadDocs"
      />

      <ProvisionHostingModal
        v-model:open="provisionOpen"
        :project="{ id: project.id, name: project.name, clientLabel }"
        @provisioned="onProvisioned"
      />
    </template>

    <!-- Log Time / Notes — panels rather than more page -->
    <TimeLogSlideover
      v-model:open="timeOpen"
      :project-id="Number(route.params.id)"
      :hourly-rate="project?.hourly_rate ?? null"
      @changed="(s) => (timeSummary = s)"
    />
    <ProjectNotesSlideover
      v-model:open="notesOpen"
      :project-id="Number(route.params.id)"
      @changed="(n) => (noteCount = n)"
    />
  </div>
</template>
