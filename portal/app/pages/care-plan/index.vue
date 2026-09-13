<script setup lang="ts">
// Care Plan — the client's recurring plan: what's included, what it costs, the
// card on file, and the one thing they may need to do (sign, add a card, or fix
// a failed payment). The API scopes everything to the signed-in client.
useHead({ title: 'Care Plan · Francis Web Agency' })

const api = useApi()
const socket = useSocket()

type Status = 'pending_signature' | 'awaiting_card' | 'active' | 'past_due' | 'cancelled'
interface Plan {
  id: number
  name: string
  description: string | null
  price: number
  currency: string
  status: Status
  requires_agreement: boolean
  contract_id: number | null
  contract_status: string | null
  start_date: string
  cancel_at_period_end: boolean
  activated_at: string | null
  cancelled_at: string | null
  pm_brand: string | null
  pm_last4: string | null
  current_period_end: string | null
  next_charge_at: string | null
}

const plans = ref<Plan[]>([])
const pending = ref(true)
const updatingCard = ref(false)

async function load() {
  try {
    const { data } = await api<{ data: Plan[] }>('/portal/care-plans')
    plans.value = data
  } finally {
    pending.value = false
  }
}
onMounted(() => {
  load()
  socket.on('care-plan:changed', load)
})
onBeforeUnmount(() => socket.off('care-plan:changed', load))

// The plan that matters: a live or pending one first, else the newest.
const RANK: Record<Status, number> = { past_due: 0, awaiting_card: 1, pending_signature: 2, active: 3, cancelled: 4 }
const plan = computed(() => [...plans.value].sort((a, b) => RANK[a.status] - RANK[b.status])[0] ?? null)

const STATUS_META: Record<Status, { label: string, chip: string }> = {
  pending_signature: { label: 'Agreement To Sign', chip: 'bg-info/10 text-info' },
  awaiting_card: { label: 'Card Needed', chip: 'bg-warning/10 text-warning' },
  active: { label: 'Active', chip: 'bg-success/10 text-success' },
  past_due: { label: 'Payment Failed', chip: 'bg-error/10 text-error' },
  cancelled: { label: 'Cancelled', chip: 'bg-muted text-muted' }
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', link: 'Link' }
const cardLabel = (p: Plan) => p.pm_last4 ? `${BRANDS[String(p.pm_brand || '').toLowerCase()] || 'Card'} ending ${p.pm_last4}` : null

const included = computed(() => String(plan.value?.description ?? '').split(/\r?\n|;\s*/).map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean))

function onSaved() {
  updatingCard.value = false
  setTimeout(load, 800)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div>
      <p class="eyebrow text-primary">
        Ongoing Care
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Care Plan
      </h1>
    </div>

    <div
      v-if="pending"
      class="mt-4 rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!plan"
      class="mt-4 rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <UIcon
        name="i-lucide-heart-pulse"
        class="mx-auto size-8 text-muted"
      />
      <p class="mt-3 text-sm text-muted">
        You don't have a care plan yet. Ask us about keeping your site updated, backed up and monitored.
      </p>
    </div>

    <template v-else>
      <!-- the money register -->
      <section class="mt-4 flex flex-wrap items-end gap-x-10 gap-y-6 rounded-band bg-sand p-7 sm:p-8">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <p class="eyebrow">
              {{ plan.name }}
            </p>
            <span
              class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
              :class="STATUS_META[plan.status].chip"
            >{{ STATUS_META[plan.status].label }}</span>
          </div>
          <div class="mt-2.5 font-display text-[2.6rem] font-bold leading-none tracking-[-0.028em] text-highlighted tabular-nums">
            {{ formatMoney(plan.price) }}<span class="ml-1 text-[1rem] font-medium tracking-normal text-muted">/ month</span>
          </div>
          <p class="mt-2.5 text-[13.5px] text-muted">
            <template v-if="plan.status === 'active' && plan.cancel_at_period_end">
              Ends {{ shortDate(plan.current_period_end) }} — no further charges after that.
            </template>
            <template v-else-if="plan.status === 'active'">
              Next charge <span class="font-semibold text-highlighted">{{ shortDate(plan.next_charge_at || plan.start_date) }}</span>{{ cardLabel(plan) ? ` · ${cardLabel(plan)}` : '' }}
            </template>
            <template v-else-if="plan.status === 'past_due'">
              <span class="font-semibold text-error">Your last payment didn't go through.</span> Update your card below to keep the plan active.
            </template>
            <template v-else-if="plan.status === 'awaiting_card'">
              Starts <span class="font-semibold text-highlighted">{{ shortDate(plan.start_date) }}</span> once a card is on file.
            </template>
            <template v-else-if="plan.status === 'pending_signature'">
              Sign the agreement to get started. You'll add a card after that.
            </template>
            <template v-else>
              Cancelled{{ plan.cancelled_at ? ` ${shortDate(plan.cancelled_at)}` : '' }}.
            </template>
          </p>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <NuxtLink
            v-if="plan.status === 'pending_signature' && plan.contract_id"
            :to="`/agreements/contract-${plan.contract_id}`"
            class="inline-flex cursor-pointer items-center rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-inverted transition-colors hover:bg-primary/90"
          >
            Sign Agreement
          </NuxtLink>
          <button
            v-else-if="plan.status === 'active' && !updatingCard"
            type="button"
            class="inline-flex items-center rounded-btn border border-accented px-4 py-2 text-[13px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
            @click="updatingCard = true"
          >
            Update Card
          </button>
        </div>
      </section>

      <div class="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
        <!-- what's included -->
        <section>
          <h2 class="text-[15px] font-semibold text-highlighted">
            What's included
          </h2>
          <ul
            v-if="included.length"
            class="mt-3 border-t border-default"
          >
            <li
              v-for="(item, i) in included"
              :key="i"
              class="flex gap-3 border-b border-default py-2.5 text-[14.5px] leading-snug text-default"
            >
              <UIcon
                name="i-lucide-check"
                class="mt-[3px] size-3.5 flex-none text-muted"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
          <p
            v-else
            class="mt-3 text-[13.5px] text-muted"
          >
            Ongoing updates, backups and monitoring for your site.
          </p>
          <dl class="mt-6 grid grid-cols-2 gap-4 text-[13.5px]">
            <div>
              <dt class="eyebrow">
                Started
              </dt>
              <dd class="mt-1 text-highlighted">
                {{ shortDate(plan.activated_at || plan.start_date) }}
              </dd>
            </div>
            <div v-if="plan.contract_id">
              <dt class="eyebrow">
                Agreement
              </dt>
              <dd class="mt-1">
                <NuxtLink
                  :to="`/agreements/contract-${plan.contract_id}`"
                  class="font-semibold text-highlighted underline decoration-ink-300 underline-offset-4 hover:decoration-citrine hover:decoration-2"
                >
                  View agreement
                </NuxtLink>
              </dd>
            </div>
          </dl>
        </section>

        <!-- the card -->
        <section>
          <template v-if="plan.status === 'awaiting_card' || plan.status === 'past_due' || updatingCard">
            <h2 class="text-[15px] font-semibold text-highlighted">
              {{ plan.status === 'awaiting_card' ? 'Add a card to start' : plan.status === 'past_due' ? 'Update your card' : 'New card' }}
            </h2>
            <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
              {{ plan.status === 'awaiting_card' ? `We'll charge ${formatMoney(plan.price)} on ${shortDate(plan.start_date)} and on that day each month.` : 'Future charges will use this card.' }}
            </p>
            <div class="mt-4">
              <PortalCardSetupElement
                :plan-id="plan.id"
                :mode="plan.status === 'awaiting_card' ? 'activate' : 'update'"
                @saved="onSaved"
              />
            </div>
            <button
              v-if="updatingCard && plan.status === 'active'"
              type="button"
              class="mt-3 text-[13px] font-semibold text-muted hover:text-highlighted"
              @click="updatingCard = false"
            >
              Keep current card
            </button>
          </template>
          <template v-else-if="plan.status === 'active'">
            <h2 class="text-[15px] font-semibold text-highlighted">
              Card on file
            </h2>
            <div class="mt-3 flex items-center gap-3 rounded-card bg-default p-5 ring ring-default">
              <UIcon
                name="i-lucide-credit-card"
                class="size-5 text-muted"
              />
              <div class="text-[13.5px]">
                <div class="font-semibold text-highlighted">
                  {{ cardLabel(plan) || 'Card saved' }}
                </div>
                <div class="text-muted">
                  Charged {{ formatMoney(plan.price) }} monthly
                </div>
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>
