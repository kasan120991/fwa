<script setup lang="ts">
// Agreements — one row per deal: the proposal with the agreement it produced
// and the project the signature created, plus care plans and their agreements.
// The band at the top is the one thing that needs the client right now; the
// list is the rest; History is what's closed. Same idiom as Invoices.
import { type PortalDeal, stageOf, chip, kindLabel, stageLine, nextAction, viewTo, mostUrgent, isActionable } from '~/utils/deals'

useHead({ title: 'Agreements · Francis Web Agency' })
const api = useApi()
const socket = useSocket()
const config = useRuntimeConfig()

const deals = ref<PortalDeal[]>([])
const pending = ref(true)

async function load() {
  try {
    const { data } = await api<{ data: PortalDeal[] }>('/portal/deals')
    deals.value = data
  } finally {
    pending.value = false
  }
}
onMounted(() => {
  load()
  socket.on('agreement:changed', load)
  socket.on('care-plan:changed', load)
})
onBeforeUnmount(() => {
  socket.off('agreement:changed', load)
  socket.off('care-plan:changed', load)
})

const focus = computed(() => mostUrgent(deals.value))
const RANK: Record<string, number> = { sign: 0, review: 1, card: 2, past_due: 3, preparing: 4, active: 5, done: 6 }
const open = computed(() => deals.value
  .filter(d => stageOf(d) !== 'closed' && d !== focus.value?.deal)
  .sort((a, b) => (RANK[stageOf(a)] ?? 9) - (RANK[stageOf(b)] ?? 9) || Date.parse(b.updated_at) - Date.parse(a.updated_at)))
const history = computed(() => deals.value.filter(d => stageOf(d) === 'closed'))

const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
const pdfUrl = (d: PortalDeal) => `${apiBase}/portal/agreements/contract/${d.contract_id}/pdf`
const signedCopy = (d: PortalDeal) => !!d.contract_id && d.contract_status === 'signed'

const focusLine = computed(() => {
  const f = focus.value
  if (!f) return ''
  if (f.stage === 'sign') return f.deal.kind === 'care_plan' ? 'Your care plan agreement is ready to sign.' : 'Your project agreement is ready to sign.'
  if (f.stage === 'review') return 'A proposal is waiting for your decision.'
  return 'Add a card to start your care plan.'
})
</script>

<template>
  <div class="flex flex-col gap-7">
    <div>
      <p class="eyebrow text-primary">
        Paperwork
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Agreements
      </h1>
      <p class="mt-1.5 text-[0.9375rem] text-muted">
        Proposals, agreements and your care plan, in one place.
      </p>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!deals.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No agreements yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Proposals and agreements we share with you will appear here.
      </p>
    </div>

    <template v-else>
      <!-- the one thing that needs you -->
      <section
        v-if="focus"
        class="flex flex-wrap items-end gap-x-10 gap-y-6 rounded-band bg-sand p-7 sm:p-8"
      >
        <div class="min-w-0">
          <p class="eyebrow">
            {{ [kindLabel(focus.deal, focus.stage), focus.deal.code].filter(Boolean).join(' · ') }}
          </p>
          <h2 class="mt-2 font-display text-[1.6rem] font-bold leading-tight tracking-[-0.028em] text-highlighted sm:text-[1.9rem]">
            {{ focus.deal.title }}
          </h2>
          <p class="mt-2.5 text-[13.5px] text-muted">
            <span class="font-semibold text-highlighted">{{ focusLine }}</span> {{ stageLine(focus.deal, focus.stage) }}
          </p>
        </div>
        <div class="ml-auto flex items-center gap-4">
          <span
            v-if="focus.deal.total != null"
            class="font-display text-[1.6rem] font-bold leading-none tracking-[-0.028em] text-highlighted tabular-nums"
          >
            {{ formatMoney(focus.deal.total) }}<span
              v-if="focus.deal.recurring"
              class="text-[13px] font-medium tracking-normal text-muted"
            >/mo</span>
          </span>
          <NuxtLink
            :to="nextAction(focus.deal, focus.stage)!.to"
            class="inline-flex items-center rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-inverted transition-colors hover:bg-primary/90"
          >
            {{ nextAction(focus.deal, focus.stage)!.label }}
          </NuxtLink>
        </div>
      </section>

      <section
        v-else
        class="rounded-band bg-sand p-7 sm:p-8"
      >
        <p class="eyebrow">
          Paperwork
        </p>
        <h3 class="mt-2 font-display text-[1.35rem] font-semibold text-highlighted">
          Nothing needs your signature
        </h3>
        <p class="mt-1 text-[13.5px] text-muted">
          Everything is signed and in motion. New proposals and agreements will show up here first.
        </p>
      </section>

      <!-- the rest -->
      <div
        v-if="open.length"
        class="flex flex-col gap-3"
      >
        <div
          v-for="d in open"
          :key="d.code || d.title"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-default px-5 py-4 ring ring-default"
        >
          <div class="min-w-0 flex-1 basis-[240px]">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink
                :to="viewTo(d)"
                class="text-[14px] font-semibold text-highlighted hover:underline"
              >
                {{ d.title }}
              </NuxtLink>
              <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{{ kindLabel(d) }}</span>
            </div>
            <div class="mt-0.5 text-[12.5px] text-muted">
              {{ stageLine(d) }}
            </div>
          </div>
          <span
            class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
            :class="chip(d).class"
          >{{ chip(d).label }}</span>
          <span class="ml-auto flex items-center gap-4">
            <span
              v-if="d.total != null"
              class="text-[14px] font-semibold text-highlighted tabular-nums"
            >{{ formatMoney(d.total) }}<span
              v-if="d.recurring"
              class="text-[11px] font-normal text-muted"
            >/mo</span></span>
            <NuxtLink
              v-if="isActionable(stageOf(d)) || stageOf(d) === 'past_due'"
              :to="nextAction(d)!.to"
              class="inline-flex items-center rounded-btn border border-accented px-3.5 py-1.5 text-[12.5px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
            >
              {{ nextAction(d)!.label }}
            </NuxtLink>
            <a
              v-else-if="signedCopy(d)"
              :href="pdfUrl(d)"
              class="inline-flex items-center gap-1.5 rounded-btn border border-accented px-3.5 py-1.5 text-[12.5px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
            >
              <UIcon
                name="i-lucide-download"
                class="size-3.5"
              />
              PDF
            </a>
            <NuxtLink
              v-else
              :to="viewTo(d)"
              class="text-[12.5px] font-medium text-highlighted underline decoration-1 underline-offset-2"
            >
              View
            </NuxtLink>
          </span>
        </div>
      </div>

      <!-- history -->
      <section v-if="history.length">
        <p class="eyebrow">
          History
        </p>
        <div class="mt-1">
          <NuxtLink
            v-for="d in history"
            :key="d.code || d.title"
            :to="viewTo(d)"
            class="flex flex-wrap items-center gap-4 border-t border-default py-3.5 transition-colors first:border-t-0 hover:bg-muted/50"
          >
            <span class="text-[13.5px] font-medium text-muted">{{ d.title }}</span>
            <span class="text-[12.5px] text-muted">{{ kindLabel(d) }} · {{ stageLine(d) }}</span>
            <span
              class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
              :class="chip(d).class"
            >{{ chip(d).label }}</span>
            <span class="ml-auto flex items-center gap-4 text-[12.5px]">
              <span
                v-if="d.total != null"
                class="font-medium text-muted tabular-nums"
              >{{ formatMoney(d.total) }}{{ d.recurring ? '/mo' : '' }}</span>
              <span class="font-medium text-highlighted underline decoration-1 underline-offset-2">View</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
