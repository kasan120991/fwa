<script setup lang="ts">
const route = useRoute()
const api = useApi()
const toast = useToast()

interface Ticket {
  id: number
  subject: string
  description: string | null
  type: string
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
  created_at: string | null
  last_activity_at: string | null
}
interface Message {
  id: number
  author_type: 'admin' | 'client'
  author_name?: string | null
  body: string
  created_at: string | null
}

const ticket = ref<Ticket | null>(null)
const messages = ref<Message[]>([])
const pending = ref(true)
const notFound = ref(false)

useHead({ title: () => `${ticket.value?.subject || 'Ticket'} · Francis Web Agency` })

async function load() {
  try {
    const { data } = await api<{ data: { ticket: Ticket, messages: Message[] } }>(`/portal/tickets/${route.params.id}`)
    ticket.value = data.ticket
    messages.value = data.messages
  } catch {
    notFound.value = true
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

// ---- reply ----
const reply = ref('')
const sending = ref(false)
async function sendReply() {
  const body = reply.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    await api(`/portal/tickets/${route.params.id}/messages`, { method: 'POST', body: { body } })
    reply.value = ''
    await load()
  } catch {
    toast.add({ title: 'Could not send your reply', color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/support"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      Support
    </NuxtLink>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="notFound || !ticket"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-medium text-highlighted">
        Ticket not found
      </h3>
    </div>

    <template v-else>
      <!-- header -->
      <div class="rounded-card bg-default p-6 ring ring-default">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow text-primary">
              {{ code(ticket.id) }}
            </p>
            <h1 class="mt-1 font-display text-[1.6rem] font-medium leading-tight tracking-tight text-highlighted">
              {{ ticket.subject }}
            </h1>
            <p class="mt-1 text-[13px] text-muted">
              Opened {{ shortDate(ticket.created_at) }}
            </p>
          </div>
          <span
            class="rounded-full px-3 py-1.5 text-[12px] font-semibold"
            :class="(STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.class"
          >{{ (STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.label }}</span>
        </div>
        <p
          v-if="ticket.description"
          class="mt-4 border-t border-default pt-4 text-[14px] leading-relaxed text-default"
        >
          {{ ticket.description }}
        </p>
      </div>

      <!-- thread -->
      <div class="flex flex-col gap-3">
        <div
          v-for="m in messages"
          :key="m.id"
          class="flex"
          :class="m.author_type === 'client' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[78%] rounded-card p-4"
            :class="m.author_type === 'client' ? 'bg-mist ring ring-primary/15' : 'bg-default ring ring-default'"
          >
            <div class="mb-1 flex items-baseline gap-2">
              <span class="text-[12px] font-semibold text-highlighted">
                {{ m.author_type === 'client' ? 'You' : (m.author_name || 'Francis Web Agency') }}
              </span>
              <span class="text-[11px] text-muted">{{ timeAgo(m.created_at) }}</span>
            </div>
            <p class="whitespace-pre-line text-[13.5px] leading-relaxed text-default">
              {{ m.body }}
            </p>
          </div>
        </div>
        <p
          v-if="!messages.length"
          class="py-4 text-center text-[13px] text-muted"
        >
          No replies yet — we'll respond here.
        </p>
      </div>

      <!-- reply box -->
      <div class="flex flex-col gap-3 rounded-card bg-default p-4 ring ring-default">
        <UTextarea
          v-model="reply"
          :rows="3"
          placeholder="Write a reply…"
          class="w-full"
        />
        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="i-lucide-send"
            :loading="sending"
            :disabled="!reply.trim()"
            @click="sendReply"
          >
            Send Reply
          </UButton>
        </div>
      </div>
    </template>
  </div>
</template>
