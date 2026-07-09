<script setup lang="ts">
definePageMeta({ title: 'Ticket', breadcrumb: 'Support' })

// Ticket detail — the ticket's fields + status controls, its reply thread, and
// file attachments. Attachments reuse the shared upload store (POST /uploads →
// POST /tickets/:id/attachments). Portal-ready: replies/files carry an
// admin|client author, but only the admin acts here this phase.
type Status = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
type Priority = 'low' | 'medium' | 'high'

interface Message {
  id: number
  ticket_id: number
  author_type: 'admin' | 'client'
  author_user_id: number | null
  author_name: string | null
  body: string
  created_at: string
}
interface Attachment {
  id: number
  ticket_id: number
  message_id: number | null
  path: string
  name: string
  mime: string | null
  size_bytes: number | null
  uploaded_by: 'admin' | 'client'
  created_at: string
}
interface Ticket {
  id: number
  client_id: number
  website_id: number | null
  subject: string
  description: string | null
  type: string
  status: Status
  priority: Priority
  created_at: string
  last_activity_at: string
  client_name: string | null
  client_company: string | null
  website_name: string | null
  website_domain: string | null
  messages: Message[]
  attachments: Attachment[]
}

const STATUS_ITEMS = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' }
]
const PRIORITY_ITEMS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }
]
const STATUS_CHIP: Record<Status, 'info' | 'warning' | 'success' | 'neutral'> = {
  open: 'info', in_progress: 'info', waiting: 'warning', resolved: 'success', closed: 'neutral'
}
const TYPE_LABEL: Record<string, string> = {
  update: 'Site Update', issue: 'Site Issue', bug: 'Bug', question: 'Question', other: 'Other'
}

const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()
const { upload, resolveUrl } = useUploads()
const ticketId = Number(route.params.id)

const ticket = ref<Ticket | null>(null)
const pending = ref(true)

useHead({ title: () => `${ticket.value ? `${ticketCode(ticket.value.id)} · ${ticket.value.subject}` : 'Ticket'} · Francis Web Agency` })

async function load() {
  try {
    const { data } = await api<{ data: Ticket }>(`/tickets/${ticketId}`)
    ticket.value = data
  } catch {
    ticket.value = null
  } finally {
    pending.value = false
  }
}

function onRemote(payload: { id: number }) {
  if (payload.id === ticketId) load()
}
function onRemoteDeleted(payload: { id: number }) {
  if (payload.id === ticketId) {
    toast.add({ title: 'This ticket was deleted', color: 'warning' })
    navigateTo('/support')
  }
}
onMounted(() => {
  load()
  socket.on('ticket:updated', onRemote)
  socket.on('ticket:deleted', onRemoteDeleted)
})
onBeforeUnmount(() => {
  socket.off('ticket:updated', onRemote)
  socket.off('ticket:deleted', onRemoteDeleted)
})

const clientLabel = computed(() => ticket.value?.client_company || ticket.value?.client_name || 'Unknown')
const siteLabel = computed(() => ticket.value?.website_name || ticket.value?.website_domain || '')
const ticketAttachments = computed(() => ticket.value?.attachments.filter(a => a.message_id == null) ?? [])
function messageAttachments(msgId: number) {
  return ticket.value?.attachments.filter(a => a.message_id === msgId) ?? []
}

function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ---- status / priority controls (PATCH on change) ----
async function patch(body: Record<string, unknown>) {
  if (!ticket.value) return
  try {
    const { data } = await api<{ data: Ticket }>(`/tickets/${ticketId}`, { method: 'PATCH', body })
    // Preserve thread/attachments (PATCH returns the row without them).
    ticket.value = { ...ticket.value, ...data }
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not update ticket', description: e?.data?.error?.message, color: 'error' })
    load()
  }
}

// ---- edit / delete ----
const editOpen = ref(false)
const deleting = ref(false)
async function removeTicket() {
  if (deleting.value) return
  deleting.value = true
  try {
    await api(`/tickets/${ticketId}`, { method: 'DELETE' })
    toast.add({ title: 'Ticket deleted', color: 'success' })
    navigateTo('/support')
  } catch {
    toast.add({ title: 'Could not delete ticket', color: 'error' })
    deleting.value = false
  }
}
const headerMenu = computed(() => [[
  { label: 'Edit Ticket', icon: 'i-lucide-pencil', onSelect: () => { editOpen.value = true } },
  { label: 'Open Client', icon: 'i-lucide-building-2', onSelect: () => navigateTo(`/clients/${ticket.value?.client_id}`) }
], [
  { label: 'Delete Ticket', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: removeTicket }
]])

// ---- reply thread ----
const newReply = ref('')
const posting = ref(false)
async function postReply() {
  const body = newReply.value.trim()
  if (!body || posting.value) return
  posting.value = true
  try {
    await api(`/tickets/${ticketId}/messages`, { method: 'POST', body: { body } })
    newReply.value = ''
    await load()
  } catch {
    toast.add({ title: 'Could not post reply', color: 'error' })
  } finally {
    posting.value = false
  }
}

// ---- attachments (upload → record) ----
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
function pickFiles() {
  fileInput.value?.click()
}
async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const res = await upload(file)
      await api(`/tickets/${ticketId}/attachments`, {
        method: 'POST',
        body: { path: res.path, name: res.name, mime: res.mime, size: res.size }
      })
    }
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not attach that file', description: e?.data?.error?.message, color: 'error' })
  } finally {
    uploading.value = false
  }
}
async function removeAttachment(a: Attachment) {
  try {
    await api(`/tickets/${ticketId}/attachments/${a.id}`, { method: 'DELETE' })
    await load()
  } catch {
    toast.add({ title: 'Could not remove attachment', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <NuxtLink
      to="/support"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      All tickets
    </NuxtLink>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!ticket"
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <UIcon
        name="i-lucide-search-x"
        class="size-6 text-dimmed"
      />
      <h3 class="mt-3 font-display text-lg font-medium text-highlighted">
        Ticket not found
      </h3>
      <UButton
        to="/support"
        color="neutral"
        variant="outline"
        class="mt-5 rounded-full"
      >
        Back to tickets
      </UButton>
    </div>

    <template v-else>
      <!-- header -->
      <div class="rounded-card bg-default p-5 ring ring-default">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              <span>{{ ticketCode(ticket.id) }}</span>
              <span>· {{ TYPE_LABEL[ticket.type] || ticket.type }}</span>
            </div>
            <h1 class="mt-1 font-display text-[24px] font-medium leading-tight tracking-tight text-highlighted">
              {{ ticket.subject }}
            </h1>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <NuxtLink
                :to="`/clients/${ticket.client_id}`"
                class="inline-flex items-center gap-1.5 font-medium text-default transition-opacity hover:opacity-80"
              >
                <UIcon
                  name="i-lucide-building-2"
                  class="size-3.5"
                />{{ clientLabel }}
              </NuxtLink>
              <span
                v-if="siteLabel"
                class="inline-flex items-center gap-1.5"
              >
                <UIcon
                  name="i-lucide-globe"
                  class="size-3.5"
                />{{ siteLabel }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <UIcon
                  name="i-lucide-clock"
                  class="size-3.5"
                />Opened {{ timeAgo(ticket.created_at) }}
              </span>
            </div>
          </div>
          <UDropdownMenu :items="headerMenu">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="outline"
              square
              aria-label="Ticket actions"
            />
          </UDropdownMenu>
        </div>

        <!-- status + priority controls -->
        <div class="mt-4 flex flex-wrap items-end gap-4 border-t border-default pt-4">
          <div class="w-40">
            <div class="mb-1 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Status
            </div>
            <USelect
              :model-value="ticket.status"
              :items="STATUS_ITEMS"
              class="w-full"
              @update:model-value="patch({ status: $event })"
            />
          </div>
          <div class="w-40">
            <div class="mb-1 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Priority
            </div>
            <USelect
              :model-value="ticket.priority"
              :items="PRIORITY_ITEMS"
              class="w-full"
              @update:model-value="patch({ priority: $event })"
            />
          </div>
          <StatusChip
            :status="STATUS_CHIP[ticket.status]"
            size="md"
            class="mb-1.5"
          >
            {{ STATUS_ITEMS.find(s => s.value === ticket!.status)?.label }}
          </StatusChip>
        </div>
      </div>

      <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
        <!-- main: description + thread -->
        <div class="flex flex-col gap-5">
          <div
            v-if="ticket.description"
            class="rounded-card bg-default p-5 ring ring-default"
          >
            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Details
            </div>
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-default">
              {{ ticket.description }}
            </p>
          </div>

          <!-- reply thread -->
          <div class="rounded-card bg-default p-5 ring ring-default">
            <div class="mb-4 flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">
                Activity
              </h2>
              <span class="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted tabular-nums">{{ ticket.messages.length }}</span>
            </div>

            <div
              v-if="ticket.messages.length"
              class="flex flex-col gap-4"
            >
              <div
                v-for="m in ticket.messages"
                :key="m.id"
                class="flex gap-3"
              >
                <span
                  class="mt-0.5 inline-flex size-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
                  :class="m.author_type === 'client' ? 'bg-sand text-highlighted' : 'bg-teal-800 text-white'"
                >{{ initials(m.author_name || (m.author_type === 'client' ? 'Client' : 'FWA')) }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-[13px] font-semibold text-highlighted">{{ m.author_name || (m.author_type === 'client' ? 'Client' : 'Team') }}</span>
                    <span class="font-mono text-[11px] uppercase tracking-[0.05em] text-dimmed">{{ timeAgo(m.created_at) }}</span>
                  </div>
                  <p class="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-default">
                    {{ m.body }}
                  </p>
                  <div
                    v-if="messageAttachments(m.id).length"
                    class="mt-2 flex flex-wrap gap-2"
                  >
                    <a
                      v-for="a in messageAttachments(m.id)"
                      :key="a.id"
                      :href="resolveUrl(a.path)"
                      target="_blank"
                      class="inline-flex items-center gap-1.5 rounded-lg border border-default bg-muted px-2.5 py-1 text-[12px] text-default transition-colors hover:border-accented"
                    >
                      <UIcon
                        name="i-lucide-paperclip"
                        class="size-3.5"
                      />{{ a.name }}
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <p
              v-else
              class="text-[13px] text-muted"
            >
              No replies yet.
            </p>

            <!-- add reply -->
            <div class="mt-4 border-t border-default pt-4">
              <UTextarea
                v-model="newReply"
                :rows="3"
                autoresize
                placeholder="Add a reply or internal note…"
                class="w-full"
              />
              <div class="mt-2.5 flex justify-end">
                <UButton
                  color="primary"
                  class="rounded-full"
                  :loading="posting"
                  :disabled="!newReply.trim()"
                  @click="postReply"
                >
                  Post Reply
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- side: attachments -->
        <div class="rounded-card bg-default p-5 ring ring-default">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">
                Attachments
              </h2>
              <span class="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted tabular-nums">{{ ticketAttachments.length }}</span>
            </div>
            <UButton
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              size="xs"
              class="rounded-full"
              :loading="uploading"
              @click="pickFiles"
            >
              Upload
            </UButton>
          </div>
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="onFilesChosen"
          >

          <div
            v-if="ticketAttachments.length"
            class="flex flex-col gap-2"
          >
            <div
              v-for="a in ticketAttachments"
              :key="a.id"
              class="group flex items-center gap-2.5 rounded-lg border border-default px-3 py-2"
            >
              <UIcon
                name="i-lucide-file"
                class="size-4 flex-none text-muted"
              />
              <a
                :href="resolveUrl(a.path)"
                target="_blank"
                class="min-w-0 flex-1"
              >
                <div class="truncate text-[13px] font-medium text-default group-hover:text-primary">{{ a.name }}</div>
                <div class="font-mono text-[11px] text-dimmed">{{ formatBytes(a.size_bytes) }}</div>
              </a>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="`Remove ${a.name}`"
                @click="removeAttachment(a)"
              />
            </div>
          </div>
          <button
            v-else
            class="w-full rounded-lg border border-dashed border-default px-4 py-6 text-center text-[13px] text-muted transition-colors hover:border-accented hover:text-highlighted"
            @click="pickFiles"
          >
            Drop or upload files for this ticket.
          </button>
        </div>
      </div>

      <TicketForm
        v-model:open="editOpen"
        mode="edit"
        :ticket="ticket"
        @saved="load"
      />
    </template>
  </div>
</template>
