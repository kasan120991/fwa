<script setup lang="ts">
// One agreement. `contract-3` → the PandaDoc embed (sign, or read a signed
// copy) with the deal's context and a PDF once signed; `proposal-5` → the
// proposal itself, readable and decidable right here (the same view and the
// same acceptance path as the emailed link).
import type { View } from '~/components/PortalProposalView.vue'
import { type PortalDeal, chip, kindLabel, stageLine } from '~/utils/deals'

const route = useRoute()
const api = useApi()
const socket = useSocket()
const config = useRuntimeConfig()
const user = useAuthUser()

// uid is `proposal-5` / `contract-3` (the agreement union's uid).
const parsed = computed(() => {
  const [kind, idStr] = String(route.params.uid).split('-')
  const id = Number(idStr)
  return (kind === 'proposal' || kind === 'contract') && Number.isInteger(id) && id > 0
    ? { kind: kind as 'proposal' | 'contract', id }
    : null
})

// The deal this document belongs to, for the header. Small list, one fetch.
const deal = ref<PortalDeal | null>(null)
async function loadDeal() {
  try {
    const { data } = await api<{ data: PortalDeal[] }>('/portal/deals')
    deal.value = data.find(d => parsed.value?.kind === 'contract' ? d.contract_id === parsed.value.id : d.proposal_id === parsed.value?.id) ?? null
  } catch { /* header falls back to the generic label */ }
}
onMounted(() => {
  loadDeal()
  socket.on('agreement:changed', loadDeal)
  socket.on('care-plan:changed', loadDeal)
})
onBeforeUnmount(() => {
  socket.off('agreement:changed', loadDeal)
  socket.off('care-plan:changed', loadDeal)
})

const title = computed(() => deal.value?.title || (parsed.value?.kind === 'contract' ? 'Agreement' : 'Proposal'))
useHead({ title: () => `${title.value} · Francis Web Agency` })

const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
const pdfUrl = computed(() => parsed.value?.kind === 'contract' ? `${apiBase}/portal/agreements/contract/${parsed.value.id}/pdf` : '')
const signed = computed(() => deal.value?.contract_status === 'signed')
// A signed care-plan agreement whose plan is still waiting for a card: the next step is one click away.
const cardNext = computed(() => deal.value?.kind === 'care_plan' && deal.value.care_plan_status === 'awaiting_card')

// ---- proposal: the three calls the shared view needs ----
const fetchView = async () => {
  const { data } = await api<{ data: View }>(`/portal/proposals/${parsed.value!.id}`)
  return data
}
const accept = async (name: string) => {
  const { data } = await api<{ data: { contract_id: number | null } }>(`/portal/proposals/${parsed.value!.id}/accept`, { method: 'POST', body: { name } })
  return data
}
const decline = (reason: string) => api(`/portal/proposals/${parsed.value!.id}/decline`, { method: 'POST', body: { reason } })
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- one-line header — the document below gets the room -->
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <NuxtLink
        to="/agreements"
        aria-label="Back to agreements"
        class="inline-flex size-8 flex-none items-center justify-center rounded-btn text-muted transition-colors hover:bg-mist hover:text-highlighted"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4.5"
        />
      </NuxtLink>
      <div class="min-w-0">
        <h1 class="truncate font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="deal"
          class="text-[12.5px] text-muted"
        >
          {{ kindLabel(deal) }} · {{ stageLine(deal) }}
        </p>
      </div>
      <span
        v-if="deal"
        class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
        :class="chip(deal).class"
      >{{ chip(deal).label }}</span>
      <span
        v-if="deal?.total != null"
        class="ml-auto text-[15px] font-bold text-highlighted tabular-nums"
      >
        {{ formatMoney(deal.total) }}<span
          v-if="deal.recurring"
          class="text-[11px] font-normal text-muted"
        >/mo</span>
      </span>
      <template v-if="parsed?.kind === 'contract' && deal">
        <NuxtLink
          v-if="signed && cardNext"
          to="/care-plan"
          class="inline-flex items-center rounded-btn bg-primary px-4 py-2 text-[13px] font-semibold text-inverted transition-colors hover:bg-primary/90"
        >
          Add Your Card
        </NuxtLink>
        <a
          v-if="signed"
          :href="pdfUrl"
          class="inline-flex items-center gap-1.5 rounded-btn border border-accented px-3.5 py-1.5 text-[12.5px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
        >
          <UIcon
            name="i-lucide-download"
            class="size-3.5"
          />
          Download PDF
        </a>
      </template>
    </div>

    <PortalDocEmbed
      v-if="parsed?.kind === 'contract'"
      :id="parsed.id"
      kind="contract"
    />
    <PortalProposalView
      v-else-if="parsed?.kind === 'proposal'"
      variant="portal"
      :fetch-view="fetchView"
      :on-accept="accept"
      :on-decline="decline"
      :default-name="user?.name || ''"
      @decided="loadDeal"
    />
    <div
      v-else
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Agreement not found
      </h3>
    </div>
  </div>
</template>
