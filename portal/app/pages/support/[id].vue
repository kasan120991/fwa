<script setup lang="ts">
const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

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
interface Attachment {
  id: number
  message_id: number | null
  path: string
  name: string
  size_bytes: number | null
  uploaded_by: 'admin' | 'client'
}

const ticket = ref<Ticket | null>(null)
const messages = ref<Message[]>([])
const attachments = ref<Attachment[]>([])
const pending = ref(true)
const notFound = ref(false)

useHead({ title: () => `${ticket.value?.subject || 'Ticket'} · Francis Web Agency` })

async function load() {
  try {
    const { data } = await api<{ data: { ticket: Ticket, messages: Message[], attachments: Attachment[] } }>(`/portal/tickets/${route.params.id}`)
    ticket.value = data.ticket
    messages.value = data.messages
    attachments.value = data.attachments ?? []
  } catch {
    notFound.value = true
  } finally {
    pending.value = false
  }
}
onMounted(() => {
  load()
  socket.on('ticket:updated', load)
})
onBeforeUnmount(() => socket.off('ticket:updated', load))

// attachments not tied to a specific message (e.g. added standalone)
const ticketAttachments = computed(() => attachments.value.filter(a => a.message_id == null))
function attachmentsFor(messageId: number) {
  return attachments.value.filter(a => a.message_id === messageId)
}

const STATUS_CHIP: Record<string, { label: string, class: string }> = {
  open: { label: 'Open', class: 'bg-mist text-primary' },
  in_progress: { label: 'In Progress', class: 'bg-mist text-primary' },
  waiting: { label: 'Waiting on You', class: 'bg-warning/10 text-warning' },
  resolved: { label: 'Resolved', class: 'bg-success/10 text-success' },
  closed: { label: 'Closed', class: 'bg-muted text-muted' }
}
const code = (id: number) => `SR-${String(id).padStart(3, '0')}`

function formatSize(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---- reply (with an optional attachment) ----
const reply = ref('')
const sending = ref(false)
const pendingFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  pendingFile.value = input.files?.[0] ?? null
}
async function sendReply() {
  const body = reply.value.trim()
  if ((!body && !pendingFile.value) || sending.value) return
  sending.value = true
  try {
    // A message is required to hang an attachment on; use a placeholder if the
    // client only attached a file.
    const { data: message } = await api<{ data: { id: number } }>(`/portal/tickets/${route.params.id}/messages`, {
      method: 'POST',
      body: { body: body || `Attached ${pendingFile.value?.name}` }
    })
    if (pendingFile.value) {
      const res = await upload(pendingFile.value)
      await api(`/portal/tickets/${route.params.id}/attachments`, {
        method: 'POST',
        body: { path: res.path, name: res.name, mime: res.mime, size: res.size, message_id: message.id }
      })
    }
    reply.value = ''
    pendingFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send your reply', description: e?.data?.error?.message || undefined, color: 'error' })
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
      <h3 class="font-display text-lg font-semibold text-highlighted">
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
            <h1 class="mt-1 font-display text-[1.6rem] font-semibold leading-tight tracking-tight text-highlighted">
              {{ ticket.subject }}
            </h1>
            <p class="mt-1 text-[13px] text-muted">
              Opened {{ shortDate(ticket.created_at) }}
            </p>
          </div>
          <span
            class="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            :class="(STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.class"
          >{{ (STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.label }}</span>
        </div>
        <p
          v-if="ticket.description"
          class="mt-4 border-t border-default pt-4 text-[14px] leading-relaxed text-default"
        >
          {{ ticket.description }}
        </p>
        <div
          v-if="ticketAttachments.length"
          class="mt-3 flex flex-wrap gap-2"
        >
          <a
            v-for="att in ticketAttachments"
            :key="att.id"
            :href="resolveUrl(att.path)"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-chip bg-muted px-2.5 py-1 text-[12px] font-medium text-primary"
          >
            <UIcon
              name="i-lucide-paperclip"
              class="size-3.5"
            />
            {{ att.name }}
          </a>
        </div>
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
            <a
              v-for="att in attachmentsFor(m.id)"
              :key="att.id"
              :href="resolveUrl(att.path)"
              target="_blank"
              rel="noopener"
              class="mt-2 inline-flex items-center gap-1.5 rounded-chip bg-default/70 px-2.5 py-1 text-[12px] font-medium text-primary ring ring-default"
            >
              <UIcon
                name="i-lucide-paperclip"
                class="size-3.5"
              />
              {{ att.name }}
              <span class="text-muted">{{ formatSize(att.size_bytes) }}</span>
            </a>
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
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          @change="onFilePicked"
        >
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-paperclip"
              size="sm"
              @click="() => fileInput?.click()"
            >
              Attach
            </UButton>
            <span
              v-if="pendingFile"
              class="truncate text-[12.5px] text-muted"
            >{{ pendingFile.name }}</span>
          </div>
          <UButton
            color="primary"
            icon="i-lucide-send"
            :loading="sending"
            :disabled="!reply.trim() && !pendingFile"
            @click="sendReply"
          >
            Send Reply
          </UButton>
        </div>
      </div>
    </template>
  </div>
</template>
