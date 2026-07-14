<script setup lang="ts">
// Client detail › Overview — attention-first summary. Leans on the parent's
// /summary payload for counts + attention strips; fetches only the small
// client-scoped extras it renders (in-flight projects, latest activity, hosting).
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

// ---- hosting margin ----
interface Hosting { configured: boolean, monthly_cost?: number, droplet_count?: number, mrr?: number, margin?: number, margin_pct?: number | null, error?: string }
const hosting = ref<Hosting | null>(null)
async function loadHosting() {
  try {
    const { data } = await api<{ data: Hosting }>(`/clients/${props.clientId}/hosting`)
    hosting.value = data
  } catch { /* non-fatal */ }
}

const socket = useSocket()
function onActivity(a: { client_id: number }) {
  if (a.client_id === props.clientId) loadActivity()
}
onMounted(() => {
  loadProjects()
  loadActivity()
  loadHosting()
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
      class="flex items-center gap-3 rounded-[12px] border-l-[3px] border-error bg-default p-3.5 pl-4 ring ring-default"
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
      class="flex items-center gap-3 rounded-[12px] border-l-[3px] border-warning bg-default p-3.5 pl-4 ring ring-default"
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

    <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
      <!-- left: in-flight work + latest activity -->
      <div class="flex min-w-0 flex-col gap-4">
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between px-[18px] py-4">
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
            class="flex cursor-pointer items-center gap-3 border-t border-default px-[18px] py-3 transition-colors hover:bg-muted"
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
            class="flex flex-col items-center border-t border-default px-[18px] py-8 text-center"
          >
            <p class="text-sm text-muted">
              No active projects right now.
            </p>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              class="mt-4 rounded-full"
              icon="i-lucide-plus"
              @click="emit('new-project')"
            >
              New Project
            </UButton>
          </div>
        </div>

        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex items-center justify-between px-[18px] py-4">
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
            class="flex items-start gap-3 border-t border-default px-[18px] py-3"
          >
            <span
              class="mt-0.5 inline-flex size-[30px] flex-none items-center justify-center rounded-[9px]"
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
            class="border-t border-default px-[18px] py-6 text-center text-[13px] text-muted"
          >
            No activity yet — events land here as they happen.
          </div>
        </div>
      </div>

      <!-- right: snapshots -->
      <div class="flex min-w-0 flex-col gap-4">
        <div class="rounded-card bg-default p-[18px] ring ring-default">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-[15px] font-semibold text-highlighted">Billing Snapshot</span>
            <button
              class="text-[13px] font-semibold text-primary"
              @click="emit('go', 'money')"
            >
              Sales &amp; Billing →
            </button>
          </div>
          <div class="flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Outstanding</span>
            <span
              class="font-bold tabular-nums"
              :class="(summary?.outstanding ?? 0) > 0 ? 'text-error' : 'text-highlighted'"
            >{{ formatMoney(summary?.outstanding ?? 0) }}</span>
          </div>
          <div class="mt-2 flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Open Invoices</span>
            <span class="tabular-nums text-default">{{ summary?.invoices_open ?? 0 }}</span>
          </div>
          <div class="mt-2 flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Total Billed</span>
            <span class="tabular-nums text-default">{{ formatMoney(summary?.total_billed ?? 0) }}</span>
          </div>
          <template v-if="hosting?.configured && !hosting.error">
            <div class="my-3 border-t border-default" />
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-muted">Hosting Margin · Monthly</span>
              <span
                class="text-[14px] font-bold tabular-nums"
                :class="(hosting.margin ?? 0) >= 0 ? 'text-success' : 'text-error'"
              >{{ (hosting.margin ?? 0) >= 0 ? '+' : '' }}{{ formatMoney(hosting.margin ?? 0) }}<span
                v-if="hosting.margin_pct != null"
                class="ml-1 text-[12px] font-semibold text-muted"
              >({{ hosting.margin_pct }}%)</span></span>
            </div>
          </template>
        </div>

        <div class="rounded-card bg-default p-[18px] ring ring-default">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-[15px] font-semibold text-highlighted">Websites</span>
            <button
              class="text-[13px] font-semibold text-primary"
              @click="emit('go', 'work')"
            >
              Manage →
            </button>
          </div>
          <div class="flex items-center justify-between text-[13.5px]">
            <span class="text-default">{{ summary?.websites_total ?? 0 }} {{ (summary?.websites_total ?? 0) === 1 ? 'site' : 'sites' }}</span>
            <span
              v-if="summary?.websites_live"
              class="inline-flex items-center gap-1.5 font-semibold text-success"
            ><span class="size-[7px] rounded-full bg-success" />{{ summary.websites_live }} live</span>
          </div>
        </div>

        <div class="rounded-card bg-default p-[18px] ring ring-default">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-[15px] font-semibold text-highlighted">Support Snapshot</span>
            <button
              class="text-[13px] font-semibold text-primary"
              @click="emit('go', 'comms')"
            >
              Support &amp; Calls →
            </button>
          </div>
          <div class="flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Open Tickets</span>
            <span class="tabular-nums text-default">{{ summary?.tickets_open ?? 0 }} of {{ summary?.tickets_total ?? 0 }}</span>
          </div>
          <div class="mt-2 flex items-center justify-between text-[13.5px]">
            <span class="text-muted">Calls Logged</span>
            <span class="tabular-nums text-default">{{ summary?.calls_total ?? 0 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
