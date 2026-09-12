<script setup lang="ts">
// Proposals — the top of the sales flow and the home of the Statement of Work.
//
// A proposal carries the scope and the price; accepting it is what generates the
// contract, and the project only appears much later, when the deposit is paid.
// So the actions here are the ones that move a deal: send the link, or record
// the yes you just got on the phone.

const api = useApi()
const toast = useToast()

type Status = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'voided'

interface Proposal {
  id: number
  code: string | null
  client_id: number
  client_name?: string | null
  client_company?: string | null
  project_id: number | null
  title: string
  status: Status
  total: number
  project_fee: number | null
  deposit_pct: number
  target_launch_date: string | null
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  accept_source: 'client' | 'admin' | null
  created_at: string
}

const STATUS_META: Record<Status, { label: string, status: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  sent: { label: 'Sent', status: 'info' },
  viewed: { label: 'Viewed', status: 'info' },
  accepted: { label: 'Accepted', status: 'success' },
  declined: { label: 'Declined', status: 'error' },
  expired: { label: 'Expired', status: 'warning' },
  voided: { label: 'Voided', status: 'neutral' }
}
// Live deals first, then the decided ones — the list is a worklist, not an archive.
const STATUS_RANK: Record<Status, number> = {
  sent: 0, viewed: 0, draft: 1, accepted: 2, declined: 3, expired: 3, voided: 4
}

const rows = ref<Proposal[]>([])
const pending = ref(true)

async function load() {
  const { data } = await api<{ data: Proposal[] }>('/proposals?limit=200')
  rows.value = data
  pending.value = false
}
onMounted(load)

const socket = useSocket()
onMounted(() => socket.on('proposal:changed', load))
onBeforeUnmount(() => socket.off('proposal:changed', load))

/* ---------------------------------------------------------------- filtering */

type Tab = 'open' | 'accepted' | 'closed' | 'all'
const tab = ref<Tab>('open')
const IN_FLIGHT = new Set<Status>(['draft', 'sent', 'viewed'])
const CLOSED = new Set<Status>(['declined', 'expired', 'voided'])

const counts = computed(() => ({
  open: rows.value.filter(r => IN_FLIGHT.has(r.status)).length,
  accepted: rows.value.filter(r => r.status === 'accepted').length,
  closed: rows.value.filter(r => CLOSED.has(r.status)).length,
  all: rows.value.length
}))
const tabs = computed(() => [
  { key: 'open' as const, label: 'In Flight', count: counts.value.open },
  { key: 'accepted' as const, label: 'Accepted', count: counts.value.accepted },
  { key: 'closed' as const, label: 'Closed', count: counts.value.closed },
  { key: 'all' as const, label: 'All', count: counts.value.all }
])

const filtered = computed(() => {
  const list = rows.value.filter((r) => {
    if (tab.value === 'open') return IN_FLIGHT.has(r.status)
    if (tab.value === 'accepted') return r.status === 'accepted'
    if (tab.value === 'closed') return CLOSED.has(r.status)
    return true
  })
  return [...list].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.id - a.id)
})

const awaiting = computed(() => rows.value.filter(r => r.status === 'sent' || r.status === 'viewed'))
const inFlightValue = computed(() => awaiting.value.reduce((sum, r) => sum + Number(r.total || 0), 0))

const tiles = computed(() => [
  { key: 'awaiting', label: 'Awaiting Response', value: String(awaiting.value.length), sub: 'sent, not decided', icon: 'i-lucide-clock', apply: () => { tab.value = 'open' } },
  { key: 'value', label: 'Value In Flight', value: formatMoney(inFlightValue.value), sub: 'awaiting a decision', icon: 'i-lucide-circle-dollar-sign', apply: () => { tab.value = 'open' } },
  { key: 'accepted', label: 'Accepted', value: String(counts.value.accepted), sub: 'contract generated', icon: 'i-lucide-file-check', apply: () => { tab.value = 'accepted' } }
])

/* ------------------------------------------------------------------ actions */

// The editor is a full page (/proposals/new, /proposals/:id) — the SOW's six
// paragraph fields never fit in a modal.
function openNew() {
  navigateTo('/proposals/new')
}
function openEdit(p: Proposal) {
  navigateTo(`/proposals/${p.id}`)
}

const busy = ref<number | null>(null)

async function send(p: Proposal) {
  busy.value = p.id
  try {
    const res = await api<{ data: Proposal, url: string, emailed: boolean }>(`/proposals/${p.id}/send`, { method: 'POST' })
    await navigator.clipboard?.writeText(res.url).catch(() => {})
    toast.add({
      title: res.emailed ? 'Proposal sent' : 'Link ready',
      // Sending is optional, so say plainly what happened rather than implying
      // an email went out when Resend is unconfigured or the send failed.
      description: res.emailed ? 'Emailed, and the link is on your clipboard.' : 'No email went out — the link is on your clipboard.',
      color: res.emailed ? 'success' : 'warning'
    })
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'Could not send', description: errText(err), color: 'error' })
  } finally { busy.value = null }
}

async function accept(p: Proposal) {
  busy.value = p.id
  try {
    await api(`/proposals/${p.id}/accept`, { method: 'POST' })
    toast.add({ title: 'Accepted', description: 'The agreement is being generated.', color: 'success' })
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'Could not accept', description: errText(err), color: 'error' })
  } finally { busy.value = null }
}

async function decline(p: Proposal) {
  busy.value = p.id
  try {
    await api(`/proposals/${p.id}/decline`, { method: 'POST' })
    toast.add({ title: 'Marked declined', color: 'neutral' })
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'Could not decline', description: errText(err), color: 'error' })
  } finally { busy.value = null }
}

async function remove(p: Proposal) {
  try {
    await api(`/proposals/${p.id}`, { method: 'DELETE' })
    toast.add({ title: 'Proposal deleted', color: 'neutral' })
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'Could not delete', description: errText(err), color: 'error' })
  }
}

function errText(err: unknown) {
  return (err as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Something went wrong.'
}

function menu(p: Proposal) {
  const decided = p.status === 'accepted' || p.status === 'declined'
  return [
    [
      { label: 'Edit Scope', icon: 'i-lucide-pencil', onSelect: () => openEdit(p) },
      ...(decided
        ? []
        : [{
            label: p.status === 'draft' ? 'Send' : 'Re-send Link',
            icon: 'i-lucide-send',
            onSelect: () => send(p)
          }])
    ],
    // The phone case: they said yes, so record it. Same code path the public
    // page uses, so nothing about the outcome can differ.
    ...(decided
      ? []
      : [[
          { label: 'Mark Accepted', icon: 'i-lucide-check', onSelect: () => accept(p) },
          { label: 'Mark Declined', icon: 'i-lucide-x', onSelect: () => decline(p) }
        ]]),
    ...(p.project_id
      ? [[{ label: 'Open Project', icon: 'i-lucide-folder-open', to: `/projects/${p.project_id}` }]]
      : []),
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(p) }]
  ]
}

const clientName = (p: Proposal) => p.client_company || p.client_name || '—'
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      icon="i-lucide-file-text"
      title="Proposals"
      :count="counts.all"
      subtitle="Scope and price, sent for a yes. Accepting one generates the agreement."
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openNew"
        >
          New Proposal
        </UButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border border-default bg-default p-4 text-left transition-colors hover:border-accented"
        @click="t.apply"
      >
        <div class="flex items-center justify-between gap-2.5">
          <span class="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{{ t.label }}</span>
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-mist text-primary"><UIcon
            :name="t.icon"
            class="size-[15px]"
          /></span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="font-display text-[27px] font-semibold leading-none tracking-tight text-highlighted tabular-nums">{{ t.value }}</span>
          <span class="text-[12.5px] text-muted">{{ t.sub }}</span>
        </div>
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors"
        :class="tab === t.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span
          class="rounded-chip px-1.5 text-[11px] font-semibold tabular-nums"
          :class="tab === t.key ? 'bg-default text-primary' : 'bg-muted text-muted'"
        >{{ t.count }}</span>
      </button>
    </div>

    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div
        v-if="pending"
        class="px-6 py-16 text-center text-sm text-muted"
      >
        Loading proposals…
      </div>
      <div
        v-else-if="filtered.length === 0"
        class="px-6 py-16 text-center"
      >
        <p class="text-sm text-muted">
          {{ tab === 'all' ? 'No proposals yet.' : 'Nothing here.' }}
        </p>
        <UButton
          v-if="tab === 'all'"
          class="mt-4"
          icon="i-lucide-plus"
          color="primary"
          variant="soft"
          @click="openNew"
        >
          Write your first proposal
        </UButton>
      </div>
      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-default">
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Proposal
              </th>
              <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted md:table-cell">
                Client
              </th>
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Status
              </th>
              <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Value
              </th>
              <th class="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in filtered"
              :key="p.id"
              class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              @click="openEdit(p)"
            >
              <td class="px-4 py-3.5">
                <div class="text-sm font-semibold text-highlighted">
                  {{ p.title }}
                </div>
                <div class="text-[12.5px] text-muted tabular-nums">
                  {{ p.code || '—' }}
                </div>
              </td>
              <td class="hidden px-4 py-3.5 text-sm text-muted md:table-cell">
                {{ clientName(p) }}
              </td>
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-2">
                  <StatusChip :status="STATUS_META[p.status].status">
                    {{ STATUS_META[p.status].label }}
                  </StatusChip>
                  <!-- Worth showing: a yes taken over the phone is a different
                       kind of record from one the client clicked. -->
                  <UTooltip
                    v-if="p.status === 'accepted' && p.accept_source === 'admin'"
                    text="Accepted on their behalf"
                  >
                    <UIcon
                      name="i-lucide-phone"
                      class="size-3.5 text-muted"
                    />
                  </UTooltip>
                </div>
              </td>
              <td class="px-4 py-3.5 text-right text-sm font-semibold text-highlighted tabular-nums">
                {{ formatMoney(p.total) }}
              </td>
              <td
                class="px-4 py-3.5 text-right"
                @click.stop
              >
                <UDropdownMenu :items="menu(p)">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    :loading="busy === p.id"
                    aria-label="Proposal actions"
                  />
                </UDropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
