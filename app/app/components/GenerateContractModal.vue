<script setup lang="ts">
// Confirm-and-generate the project's contract. Pre-fills from the project SOW,
// lets the owner tweak the essentials (title, recipient, dates, deposit %, line
// items, special terms), then POSTs /projects/:id/contract to create the PandaDoc
// draft and routes to the contract viewer. Mirrors InvoiceForm's modal shape.
interface ProjectLike {
  id: number
  code: string | null
  name: string
  client_id: number
  client_company: string | null
  client_name: string | null
  project_fee: number | null
  deposit_pct: number
  start_date: string | null
  special_terms: string | null
  goals: string | null
}
interface LineRow { name: string, price: number | null, qty: number }

const props = defineProps<{ open: boolean, project: ProjectLike | null }>()
const emit = defineEmits<{ 'update:open': [boolean], 'created': [] }>()

const api = useApi()
const toast = useToast()

const title = ref('')
const recipientEmail = ref('')
const startDate = ref('')
const depositPct = ref<number | null>(null)
const billingInterval = ref<'one_time' | 'monthly'>('one_time')
const specialTerms = ref('')
const lines = ref<LineRow[]>([{ name: '', price: null, qty: 1 }])
const clientHasEmailOnFile = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const billingItems = [
  { label: 'One-time', value: 'one_time' },
  { label: 'Monthly', value: 'monthly' }
]

const clientLabel = computed(() => props.project?.client_company || props.project?.client_name || 'the client')
const total = computed(() => Math.round(lines.value.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0) * 100) / 100)
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function reset() {
  const p = props.project
  errors.value = {}
  // Pre-fill "PROJ-0001 - Service Agreement" (matches the backend default in
  // projectContract.js); editable before generating.
  title.value = p ? (p.code ? `${p.code} - Service Agreement` : `Service Agreement — ${p.client_company || p.client_name}`) : ''
  startDate.value = p?.start_date ? p.start_date.slice(0, 10) : ''
  depositPct.value = p?.deposit_pct ?? 50
  billingInterval.value = 'one_time'
  specialTerms.value = p?.special_terms ?? ''
  lines.value = [{
    name: p ? `Website Design & Development — ${p.name}` : '',
    price: p?.project_fee ?? null,
    qty: 1
  }]
  recipientEmail.value = ''
  clientHasEmailOnFile.value = true
}

// Pull the client to pre-fill the signer email (the project row doesn't carry it).
async function loadRecipient(clientId: number) {
  try {
    const { data } = await api<{ data: { email: string | null, billing_email: string | null } }>(`/clients/${clientId}`)
    recipientEmail.value = data.billing_email || data.email || ''
    clientHasEmailOnFile.value = Boolean(recipientEmail.value)
  } catch {
    recipientEmail.value = ''
    clientHasEmailOnFile.value = false
  }
}

watch(() => props.open, (o) => {
  if (o) {
    reset()
    if (props.project?.client_id) loadRecipient(props.project.client_id)
  }
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
  if (!title.value.trim()) e.title = 'Give the contract a title.'
  if (!recipientEmail.value.trim()) e.recipient = 'A signer email is required (add one to the client or enter it here).'
  const valid = lines.value.filter(l => l.name.trim() && Number(l.price) > 0)
  if (!valid.length) e.items = 'Add at least one line with a name and price.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  if (saving.value || !props.project) return
  if (!validate()) return
  saving.value = true
  try {
    const items = lines.value
      .filter(l => l.name.trim() && Number(l.price) > 0)
      .map(l => ({ name: l.name.trim(), unit_price: Number(l.price), qty: Number(l.qty) || 1 }))
    const { data } = await api<{ data: { id: number } }>(`/projects/${props.project.id}/contract`, {
      method: 'POST',
      body: {
        title: title.value.trim(),
        recipient_email: recipientEmail.value.trim(),
        start_date: startDate.value || undefined,
        deposit_pct: depositPct.value ?? undefined,
        billing_interval: billingInterval.value,
        special_terms: specialTerms.value || undefined,
        items
      }
    })
    emit('created')
    emit('update:open', false)
    toast.add({ title: 'Contract created', description: `Draft ready to review and send to ${clientLabel.value}.`, color: 'success' })
    await navigateTo(`/contracts/${data.id}`)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string, contract_id?: number } }, status?: number }
    const existingId = e?.data?.error?.contract_id
    if (existingId) {
      // A live contract already exists — offer to open it rather than duplicate.
      emit('update:open', false)
      toast.add({
        title: 'Contract already exists',
        description: e?.data?.error?.message || 'This project already has a contract.',
        color: 'warning',
        actions: [{ label: 'Open Contract', onClick: () => navigateTo(`/contracts/${existingId}`) }]
      })
      return
    }
    toast.add({ title: 'Could not generate contract', description: e?.data?.error?.message || 'Check the fields and try again.', color: 'error' })
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
              <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Sales
              </div>
              <h2 class="mt-1 font-display text-[22px] font-semibold tracking-tight text-highlighted">
                Generate Contract
              </h2>
              <p class="mt-1 text-[13px] text-muted">
                Confirm the details, then create a draft to review before sending to {{ clientLabel }}.
              </p>
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
            <UFormField
              label="Title"
              :required="true"
              :error="errors.title"
            >
              <UInput
                v-model="title"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Client Signer Email"
              :required="true"
              :error="errors.recipient"
              :help="clientHasEmailOnFile ? undefined : 'The client has no email on file — enter one for the signature request.'"
            >
              <UInput
                v-model="recipientEmail"
                type="email"
                placeholder="client@company.com"
                icon="i-lucide-mail"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField label="Start Date">
                <UInput
                  v-model="startDate"
                  type="date"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Deposit %">
                <UInput
                  v-model.number="depositPct"
                  type="number"
                  min="1"
                  max="100"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Billing">
                <USelect
                  v-model="billingInterval"
                  :items="billingItems"
                  size="lg"
                  class="w-full"
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

            <UFormField label="Special Terms (Optional)">
              <UTextarea
                v-model="specialTerms"
                :rows="3"
                placeholder="Anything specific to add to the agreement…"
                size="lg"
                class="w-full"
              />
            </UFormField>
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
              icon="i-lucide-file-signature"
              :loading="saving"
              @click="submit"
            >
              Generate Draft
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
