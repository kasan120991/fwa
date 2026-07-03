<script setup lang="ts">
useHead({ title: 'AI Receptionist · Francis Web Agency' })

// Calls sample data — mirrors the eventual /calls API. classification uses the
// CLAUDE.md enum (inquiry | client | spam | wrong_number | other).
type Classification = 'inquiry' | 'client' | 'spam' | 'wrong_number' | 'other'
interface Turn { r: boolean, t: string }
interface Call {
  id: string
  name: string | null
  number: string
  business: string | null
  type: Classification
  unread: boolean
  contactId: string | null
  time: string
  ts: string
  duration: string
  dur: number
  sortT: number
  summary: string
  captured: [string, string][]
  transcript: Turn[]
}

const calls: Call[] = [
  { id: 'delta', name: 'Rachel Munoz', number: '(415) 555-0148', business: 'Delta Kitchens', type: 'inquiry', unread: true, contactId: null, time: '12m ago', ts: 'Today, 9:12 AM', duration: '4:12', dur: 252, sortT: 0.2,
    summary: 'Rachel runs a kitchen-remodeling business and wants a new website with online consultation booking. Her current site is about six years old and not mobile-friendly. She mentioned an approximate budget and hopes to launch before spring.',
    captured: [['Name', 'Rachel Munoz'], ['Business', 'Delta Kitchens'], ['Reason for call', 'New website + online booking'], ['Callback number', '(415) 555-0148'], ['Timeline', 'Before spring'], ['Budget', 'Mentioned']],
    transcript: [
      { r: true, t: 'Thanks for calling Francis Web Agency — this is the front desk. How can I help you today?' },
      { r: false, t: "Hi, yeah, I run a kitchen remodeling business and I think I need a whole new website. Mine's pretty old." },
      { r: true, t: 'Happy to help with that. When you say old — is it not working on phones, or more that it looks dated?' },
      { r: false, t: 'Both, honestly. And I want people to be able to book a consultation online instead of calling.' },
      { r: true, t: 'Got it — a modern site with online booking built in. Do you have a rough timeline or budget in mind?' },
      { r: false, t: "I'd love to launch before spring. Budget's flexible but I want it done right." },
      { r: true, t: "Perfect. I'll pass this to the team with your number and they'll follow up with next steps. Anything else?" },
      { r: false, t: 'That covers it, thank you!' }
    ] },
  { id: 'bloom', name: 'Sofia Nguyen', number: '(212) 555-0173', business: 'Bloom Floral', type: 'inquiry', unread: true, contactId: 'bloom', time: '5h ago', ts: 'Today, 6:40 AM', duration: '3:28', dur: 208, sortT: 5,
    summary: 'Sofia owns a flower shop and wants to add e-commerce with same-day delivery scheduling. She currently takes orders by phone and is losing evening sales. Interested in a phased build starting with the storefront.',
    captured: [['Name', 'Sofia Nguyen'], ['Business', 'Bloom Floral'], ['Reason for call', 'E-commerce + delivery scheduling'], ['Callback number', '(212) 555-0173'], ['Current setup', 'Phone orders only']],
    transcript: [
      { r: true, t: 'Francis Web Agency, this is the front desk — how can I help?' },
      { r: false, t: 'Hi! I have a flower shop and I want to start selling online with delivery times customers can pick.' },
      { r: true, t: 'Lovely. Are you taking any orders online today, or all by phone right now?' },
      { r: false, t: 'All by phone, and I lose a lot of evening orders because of it.' },
      { r: true, t: "Understood — a storefront with scheduled delivery would cover that. I'll have the team reach out with options." },
      { r: false, t: 'Great, thanks so much.' }
    ] },
  { id: 'northwind', name: 'Dana Cole', number: '(503) 555-0110', business: 'Northwind Co. · Client', type: 'client', unread: false, contactId: 'northwind', time: '1d ago', ts: 'Yesterday, 3:22 PM', duration: '2:05', dur: 125, sortT: 26,
    summary: 'Dana from Northwind (existing client) called about an invoice question on their latest project milestone. Wanted to confirm the amount and the due date before approving internally.',
    captured: [['Name', 'Dana Cole'], ['Business', 'Northwind Co.'], ['Reason for call', 'Invoice question'], ['Callback number', '(503) 555-0110'], ['Account', 'Active client']],
    transcript: [
      { r: true, t: 'Francis Web Agency, front desk speaking.' },
      { r: false, t: "Hi, it's Dana from Northwind — I have a quick question about our latest invoice." },
      { r: true, t: "Of course, Dana. I'll flag this to your account owner so they can confirm the amount and due date." },
      { r: false, t: 'Perfect, thank you.' }
    ] },
  { id: 'robocall', name: null, number: '(800) 555-0011', business: null, type: 'spam', unread: false, contactId: null, time: '1d ago', ts: 'Yesterday, 11:04 AM', duration: '0:18', dur: 18, sortT: 30,
    summary: 'Automated robocall about an expiring vehicle warranty. No real caller — receptionist ended the call after detecting a pre-recorded message.',
    captured: [['Number', '(800) 555-0011'], ['Detected as', 'Robocall / warranty scam'], ['Action taken', 'Call ended']],
    transcript: [
      { r: true, t: 'Francis Web Agency, how can I help you?' },
      { r: false, t: '(Pre-recorded) We have been trying to reach you about your vehicle’s extended warranty…' },
      { r: true, t: 'This appears to be an automated message. Ending the call.' }
    ] },
  { id: 'wrong', name: null, number: '(646) 555-0295', business: null, type: 'wrong_number', unread: false, contactId: null, time: '2d ago', ts: '2 days ago, 4:47 PM', duration: '0:22', dur: 22, sortT: 52,
    summary: 'Caller was trying to reach a pharmacy and dialed the wrong number. Receptionist clarified and politely ended the call.',
    captured: [['Number', '(646) 555-0295'], ['Reason for call', 'Wanted a pharmacy'], ['Action taken', 'Clarified wrong number']],
    transcript: [
      { r: true, t: 'Francis Web Agency, how can I help you?' },
      { r: false, t: 'Oh — is this the pharmacy on 5th?' },
      { r: true, t: "You've reached Francis Web Agency, a web design studio. I think you may have the wrong number." },
      { r: false, t: 'Sorry about that!' }
    ] },
  { id: 'permit', name: 'City of Portland', number: '(503) 555-0777', business: 'Permitting Office', type: 'other', unread: false, contactId: null, time: '3d ago', ts: '3 days ago, 10:12 AM', duration: '1:10', dur: 70, sortT: 74,
    summary: 'Automated-adjacent message from the city permitting office following up on a business license renewal. Left a reference number and a callback line.',
    captured: [['Caller', 'City of Portland'], ['Reason for call', 'Business license renewal'], ['Reference', 'BL-2026-4471'], ['Callback number', '(503) 555-0777']],
    transcript: [
      { r: true, t: 'Francis Web Agency, front desk speaking.' },
      { r: false, t: 'This is the Portland permitting office regarding a business license renewal reference BL-2026-4471.' },
      { r: true, t: "Thank you — I'll log this and pass along the reference number to the owner." }
    ] },
  { id: 'fielder', name: 'Tom Fielder', number: '(503) 555-0192', business: 'Fielder Roofing', type: 'inquiry', unread: false, contactId: 'fielder', time: '3d ago', ts: '3 days ago, 2:05 PM', duration: '5:47', dur: 347, sortT: 75,
    summary: 'Tom wants a lead-generation site with quote-request forms and is comparing two agencies, so a fast proposal matters. Emphasized ranking locally for roofing searches.',
    captured: [['Name', 'Tom Fielder'], ['Business', 'Fielder Roofing'], ['Reason for call', 'Lead-gen site + quote forms'], ['Callback number', '(503) 555-0192'], ['Note', 'Comparing 2 agencies']],
    transcript: [
      { r: true, t: 'Francis Web Agency, how can I help?' },
      { r: false, t: 'I need a website that actually brings in roofing leads. Forms, quotes, the works.' },
      { r: true, t: "We do exactly that. I'll have the team send a proposal — I understand timing matters." },
      { r: false, t: "It does, I'm talking to a couple other folks. Appreciate it." }
    ] }
]

const TYPE_LABEL: Record<Classification, string> = { inquiry: 'Inquiry', client: 'Client', spam: 'Spam', wrong_number: 'Wrong number', other: 'Other' }
const TYPE_CHIP: Record<Classification, string> = {
  inquiry: 'bg-mist text-teal-700',
  client: 'bg-info/10 text-info',
  spam: 'bg-error/10 text-error',
  wrong_number: 'bg-muted text-default',
  other: 'bg-muted text-default'
}
const TYPE_DOT: Record<Classification, string> = {
  inquiry: 'bg-teal-600', client: 'bg-info', spam: 'bg-error', wrong_number: 'bg-ink-400', other: 'bg-ink-400'
}
const RECLASS_ORDER: Classification[] = ['inquiry', 'client', 'spam', 'wrong_number', 'other']

const stats = [
  { label: 'Calls this week', value: '34', trend: '+12%' },
  { label: 'Inquiries captured', value: '11', trend: '+4' },
  { label: 'After-hours answered', value: '7', trend: '' },
  { label: 'Avg. duration', value: '3:12', trend: '' },
  { label: 'Converted to leads', value: '6', trend: '+2' }
]

// Links to the contact a call belongs to (existing records).
const LINK_MAP: Record<string, { label: string, href: string, kind: 'lead' | 'client' }> = {
  bloom: { label: 'Sofia Nguyen · Lead', href: '/leads', kind: 'lead' },
  northwind: { label: 'Northwind Co. · Client', href: '/clients/northwind', kind: 'client' },
  fielder: { label: 'Tom Fielder · Lead', href: '/leads', kind: 'lead' }
}

// ---- reactive state ----
const activeTab = ref<'all' | 'inquiry' | 'client' | 'other'>('all')
const search = ref('')
const sortKey = ref<'newest' | 'oldest' | 'longest'>('newest')
const dateRange = ref<'today' | '7d' | '30d' | 'all'>('7d')
const selectedId = ref<string>('delta')
const selected = ref<Record<string, boolean>>({})
const reclass = ref<Record<string, Classification>>({})
const reviewed = ref<Record<string, boolean>>({})
const converted = ref<Record<string, boolean>>({})
const playing = ref(false)
const convertTarget = ref<Call | null>(null)
const newCall = ref(false)

const toast = useToast()

function effType(c: Call): Classification { return reclass.value[c.id] ?? c.type }
function isReviewed(c: Call) { return reviewed.value[c.id] ?? !c.unread }
function initialsOf(c: Call) { return c.name ? c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '#' }

const counts = computed(() => ({
  all: calls.length,
  inquiry: calls.filter(c => effType(c) === 'inquiry').length,
  client: calls.filter(c => effType(c) === 'client').length,
  other: calls.filter(c => ['spam', 'wrong_number', 'other'].includes(effType(c))).length
}))
const tabs = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'inquiry' as const, label: 'Inquiries', count: counts.value.inquiry },
  { key: 'client' as const, label: 'Clients', count: counts.value.client },
  { key: 'other' as const, label: 'Other', count: counts.value.other }
])

const visibleCalls = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = calls.slice()
  if (activeTab.value === 'inquiry') rows = rows.filter(c => effType(c) === 'inquiry')
  else if (activeTab.value === 'client') rows = rows.filter(c => effType(c) === 'client')
  else if (activeTab.value === 'other') rows = rows.filter(c => ['spam', 'wrong_number', 'other'].includes(effType(c)))
  if (q) rows = rows.filter(c => `${c.name ?? ''} ${c.number} ${c.business ?? ''} ${c.summary} ${c.transcript.map(t => t.t).join(' ')}`.toLowerCase().includes(q))
  rows.sort((a, b) => sortKey.value === 'oldest' ? b.sortT - a.sortT : (sortKey.value === 'longest' ? b.dur - a.dur : a.sortT - b.sortT))
  return rows
})

const unreadCount = computed(() => calls.filter(c => !isReviewed(c)).length)
const selCount = computed(() => Object.values(selected.value).filter(Boolean).length)
const allChecked = computed(() => visibleCalls.value.length > 0 && visibleCalls.value.every(c => selected.value[c.id]))
const anySelected = computed(() => selCount.value > 0)

function toggleAll() {
  const next = { ...selected.value }
  if (allChecked.value) visibleCalls.value.forEach(c => delete next[c.id])
  else visibleCalls.value.forEach(c => { next[c.id] = true })
  selected.value = next
}
function selectCall(c: Call) {
  selectedId.value = c.id
  playing.value = false
  reviewed.value = { ...reviewed.value, [c.id]: true }
}

// ---- current detail ----
const cur = computed(() => calls.find(c => c.id === selectedId.value) ?? null)
const curType = computed(() => cur.value ? effType(cur.value) : 'inquiry')
const curLink = computed(() => cur.value?.contactId ? LINK_MAP[cur.value.contactId] : null)
const curConverted = computed(() => cur.value ? !!converted.value[cur.value.id] : false)
const canConvert = computed(() => !!cur.value && curType.value === 'inquiry' && !cur.value.contactId && !curConverted.value)
const curReviewed = computed(() => cur.value ? isReviewed(cur.value) : false)

const reclassItems = computed(() => [RECLASS_ORDER.map(k => ({
  label: TYPE_LABEL[k],
  icon: curType.value === k ? 'i-lucide-check' : undefined,
  onSelect: () => { if (cur.value) reclass.value = { ...reclass.value, [cur.value.id]: k } }
}))])

const dateItems = computed(() => [([['today', 'Today'], ['7d', 'This week'], ['30d', 'This month'], ['all', 'All time']] as const).map(([k, label]) => ({
  label, icon: dateRange.value === k ? 'i-lucide-check' : undefined, onSelect: () => { dateRange.value = k }
}))])
const dateLabel = computed(() => ({ today: 'Today', '7d': 'This week', '30d': 'This month', all: 'All time' })[dateRange.value])

const sortItems = computed(() => [([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['longest', 'Longest call']] as const).map(([k, label]) => ({
  label, icon: sortKey.value === k ? 'i-lucide-check' : undefined, onSelect: () => { sortKey.value = k }
}))])

// waveform — decorative; first bars fill while "playing"
const waveform = computed(() => {
  const seed = cur.value?.dur ?? 100
  return Array.from({ length: 44 }, (_, i) => {
    const h = 5 + Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6)) * 20
    return { h: Math.round(h), played: playing.value && i < 14 }
  })
})

function toggleReviewed() {
  if (!cur.value) return
  const id = cur.value.id
  reviewed.value = { ...reviewed.value, [id]: !isReviewed(cur.value) }
}
function confirmConvert() {
  if (!convertTarget.value) return
  converted.value = { ...converted.value, [convertTarget.value.id]: true }
  toast.add({ title: 'Lead created', description: `${convertTarget.value.name ?? convertTarget.value.number} added to Leads → Inbound.`, color: 'success' })
  convertTarget.value = null
}

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
      <div class="flex items-center gap-2.5">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search caller, number, transcript…" class="w-[260px]" :ui="{ base: 'rounded-full' }" />
        <UDropdownMenu :items="dateItems">
          <UButton icon="i-lucide-calendar" trailing-icon="i-lucide-chevron-down" color="neutral" variant="outline" class="rounded-full">{{ dateLabel }}</UButton>
        </UDropdownMenu>
        <UDropdownMenu :items="sortItems">
          <UButton icon="i-lucide-arrow-down-wide-narrow" color="neutral" variant="outline" class="rounded-full">Sort</UButton>
        </UDropdownMenu>
      </div>
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
          @click="newCall = false"
        >
          <span class="size-2 flex-none animate-pulse rounded-full bg-teal-500" />New call just came in — tap to load
        </button>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <template v-if="visibleCalls.length > 0">
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
                <span v-else-if="!isReviewed(c)" class="size-2 rounded-full bg-teal-500" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm text-highlighted" :class="!isReviewed(c) ? 'font-bold' : 'font-semibold'">{{ c.name || c.number }}</span>
                  <span class="flex-none whitespace-nowrap text-xs text-muted tabular-nums">{{ c.time }}</span>
                </div>
                <div class="mt-px truncate text-[12.5px] text-muted">{{ c.business || (c.name ? '' : 'Unknown caller') }}</div>
                <div class="mt-1.5 line-clamp-2 text-[13px] leading-snug text-default">{{ c.summary }}</div>
                <div class="mt-2 flex items-center gap-2.5">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="TYPE_CHIP[effType(c)]">{{ TYPE_LABEL[effType(c)] }}</span>
                  <span class="inline-flex items-center gap-1 text-xs text-muted tabular-nums"><UIcon name="i-lucide-clock" class="size-3" />{{ c.duration }}</span>
                  <UIcon name="i-lucide-mic" class="size-[13px] text-muted" />
                </div>
              </div>
            </div>
          </template>
          <!-- no results -->
          <div v-else class="flex flex-col items-center px-7 py-16 text-center">
            <span class="mb-3.5 inline-flex size-12 items-center justify-center rounded-xl bg-muted text-muted"><UIcon name="i-lucide-search" class="size-5" /></span>
            <h3 class="font-display text-[17px] font-medium text-highlighted">No matching calls</h3>
            <p class="mt-1 text-[13px] text-muted">Try a different search or filter.</p>
            <UButton color="neutral" variant="outline" size="xs" class="mt-3.5 rounded-full" @click="search = ''; activeTab = 'all'">Clear filters</UButton>
          </div>
        </div>
      </div>

      <!-- DETAIL -->
      <div class="hidden min-w-0 flex-1 flex-col bg-muted lg:flex">
        <template v-if="cur">
          <!-- detail header -->
          <div class="flex-none border-b border-default bg-default px-[26px] py-[22px]">
            <div class="flex items-start justify-between gap-3.5">
              <div class="flex min-w-0 items-center gap-3">
                <span class="inline-flex size-[46px] flex-none items-center justify-center rounded-xl bg-mist text-[15px] font-semibold text-teal-700">{{ initialsOf(cur) }}</span>
                <div class="min-w-0">
                  <div class="truncate text-lg font-semibold text-highlighted">{{ cur.name || cur.number }}</div>
                  <div class="truncate text-[13px] text-muted tabular-nums">{{ (cur.business ? cur.business + ' · ' : '') + cur.number }}</div>
                </div>
              </div>
              <UDropdownMenu :items="reclassItems">
                <button class="inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold" :class="TYPE_CHIP[curType]">
                  {{ TYPE_LABEL[curType] }}<UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
                </button>
              </UDropdownMenu>
            </div>
            <div class="mt-3.5 flex items-center gap-4 text-[12.5px] text-muted">
              <span class="inline-flex items-center gap-1.5"><UIcon name="i-lucide-calendar" class="size-[13px]" />{{ cur.ts }}</span>
              <span class="inline-flex items-center gap-1.5 tabular-nums"><UIcon name="i-lucide-clock" class="size-[13px]" />{{ cur.duration }}</span>
              <span v-if="curReviewed" class="inline-flex items-center gap-1.5 text-success"><UIcon name="i-lucide-check" class="size-[13px]" />Reviewed</span>
            </div>
          </div>

          <!-- detail body -->
          <div class="min-h-0 flex-1 overflow-y-auto px-[26px] pb-[26px] pt-[22px]">
            <!-- recording -->
            <div class="mb-[22px] flex items-center gap-3.5 rounded-xl bg-default p-4 ring ring-default">
              <UButton
                :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
                color="primary"
                :ui="{ base: 'rounded-full size-11 justify-center' }"
                aria-label="Play recording"
                @click="playing = !playing"
              />
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

            <!-- summary -->
            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Summary</div>
            <p class="mb-6 text-[14.5px] leading-relaxed text-default">{{ cur.summary }}</p>

            <!-- captured details -->
            <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Captured details</div>
            <div class="mb-6 overflow-hidden rounded-xl bg-default ring ring-default">
              <div v-for="(f, i) in cur.captured" :key="f[0]" class="flex items-center justify-between gap-4 px-4 py-2.5" :class="i > 0 ? 'border-t border-default' : ''">
                <span class="w-[140px] flex-none text-[13px] text-muted">{{ f[0] }}</span>
                <span class="min-w-0 text-right text-[13.5px] font-medium text-highlighted">{{ f[1] }}</span>
              </div>
            </div>

            <!-- transcript -->
            <div class="mb-3 flex items-center justify-between">
              <div class="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Transcript</div>
              <span class="text-xs text-muted">{{ cur.transcript.length }} turns</span>
            </div>
            <div class="flex flex-col gap-3.5">
              <div v-for="(t, i) in cur.transcript" :key="i" class="flex max-w-[86%] flex-col gap-1" :class="t.r ? 'self-start' : 'self-end'">
                <div class="px-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted" :class="t.r ? 'text-left' : 'text-right'">{{ t.r ? 'Receptionist' : 'Caller' }}</div>
                <div
                  class="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                  :class="t.r ? 'rounded-bl-sm bg-default text-default ring ring-default' : 'rounded-br-sm bg-teal-800 text-white'"
                >{{ t.t }}</div>
              </div>
            </div>
          </div>

          <!-- actions -->
          <div class="flex flex-none flex-wrap items-center gap-2.5 border-t border-default bg-default px-[26px] py-3.5">
            <UButton v-if="canConvert" icon="i-lucide-arrow-down-to-line" color="primary" @click="convertTarget = cur">Convert to lead</UButton>
            <NuxtLink
              v-else-if="curLink"
              :to="curLink.href"
              class="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-mist px-4 py-2 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-50"
            >
              <span class="size-[7px] flex-none rounded-full" :class="curLink.kind === 'client' ? 'bg-info' : 'bg-teal-600'" />{{ curLink.label }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5 opacity-60" />
            </NuxtLink>
            <span v-else-if="curConverted" class="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-mist px-4 py-2 text-sm font-semibold text-teal-800">
              <span class="size-[7px] flex-none rounded-full bg-teal-600" />New lead · Leads
            </span>
            <div class="flex-1" />
            <UButton
              :icon="curReviewed ? 'i-lucide-check' : 'i-lucide-check'"
              :color="curReviewed ? 'success' : 'neutral'"
              :variant="curReviewed ? 'soft' : 'outline'"
              class="rounded-full"
              @click="toggleReviewed"
            >{{ curReviewed ? 'Reviewed' : 'Mark reviewed' }}</UButton>
            <UButton icon="i-lucide-archive" color="neutral" variant="outline" class="rounded-full">Ignore</UButton>
          </div>
        </template>

        <!-- detail empty -->
        <div v-else class="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <span class="mb-4 inline-flex size-14 items-center justify-center rounded-[14px] bg-default text-muted ring ring-default"><UIcon name="i-lucide-inbox" class="size-6" /></span>
          <p class="max-w-[240px] text-sm text-muted">Select a call to read its summary, recording, and transcript.</p>
        </div>
      </div>

      <!-- bulk toolbar -->
      <div v-if="anySelected" class="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-inverted py-2 pl-4 pr-2 shadow-lg">
        <span class="whitespace-nowrap text-[13px] font-semibold text-white">{{ selCount }} selected</span>
        <span class="mx-1 h-5 w-px bg-white/20" />
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-check" class="size-[15px]" />Mark reviewed</button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-tag" class="size-[15px]" />Reclassify</button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-arrow-down-to-line" class="size-[15px]" />Convert</button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-error transition-colors hover:bg-white/10" @click="selected = {}"><UIcon name="i-lucide-trash-2" class="size-[15px]" />Delete</button>
        <button class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Clear selection" @click="selected = {}"><UIcon name="i-lucide-x" class="size-[15px]" /></button>
      </div>
    </div>

    <!-- convert-to-lead modal -->
    <UModal :open="!!convertTarget" title="Convert to lead" @update:open="v => { if (!v) convertTarget = null }">
      <template #body>
        <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-mist text-teal-700"><UIcon name="i-lucide-arrow-down-to-line" class="size-5" /></span>
        <p class="text-[14.5px] leading-relaxed text-default">
          Create a contact for <strong class="text-highlighted">{{ convertTarget?.name || convertTarget?.number }}</strong>
          with source <strong class="text-highlighted">Call</strong>. They'll appear in
          <strong class="text-highlighted">Leads → Inbound</strong> at the New stage, and this call will be linked to the new contact.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton color="neutral" variant="outline" class="rounded-full" @click="convertTarget = null">Cancel</UButton>
          <UButton icon="i-lucide-arrow-down-to-line" color="primary" class="rounded-full" @click="confirmConvert">Create lead</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
