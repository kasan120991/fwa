<script setup lang="ts">
// Support ticket form — the admin opens a ticket for a client (site update,
// issue, bug). A modal reused from the /support page and the client Support
// tab. When launched from a client the client is locked. Optionally references
// one of that client's websites.
interface TicketRow {
  id: number
  client_id: number
  website_id: number | null
  subject: string
  description: string | null
  type: string
  status: string
  priority: string
  client_company?: string | null
  client_name?: string | null
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  ticket?: TicketRow | null
  // Lock the client when launched from a client detail page (create mode).
  clientId?: number | null
  clientLabel?: string | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [TicketRow] }>()

const api = useApi()
const toast = useToast()

const TYPE_ITEMS = [
  { label: 'Site Update', value: 'update' },
  { label: 'Site Issue', value: 'issue' },
  { label: 'Bug', value: 'bug' },
  { label: 'Question', value: 'question' },
  { label: 'Other', value: 'other' }
]
const PRIORITY_ITEMS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }
]
const STATUS_ITEMS = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' }
]

interface FormState {
  client_id: number | undefined
  website_id: number | undefined
  subject: string
  description: string
  type: string
  priority: string
  status: string
}
function blank(): FormState {
  return {
    client_id: props.clientId ?? undefined,
    website_id: undefined,
    subject: '', description: '', type: 'update', priority: 'medium', status: 'open'
  }
}

const form = reactive<FormState>(blank())
const clients = ref<{ label: string, value: number }[]>([])
const websites = ref<{ label: string, value: number }[]>([])
const saving = ref(false)
const errors = ref<Record<string, string>>({})

// Website options are always the selected client's sites; '' clears the link.
const websiteItems = computed(() => [{ label: 'No specific site', value: 0 }, ...websites.value])

async function loadWebsites(clientId: number | undefined) {
  websites.value = []
  if (!clientId) return
  try {
    const { data } = await api<{ data: { id: number, name: string, domain: string }[] }>('/websites', { query: { client_id: clientId, limit: 200 } })
    websites.value = data.map(w => ({ label: w.name || w.domain, value: w.id }))
  } catch {
    // Non-fatal — the site link is optional.
  }
}

function fillFrom(t: TicketRow) {
  Object.assign(form, {
    client_id: t.client_id,
    website_id: t.website_id ?? undefined,
    subject: t.subject || '',
    description: t.description || '',
    type: t.type,
    priority: t.priority,
    status: t.status
  })
}

async function init() {
  errors.value = {}
  // Client picker only when creating without a locked client.
  if (props.mode === 'create' && !props.clientId && !clients.value.length) {
    try {
      const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/clients', { query: { limit: 200 } })
      clients.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
    } catch {
      toast.add({ title: 'Could not load clients', color: 'error' })
    }
  }

  if (props.mode === 'edit' && props.ticket) {
    fillFrom(props.ticket)
  } else {
    Object.assign(form, blank())
  }
  await loadWebsites(form.client_id)
}

watch(() => props.open, (o) => {
  if (o) init()
})

// When the user picks a different client (create mode), drop the stale site link
// and load that client's sites. Driven off the select so init() stays race-free.
function onClientChange(id: number) {
  form.client_id = id
  form.website_id = undefined
  loadWebsites(id)
}

function payload() {
  return {
    client_id: form.client_id,
    website_id: form.website_id ? form.website_id : null,
    subject: form.subject.trim(),
    description: form.description.trim() || null,
    type: form.type,
    priority: form.priority,
    status: form.status
  }
}

function validate() {
  const e: Record<string, string> = {}
  if (!form.subject.trim()) e.subject = 'A subject is required.'
  if (!form.client_id) e.client_id = 'Choose a client.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value) return
  if (!validate()) return
  saving.value = true
  try {
    let ticket: TicketRow
    if (props.mode === 'create') {
      const { data } = await api<{ data: TicketRow }>('/tickets', { method: 'POST', body: payload() })
      ticket = data
      toast.add({ title: 'Ticket created', description: `“${ticket.subject}” was opened.`, color: 'success' })
    } else {
      const { data } = await api<{ data: TicketRow }>(`/tickets/${props.ticket!.id}`, { method: 'PATCH', body: payload() })
      ticket = data
      toast.add({ title: 'Ticket saved', color: 'success' })
    }
    emit('saved', ticket)
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not save ticket', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

const lockedClientLabel = computed(() => props.clientLabel || props.ticket?.client_company || props.ticket?.client_name || 'Selected client')
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <!-- header -->
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">
                Support
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                {{ mode === 'edit' ? 'Edit Ticket' : 'New Ticket' }}
              </h2>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="outline"
              square
              size="sm"
              aria-label="Close"
              @click="emit('update:open', false)"
            />
          </div>
        </div>

        <!-- body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div class="flex flex-col gap-5">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="Client"
                :required="true"
                :error="errors.client_id"
              >
                <UInput
                  v-if="mode === 'edit' || clientId"
                  :model-value="lockedClientLabel"
                  disabled
                  size="lg"
                  class="w-full"
                />
                <USelect
                  v-else
                  :model-value="form.client_id"
                  :items="clients"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                  @update:model-value="onClientChange"
                />
              </UFormField>
              <UFormField label="Website (optional)">
                <USelect
                  v-model="form.website_id"
                  :items="websiteItems"
                  :disabled="!form.client_id || !websites.length"
                  placeholder="No specific site"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              label="Subject"
              :required="true"
              :error="errors.subject"
            >
              <UInput
                v-model="form.subject"
                placeholder="Update homepage hero copy"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField label="Type">
                <USelect
                  v-model="form.type"
                  :items="TYPE_ITEMS"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Priority">
                <USelect
                  v-model="form.priority"
                  :items="PRIORITY_ITEMS"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Status">
                <USelect
                  v-model="form.status"
                  :items="STATUS_ITEMS"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField label="Details">
              <UTextarea
                v-model="form.description"
                :rows="4"
                autoresize
                placeholder="What needs doing? Include context, links, and any specifics."
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <!-- footer -->
        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex items-center justify-end gap-2.5">
            <UButton
              color="neutral"
              variant="outline"
              class="rounded-full"
              @click="emit('update:open', false)"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              class="rounded-full"
              :loading="saving"
              @click="save"
            >
              {{ mode === 'edit' ? 'Save Changes' : 'Create Ticket' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
