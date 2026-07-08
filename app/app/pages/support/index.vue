<script setup lang="ts">
useHead({ title: 'Support Tickets · Francis Web Agency' })

// Support tickets — every ticket across all clients. Each belongs to a client
// (optionally a specific website) and carries a reply thread + attachments.
// Backed by the /tickets API.
type Status = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
type Priority = 'low' | 'medium' | 'high'

interface ApiTicket {
  id: number
  client_id: number
  website_id: number | null
  subject: string
  description: string | null
  type: string
  status: Status
  priority: Priority
  last_activity_at: string
  client_name: string | null
  client_company: string | null
  website_name: string | null
  website_domain: string | null
  message_count: number
  attachment_count: number
}

const STATUS_ORDER: Status[] = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const STATUS: Record<Status, { label: string, chip: 'info' | 'warning' | 'success' | 'neutral' }> = {
  open: { label: 'Open', chip: 'info' },
  in_progress: { label: 'In Progress', chip: 'info' },
  waiting: { label: 'Waiting', chip: 'warning' },
  resolved: { label: 'Resolved', chip: 'success' },
  closed: { label: 'Closed', chip: 'neutral' }
}
const PRIO: Record<Priority, { label: string, dot: string }> = {
  high: { label: 'High', dot: 'bg-error' },
  medium: { label: 'Medium', dot: 'bg-warning' },
  low: { label: 'Low', dot: 'bg-ink-400' }
}
const TYPE_LABEL: Record<string, string> = {
  update: 'Site Update', issue: 'Site Issue', bug: 'Bug', question: 'Question', other: 'Other'
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-teal-700', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']

const api = useApi()
const socket = useSocket()
const toast = useToast()

const tickets = ref<ApiTicket[]>([])
const pending = ref(true)

async function load() {
  try {
    const { data } = await api<{ data: ApiTicket[] }>('/tickets')
    tickets.value = data
  } catch {
    toast.add({ title: 'Could not load tickets', color: 'error' })
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  load()
  socket.on('ticket:created', load)
  socket.on('ticket:updated', load)
  socket.on('ticket:deleted', load)
})
onBeforeUnmount(() => {
  socket.off('ticket:created', load)
  socket.off('ticket:updated', load)
  socket.off('ticket:deleted', load)
})

// ---- create form ----
const formOpen = ref(false)
function openNew() {
  formOpen.value = true
}

// ---- filters ----
const statusTab = ref<Status | 'all' | 'active'>('active')
const search = ref('')

const counts = computed<Record<string, number>>(() => {
  const c: Record<string, number> = {
    all: tickets.value.length,
    active: tickets.value.filter(t => t.status !== 'resolved' && t.status !== 'closed').length
  }
  for (const k of STATUS_ORDER) c[k] = tickets.value.filter(t => t.status === k).length
  return c
})
const statusTabs = computed(() => [
  { key: 'active' as const, label: 'Active', count: counts.value.active },
  { key: 'all' as const, label: 'All', count: counts.value.all },
  ...STATUS_ORDER.map(k => ({ key: k, label: STATUS[k].label, count: counts.value[k] }))
])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return tickets.value.filter((t) => {
    if (statusTab.value === 'active' && (t.status === 'resolved' || t.status === 'closed')) return false
    else if (statusTab.value !== 'all' && statusTab.value !== 'active' && t.status !== statusTab.value) return false
    const client = t.client_company || t.client_name || ''
    if (q && !`${ticketCode(t.id)} ${t.subject} ${client}`.toLowerCase().includes(q)) return false
    return true
  })
})

const clientLabel = (t: ApiTicket) => t.client_company || t.client_name || 'Unknown'
const siteLabel = (t: ApiTicket) => t.website_name || t.website_domain || ''
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Support Tickets
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-teal-700 tabular-nums">{{ tickets.length }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Requests across every client — site updates, issues, and bugs. Each has a reply thread and attachments.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        class="flex-none"
        @click="openNew"
      >
        New Ticket
      </UButton>
    </div>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
          :class="statusTab === t.key ? 'border-teal-600 bg-mist font-semibold text-teal-700' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
          @click="statusTab = t.key"
        >
          {{ t.label }}
          <span
            class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="statusTab === t.key ? 'bg-default text-teal-700' : 'bg-muted text-muted'"
          >{{ t.count }}</span>
        </button>
      </div>

      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search subject or client…"
        class="w-[240px]"
        :ui="{ base: 'rounded-full' }"
      />
    </div>

    <!-- table -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <template v-if="filtered.length > 0">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Ticket
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Priority
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Status
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                  Activity
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in filtered"
                :key="t.id"
                class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
                @click="navigateTo(`/support/${t.id}`)"
              >
                <td class="px-4 py-3.5">
                  <div class="whitespace-nowrap text-sm font-semibold text-highlighted">
                    {{ t.subject }}
                  </div>
                  <div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] tracking-[0.03em] text-muted">
                    <span>{{ ticketCode(t.id) }}</span>
                    <span>· {{ TYPE_LABEL[t.type] || t.type }}</span>
                    <span
                      v-if="siteLabel(t)"
                      class="inline-flex items-center gap-1 normal-case"
                    >· <UIcon
                      name="i-lucide-globe"
                      class="size-3"
                    />{{ siteLabel(t) }}</span>
                    <span
                      v-if="t.attachment_count"
                      class="inline-flex items-center gap-0.5"
                    >· <UIcon
                      name="i-lucide-paperclip"
                      class="size-3"
                    />{{ t.attachment_count }}</span>
                  </div>
                </td>
                <td
                  class="px-4 py-3.5"
                  @click.stop
                >
                  <NuxtLink
                    :to="`/clients/${t.client_id}`"
                    class="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
                  >
                    <span
                      class="inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold"
                      :class="AVATAR[t.client_id % AVATAR.length]"
                    >{{ initials(clientLabel(t)) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ clientLabel(t) }}</span>
                  </NuxtLink>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                  <span class="inline-flex items-center gap-1.5 text-[13.5px] text-default">
                    <span
                      class="size-1.5 rounded-full"
                      :class="PRIO[t.priority].dot"
                    />{{ PRIO[t.priority].label }}
                  </span>
                </td>
                <td class="px-4 py-3.5">
                  <StatusChip :status="STATUS[t.status].chip">
                    {{ STATUS[t.status].label }}
                  </StatusChip>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 text-[13.5px] text-muted tabular-nums lg:table-cell">
                  {{ timeAgo(t.last_activity_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">Showing {{ filtered.length }} of {{ tickets.length }} tickets</span>
        </div>
      </template>

      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-life-buoy"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          {{ tickets.length ? 'No tickets match' : 'No tickets yet' }}
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          {{ tickets.length ? 'Try a different search or status filter.' : 'Open a ticket to track a client request, site issue, or bug.' }}
        </p>
        <UButton
          v-if="!tickets.length"
          icon="i-lucide-plus"
          color="primary"
          class="mt-5 rounded-full"
          @click="openNew"
        >
          New Ticket
        </UButton>
      </div>
    </div>

    <TicketForm
      v-model:open="formOpen"
      mode="create"
      @saved="load"
    />
  </div>
</template>
