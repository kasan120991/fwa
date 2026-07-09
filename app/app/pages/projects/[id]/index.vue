<script setup lang="ts">
// Project detail — the project is the hub: its Statement of Work (Scope tab)
// feeds contract generation, and its tasks roll up here. Backed by /projects/:id.
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
interface Doc { id: number, title: string, status: string, total: number | null, created_at: string }
type InvStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
type ChipStatus = 'neutral' | 'info' | 'success' | 'warning' | 'error'
interface ProjectInvoice { id: number, kind: 'deposit' | 'balance' | 'custom', status: InvStatus, number: string | null, amount_due: number, amount_paid: number, is_overdue: boolean }

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
const PRIORITY_META: Record<'low' | 'medium' | 'high', { label: string, class: string }> = {
  high: { label: 'High', class: 'bg-warning/10 text-warning' },
  medium: { label: 'Medium', class: 'bg-muted text-muted' },
  low: { label: 'Low', class: 'bg-muted text-muted' }
}
const DOC_STATUS: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral', sent: 'info', viewed: 'info', signed: 'success', accepted: 'success',
  declined: 'error', expired: 'warning', voided: 'error'
}
const INV_STATUS: Record<InvStatus, { label: string, status: ChipStatus }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
function invChip(i: ProjectInvoice): { label: string, status: ChipStatus } {
  return i.is_overdue ? { label: 'Overdue', status: 'warning' } : INV_STATUS[i.status]
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

const clientLabel = computed(() => project.value?.client_company || project.value?.client_name || 'Client')
const pct = computed(() => project.value && project.value.task_total ? Math.round((project.value.task_done / project.value.task_total) * 100) : 0)
const openTasks = computed(() => project.value ? project.value.task_total - project.value.task_done : 0)
const depositPct = computed(() => project.value?.deposit_pct ?? 50)
const deposit = computed(() => (project.value?.project_fee == null ? null : Math.round((project.value.project_fee * depositPct.value / 100) * 100) / 100))
const balance = computed(() => (project.value?.project_fee == null || deposit.value == null ? null : Math.round((project.value.project_fee - deposit.value) * 100) / 100))

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
// invoice), so refresh the Contracts tab + billing panel when they fire.
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

// ---- quick status change (header chip dropdown) ----
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
    toast.add({ title: "Couldn't update status", color: 'error' })
  }
}

// ---- tabs ----
const activeTab = ref<'scope' | 'tasks' | 'contracts' | 'proposals' | 'activity'>('scope')
const tabs = computed(() => [
  { key: 'scope' as const, label: 'Scope', badge: null },
  { key: 'tasks' as const, label: 'Tasks', badge: tasks.value.length || null },
  { key: 'contracts' as const, label: 'Contracts', badge: contracts.value.length || null },
  { key: 'proposals' as const, label: 'Proposals', badge: proposals.value.length || null },
  { key: 'activity' as const, label: 'Activity', badge: null }
])

const groupedTasks = computed(() => TASK_ORDER.map(s => ({
  status: s,
  meta: TASK_META[s],
  items: tasks.value.filter(t => t.status === s)
})).filter(g => g.items.length))

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

function taskOverdue(t: Task) {
  const d = daysFromNow(t.due_date)
  return d != null && d < 0 && t.status !== 'done'
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
const newItemTitle = reactive<Record<number, string>>({})
const checklistPct = (t: Task) => (t.checklist_total ? Math.round((t.checklist_done / t.checklist_total) * 100) : 0)

async function loadChecklist(taskId: number) {
  const { data } = await api<{ data: ChecklistItem[] }>(`/tasks/${taskId}/checklist`)
  checklist[taskId] = data
}
async function toggleExpand(t: Task) {
  expanded[t.id] = !expanded[t.id]
  if (newItemTitle[t.id] === undefined) newItemTitle[t.id] = ''
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
async function addChecklistItem(taskId: number) {
  const title = (newItemTitle[taskId] ?? '').trim()
  if (!title) return
  try {
    const { data } = await api<{ data: ChecklistItem }>(`/tasks/${taskId}/checklist`, { method: 'POST', body: { title } })
    ;(checklist[taskId] ??= []).push(data)
    newItemTitle[taskId] = ''
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

// One contextual billing button in the Fee panel: request the deposit first,
// then — once it's been raised — send the final invoice.
const billingAction = computed(() => {
  if (!hasPricing.value) return null
  if (!depositInvoice.value) return { label: 'Request Deposit', icon: 'i-lucide-hand-coins', run: requestDeposit, loading: requestingDeposit.value }
  if (!finalInvoice.value) return { label: 'Send Final Invoice', icon: 'i-lucide-send', run: sendFinalInvoice, loading: requestingFinal.value }
  return null
})

const headerMenu = computed(() => [[
  { label: 'Edit Scope', icon: 'i-lucide-pencil', onSelect: openEdit },
  { label: 'Generate Contract', icon: 'i-lucide-file-signature', onSelect: openContractModal, disabled: !canGenerate.value }
]])

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)
const metrics = computed(() => project.value
  ? [
      { label: 'Progress', value: `${pct.value}%`, sub: `${project.value.task_done}/${project.value.task_total} tasks`, tone: 'text-highlighted' },
      { label: 'Open Tasks', value: String(openTasks.value), sub: null, tone: 'text-highlighted' },
      { label: 'Project Fee', value: money(project.value.project_fee), sub: null, tone: 'text-highlighted' },
      { label: 'Target Launch', value: project.value.target_launch_date ? shortDate(project.value.target_launch_date) : '—', sub: null, tone: overdueLaunch.value ? 'text-warning' : 'text-highlighted' }
    ]
  : [])
const overdueLaunch = computed(() => {
  const d = daysFromNow(project.value?.target_launch_date)
  return d != null && d < 0 && project.value?.status !== 'completed'
})

// SOW read-only field list for the Scope tab.
const scopeFields = computed(() => project.value
  ? [
      { label: 'Goals / Description', value: project.value.goals },
      { label: 'Pages Included', value: project.value.pages_included },
      { label: 'Key Features', value: project.value.key_features },
      { label: 'Design Deliverables', value: project.value.design_deliverables },
      { label: 'Content Provided By', value: project.value.content_provided_by ? project.value.content_provided_by.charAt(0).toUpperCase() + project.value.content_provided_by.slice(1) : null },
      { label: 'Revision Rounds', value: String(project.value.revision_rounds) },
      { label: 'Third-Party Costs', value: project.value.third_party_costs },
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

        <!-- header -->
        <div class="flex flex-wrap items-center justify-between gap-5">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">
                {{ project.name }}
              </h1>
              <UDropdownMenu :items="statusItems">
                <button
                  class="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
                  aria-label="Change status"
                >
                  <StatusChip
                    :status="STATUS_META[project.status].status"
                    size="lg"
                  >
                    {{ STATUS_META[project.status].label }}
                  </StatusChip>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-4 text-muted"
                  />
                </button>
              </UDropdownMenu>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-3.5">
              <span class="font-mono text-[12px] tracking-[0.03em] text-muted">{{ project.code }}</span>
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
            <UDropdownMenu :items="headerMenu">
              <UButton
                color="neutral"
                variant="outline"
                class="rounded-full"
                trailing-icon="i-lucide-chevron-down"
                :loading="generating || requestingDeposit"
              >
                Actions
              </UButton>
            </UDropdownMenu>
          </div>
        </div>

        <!-- metric strip -->
        <div class="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          <div
            v-for="m in metrics"
            :key="m.label"
            class="rounded-[14px] bg-default p-4 ring ring-default"
          >
            <div class="mb-2 whitespace-nowrap text-[12.5px] text-muted">
              {{ m.label }}
            </div>
            <div class="flex items-baseline gap-2">
              <span
                class="font-display text-2xl font-medium leading-none tracking-tight tabular-nums"
                :class="m.tone"
              >{{ m.value }}</span>
              <span
                v-if="m.sub"
                class="text-xs text-muted"
              >{{ m.sub }}</span>
            </div>
          </div>
        </div>

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

        <!-- SCOPE -->
        <div
          v-if="activeTab === 'scope'"
          class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]"
        >
          <div class="rounded-card bg-default ring ring-default">
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

          <!-- fee + dates sidebar -->
          <div class="flex flex-col gap-4">
            <div class="rounded-card bg-default p-[18px] ring ring-default">
              <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Fee
              </div>
              <div class="font-display text-[26px] font-medium tracking-tight text-highlighted tabular-nums">
                {{ money(project.project_fee) }}
              </div>
              <div class="mt-3 flex flex-col gap-2.5 text-[13px] text-muted">
                <div class="flex items-center justify-between gap-2">
                  <span>Deposit ({{ depositPct }}%)</span>
                  <div class="flex items-center gap-2">
                    <StatusChip
                      v-if="depositInvoice"
                      :status="invChip(depositInvoice).status"
                      :title="depositInvoice.number || undefined"
                    >
                      {{ invChip(depositInvoice).label }}
                    </StatusChip>
                    <span
                      v-else
                      class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted"
                    >Not invoiced</span>
                    <span class="font-semibold text-highlighted tabular-nums">{{ money(deposit) }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span>Final ({{ 100 - depositPct }}%)</span>
                  <div class="flex items-center gap-2">
                    <StatusChip
                      v-if="finalInvoice"
                      :status="invChip(finalInvoice).status"
                      :title="finalInvoice.number || undefined"
                    >
                      {{ invChip(finalInvoice).label }}
                    </StatusChip>
                    <span
                      v-else
                      class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted"
                    >Not invoiced</span>
                    <span class="font-semibold text-highlighted tabular-nums">{{ money(balance) }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span>Hourly (extra)</span><span class="font-semibold text-highlighted tabular-nums">{{ money(project.hourly_rate) }}</span>
                </div>
              </div>
              <UButton
                v-if="billingAction"
                block
                color="primary"
                size="sm"
                :icon="billingAction.icon"
                class="mt-4 rounded-full"
                :loading="billingAction.loading"
                @click="billingAction.run"
              >
                {{ billingAction.label }}
              </UButton>
            </div>
            <div class="rounded-card bg-default p-[18px] ring ring-default">
              <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Timeline
              </div>
              <div class="flex flex-col gap-2 text-[13px]">
                <div class="flex justify-between">
                  <span class="text-muted">Content deadline</span><span class="text-default tabular-nums">{{ project.content_deadline ? shortDate(project.content_deadline) : '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">Start</span><span class="text-default tabular-nums">{{ project.start_date ? shortDate(project.start_date) : '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">Target launch</span><span
                    class="tabular-nums"
                    :class="overdueLaunch ? 'font-semibold text-warning' : 'text-default'"
                  >{{ project.target_launch_date ? shortDate(project.target_launch_date) : '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TASKS -->
        <div
          v-else-if="activeTab === 'tasks'"
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

          <div
            v-for="g in groupedTasks"
            v-else
            :key="g.status"
            class="overflow-hidden rounded-card bg-default ring ring-default"
          >
            <div class="flex items-center gap-2 border-b border-default px-4 py-2.5">
              <StatusChip :status="g.meta.status">
                {{ g.meta.label }}
              </StatusChip>
              <span class="text-[12px] text-muted tabular-nums">{{ g.items.length }}</span>
            </div>
            <div
              v-for="t in g.items"
              :key="t.id"
              class="border-b border-default last:border-b-0"
            >
              <div class="flex items-center gap-3 px-4 py-3 hover:bg-muted">
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
                <div class="min-w-0 flex-1">
                  <span
                    class="block truncate text-[13.5px]"
                    :class="t.status === 'done' ? 'text-muted line-through' : 'text-highlighted'"
                  >{{ t.title }}</span>
                  <div
                    v-if="t.checklist_total > 0"
                    class="mt-1.5 flex items-center gap-2"
                  >
                    <div class="h-1 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full bg-teal-500 transition-[width] duration-300"
                        :style="{ width: checklistPct(t) + '%' }"
                      />
                    </div>
                    <span class="text-[11px] text-muted tabular-nums">{{ t.checklist_done }}/{{ t.checklist_total }}</span>
                  </div>
                </div>
                <span
                  v-if="t.priority !== 'medium'"
                  class="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  :class="PRIORITY_META[t.priority].class"
                >{{ PRIORITY_META[t.priority].label }}</span>

                <!-- due date — click to set/clear -->
                <UPopover>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] tabular-nums transition-colors"
                    :class="t.due_date ? (taskOverdue(t) ? 'font-semibold text-warning hover:bg-warning/10' : 'text-muted hover:bg-elevated') : 'text-muted hover:text-highlighted'"
                  >
                    <UIcon name="i-lucide-calendar" class="size-3.5" />
                    <span>{{ t.due_date ? shortDate(t.due_date) : 'Due' }}</span>
                  </button>
                  <template #content>
                    <div class="flex flex-col gap-2 p-3">
                      <UInput
                        type="date"
                        :model-value="t.due_date ? t.due_date.slice(0, 10) : ''"
                        size="sm"
                        @update:model-value="(v) => setDue(t, (v as string) || null)"
                      />
                      <UButton
                        v-if="t.due_date"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-x"
                        class="justify-center"
                        @click="setDue(t, null)"
                      >
                        Clear due date
                      </UButton>
                    </div>
                  </template>
                </UPopover>

                <!-- checklist expand toggle -->
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11.5px] text-muted transition-colors hover:text-highlighted"
                  :aria-label="expanded[t.id] ? 'Hide checklist' : 'Show checklist'"
                  @click="toggleExpand(t)"
                >
                  <UIcon name="i-lucide-list-checks" class="size-3.5" />
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-3.5 transition-transform"
                    :class="expanded[t.id] ? 'rotate-180' : ''"
                  />
                </button>

                <UDropdownMenu :items="taskMenu(t)">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Actions for ${t.title}`"
                  />
                </UDropdownMenu>
              </div>

              <!-- checklist panel -->
              <div
                v-if="expanded[t.id]"
                class="border-t border-default bg-muted/40 py-2.5 pl-11 pr-4"
              >
                <div
                  v-for="item in (checklist[t.id] ?? [])"
                  :key="item.id"
                  class="group/item flex items-center gap-2.5 py-1"
                >
                  <button
                    type="button"
                    class="flex size-4 flex-none items-center justify-center rounded-[5px] border transition-colors"
                    :class="item.done ? 'border-teal-500 bg-teal-500 text-white' : 'border-accented hover:border-primary'"
                    :aria-label="item.done ? 'Mark item not done' : 'Mark item done'"
                    @click="toggleItem(t.id, item)"
                  >
                    <UIcon
                      v-if="item.done"
                      name="i-lucide-check"
                      class="size-2.5"
                    />
                  </button>
                  <span
                    class="min-w-0 flex-1 text-[13px]"
                    :class="item.done ? 'text-muted line-through' : 'text-default'"
                  >{{ item.title }}</span>
                  <button
                    type="button"
                    class="flex-none text-muted opacity-0 transition-opacity hover:text-error group-hover/item:opacity-100"
                    aria-label="Remove item"
                    @click="removeChecklistItem(t.id, item)"
                  >
                    <UIcon name="i-lucide-x" class="size-3.5" />
                  </button>
                </div>
                <UInput
                  v-model="newItemTitle[t.id]"
                  placeholder="Add a checklist item…"
                  size="xs"
                  icon="i-lucide-plus"
                  class="mt-1 w-full"
                  :ui="{ base: 'rounded-full' }"
                  @keydown.enter="addChecklistItem(t.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- CONTRACTS -->
        <div
          v-else-if="activeTab === 'contracts'"
          class="flex flex-col gap-4"
        >
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              Contracts generated from this project's scope.
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
          <div
            v-if="!contracts.length"
            class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
          >
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
          <div
            v-else
            class="overflow-hidden rounded-card bg-default ring ring-default"
          >
            <NuxtLink
              v-for="d in contracts"
              :key="d.id"
              :to="`/contracts/${d.id}`"
              class="flex items-center gap-3 border-b border-default px-5 py-3.5 last:border-b-0 hover:bg-muted"
            >
              <UIcon
                name="i-lucide-file-text"
                class="size-4 flex-none text-muted"
              />
              <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-highlighted">{{ d.title }}</span>
              <span class="text-[13px] text-muted tabular-nums">{{ money(d.total) }}</span>
              <StatusChip :status="DOC_STATUS[d.status] || 'neutral'">{{ d.status }}</StatusChip>
              <span class="hidden text-[12.5px] text-muted tabular-nums sm:inline">{{ shortDate(d.created_at) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- PROPOSALS -->
        <div
          v-else-if="activeTab === 'proposals'"
          class="flex flex-col gap-4"
        >
          <div
            v-if="!proposals.length"
            class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
          >
            <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
              name="i-lucide-file-text"
              class="size-6"
            /></span>
            <h3 class="font-display text-lg font-medium text-highlighted">
              No Proposals
            </h3>
            <p class="mt-1.5 max-w-xs text-sm text-muted">
              Proposals linked to this project will appear here.
            </p>
          </div>
          <div
            v-else
            class="overflow-hidden rounded-card bg-default ring ring-default"
          >
            <NuxtLink
              v-for="d in proposals"
              :key="d.id"
              to="/agreements"
              class="flex items-center gap-3 border-b border-default px-5 py-3.5 last:border-b-0 hover:bg-muted"
            >
              <UIcon
                name="i-lucide-file-text"
                class="size-4 flex-none text-muted"
              />
              <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-highlighted">{{ d.title }}</span>
              <span class="text-[13px] text-muted tabular-nums">{{ money(d.total) }}</span>
              <StatusChip :status="DOC_STATUS[d.status] || 'neutral'">{{ d.status }}</StatusChip>
            </NuxtLink>
          </div>
        </div>

        <!-- ACTIVITY -->
        <div
          v-else
          class="rounded-card bg-default p-6 ring ring-default"
        >
          <div class="mb-4 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            Activity
          </div>
          <div class="flex flex-col gap-3 text-[13.5px] text-default">
            <div class="flex items-center gap-2.5">
              <span class="size-2 flex-none rounded-full bg-teal-500" />
              <span>Project <span class="font-semibold">{{ project.code }}</span> created for {{ clientLabel }}.</span>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="size-2 flex-none rounded-full bg-muted" />
              <span class="text-muted">Currently {{ STATUS_META[project.status].label.toLowerCase() }} · {{ project.task_done }}/{{ project.task_total }} tasks done.</span>
            </div>
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
