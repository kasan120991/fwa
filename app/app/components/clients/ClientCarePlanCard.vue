<script setup lang="ts">
// Client detail › Sales & Billing › Care Plan — the client's recurring plan and
// the one thing that moves it next. Actions map 1:1 to /api/care-plans routes;
// the status itself only changes server-side.
import { type CarePlan, CARE_PLAN_META, cardLabel, isLive } from '~/utils/carePlans'

const props = defineProps<{ clientId: number }>()
const emit = defineEmits<{ new: [] }>()

const api = useApi()
const toast = useToast()
const socket = useSocket()

const plans = ref<CarePlan[]>([])
const pending = ref(true)
const busy = ref<string | null>(null)

async function load() {
  try {
    const { data } = await api<{ data: CarePlan[] }>('/care-plans', { query: { client_id: props.clientId } })
    plans.value = data
  } catch { /* non-fatal */ } finally {
    pending.value = false
  }
}
onMounted(() => {
  load()
  socket.on('care-plan:changed', load)
})
onBeforeUnmount(() => socket.off('care-plan:changed', load))
defineExpose({ reload: load })

// The plan that matters: live first, then the one waiting on someone, then the rest.
const RANK: Record<CarePlan['status'], number> = { past_due: 0, active: 1, awaiting_card: 2, pending_signature: 3, draft: 4, cancelled: 5 }
const plan = computed(() => [...plans.value].sort((a, b) => RANK[a.status] - RANK[b.status])[0] ?? null)
const history = computed(() => plans.value.filter(p => p.id !== plan.value?.id))

function errText(err: unknown) {
  return (err as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Something went wrong.'
}
async function run(key: string, fn: () => Promise<unknown>, done: string) {
  busy.value = key
  try {
    await fn()
    toast.add({ title: done, color: 'success' })
    await load()
  } catch (err: unknown) {
    toast.add({ title: 'That didn’t work', description: errText(err), color: 'error' })
  } finally { busy.value = null }
}
const sendAgreement = (p: CarePlan) => run('agreement', () => api(`/care-plans/${p.id}/send-agreement`, { method: 'POST' }), 'Agreement sent')
const sendCardLink = (p: CarePlan) => run('invite', () => api(`/care-plans/${p.id}/invite`, { method: 'POST' }), 'Card link sent')
const cancelAtEnd = (p: CarePlan) => run('cancel', () => api(`/care-plans/${p.id}/cancel`, { method: 'POST', body: { at_period_end: true } }), 'Plan ends at period end')
const cancelNow = (p: CarePlan) => run('cancel', () => api(`/care-plans/${p.id}/cancel`, { method: 'POST', body: { at_period_end: false } }), 'Plan cancelled')
const removeDraft = (p: CarePlan) => run('delete', () => api(`/care-plans/${p.id}`, { method: 'DELETE' }), 'Plan removed')

function menu(p: CarePlan) {
  const groups: { label: string, icon: string, color?: 'error', onSelect: () => unknown }[][] = []
  const first: typeof groups[number] = []
  if (p.status === 'pending_signature' && p.contract_status !== 'draft') first.push({ label: 'Open Agreement', icon: 'i-lucide-file-signature', onSelect: () => navigateTo(`/contracts/${p.contract_id}`) })
  if (p.status === 'awaiting_card') first.push({ label: 'Re-send Card Link', icon: 'i-lucide-send', onSelect: () => sendCardLink(p) })
  if (p.contract_id && p.status !== 'pending_signature') first.push({ label: 'View Agreement', icon: 'i-lucide-file-signature', onSelect: () => navigateTo(`/contracts/${p.contract_id}`) })
  if (first.length) groups.push(first)
  const danger: typeof groups[number] = []
  if (isLive(p) && !p.cancel_at_period_end) danger.push({ label: 'Cancel At Period End', icon: 'i-lucide-calendar-x', onSelect: () => cancelAtEnd(p) })
  if (isLive(p)) danger.push({ label: 'Cancel Now', icon: 'i-lucide-ban', color: 'error', onSelect: () => cancelNow(p) })
  if (['draft', 'pending_signature', 'awaiting_card'].includes(p.status)) danger.push({ label: 'Remove Plan', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeDraft(p) })
  if (danger.length) groups.push(danger)
  return groups
}

const statusLine = (p: CarePlan) => {
  if (p.status === 'active' && p.cancel_at_period_end) return `Ends ${shortDate(p.current_period_end)} · no further charges`
  if (p.status === 'active') return `Next charge ${shortDate(p.next_charge_at || p.start_date)}${cardLabel(p) ? ` · ${cardLabel(p)}` : ''}`
  if (p.status === 'past_due') return `Last charge failed${cardLabel(p) ? ` on ${cardLabel(p)}` : ''} · client asked to update their card`
  if (p.status === 'awaiting_card') return `Starts ${shortDate(p.start_date)} once a card is on file`
  if (p.status === 'pending_signature') return p.contract_status === 'draft' ? 'Agreement drafted, not sent' : `Agreement ${p.contract_status} · waiting for signature`
  if (p.status === 'cancelled') return `Cancelled${p.cancelled_at ? ` ${shortDate(p.cancelled_at)}` : ''}`
  return CARE_PLAN_META[p.status].hint
}
</script>

<template>
  <div class="overflow-hidden rounded-card bg-default ring ring-default">
    <div class="flex items-center justify-between gap-3 px-6 py-5">
      <span class="text-[15px] font-semibold text-highlighted">Care Plan</span>
      <UButton
        v-if="!plan || plan.status === 'cancelled'"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-plus"
        @click="emit('new')"
      >
        Assign Plan
      </UButton>
      <span
        v-else
        class="eyebrow"
      >Monthly</span>
    </div>

    <div
      v-if="pending"
      class="border-t border-default px-6 py-6 text-[13px] text-muted"
    >
      Loading…
    </div>
    <div
      v-else-if="!plan"
      class="border-t border-default px-6 py-6 text-[13px] text-muted"
    >
      No care plan. Assign one to bill hosting, updates and support monthly.
    </div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-4 border-t border-default px-6 py-5">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="text-sm font-semibold text-highlighted">{{ plan.name }}</span>
            <StatusChip :status="CARE_PLAN_META[plan.status].chip">
              {{ CARE_PLAN_META[plan.status].label }}
            </StatusChip>
          </div>
          <div class="mt-1 text-[12.5px] text-muted">
            {{ statusLine(plan) }}
          </div>
        </div>
        <div class="text-[22px] font-bold leading-none tracking-tight text-highlighted tabular-nums">
          {{ formatMoney(plan.price) }}<span class="text-xs font-normal text-muted"> /mo</span>
        </div>
        <div
          class="flex items-center gap-2"
          @click.stop
        >
          <UButton
            v-if="plan.status === 'pending_signature' && plan.contract_status === 'draft'"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-send"
            :loading="busy === 'agreement'"
            @click="sendAgreement(plan)"
          >
            Send Agreement
          </UButton>
          <UButton
            v-else-if="plan.status === 'awaiting_card'"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-credit-card"
            :loading="busy === 'invite'"
            @click="sendCardLink(plan)"
          >
            Send Card Link
          </UButton>
          <UDropdownMenu
            v-if="menu(plan).length"
            :items="menu(plan)"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              aria-label="More"
              :loading="busy === 'cancel' || busy === 'delete'"
            />
          </UDropdownMenu>
        </div>
      </div>
      <div
        v-if="plan.description"
        class="border-t border-default px-6 py-4 text-[13px] leading-relaxed text-muted whitespace-pre-line"
      >
        {{ plan.description }}
      </div>
      <div
        v-for="p in history"
        :key="p.id"
        class="flex items-center gap-3 border-t border-default px-6 py-3 text-[12.5px] text-muted"
      >
        <span class="flex-1 truncate">{{ p.name }} · {{ statusLine(p) }}</span>
        <span class="tabular-nums">{{ formatMoney(p.price) }}/mo</span>
      </div>
    </template>
  </div>
</template>
