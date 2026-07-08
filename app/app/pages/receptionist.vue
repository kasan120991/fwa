<script setup lang="ts">
useHead({ title: 'AI Receptionist · Francis Web Agency' })

type Classification = 'inquiry' | 'client' | 'spam' | 'wrong_number' | 'other'
interface Turn { r: boolean, t: string }
interface Call {
  id: number
  name: string | null
  number: string
  business: string | null
  type: Classification
  unread: boolean
  leadId: number | null
  clientId: number | null
  time: string
  ts: string
  duration: string
  dur: number
  summary: string
  captured: [string, string][]
  transcript: Turn[]
}

// Raw API row shape (subset we use).
interface ApiCall {
  id: number
  lead_id: number | null
  client_id: number | null
  classification: Classification
  caller_number: string
  caller_name: string | null
  summary: string | null
  transcript: Turn[] | null
  duration_seconds: number | null
  extracted: { business?: string | null, captured?: [string, string][] } | null
  reviewed: boolean
  occurred_at: string
}

const api = useApi()
const toast = useToast()

const calls = ref<Call[]>([])
const pending = ref(true)
const selectedId = ref<number | null>(null)

function mapCall(c: ApiCall): Call {
  return {
    id: c.id,
    name: c.caller_name,
    number: c.caller_number,
    business: c.extracted?.business ?? null,
    type: c.classification,
    unread: !c.reviewed,
    leadId: c.lead_id,
    clientId: c.client_id,
    time: timeAgo(c.occurred_at),
    ts: callTimestamp(c.occurred_at),
    duration: durationMMSS(c.duration_seconds),
    dur: c.duration_seconds ?? 0,
    summary: c.summary ?? '',
    captured: c.extracted?.captured ?? [],
    transcript: c.transcript ?? []
  }
}

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiCall[] }>('/calls')
    calls.value = data.map(mapCall)
    if (selectedId.value == null && calls.value.length) selectedId.value = calls.value[0].id
  } finally {
    pending.value = false
  }
}
onMounted(load)

const TYPE_LABEL: Record<Classification, string> = { inquiry: 'Inquiry', client: 'Client', spam: 'Spam', wrong_number: 'Wrong Number', other: 'Other' }
const TYPE_CHIP: Record<Classification, string> = {
  inquiry: 'bg-mist text-teal-700', client: 'bg-info/10 text-info', spam: 'bg-error/10 text-error', wrong_number: 'bg-muted text-default', other: 'bg-muted text-default'
}
const RECLASS_ORDER: Classification[] = ['inquiry', 'client', 'spam', 'wrong_number', 'other']

const stats = [
  { label: 'Calls This Week', value: '34', trend: '+12%' },
  { label: 'Inquiries Captured', value: '11', trend: '+4' },
  { label: 'After-Hours Answered', value: '7', trend: '' },
  { label: 'Avg. Duration', value: '3:12', trend: '' },
  { label: 'Converted To Leads', value: '6', trend: '+2' }
]

const activeTab = ref<'all' | 'inquiry' | 'client' | 'other'>('all')
const search = ref('')
const selected = ref<Record<number, boolean>>({})
const playing = ref(false)
const convertTarget = ref<Call | null>(null)
const newCall = ref(false)

function initialsOf(c: Call) { return initials(c.name) }

const counts = computed(() => ({
  all: calls.value.length,
  inquiry: calls.value.filter(c => c.type === 'inquiry').length,
  client: calls.value.filter(c => c.type === 'client').length,
  other: calls.value.filter(c => ['spam', 'wrong_number', 'other'].includes(c.type)).length
}))
const tabs = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'inquiry' as const, label: 'Inquiries', count: counts.value.inquiry },
  { key: 'client' as const, label: 'Clients', count: counts.value.client },
  { key: 'other' as const, label: 'Other', count: counts.value.other }
])

const visibleCalls = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = calls.value
  if (activeTab.value === 'inquiry') rows = rows.filter(c => c.type === 'inquiry')
  else if (activeTab.value === 'client') rows = rows.filter(c => c.type === 'client')
  else if (activeTab.value === 'other') rows = rows.filter(c => ['spam', 'wrong_number', 'other'].includes(c.type))
  if (q) rows = rows.filter(c => `${c.name ?? ''} ${c.number} ${c.business ?? ''} ${c.summary}`.toLowerCase().includes(q))
  return rows
})

const unreadCount = computed(() => calls.value.filter(c => c.unread).length)
const selCount = computed(() => Object.values(selected.value).filter(Boolean).length)
const allChecked = computed(() => visibleCalls.value.length > 0 && visibleCalls.value.every(c => selected.value[c.id]))
const anySelected = computed(() => selCount.value > 0)

function toggleAll() {
  const next = { ...selected.value }
  if (allChecked.value) visibleCalls.value.forEach(c => delete next[c.id])
  else visibleCalls.value.forEach(c => { next[c.id] = true })
  selected.value = next
}

async function selectCall(c: Call) {
  selectedId.value = c.id
  playing.value = false
  if (c.unread) {
    c.unread = false
    try { await api(`/calls/${c.id}`, { method: 'PATCH', body: { reviewed: true } }) } catch { c.unread = true }
  }
}

const cur = computed(() => calls.value.find(c => c.id === selectedId.value) ?? null)
const canConvert = computed(() => !!cur.value && cur.value.type === 'inquiry' && !cur.value.leadId && !cur.value.clientId)
const curReviewed = computed(() => cur.value ? !cur.value.unread : false)
const curLink = computed(() => {
  const c = cur.value
  if (!c) return null
  if (c.clientId) return { href: `/clients/${c.clientId}`, label: c.business || 'View client', kind: 'client' }
  if (c.leadId) return { href: `/leads/${c.leadId}`, label: c.business || 'View lead', kind: 'lead' }
  return null
})

const reclassItems = computed(() => [RECLASS_ORDER.map(k => ({
  label: TYPE_LABEL[k],
  icon: cur.value?.type === k ? 'i-lucide-check' : undefined,
  onSelect: () => reclassify(k)
}))])

async function reclassify(k: Classification) {
  if (!cur.value || cur.value.type === k) return
  const prev = cur.value.type
  cur.value.type = k
  try { await api(`/calls/${cur.value.id}`, { method: 'PATCH', body: { classification: k } }) } catch { cur.value.type = prev }
}

async function toggleReviewed() {
  if (!cur.value) return
  const next = cur.value.unread // becoming reviewed if currently unread
  cur.value.unread = !cur.value.unread
  try { await api(`/calls/${cur.value.id}`, { method: 'PATCH', body: { reviewed: next } }) } catch { cur.value.unread = !cur.value.unread }
}

async function confirmConvert() {
  const c = convertTarget.value
  if (!c) return
  try {
    const { data } = await api<{ data: { lead: { id: number } } }>(`/calls/${c.id}/convert`, { method: 'POST' })
    c.leadId = data.lead.id
    toast.add({ title: 'Lead created', description: `${c.name ?? c.number} added to Leads → Outreach.`, color: 'success' })
  } catch {
    toast.add({ title: "Couldn't convert", description: 'Please try again.', color: 'error' })
  } finally {
    convertTarget.value = null
  }
}

const waveform = computed(() => {
  const seed = cur.value?.dur ?? 100
  return Array.from({ length: 44 }, (_, i) => {
    const h = 5 + Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6)) * 20
    return { h: Math.round(h), played: playing.value && i < 14 }
  })
})

onMounted(() => {
  const t = setTimeout(() => { newCall.value = true }, 4500)
  onBeforeUnmount(() => clearTimeout(t))
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">AI Receptionist</h1>
          <span class="inline-flex items-center gap-1.5 rounded-full bg-success/10 py-1 pl-2.5 pr-3 text-[12.5px] font-semibold text-success">
            <span class="size-[7px] animate-pulse rounded-full bg-success" />Online
          </span>
        </div>
        <p class="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-phone" class="size-3.5" />Answering <span class="font-medium text-default tabular-nums">(415) 555-0100</span>
        </p>
      </div>
      <UButton icon="i-lucide-settings" color="neutral" variant="outline" class="rounded-full">Configure</UButton>
    </div>

    <!-- stat strip -->
    <div class="-mx-1 overflow-x-auto px-1">
      <div class="flex min-w-min gap-3">
        <div v-for="s in stats" :key="s.label" class="min-w-[170px] flex-1 rounded-[14px] bg-default p-4 ring ring-default">
          <div class="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">{{ s.label }}</div>
          <div class="mt-2 flex items-baseline gap-2">
            <div class="font-display text-[26px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ s.value }}</div>
            <span v-if="s.trend" class="text-xs font-semibold text-success tabular-nums">{{ s.trend }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- controls -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="inline-flex items-center gap-0.5 rounded-[10px] border border-default bg-muted p-0.5">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
          :class="activeTab === t.key ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-highlighted'"
          @click="activeTab = t.key"
        >
          {{ t.label }}
          <span class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" :class="activeTab === t.key ? 'bg-mist text-teal-700' : 'bg-elevated text-muted'">{{ t.count }}</span>
        </button>
      </div>
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search caller, number, transcript…" class="w-[260px]" :ui="{ base: 'rounded-full' }" />
    </div>

    <!-- master-detail -->
    <div class="relative flex h-[calc(100dvh-17rem)] min-h-[560px] overflow-hidden rounded-card bg-default ring ring-default">
      <!-- LIST -->
      <div class="flex w-full min-w-0 flex-col lg:w-96 lg:flex-none lg:border-r lg:border-default">
        <div class="flex flex-none items-center justify-between border-b border-default px-4 py-3">
          <button class="inline-flex items-center gap-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-highlighted" @click="toggleAll">
            <span class="inline-flex size-[18px] flex-none items-center justify-center rounded-[5px] border" :class="allChecked ? 'border-primary bg-primary' : 'border-accented bg-default'">
              <UIcon v-if="allChecked" name="i-lucide-check" class="size-3 text-white" />
            </span>
            {{ visibleCalls.length }} {{ visibleCalls.length === 1 ? 'call' : 'calls' }}
          </button>
          <span class="font-mono text-[11px] uppercase tracking-[0.04em] text-muted">{{ unreadCount > 0 ? `${unreadCount} unread` : 'All reviewed' }}</span>
        </div>

        <button
          v-if="newCall"
          class="flex flex-none items-center gap-2.5 border-b border-teal-100 bg-mist px-4 py-2.5 text-left text-[13px] font-semibold text-teal-800 transition-colors hover:bg-teal-50"
          @click="newCall = false; load()"
        >
          <span class="size-2 flex-none animate-pulse rounded-full bg-teal-500" />New call just came in — tap to load
        </button>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="pending" class="flex h-full items-center justify-center text-sm text-muted">Loading calls…</div>
          <template v-else-if="visibleCalls.length > 0">
            <div
              v-for="c in visibleCalls"
              :key="c.id"
              class="flex cursor-pointer gap-3 border-b border-l-[3px] border-default px-4 py-3.5 transition-colors"
              :class="selectedId === c.id ? 'border-l-teal-500 bg-mist' : (selected[c.id] ? 'border-l-transparent bg-teal-50' : 'border-l-transparent hover:bg-muted')"
              @click="selectCall(c)"
            >
              <div class="flex w-[22px] flex-none items-start justify-center pt-0.5" @click.stop>
                <button
                  v-if="selected[c.id] || anySelected"
                  class="inline-flex size-[18px] flex-none items-center justify-center rounded-[5px] border"
                  :class="selected[c.id] ? 'border-primary bg-primary' : 'border-accented bg-default'"
                  role="checkbox"
                  :aria-checked="!!selected[c.id]"
                  @click="selected[c.id] = !selected[c.id]"
                >
                  <UIcon v-if="selected[c.id]" name="i-lucide-check" class="size-3 text-white" />
                </button>
                <span v-else-if="c.unread" class="size-2 rounded-full bg-teal-500" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm text-highlighted" :class="c.unread ? 'font-bold' : 'font-semibold'">{{ c.name || formatPhone(c.number) }}</span>
                  <span class="flex-none whitespace-nowrap text-xs text-muted tabular-nums">{{ c.time }}</span>
                </div>
                <div class="mt-px truncate text-[12.5px] text-muted">{{ c.business || (c.name ? '' : 'Unknown caller') }}</div>
                <div class="mt-1.5 line-clamp-2 text-[13px] leading-snug text-default">{{ c.summary }}</div>
                <div class="mt-2 flex items-center gap-2.5">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="TYPE_CHIP[c.type]">{{ TYPE_LABEL[c.type] }}</span>
                  <span class="inline-flex items-center gap-1 text-xs text-muted tabular-nums"><UIcon name="i-lucide-clock" class="size-3" />{{ c.duration }}</span>
                  <UIcon name="i-lucide-mic" class="size-[13px] text-muted" />
                </div>
              </div>
            </div>
          </template>
          <div v-else class="flex flex-col items-center px-7 py-16 text-center">
            <span class="mb-3.5 inline-flex size-12 items-center justify-center rounded-xl bg-muted text-muted"><UIcon name="i-lucide-search" class="size-5" /></span>
            <h3 class="font-display text-[17px] font-medium text-highlighted">No Matching Calls</h3>
            <p class="mt-1 text-[13px] text-muted">Try a different search or filter.</p>
            <UButton color="neutral" variant="outline" size="xs" class="mt-3.5 rounded-full" @click="search = ''; activeTab = 'all'">Clear Filters</UButton>
          </div>
        </div>
      </div>

      <!-- DETAIL -->
      <div class="hidden min-w-0 flex-1 flex-col bg-muted lg:flex">
        <template v-if="cur">
          <div class="flex-none border-b border-default bg-default px-[26px] py-[22px]">
            <div class="flex items-start justify-between gap-3.5">
              <div class="flex min-w-0 items-center gap-3">
                <span class="inline-flex size-[46px] flex-none items-center justify-center rounded-xl bg-mist text-[15px] font-semibold text-teal-700">{{ initialsOf(cur) }}</span>
                <div class="min-w-0">
                  <div class="truncate text-lg font-semibold text-highlighted">{{ cur.name || formatPhone(cur.number) }}</div>
                  <div class="truncate text-[13px] text-muted tabular-nums">{{ (cur.business ? cur.business + ' · ' : '') + formatPhone(cur.number) }}</div>
                </div>
              </div>
              <UDropdownMenu :items="reclassItems">
                <button class="inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold" :class="TYPE_CHIP[cur.type]">
                  {{ TYPE_LABEL[cur.type] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
                </button>
              </UDropdownMenu>
            </div>
            <div class="mt-3.5 flex items-center gap-4 text-[12.5px] text-muted">
              <span class="inline-flex items-center gap-1.5"><UIcon name="i-lucide-calendar" class="size-[13px]" />{{ cur.ts }}</span>
              <span class="inline-flex items-center gap-1.5 tabular-nums"><UIcon name="i-lucide-clock" class="size-[13px]" />{{ cur.duration }}</span>
              <span v-if="curReviewed" class="inline-flex items-center gap-1.5 text-success"><UIcon name="i-lucide-check" class="size-[13px]" />Reviewed</span>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-[26px] pb-[26px] pt-[22px]">
            <div class="mb-[22px] flex items-center gap-3.5 rounded-xl bg-default p-4 ring ring-default">
              <UButton :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'" color="primary" :ui="{ base: 'rounded-full size-11 justify-center' }" aria-label="Play recording" @click="playing = !playing" />
              <div class="min-w-0 flex-1">
                <div class="flex h-[26px] items-center gap-px">
                  <span v-for="(b, i) in waveform" :key="i" class="flex-1 rounded-full" :class="b.played ? 'bg-teal-600' : 'bg-accented'" :style="{ height: b.h + 'px' }" />
                </div>
                <div class="mt-1.5 flex justify-between text-[11.5px] text-muted tabular-nums">
                  <span>{{ playing ? '1:12' : '0:00' }}</span><span>{{ cur.duration }}</span>
                </div>
              </div>
              <UButton icon="i-lucide-download" color="neutral" variant="outline" square size="sm" aria-label="Download recording" />
            </div>

            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Summary</div>
            <p class="mb-6 text-[14.5px] leading-relaxed text-default">{{ cur.summary }}</p>

            <div v-if="cur.captured.length" class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Captured details</div>
            <div v-if="cur.captured.length" class="mb-6 overflow-hidden rounded-xl bg-default ring ring-default">
              <div v-for="(f, i) in cur.captured" :key="f[0]" class="flex items-center justify-between gap-4 px-4 py-2.5" :class="i > 0 ? 'border-t border-default' : ''">
                <span class="w-[140px] flex-none text-[13px] text-muted">{{ f[0] }}</span>
                <span class="min-w-0 text-right text-[13.5px] font-medium text-highlighted">{{ f[1] }}</span>
              </div>
            </div>

            <div class="mb-3 flex items-center justify-between">
              <div class="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Transcript</div>
              <span class="text-xs text-muted">{{ cur.transcript.length }} turns</span>
            </div>
            <div class="flex flex-col gap-3.5">
              <div v-for="(t, i) in cur.transcript" :key="i" class="flex max-w-[86%] flex-col gap-1" :class="t.r ? 'self-start' : 'self-end'">
                <div class="px-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted" :class="t.r ? 'text-left' : 'text-right'">{{ t.r ? 'Receptionist' : 'Caller' }}</div>
                <div class="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed" :class="t.r ? 'rounded-bl-sm bg-default text-default ring ring-default' : 'rounded-br-sm bg-teal-800 text-white'">{{ t.t }}</div>
              </div>
            </div>
          </div>

          <div class="flex flex-none flex-wrap items-center gap-2.5 border-t border-default bg-default px-[26px] py-3.5">
            <UButton v-if="canConvert" icon="i-lucide-arrow-down-to-line" color="primary" @click="convertTarget = cur">Convert To Lead</UButton>
            <NuxtLink
              v-else-if="curLink"
              :to="curLink.href"
              class="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-mist px-4 py-2 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-50"
            >
              <span class="size-[7px] flex-none rounded-full" :class="curLink.kind === 'client' ? 'bg-info' : 'bg-teal-600'" />{{ curLink.label }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5 opacity-60" />
            </NuxtLink>
            <div class="flex-1" />
            <UButton :color="curReviewed ? 'success' : 'neutral'" :variant="curReviewed ? 'soft' : 'outline'" icon="i-lucide-check" class="rounded-full" @click="toggleReviewed">{{ curReviewed ? 'Reviewed' : 'Mark Reviewed' }}</UButton>
            <UButton icon="i-lucide-archive" color="neutral" variant="outline" class="rounded-full">Ignore</UButton>
          </div>
        </template>

        <div v-else class="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <span class="mb-4 inline-flex size-14 items-center justify-center rounded-[14px] bg-default text-muted ring ring-default"><UIcon name="i-lucide-inbox" class="size-6" /></span>
          <p class="max-w-[240px] text-sm text-muted">Select a call to read its summary, recording, and transcript.</p>
        </div>
      </div>

      <!-- bulk toolbar -->
      <div v-if="anySelected" class="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-inverted py-2 pl-4 pr-2 shadow-lg">
        <span class="whitespace-nowrap text-[13px] font-semibold text-white">{{ selCount }} selected</span>
        <span class="mx-1 h-5 w-px bg-white/20" />
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-check" class="size-[15px]" />Mark Reviewed</button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-tag" class="size-[15px]" />Reclassify</button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-error transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-trash-2" class="size-[15px]" />Delete</button>
        <button class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Clear selection" @click="selected = {}"><UIcon name="i-lucide-x" class="size-[15px]" /></button>
      </div>
    </div>

    <!-- convert-to-lead modal -->
    <UModal :open="!!convertTarget" title="Convert To Lead" @update:open="v => { if (!v) convertTarget = null }">
      <template #body>
        <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-mist text-teal-700"><UIcon name="i-lucide-arrow-down-to-line" class="size-5" /></span>
        <p class="text-[14.5px] leading-relaxed text-default">
          Create a lead for <strong class="text-highlighted">{{ convertTarget?.name || formatPhone(convertTarget?.number) }}</strong>.
          They'll appear in <strong class="text-highlighted">Leads → Outreach</strong> at the New stage, and this call will be linked to the new lead.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton color="neutral" variant="outline" class="rounded-full" @click="convertTarget = null">Cancel</UButton>
          <UButton icon="i-lucide-arrow-down-to-line" color="primary" class="rounded-full" @click="confirmConvert">Create Lead</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
