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
  open: { label: 'Open', class: 'bg-mist text-primary' },
  in_progress: { label: 'In Progress', class: 'bg-mist text-primary' },
  waiting: { label: 'Waiting on you', class: 'bg-warning/10 text-warning' },
  resolved: { label: 'Resolved', class: 'bg-success/10 text-success' },
  closed: { label: 'Closed', class: 'bg-muted text-muted' }
}
const code = (id: number) => `SR-${String(id).padStart(3, '0')}`

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
          We're here to help
        </p>
        <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
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
      <h3 class="font-display text-lg font-medium text-highlighted">
        No tickets yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Need a hand with your site? Open a ticket and we'll take it from there.
      </p>
    </div>

    <div
      v-else
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <NuxtLink
        v-for="t in tickets"
        :key="t.id"
        :to="`/support/${t.id}`"
        class="flex items-center gap-4 border-b border-default px-5 py-4 transition-colors last:border-0 hover:bg-muted/50"
      >
        <span class="font-mono text-[12px] text-muted">{{ code(t.id) }}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[14px] font-medium text-highlighted">
            {{ t.subject }}
          </div>
          <div class="text-[12.5px] text-muted">
            Updated {{ timeAgo(t.last_activity_at) }}
          </div>
        </div>
        <span
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="(STATUS_CHIP[t.status] || STATUS_CHIP.open)!.class"
        >{{ (STATUS_CHIP[t.status] || STATUS_CHIP.open)!.label }}</span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 flex-none text-muted"
        />
      </NuxtLink>
    </div>
  </div>
</template>
