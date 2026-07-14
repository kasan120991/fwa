<script setup lang="ts">
// Client detail › Support & Calls — the real activity timeline (paginated),
// support tickets with a status filter, and the client's call log.
import type { ChipStatus } from '~/utils/clientDetail'

const props = defineProps<{ clientId: number }>()
const emit = defineEmits<{ 'new-ticket': [] }>()

const api = useApi()

// ---- activity timeline (paginated) ----
interface ApiActivity {
  id: number
  client_id: number
  category: string
  icon: string
  title: string
  meta: string | null
  link: string | null
  occurred_at: string
}
const PAGE = 15
const activity = ref<ApiActivity[]>([])
const activityTotal = ref(0)
const activityPending = ref(true)
const loadingMore = ref(false)
const hasMore = computed(() => activity.value.length < activityTotal.value)

async function loadActivity(reset = true) {
  try {
    const offset = reset ? 0 : activity.value.length
    const { data } = await api<{ data: { rows: ApiActivity[], total: number } }>(
      `/clients/${props.clientId}/activity`, { query: { limit: PAGE, offset } }
    )
    activity.value = reset ? data.rows : [...activity.value, ...data.rows]
    activityTotal.value = data.total
  } catch { /* non-fatal */ } finally {
    activityPending.value = false
  }
}
async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  await loadActivity(false)
  loadingMore.value = false
}

const CATEGORY_TONE: Record<string, string> = {
  payment: 'bg-success/10 text-success',
  invoice: 'bg-warning/10 text-warning',
  agreement: 'bg-mist text-primary',
  call: 'bg-mist text-primary',
  website: 'bg-mist text-primary',
  portal: 'bg-muted text-muted'
}

// ---- tickets ----
interface ApiTicket { id: number, subject: string, status: string, priority: string, created_at: string, last_activity_at: string }
const TICKET_CHIP: Record<string, ChipStatus> = { open: 'info', in_progress: 'info', waiting: 'warning', resolved: 'success', closed: 'neutral' }
const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In Progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' }
const PRIO_CLASS: Record<string, string> = { high: 'bg-error', medium: 'bg-warning', low: 'bg-ink-400' }

const ticketsRaw = ref<ApiTicket[]>([])
async function loadTickets() {
  try {
    const { data } = await api<{ data: ApiTicket[] }>('/tickets', { query: { client_id: props.clientId } })
    ticketsRaw.value = data
  } catch { /* non-fatal */ }
}
const tickets = computed(() => ticketsRaw.value.map(t => ({
  id: t.id,
  code: ticketCode(t.id),
  subject: t.subject,
  status: TICKET_CHIP[t.status] ?? 'neutral',
  statusLabel: TICKET_STATUS_LABEL[t.status] ?? t.status,
  prio: t.priority,
  created: shortDate(t.created_at),
  updated: timeAgo(t.last_activity_at),
  open: t.status !== 'resolved' && t.status !== 'closed'
})))
const openTicketCount = computed(() => tickets.value.filter(t => t.open).length)

const ticketFilter = ref<'all' | 'open' | 'done'>('all')
const ticketFilters = computed(() => [
  { key: 'all' as const, label: 'All', count: tickets.value.length },
  { key: 'open' as const, label: 'Open', count: openTicketCount.value },
  { key: 'done' as const, label: 'Resolved', count: tickets.value.length - openTicketCount.value }
])
const visibleTickets = computed(() => tickets.value.filter((t) => {
  if (ticketFilter.value === 'all') return true
  return ticketFilter.value === 'open' ? t.open : !t.open
}))

// ---- calls ----
type CallClass = 'inquiry' | 'client' | 'spam' | 'wrong_number' | 'other'
interface ApiCall {
  id: number
  classification: CallClass
  caller_number: string
  caller_name: string | null
  summary: string | null
  duration_seconds: number | null
  recording_url: string | null
  occurred_at: string
}
const CALL_LABEL: Record<CallClass, string> = { inquiry: 'Inquiry', client: 'Client', spam: 'Spam', wrong_number: 'Wrong Number', other: 'Other' }
const CALL_CHIP: Record<CallClass, ChipStatus> = { inquiry: 'info', client: 'success', spam: 'error', wrong_number: 'neutral', other: 'neutral' }
const callsRaw = ref<ApiCall[]>([])
async function loadCalls() {
  try {
    const { data } = await api<{ data: ApiCall[] }>('/calls', { query: { client_id: props.clientId } })
    callsRaw.value = data
  } catch { /* non-fatal */ }
}
const calls = computed(() => callsRaw.value.map(c => ({
  id: c.id,
  who: c.caller_name || formatPhone(c.caller_number),
  summary: c.summary || 'No summary captured.',
  status: CALL_CHIP[c.classification] ?? 'neutral',
  statusLabel: CALL_LABEL[c.classification] ?? c.classification,
  when: shortDate(c.occurred_at),
  ago: timeAgo(c.occurred_at),
  duration: c.duration_seconds ? durationMMSS(c.duration_seconds) : '—',
  hasRecording: !!c.recording_url
})))

const NuxtLinkComp = resolveComponent('NuxtLink')

const socket = useSocket()
function onActivity(a: { client_id: number }) {
  if (a.client_id === props.clientId) loadActivity()
}
onMounted(() => {
  loadActivity()
  loadTickets()
  loadCalls()
  socket.on('client-activity:new', onActivity)
  socket.on('ticket:created', loadTickets)
  socket.on('ticket:updated', loadTickets)
  socket.on('ticket:deleted', loadTickets)
  socket.on('call:new', loadCalls)
  socket.on('call:changed', loadCalls)
})
onBeforeUnmount(() => {
  socket.off('client-activity:new', onActivity)
  socket.off('ticket:created', loadTickets)
  socket.off('ticket:updated', loadTickets)
  socket.off('ticket:deleted', loadTickets)
  socket.off('call:new', loadCalls)
  socket.off('call:changed', loadCalls)
})
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
    <!-- activity timeline -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div class="flex items-center justify-between px-[18px] py-4">
        <span class="text-[15px] font-semibold text-highlighted">Activity</span>
        <span class="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">All Events</span>
      </div>
      <div
        v-if="activityPending"
        class="border-t border-default px-4 py-10 text-center text-sm text-muted"
      >
        Loading activity…
      </div>
      <div
        v-else-if="!activity.length"
        class="border-t border-default px-4 py-10 text-center text-sm text-muted"
      >
        No activity yet — invoices, payments, tickets, and calls land here as they happen.
      </div>
      <template v-else>
        <div class="border-t border-default px-[18px] py-2">
          <div
            v-for="(a, i) in activity"
            :key="a.id"
            class="relative flex gap-3 py-2.5"
          >
            <div class="flex flex-none flex-col items-center">
              <span
                class="inline-flex size-[30px] flex-none items-center justify-center rounded-[9px]"
                :class="CATEGORY_TONE[a.category] ?? 'bg-muted text-muted'"
              >
                <UIcon
                  :name="a.icon"
                  class="size-[15px]"
                />
              </span>
              <span
                v-if="i < activity.length - 1"
                class="mt-1.5 w-px flex-1 bg-muted"
              />
            </div>
            <component
              :is="a.link ? NuxtLinkComp : 'div'"
              :to="a.link || undefined"
              class="min-w-0 flex-1 pt-1"
              :class="a.link ? 'group cursor-pointer' : ''"
            >
              <div
                class="text-[13.5px] font-semibold leading-snug text-highlighted"
                :class="a.link ? 'group-hover:text-primary' : ''"
              >
                {{ a.title }}
              </div>
              <div
                v-if="a.meta"
                class="mt-0.5 truncate text-[12.5px] text-muted"
              >
                {{ a.meta }}
              </div>
            </component>
            <span class="whitespace-nowrap pt-1 text-[12px] text-muted tabular-nums">{{ shortDate(a.occurred_at) }}</span>
          </div>
        </div>
        <div
          v-if="hasMore"
          class="border-t border-default p-3"
        >
          <UButton
            block
            color="neutral"
            variant="outline"
            size="sm"
            class="rounded-full"
            :loading="loadingMore"
            @click="loadMore"
          >
            Load More
          </UButton>
        </div>
      </template>
    </div>

    <!-- right: tickets + calls -->
    <div class="flex min-w-0 flex-col gap-4">
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5">
          <span class="text-[15px] font-semibold text-highlighted">Tickets</span>
          <div class="flex items-center gap-2.5">
            <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
              <button
                v-for="f in ticketFilters"
                :key="f.key"
                class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] transition-colors"
                :class="ticketFilter === f.key ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
                @click="ticketFilter = f.key"
              >
                {{ f.label }}
                <span
                  class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
                  :class="ticketFilter === f.key ? 'bg-mist text-primary' : 'bg-elevated text-muted'"
                >{{ f.count }}</span>
              </button>
            </div>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="xs"
              aria-label="New Ticket"
              @click="emit('new-ticket')"
            />
          </div>
        </div>
        <NuxtLink
          v-for="t in visibleTickets"
          :key="t.id"
          :to="`/support/${t.id}`"
          class="flex items-center gap-3 border-t border-default px-[18px] py-3 transition-colors hover:bg-muted"
        >
          <span
            class="size-[9px] flex-none rounded-full"
            :class="PRIO_CLASS[t.prio] ?? 'bg-ink-400'"
            :title="`${t.prio} priority`"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13.5px] font-semibold text-highlighted">
              {{ t.subject }}
            </div>
            <div class="mt-0.5 text-xs text-muted tabular-nums">
              {{ t.code }} · opened {{ t.created }} · {{ t.updated }}
            </div>
          </div>
          <StatusChip :status="t.status">
            {{ t.statusLabel }}
          </StatusChip>
        </NuxtLink>
        <div
          v-if="!visibleTickets.length"
          class="border-t border-default px-[18px] py-8 text-center text-[13px] text-muted"
        >
          {{ tickets.length ? 'No tickets in this view.' : 'No tickets yet for this client.' }}
        </div>
      </div>

      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between px-[18px] py-4">
          <span class="text-[15px] font-semibold text-highlighted">Calls <span class="ml-1 text-[12.5px] font-normal text-muted">{{ calls.length }} logged</span></span>
          <NuxtLink
            to="/receptionist"
            class="text-[13px] font-semibold text-primary"
          >
            Receptionist →
          </NuxtLink>
        </div>
        <div
          v-for="c in calls"
          :key="c.id"
          class="flex gap-3.5 border-t border-default px-[18px] py-3.5"
        >
          <span class="inline-flex size-[34px] flex-none items-center justify-center rounded-full bg-mist text-primary">
            <UIcon
              name="i-lucide-phone"
              class="size-[15px]"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <span class="truncate text-sm font-semibold text-highlighted">{{ c.who }}</span>
              <span class="flex-none whitespace-nowrap text-xs text-muted tabular-nums">{{ c.ago }}</span>
            </div>
            <p class="mt-1 line-clamp-2 text-[13px] leading-snug text-default">
              {{ c.summary }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2.5">
              <StatusChip :status="c.status">
                {{ c.statusLabel }}
              </StatusChip>
              <span class="inline-flex items-center gap-1 text-xs text-muted tabular-nums"><UIcon
                name="i-lucide-clock"
                class="size-3"
              />{{ c.duration }}</span>
              <span class="text-xs text-muted tabular-nums">{{ c.when }}</span>
              <UIcon
                v-if="c.hasRecording"
                name="i-lucide-mic"
                class="size-[13px] text-muted"
              />
            </div>
          </div>
        </div>
        <div
          v-if="!calls.length"
          class="border-t border-default px-[18px] py-8 text-center text-[13px] text-muted"
        >
          No calls logged for this client yet.
        </div>
      </div>
    </div>
  </div>
</template>
