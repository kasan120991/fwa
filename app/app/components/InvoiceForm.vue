<script setup lang="ts">
// New invoice — pick a client (+ optional project), add line items, and send
// via Stripe. A UModal reused from the Invoices page's "New invoice" button.
interface ContactOpt { id: number, company: string | null, name: string }
interface ProjectOpt { id: number, name: string, code: string | null }
interface LineRow { name: string, price: number | null, qty: number }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean], 'created': [] }>()

const api = useApi()
const toast = useToast()

const contactId = ref<number | undefined>(undefined)
const projectId = ref<number | null>(null)
const description = ref('')
const dueDate = ref('')
const lines = ref<LineRow[]>([{ name: '', price: null, qty: 1 }])
const contacts = ref<{ label: string, value: number }[]>([])
const projects = ref<{ label: string, value: number | null }[]>([{ label: 'No Project', value: null }])
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const total = computed(() => Math.round(lines.value.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0) * 100) / 100)
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function reset() {
  contactId.value = undefined
  projectId.value = null
  description.value = ''
  dueDate.value = ''
  lines.value = [{ name: '', price: null, qty: 1 }]
  errors.value = {}
}

async function loadContacts() {
  const { data } = await api<{ data: ContactOpt[] }>('/clients', { query: { limit: 200 } })
  contacts.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
}
async function loadProjects(cid: number) {
  const { data } = await api<{ data: ProjectOpt[] }>('/projects', { query: { client_id: cid } })
  projects.value = [{ label: 'No Project', value: null }, ...data.map(p => ({ label: `${p.code ? p.code + ' · ' : ''}${p.name}`, value: p.id }))]
}

watch(() => props.open, (o) => {
  if (o) {
    reset()
    if (!contacts.value.length) loadContacts()
  }
})
watch(contactId, (cid) => {
  projectId.value = null
  projects.value = [{ label: 'No Project', value: null }]
  if (cid) loadProjects(cid)
})

function addLine() {
  lines.value.push({ name: '', price: null, qty: 1 })
}
function removeLine(i: number) {
  lines.value.splice(i, 1)
  if (!lines.value.length) addLine()
}

function validate() {
  const e: Record<string, string> = {}
  if (!contactId.value) e.contact = 'Choose a client.'
  const valid = lines.value.filter(l => l.name.trim() && Number(l.price) > 0)
  if (!valid.length) e.items = 'Add at least one line with a name and price.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value) return
  if (!validate()) return
  saving.value = true
  try {
    const items = lines.value
      .filter(l => l.name.trim() && Number(l.price) > 0)
      .map(l => ({ name: l.name.trim(), unit_price: Number(l.price), qty: Number(l.qty) || 1 }))
    const { data } = await api<{ data: { hosted_invoice_url: string | null } }>('/invoices', {
      method: 'POST',
      body: {
        client_id: contactId.value,
        project_id: projectId.value,
        description: description.value || undefined,
        due_date: dueDate.value || undefined,
        items
      }
    })
    toast.add({
      title: 'Invoice sent',
      description: 'The invoice was created and emailed to the client.',
      color: 'success',
      actions: data.hosted_invoice_url ? [{ label: 'View Invoice', to: data.hosted_invoice_url, target: '_blank' }] : undefined
    })
    emit('created')
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not create invoice', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                Billing
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                New Invoice
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

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="Client"
                :required="true"
                :error="errors.contact"
              >
                <USelect
                  v-model="contactId"
                  :items="contacts"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Project (Optional)">
                <USelect
                  v-model="projectId"
                  :items="projects"
                  :disabled="!contactId"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <UFormField label="Description">
                <UInput
                  v-model="description"
                  placeholder="Website care — March"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Due Date">
                <UInput
                  v-model="dueDate"
                  type="date"
                  size="lg"
                  class="w-full sm:w-44"
                />
              </UFormField>
            </div>

            <!-- line items -->
            <div>
              <div class="mb-2 flex items-center justify-between">
                <label class="text-sm font-medium text-default">Line items</label>
                <span
                  v-if="errors.items"
                  class="text-[12.5px] text-error"
                >{{ errors.items }}</span>
              </div>
              <div class="flex flex-col gap-2">
                <div
                  v-for="(l, i) in lines"
                  :key="i"
                  class="flex items-center gap-2"
                >
                  <UInput
                    v-model="l.name"
                    placeholder="Item description"
                    class="flex-1"
                  />
                  <UInput
                    v-model.number="l.qty"
                    type="number"
                    min="1"
                    class="w-16"
                    :ui="{ base: 'text-center' }"
                  />
                  <UInput
                    v-model.number="l.price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    icon="i-lucide-dollar-sign"
                    class="w-32"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Remove line ${i + 1}`"
                    @click="removeLine(i)"
                  />
                </div>
              </div>
              <div class="mt-2.5 flex items-center justify-between">
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  class="rounded-full"
                  @click="addLine"
                >
                  Add Line
                </UButton>
                <span class="text-[13px] text-muted">Total <span class="ml-1.5 font-semibold text-highlighted tabular-nums">{{ money(total) }}</span></span>
              </div>
            </div>
          </div>
        </div>

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
              icon="i-lucide-send"
              :loading="saving"
              @click="save"
            >
              Create &amp; Send
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
