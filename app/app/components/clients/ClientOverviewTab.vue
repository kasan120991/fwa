<script setup lang="ts">
// Client detail › Overview — attention-first, one column. Leans on the parent's
// /summary payload for the attention strips; fetches only the two small
// client-scoped lists it renders (in-flight projects, latest activity). The
// counts live in the stat row above, so nothing here repeats them.
import { PROJECT_META, type ClientSummary, type PStatus } from '~/utils/clientDetail'

const props = defineProps<{
  clientId: number
  summary: ClientSummary | null
}>()

const emit = defineEmits<{ 'go': [tab: string], 'new-project': [] }>()

const api = useApi()

// ---- in-flight projects ----
interface ApiProject {
  id: number
  name: string
  status: PStatus
  target_launch_date: string | null
  task_total: number
  task_done: number
}
const projects = ref<ApiProject[]>([])
const inFlight = computed(() => projects.value
  .filter(p => p.status !== 'completed')
  .map((p) => {
    const meta = PROJECT_META[p.status]
    return {
      id: p.id,
      name: p.name,
      status: meta.status,
      statusLabel: meta.label,
      progress: p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0,
      bar: meta.bar,
      due: p.target_launch_date ? `Due ${shortDate(p.target_launch_date)}` : 'No target date',
      open: p.task_total - p.task_done
    }
  }))

async function loadProjects() {
  try {
    const { data } = await api<{ data: ApiProject[] }>('/projects', { query: { client_id: props.clientId } })
    projects.value = data
  } catch { /* non-fatal */ }
}

// ---- latest activity (capped preview; the full feed lives in Support & Calls) ----
interface ApiActivity { id: number, category: string, icon: string, title: string, meta: string | null, occurred_at: string }
const activity = ref<ApiActivity[]>([])
async function loadActivity() {
  try {
    const { data } = await api<{ data: { rows: ApiActivity[] } }>(`/clients/${props.clientId}/activity`, { query: { limit: 4 } })
    activity.value = data.rows
  } catch { /* non-fatal */ }
}

const socket = useSocket()
function onActivity(a: { client_id: number }) {
  if (a.client_id === props.clientId) loadActivity()
}
onMounted(() => {
  loadProjects()
  loadActivity()
  socket.on('client-activity:new', onActivity)
  socket.on('project:created', loadProjects)
  socket.on('project:updated', loadProjects)
})
onBeforeUnmount(() => {
  socket.off('client-activity:new', onActivity)
  socket.off('project:created', loadProjects)
  socket.off('project:updated', loadProjects)
})

const overdue = computed(() => props.summary?.overdue_invoice ?? null)
const attentionTicket = computed(() => props.summary?.attention_ticket ?? null)

const CATEGORY_TONE: Record<string, string> = {
  payment: 'bg-success/10 text-success',
  invoice: 'bg-warning/10 text-warning',
  agreement: 'bg-mist text-primary',
  call: 'bg-mist text-primary',
  portal: 'bg-muted text-muted'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- attention strips -->
    <div
      v-if="overdue"
      class="flex items-center gap-3 rounded-card border-l-[3px] border-error bg-default px-4 py-3.5 pl-5 ring ring-default"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="size-4 flex-none text-error"
      />
      <span class="min-w-0 text-[13.5px] text-default">
        <span class="font-semibold text-highlighted">{{ overdue.number || 'An invoice' }} is {{ overdue.days_overdue }} {{ overdue.days_overdue === 1 ? 'day' : 'days' }} overdue</span>
        — {{ formatMoney(overdue.amount_due - overdue.amount_paid) }} outstanding since {{ shortDate(overdue.due_date) }}.
      </span>
      <button
        class="ml-auto whitespace-nowrap text-[13px] font-semibold text-primary"
        @click="emit('go', 'money')"
      >
        Open Invoice →
      </button>
    </div>
    <div
      v-if="attentionTicket"
      class="flex items-center gap-3 rounded-card border-l-[3px] border-warning bg-default px-4 py-3.5 pl-5 ring ring-default"
    >
      <UIcon
        name="i-lucide-clock"
        class="size-4 flex-none text-warning"
      />
      <span class="min-w-0 truncate text-[13.5px] text-default">
        <span class="font-semibold text-highlighted">{{ ticketCode(attentionTicket.id) }} waiting since {{ shortDate(attentionTicket.created_at) }}</span>
        — {{ attentionTicket.subject }}<template v-if="attentionTicket.priority === 'high'">, high priority</template>.
      </span>
      <button
        class="ml-auto whitespace-nowrap text-[13px] font-semibold text-primary"
        @click="emit('go', 'comms')"
      >
        View Ticket →
      </button>
    </div>

    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div class="flex items-center justify-between px-6 py-5">
        <span class="text-[15px] font-semibold text-highlighted">In-Flight Work</span>
        <button
          class="text-[13px] font-semibold text-primary"
          @click="emit('go', 'work')"
        >
          Projects &amp; Sites →
        </button>
      </div>
      <div
        v-for="p in inFlight"
        :key="p.id"
        class="flex cursor-pointer items-center gap-3 border-t border-default px-6 py-3.5 transition-colors hover:bg-muted"
        @click="navigateTo(`/projects/${p.id}`)"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold text-highlighted">
            {{ p.name }}
          </div>
          <div class="mt-1 text-[12.5px] text-muted">
            {{ p.due }} · {{ p.open }} {{ p.open === 1 ? 'task' : 'tasks' }} open
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-[5px] w-[86px] overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full"
              :class="p.bar"
              :style="{ width: p.progress + '%' }"
            />
          </div>
          <span class="w-8 text-right text-xs text-muted tabular-nums">{{ p.progress }}%</span>
        </div>
        <StatusChip :status="p.status">
          {{ p.statusLabel }}
        </StatusChip>
      </div>
      <div
        v-if="!inFlight.length"
        class="flex flex-col items-center border-t border-default px-6 py-8 text-center"
      >
        <p class="text-sm text-muted">
          No active projects right now.
        </p>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4"
          icon="i-lucide-plus"
          @click="emit('new-project')"
        >
          New Project
        </UButton>
      </div>
    </div>

    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div class="flex items-center justify-between px-6 py-5">
        <span class="text-[15px] font-semibold text-highlighted">Latest Activity</span>
        <button
          class="text-[13px] font-semibold text-primary"
          @click="emit('go', 'comms')"
        >
          Full Timeline →
        </button>
      </div>
      <div
        v-for="a in activity"
        :key="a.id"
        class="flex items-start gap-3 border-t border-default px-6 py-3.5"
      >
        <span
          class="mt-0.5 inline-flex size-[30px] flex-none items-center justify-center rounded-btn"
          :class="CATEGORY_TONE[a.category] ?? 'bg-muted text-muted'"
        >
          <UIcon
            :name="a.icon"
            class="size-[15px]"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13.5px] font-semibold text-highlighted">
            {{ a.title }}
          </div>
          <div
            v-if="a.meta"
            class="mt-0.5 truncate text-[12.5px] text-muted"
          >
            {{ a.meta }}
          </div>
        </div>
        <span class="whitespace-nowrap pt-0.5 text-xs text-muted tabular-nums">{{ shortDate(a.occurred_at) }}</span>
      </div>
      <div
        v-if="!activity.length"
        class="border-t border-default px-6 py-6 text-center text-[13px] text-muted"
      >
        No activity yet — events land here as they happen.
      </div>
    </div>
  </div>
</template>
