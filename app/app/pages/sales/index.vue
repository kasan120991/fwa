<script setup lang="ts">
// Sales — one page for the whole flow. A deal is ONE row: the proposal with the
// contract it produced folded in as a stage (Draft → Sent → Accepted →
// Contract Out → Signed), plus care plans as rows of their own. The rail on
// the left picks a stage; the list shows that stage with the action that moves
// a deal inline. Replaces the old Proposals and Contracts pages.
import type { StatRowItem } from '~/components/StatRow.vue'
import { type ApiDeal, type Stage, STAGES, STAGE_META, IN_FLIGHT, stageOf, nextFor, whenFor, waitingDays, chipFor } from '~/utils/deals'

useHead({ title: 'Sales · Francis Web Agency' })

const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

interface Deal extends ApiDeal {
  stage: Stage
  next: string
  when: string
  waiting: number | null
}

const rows = ref<Deal[]>([])
const pending = ref(true)
const search = ref('')

function decorate(d: ApiDeal): Deal {
  const stage = stageOf(d)
  return { ...d, stage, next: nextFor(d, stage).text, when: whenFor(d, stage), waiting: waitingDays(d, stage) }
}

async function load() {
  try {
    const { data } = await api<{ data: ApiDeal[] }>('/agreements/deals')
    rows.value = data.map(decorate)
  } finally {
    pending.value = false
  }
}
onMounted(load)

const socket = useSocket()
const EVENTS = ['proposal:changed', 'contract:changed', 'project:created', 'care-plan:changed']
const carePlanFormOpen = ref(false)
onMounted(() => {
  for (const ev of EVENTS) socket.on(ev, load)
})
onBeforeUnmount(() => {
  for (const ev of EVENTS) socket.off(ev, load)
})

/* ------------------------------------------------------------- stat row */
const inFlight = computed(() => rows.value.filter(r => IN_FLIGHT.includes(r.stage)))
const awaitingResponse = computed(() => rows.value.filter(r => r.stage === 'sent'))
const awaitingSignature = computed(() => rows.value.filter(r => r.stage === 'contract'))
const valueInFlight = computed(() => rows.value
  .filter(r => (r.stage === 'sent' || r.stage === 'contract') && !r.recurring)
  .reduce((sum, r) => sum + Number(r.total || 0), 0))
const wonThisQuarter = computed(() => {
  const now = new Date()
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime()
  const won = rows.value.filter(r => r.stage === 'signed' && r.signed_at && Date.parse(String(r.signed_at).replace(' ', 'T') + 'Z') >= qStart)
  return { count: won.length, value: won.filter(r => !r.recurring).reduce((s, r) => s + Number(r.total || 0), 0) }
})
const metrics = computed<StatRowItem[]>(() => [
  { label: 'Awaiting Response', value: String(awaitingResponse.value.length), sub: 'sent, not decided', tone: awaitingResponse.value.length ? 'warning' : 'default' },
  { label: 'Awaiting Signature', value: String(awaitingSignature.value.length), sub: 'contract out', tone: awaitingSignature.value.length ? 'warning' : 'default' },
  { label: 'Value In Flight', value: formatMoney(valueInFlight.value), sub: 'awaiting a decision' },
  { label: 'Won This Quarter', value: formatMoney(wonThisQuarter.value.value), sub: `${wonThisQuarter.value.count} signed` }
])

/* ------------------------------------------------------------------ rail */
type RailKey = 'inflight' | Stage
const RAIL_KEYS: RailKey[] = ['inflight', ...STAGES]

function railFromRoute(): RailKey {
  const s = String(route.query.stage ?? '')
  return (RAIL_KEYS as string[]).includes(s) ? s as RailKey : 'inflight'
}
const active = ref<RailKey>(railFromRoute())
function showStage(key: RailKey) {
  active.value = key
  router.replace({ query: { ...route.query, stage: key === 'inflight' ? undefined : key } })
}
watch(() => route.query.stage, () => {
  active.value = railFromRoute()
})

const counts = computed(() => {
  const c: Record<RailKey, number> = { inflight: inFlight.value.length, draft: 0, sent: 0, accepted: 0, contract: 0, signed: 0, closed: 0 }
  for (const r of rows.value) c[r.stage]++
  return c
})
const rail = computed(() => [
  { key: 'inflight' as const, label: 'In Flight', icon: 'i-lucide-clock', count: counts.value.inflight },
  ...STAGES.map(s => ({ key: s, label: STAGE_META[s].label, icon: STAGE_META[s].icon, count: counts.value[s] }))
])

/* ------------------------------------------------------------------ list */
const STAGE_RANK: Record<Stage, number> = { contract: 0, sent: 1, accepted: 2, draft: 3, signed: 4, closed: 5 }
const listed = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value
    .filter(r => active.value === 'inflight' ? IN_FLIGHT.includes(r.stage) : r.stage === active.value)
    .filter(r => !q || r.title.toLowerCase().includes(q) || r.client.toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q))
    .sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || Date.parse(b.updated_at) - Date.parse(a.updated_at))
})
const listTitle = computed(() => active.value === 'inflight' ? 'In Flight' : STAGE_META[active.value].label)
const listValue = computed(() => listed.value.filter(r => !r.recurring).reduce((s, r) => s + Number(r.total || 0), 0))

// The stalest deal waiting on the client gets a strip above the list.
const attention = computed(() => {
  const waiting = rows.value.filter(r => r.waiting != null && r.waiting >= 2)
  if (!waiting.length) return null
  const d = waiting.sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))[0]!
  const days = `${d.waiting} ${d.waiting === 1 ? 'day' : 'days'}`
  if (d.kind === 'care_plan' && d.care_plan_status === 'awaiting_card') {
    return { deal: d, text: `has been waiting ${days} for a card.`, hint: 'Re-send the card link or give the client a call.', action: 'Re-send Card Link', run: () => sendCardLink(d) }
  }
  return d.stage === 'contract'
    ? { deal: d, text: `has been out for signature for ${days}.`, hint: 'Nudge the client or open the contract.', action: 'Open Contract', run: () => navigateTo(`/contracts/${d.contract_id}`) }
    : { deal: d, text: `was sent ${days} ago and hasn't been answered.`, hint: 'Follow up, or re-send the link.', action: 'Re-send Link', run: () => sendProposal(d) }
})

/* --------------------------------------------------------------- actions */
const busy = ref<string | null>(null)
const key = (d: Deal) => `${d.kind}-${d.proposal_id ?? d.contract_id}`
function errText(err: unknown) {
  return (err as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Something went wrong.'
}
async function run(d: Deal, fn: () => Promise<void>) {
  busy.value = key(d)
  try {
    await fn()
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'That didn’t work', description: errText(err), color: 'error' })
  } finally { busy.value = null }
}

function sendProposal(d: Deal) {
  return run(d, async () => {
    const res = await api<{ url: string, emailed: boolean }>(`/proposals/${d.proposal_id}/send`, { method: 'POST' })
    await navigator.clipboard?.writeText(res.url).catch(() => {})
    toast.add({
      title: res.emailed ? 'Proposal sent' : 'Link ready',
      description: res.emailed ? 'Emailed, and the link is on your clipboard.' : 'No email went out — the link is on your clipboard.',
      color: res.emailed ? 'success' : 'warning'
    })
  })
}
function markAccepted(d: Deal) {
  return run(d, async () => {
    await api(`/proposals/${d.proposal_id}/accept`, { method: 'POST' })
    toast.add({ title: 'Accepted', description: 'The agreement is being generated.', color: 'success' })
  })
}
function markDeclined(d: Deal) {
  return run(d, async () => {
    await api(`/proposals/${d.proposal_id}/decline`, { method: 'POST' })
    toast.add({ title: 'Marked declined', color: 'neutral' })
  })
}
function sendContract(d: Deal) {
  return run(d, async () => {
    await api(`/contracts/${d.contract_id}/send`, { method: 'POST' })
    toast.add({ title: 'Contract sent', description: 'Out for signature.', color: 'success' })
  })
}
function voidContract(d: Deal) {
  return run(d, async () => {
    await api(`/contracts/${d.contract_id}/void`, { method: 'POST' })
    toast.add({ title: 'Contract voided', color: 'neutral' })
  })
}
function sendCarePlanAgreement(d: Deal) {
  return run(d, async () => {
    await api(`/care-plans/${d.care_plan_id}/send-agreement`, { method: 'POST' })
    toast.add({ title: 'Agreement sent', color: 'success' })
  })
}
function sendCardLink(d: Deal) {
  return run(d, async () => {
    await api(`/care-plans/${d.care_plan_id}/invite`, { method: 'POST' })
    toast.add({ title: 'Card link sent', description: 'The client can add their card in the portal.', color: 'success' })
  })
}
function cancelCarePlan(d: Deal, atPeriodEnd: boolean) {
  return run(d, async () => {
    await api(`/care-plans/${d.care_plan_id}/cancel`, { method: 'POST', body: { at_period_end: atPeriodEnd } })
    toast.add({ title: atPeriodEnd ? 'Plan ends at period end' : 'Plan cancelled', color: 'neutral' })
  })
}
function deleteCarePlan(d: Deal) {
  return run(d, async () => {
    await api(`/care-plans/${d.care_plan_id}`, { method: 'DELETE' })
    toast.add({ title: 'Plan removed', color: 'neutral' })
  })
}
function deleteProposal(d: Deal) {
  return run(d, async () => {
    await api(`/proposals/${d.proposal_id}`, { method: 'DELETE' })
    toast.add({ title: 'Proposal deleted', color: 'neutral' })
  })
}

// Where a row goes when clicked: the proposal editor while the proposal is
// the live object, the contract viewer once a contract exists.
function openDeal(d: Deal) {
  if (d.kind === 'care_plan') return navigateTo(`/clients/${d.client_id}?tab=money`)
  if (d.contract_id && (d.stage === 'accepted' || d.stage === 'contract' || d.stage === 'signed')) {
    return navigateTo(`/contracts/${d.contract_id}`)
  }
  if (d.proposal_id) return navigateTo(`/proposals/${d.proposal_id}`)
  if (d.contract_id) return navigateTo(`/contracts/${d.contract_id}`)
}

// The one inline action per stage. Everything else lives in the row menu.
function primary(d: Deal): { label: string, icon: string, run: () => unknown } | null {
  if (d.kind === 'care_plan') {
    switch (d.care_plan_status) {
      case 'pending_signature': return d.contract_status === 'draft'
        ? { label: 'Send Agreement', icon: 'i-lucide-send', run: () => sendCarePlanAgreement(d) }
        : { label: 'Open Agreement', icon: 'i-lucide-file-signature', run: () => navigateTo(`/contracts/${d.contract_id}`) }
      case 'awaiting_card': return { label: 'Send Card Link', icon: 'i-lucide-credit-card', run: () => sendCardLink(d) }
      case 'active': case 'past_due': return { label: 'Open Client', icon: 'i-lucide-user', run: () => navigateTo(`/clients/${d.client_id}?tab=money`) }
      default: return null
    }
  }
  switch (d.stage) {
    case 'draft':
      return { label: 'Send', icon: 'i-lucide-send', run: () => sendProposal(d) }
    case 'sent': return { label: 'Mark Accepted', icon: 'i-lucide-handshake', run: () => markAccepted(d) }
    case 'accepted': return d.contract_id
      ? (d.contract_status === 'draft'
          ? { label: 'Send Contract', icon: 'i-lucide-send', run: () => sendContract(d) }
          : { label: 'Open Contract', icon: 'i-lucide-file-signature', run: () => navigateTo(`/contracts/${d.contract_id}`) })
      : null
    case 'contract': return { label: 'Open Contract', icon: 'i-lucide-file-signature', run: () => navigateTo(`/contracts/${d.contract_id}`) }
    case 'signed': return d.project_id
      ? { label: 'Open Project', icon: 'i-lucide-folder-open', run: () => navigateTo(`/projects/${d.project_id}`) }
      : { label: 'Open Contract', icon: 'i-lucide-file-signature', run: () => navigateTo(`/contracts/${d.contract_id}`) }
    default: return null
  }
}

const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
function menu(d: Deal) {
  const groups: { label: string, icon: string, color?: 'error', onSelect?: () => unknown, to?: string, target?: string }[][] = []
  if (d.kind === 'care_plan') {
    const cp: typeof groups[number] = [{ label: 'Open Client', icon: 'i-lucide-user', onSelect: () => navigateTo(`/clients/${d.client_id}?tab=money`) }]
    if (d.contract_id) cp.push({ label: 'View Agreement', icon: 'i-lucide-file-signature', onSelect: () => navigateTo(`/contracts/${d.contract_id}`) })
    if (d.care_plan_status === 'awaiting_card') cp.push({ label: 'Re-send Card Link', icon: 'i-lucide-send', onSelect: () => sendCardLink(d) })
    groups.push(cp)
    const danger: typeof groups[number] = []
    if ((d.care_plan_status === 'active' || d.care_plan_status === 'past_due') && !d.cancel_at_period_end) danger.push({ label: 'Cancel At Period End', icon: 'i-lucide-calendar-x', onSelect: () => cancelCarePlan(d, true) })
    if (d.care_plan_status === 'active' || d.care_plan_status === 'past_due') danger.push({ label: 'Cancel Now', icon: 'i-lucide-ban', color: 'error', onSelect: () => cancelCarePlan(d, false) })
    if (['draft', 'pending_signature', 'awaiting_card'].includes(d.care_plan_status ?? '')) danger.push({ label: 'Remove Plan', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteCarePlan(d) })
    if (danger.length) groups.push(danger)
    return groups
  }
  const first: typeof groups[number] = []
  if (d.proposal_id && (d.stage === 'draft' || d.stage === 'sent')) first.push({ label: 'Edit Scope', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/proposals/${d.proposal_id}`) })
  if (d.proposal_id && d.stage !== 'draft') first.push({ label: 'View Proposal', icon: 'i-lucide-file-text', onSelect: () => navigateTo(`/proposals/${d.proposal_id}`) })
  if (d.stage === 'sent') first.push({ label: 'Re-send Link', icon: 'i-lucide-send', onSelect: () => sendProposal(d) })
  if (first.length) groups.push(first)
  if (d.stage === 'sent') groups.push([{ label: 'Mark Declined', icon: 'i-lucide-x', onSelect: () => markDeclined(d) }])
  const docs: typeof groups[number] = []
  if (d.contract_id) {
    docs.push({ label: 'Open Contract', icon: 'i-lucide-file-signature', onSelect: () => navigateTo(`/contracts/${d.contract_id}`) })
    if (d.contract_status && d.contract_status !== 'draft') docs.push({ label: 'Download PDF', icon: 'i-lucide-download', to: `${apiBase}/contracts/${d.contract_id}/pdf`, target: '_blank' })
  }
  if (d.project_id) docs.push({ label: 'Open Project', icon: 'i-lucide-folder-open', onSelect: () => navigateTo(`/projects/${d.project_id}`) })
  docs.push({ label: 'Open Client', icon: 'i-lucide-user', onSelect: () => navigateTo(`/clients/${d.client_id}?tab=money`) })
  groups.push(docs)
  const danger: typeof groups[number] = []
  if (d.contract_id && (d.contract_status === 'sent' || d.contract_status === 'viewed')) danger.push({ label: 'Void Contract', icon: 'i-lucide-ban', color: 'error', onSelect: () => voidContract(d) })
  if (d.proposal_id && d.stage === 'draft') danger.push({ label: 'Delete Draft', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteProposal(d) })
  if (danger.length) groups.push(danger)
  return groups
}

// Five dots on a hairline: how far along the spine the deal is.
const DOTS = 5
function filled(stage: Stage) {
  return stage === 'closed' ? 0 : STAGES.indexOf(stage) + 1
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      icon="i-lucide-handshake"
      title="Sales"
      :count="rows.length"
      subtitle="Proposals, their contracts and care plans — one row per deal."
    >
      <template #actions>
        <UButton
          icon="i-lucide-heart-pulse"
          color="neutral"
          variant="outline"
          @click="carePlanFormOpen = true"
        >
          New Care Plan
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="navigateTo('/proposals/new')"
        >
          New Proposal
        </UButton>
      </template>
    </PageHeader>

    <CarePlanForm
      v-model:open="carePlanFormOpen"
      @saved="load"
    />

    <StatRow :items="metrics" />

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-7">
      <!-- stage rail -->
      <nav class="flex gap-1 overflow-x-auto lg:sticky lg:top-2 lg:flex-col lg:overflow-visible">
        <button
          v-for="r in rail"
          :key="r.key"
          type="button"
          class="flex flex-none items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors"
          :class="active === r.key
            ? 'border-primary/25 bg-mist font-semibold text-primary'
            : 'border-transparent text-toned hover:bg-default'"
          @click="showStage(r.key)"
        >
          <UIcon
            :name="r.icon"
            class="size-[17px] flex-none"
            :class="active === r.key ? 'text-primary' : 'text-muted'"
          />
          <span class="flex-1 whitespace-nowrap">{{ r.label }}</span>
          <span class="text-[11px] font-semibold text-muted tabular-nums">{{ r.count }}</span>
        </button>

        <div class="mt-5 hidden rounded-card bg-sand p-5 lg:block">
          <div class="eyebrow">
            This Quarter
          </div>
          <div class="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-highlighted tabular-nums">
            {{ formatMoney(wonThisQuarter.value) }}
          </div>
          <div class="mt-1.5 text-[12.5px] text-muted">
            won · {{ wonThisQuarter.count }} signed
          </div>
          <div class="mt-3 border-t border-ink-300 pt-3 text-[12.5px] text-muted tabular-nums">
            {{ formatMoney(valueInFlight) }} in flight
          </div>
        </div>
      </nav>

      <div class="flex min-w-0 flex-col gap-4">
        <!-- attention strip -->
        <div
          v-if="attention"
          class="flex items-center gap-3 rounded-card border-l-[3px] border-warning bg-default px-4 py-3.5 pl-5 ring ring-default"
        >
          <UIcon
            name="i-lucide-clock"
            class="size-4 flex-none text-warning"
          />
          <span class="min-w-0 flex-1 text-[13.5px] text-default">
            <span class="font-semibold text-highlighted">{{ attention.deal.title }} {{ attention.text }}</span>
            {{ attention.hint }}
          </span>
          <button
            type="button"
            class="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-primary"
            @click="attention.run()"
          >
            {{ attention.action }}
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </button>
        </div>

        <!-- the list -->
        <section class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <span class="text-[15px] font-semibold text-highlighted">
              {{ listTitle }}
              <span class="ml-1.5 text-[13px] font-normal text-muted tabular-nums">{{ listed.length }} {{ listed.length === 1 ? 'deal' : 'deals' }}{{ listValue ? ` · ${formatMoney(listValue)}` : '' }}</span>
            </span>
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search deals…"
              size="sm"
              class="w-60"
            />
          </div>

          <div
            v-if="pending"
            class="border-t border-default px-6 py-12 text-center text-sm text-muted"
          >
            Loading deals…
          </div>
          <div
            v-else-if="!listed.length"
            class="flex flex-col items-center border-t border-default px-6 py-12 text-center"
          >
            <span class="mb-3 inline-flex size-11 items-center justify-center rounded-card bg-muted text-muted">
              <UIcon
                name="i-lucide-handshake"
                class="size-5"
              />
            </span>
            <p class="text-sm text-muted">
              {{ search ? 'Nothing matches that search.' : active === 'inflight' ? 'Nothing in flight. Start with a proposal.' : `No deals at ${listTitle.toLowerCase()}.` }}
            </p>
            <UButton
              v-if="!search && active === 'inflight'"
              color="neutral"
              variant="outline"
              size="sm"
              class="mt-4"
              icon="i-lucide-plus"
              @click="navigateTo('/proposals/new')"
            >
              New Proposal
            </UButton>
          </div>

          <div
            v-for="d in listed"
            :key="key(d)"
            class="grid cursor-pointer grid-cols-1 items-center gap-3 border-t border-default px-6 py-4 transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1fr)_150px_110px_auto] sm:gap-4"
            @click="openDeal(d)"
          >
            <!-- deal -->
            <div class="flex min-w-0 items-center gap-3">
              <span class="inline-flex size-[34px] flex-none items-center justify-center rounded-btn bg-sand text-[12px] font-semibold text-highlighted">
                {{ initials(d.client) }}
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-semibold text-highlighted">{{ d.title }}</span>
                  <span
                    v-if="d.kind === 'care_plan'"
                    class="rounded-chip bg-muted px-1.5 py-px text-[11px] font-semibold text-muted"
                  >Care Plan</span>
                </div>
                <div class="mt-0.5 truncate text-[12.5px] text-muted">
                  {{ d.client }}<template v-if="d.code">
                    · <span class="tabular-nums">{{ d.code }}</span>
                  </template> · {{ d.when }}
                </div>
              </div>
            </div>

            <!-- stage -->
            <div class="flex flex-col gap-1.5">
              <StatusChip :status="chipFor(d, d.stage).status">
                {{ chipFor(d, d.stage).label }}
              </StatusChip>
              <span class="flex w-24 items-center">
                <template
                  v-for="i in DOTS"
                  :key="i"
                >
                  <span
                    class="size-2 flex-none rounded-full ring-[1.5px] ring-inset"
                    :class="i <= filled(d.stage) ? 'bg-inverted ring-inverted' : 'bg-default ring-accented'"
                  />
                  <span
                    v-if="i < DOTS"
                    class="h-px flex-1"
                    :class="i < filled(d.stage) ? 'bg-inverted' : 'bg-accented'"
                  />
                </template>
              </span>
            </div>

            <!-- value -->
            <div class="text-sm font-semibold text-highlighted tabular-nums sm:text-right">
              {{ formatMoney(d.total) }}<span
                v-if="d.recurring"
                class="text-xs font-normal text-muted"
              > /mo</span>
            </div>

            <!-- actions -->
            <div
              class="flex items-center justify-end gap-2"
              @click.stop
            >
              <UButton
                v-if="primary(d)"
                color="neutral"
                variant="outline"
                size="sm"
                :icon="primary(d)!.icon"
                :loading="busy === key(d)"
                @click="primary(d)!.run()"
              >
                {{ primary(d)!.label }}
              </UButton>
              <span
                v-else
                class="w-8 text-center text-[12.5px] text-muted"
              >—</span>
              <UDropdownMenu :items="menu(d)">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  square
                  aria-label="More"
                />
              </UDropdownMenu>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
