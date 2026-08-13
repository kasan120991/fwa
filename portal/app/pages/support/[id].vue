<script setup lang="ts">
const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()
const user = useAuthUser()
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

// The case-file thread: the ticket's own description opens it, then messages.
interface Entry {
  key: string
  authorType: 'admin' | 'client'
  who: string
  at: string | null
  body: string
  attachments: Attachment[]
}
const entries = computed<Entry[]>(() => {
  const list: Entry[] = []
  if (ticket.value?.description) {
    list.push({
      key: 'opening',
      authorType: 'client',
      who: 'You',
      at: ticket.value.created_at,
      body: ticket.value.description,
      attachments: attachments.value.filter(a => a.message_id == null)
    })
  }
  for (const m of messages.value) {
    list.push({
      key: `m-${m.id}`,
      authorType: m.author_type,
      who: m.author_type === 'client' ? 'You' : (m.author_name ? `${m.author_name} · Francis Web Agency` : 'Francis Web Agency'),
      at: m.created_at,
      body: m.body,
      attachments: attachments.value.filter(a => a.message_id === m.id)
    })
  }
  return list
})

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
const clientInitials = computed(() => initials(user.value?.name))

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
  <div class="flex flex-col gap-5">
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
      <div>
        <p class="eyebrow text-primary">
          {{ code(ticket.id) }}
        </p>
        <h1 class="mt-1 font-display text-[1.6rem] font-semibold leading-tight tracking-tight text-highlighted">
          {{ ticket.subject }}
        </h1>
      </div>

      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_300px]">
        <!-- the thread — flat timestamped entries -->
        <div>
          <div
            v-for="e in entries"
            :key="e.key"
            class="flex gap-3 border-t border-default py-4 first:border-t-0 first:pt-0"
          >
            <span
              v-if="e.authorType === 'client'"
              class="inline-flex size-[30px] flex-none items-center justify-center rounded-btn bg-sand text-[11px] font-bold text-highlighted"
            >{{ clientInitials }}</span>
            <span
              v-else
              class="inline-flex size-[30px] flex-none items-center justify-center rounded-btn bg-deep"
            >
              <img
                src="/brand/fwa-mark-white.svg"
                alt=""
                class="size-3.5"
              >
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[12.5px] font-semibold text-highlighted">
                {{ e.who }}
                <span class="ml-1.5 font-normal text-muted">{{ shortDate(e.at) }} · {{ timeAgo(e.at) }}</span>
              </div>
              <p class="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-default">
                {{ e.body }}
              </p>
              <a
                v-for="att in e.attachments"
                :key="att.id"
                :href="resolveUrl(att.path)"
                target="_blank"
                rel="noopener"
                class="mt-2 mr-2 inline-flex items-center gap-1.5 rounded-chip bg-paper px-2.5 py-1 text-[12px] font-medium text-highlighted ring ring-default hover:ring-primary"
              >
                <UIcon
                  name="i-lucide-paperclip"
                  class="size-3.5"
                />
                {{ att.name }}
                <span
                  v-if="att.size_bytes"
                  class="text-muted"
                >{{ formatBytes(att.size_bytes) }}</span>
              </a>
            </div>
          </div>
          <p
            v-if="!entries.length"
            class="py-4 text-center text-[13px] text-muted"
          >
            No replies yet — we'll respond here.
          </p>

          <!-- composer at the thread's end -->
          <div class="mt-4 flex flex-col gap-3 rounded-card bg-default p-4 ring ring-default">
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
        </div>

        <!-- the case file rail -->
        <aside class="flex flex-col gap-4">
          <div class="rounded-card bg-default px-5 py-3 ring ring-default">
            <div class="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span class="text-muted">Status</span>
              <span
                class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
                :class="(STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.class"
              >{{ (STATUS_CHIP[ticket.status] || STATUS_CHIP.open)!.label }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-default py-2.5 text-[13px]">
              <span class="text-muted">Type</span>
              <span class="font-semibold text-highlighted">{{ TYPE_LABEL[ticket.type] || formatStatus(ticket.type) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-default py-2.5 text-[13px]">
              <span class="text-muted">Opened</span>
              <span class="font-semibold tabular-nums text-highlighted">{{ shortDate(ticket.created_at) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-default py-2.5 text-[13px]">
              <span class="text-muted">Last Activity</span>
              <span class="font-semibold tabular-nums text-highlighted">{{ timeAgo(ticket.last_activity_at) }}</span>
            </div>
          </div>

          <div
            v-if="attachments.length"
            class="rounded-card bg-default px-5 pb-2 pt-4 ring ring-default"
          >
            <p class="eyebrow pb-1.5">
              Attachments
            </p>
            <a
              v-for="att in attachments"
              :key="att.id"
              :href="resolveUrl(att.path)"
              target="_blank"
              rel="noopener"
              class="flex items-center gap-2 border-t border-default py-2.5 text-[12.5px] font-medium text-highlighted first:border-t-0 hover:underline"
            >
              <UIcon
                name="i-lucide-paperclip"
                class="size-3.5 flex-none text-muted"
              />
              <span class="min-w-0 flex-1 truncate">{{ att.name }}</span>
              <span
                v-if="att.size_bytes"
                class="text-[11.5px] font-normal text-muted"
              >{{ formatBytes(att.size_bytes) }}</span>
            </a>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
