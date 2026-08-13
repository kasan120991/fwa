<script setup lang="ts">
useHead({ title: 'Support · Francis Web Agency' })
const api = useApi()
const toast = useToast()

interface Ticket {
  id: number
  subject: string
  type: string
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high'
  last_activity_at: string | null
  message_count?: number
}
const tickets = ref<Ticket[]>([])
const pending = ref(true)

async function load() {
  try {
    const { data } = await api<{ data: Ticket[] }>('/portal/tickets')
    tickets.value = data
  } finally {
    pending.value = false
  }
}
onMounted(load)

const STATUS_CHIP: Record<string, { label: string, class: string }> = {
  open: { label: 'Open', class: 'bg-info/10 text-info' },
  in_progress: { label: 'In Progress', class: 'bg-info/10 text-info' },
  waiting: { label: 'Waiting on You', class: 'bg-warning/10 text-warning' },
  resolved: { label: 'Resolved', class: 'bg-success/10 text-success' },
  closed: { label: 'Closed', class: 'bg-mist text-muted' }
}
const TYPE_LABEL: Record<string, string> = {
  question: 'Question',
  issue: 'Site Issue',
  bug: 'Bug Report',
  update: 'Content Update',
  other: 'Request'
}
const code = (id: number) => `SR-${String(id).padStart(3, '0')}`

function metaLine(t: Ticket) {
  const parts = [TYPE_LABEL[t.type] || formatStatus(t.type)]
  if (t.message_count) parts.push(`${t.message_count} ${t.message_count === 1 ? 'message' : 'messages'}`)
  if (t.last_activity_at) {
    parts.push(t.status === 'resolved' || t.status === 'closed'
      ? `${STATUS_CHIP[t.status]!.label} ${shortDate(t.last_activity_at)}`
      : `updated ${timeAgo(t.last_activity_at)}`)
  }
  return parts.join(' · ')
}

// The inbox groups by whose move it is: yours first, then ours, then history.
const needsYou = computed(() => tickets.value.filter(t => t.status === 'waiting'))
const openTickets = computed(() => tickets.value.filter(t => t.status === 'open' || t.status === 'in_progress'))
const closedTickets = computed(() => tickets.value.filter(t => t.status === 'resolved' || t.status === 'closed'))
const groups = computed(() => [
  { key: 'needs-you', label: 'Needs Your Reply', items: needsYou.value, dim: false },
  { key: 'open', label: 'Open', items: openTickets.value, dim: false },
  { key: 'closed', label: 'Closed', items: closedTickets.value, dim: true }
].filter(g => g.items.length))

// ---- new ticket ----
const formOpen = ref(false)
const subject = ref('')
const type = ref('question')
const description = ref('')
const saving = ref(false)
const TYPE_ITEMS = [
  { label: 'Question', value: 'question' },
  { label: 'Site issue', value: 'issue' },
  { label: 'Bug report', value: 'bug' },
  { label: 'Content update', value: 'update' },
  { label: 'Something else', value: 'other' }
]
async function submit() {
  if (saving.value || !subject.value.trim()) return
  saving.value = true
  try {
    const { data } = await api<{ data: Ticket }>('/portal/tickets', {
      method: 'POST',
      body: { subject: subject.value.trim(), type: type.value, description: description.value.trim() || null }
    })
    toast.add({ title: 'Ticket opened', description: `${code(data.id)} — we'll get back to you soon.`, color: 'success' })
    subject.value = ''
    description.value = ''
    type.value = 'question'
    formOpen.value = false
    await load()
    await navigateTo(`/support/${data.id}`)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not open ticket', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow text-primary">
          We're Here to Help
        </p>
        <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
          Support
        </h1>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        @click="() => { formOpen = !formOpen }"
      >
        New Ticket
      </UButton>
    </div>

    <!-- new ticket form -->
    <div
      v-if="formOpen"
      class="flex flex-col gap-4 rounded-card bg-default p-6 ring ring-default"
    >
      <UFormField
        label="Subject"
        required
      >
        <UInput
          v-model="subject"
          placeholder="What do you need help with?"
          size="lg"
          class="w-full"
        />
      </UFormField>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr]">
        <UFormField label="Type">
          <USelect
            v-model="type"
            :items="TYPE_ITEMS"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Details">
          <UTextarea
            v-model="description"
            :rows="3"
            placeholder="Anything that helps us understand — links, pages, what you expected."
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="flex items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          @click="() => { formOpen = false }"
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          :loading="saving"
          :disabled="!subject.trim()"
          @click="submit"
        >
          Open Ticket
        </UButton>
      </div>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!tickets.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No tickets yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Need a hand with your site? Open a ticket and we'll take it from there.
      </p>
    </div>

    <!-- the inbox, grouped by whose move it is -->
    <section
      v-for="g in groups"
      :key="g.key"
    >
      <p class="eyebrow mb-1">
        {{ g.label }}
      </p>
      <NuxtLink
        v-for="t in g.items"
        :key="t.id"
        :to="`/support/${t.id}`"
        class="flex items-center gap-4 border-t border-default py-3.5 transition-colors first:border-t-0 hover:bg-muted/50"
      >
        <span class="w-14 flex-none text-[12px] tabular-nums text-muted">{{ code(t.id) }}</span>
        <div class="min-w-0 flex-1">
          <div
            class="truncate text-[13.5px] font-medium"
            :class="g.dim ? 'text-muted' : 'text-highlighted'"
          >
            {{ t.subject }}
          </div>
          <div class="text-[12px] text-muted">
            {{ metaLine(t) }}
          </div>
        </div>
        <span
          class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
          :class="(STATUS_CHIP[t.status] || STATUS_CHIP.open)!.class"
        >{{ (STATUS_CHIP[t.status] || STATUS_CHIP.open)!.label }}</span>
      </NuxtLink>
    </section>
  </div>
</template>
