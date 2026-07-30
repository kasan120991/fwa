<script setup lang="ts">
// Create / edit an expense. A UModal reused from the Expenses page — its
// category select drives which fields show: a client + billable toggle for
// client expenses, a billing cycle + renewal date for subscriptions. Handles
// receipt upload, plus delete and (subscription) cancel actions in edit mode.
type Category = 'client' | 'business' | 'subscription'
interface ContactOpt { id: number, company: string | null, name: string }
interface ProjectOpt { id: number, name: string, code: string | null }
interface Expense {
  id: number
  category: Category
  client_id: number | null
  project_id: number | null
  vendor: string
  description: string | null
  amount: number
  currency: string
  expense_date: string
  payment_method: string
  billable: boolean
  reimbursed_at: string | null
  receipt_url: string | null
  billing_interval: string | null
  next_renewal_at: string | null
  status: 'active' | 'cancelled'
  notes: string | null
}

const props = defineProps<{ open: boolean, expenseId?: number | null }>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [] }>()

const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

const isEdit = computed(() => props.expenseId != null)

const CATEGORY_ITEMS = [
  { label: 'Client Expense', value: 'client' },
  { label: 'Business Expense', value: 'business' },
  { label: 'Subscription', value: 'subscription' }
]
const METHOD_ITEMS = [
  { label: 'Card', value: 'card' },
  { label: 'Bank', value: 'bank' },
  { label: 'Cash', value: 'cash' },
  { label: 'Other', value: 'other' }
]
const INTERVAL_ITEMS = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' }
]

const category = ref<Category>('business')
const vendor = ref('')
const amount = ref<number | null>(null)
const currency = ref('USD')
const expenseDate = ref('')
const paymentMethod = ref('card')
const clientId = ref<number | null>(null)
const projectId = ref<number | null>(null)
const billable = ref(false)
const reimbursed = ref(false)
const billingInterval = ref<string | null>('monthly')
const nextRenewalAt = ref('')
const description = ref('')
const notes = ref('')
const receiptUrl = ref<string | null>(null)
const status = ref<'active' | 'cancelled'>('active')

const contacts = ref<{ label: string, value: number }[]>([])
const projects = ref<{ label: string, value: number | null }[]>([{ label: 'No project', value: null }])
const saving = ref(false)
const uploading = ref(false)
const errors = ref<Record<string, string>>({})

const today = () => new Date().toISOString().slice(0, 10)

function reset() {
  category.value = 'business'
  vendor.value = ''
  amount.value = null
  currency.value = 'USD'
  expenseDate.value = today()
  paymentMethod.value = 'card'
  clientId.value = null
  projectId.value = null
  billable.value = false
  reimbursed.value = false
  billingInterval.value = 'monthly'
  nextRenewalAt.value = ''
  description.value = ''
  notes.value = ''
  receiptUrl.value = null
  status.value = 'active'
  errors.value = {}
}

async function loadContacts() {
  const { data } = await api<{ data: ContactOpt[] }>('/clients', { query: { limit: 200 } })
  contacts.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
}
async function loadProjects(cid: number) {
  const { data } = await api<{ data: ProjectOpt[] }>('/projects', { query: { client_id: cid } })
  projects.value = [{ label: 'No project', value: null }, ...data.map(p => ({ label: `${p.code ? p.code + ' · ' : ''}${p.name}`, value: p.id }))]
}

async function loadExpense(id: number) {
  const { data } = await api<{ data: Expense }>(`/expenses/${id}`)
  category.value = data.category
  vendor.value = data.vendor
  amount.value = data.amount
  currency.value = data.currency
  expenseDate.value = data.expense_date?.slice(0, 10) || today()
  paymentMethod.value = data.payment_method
  clientId.value = data.client_id
  projectId.value = data.project_id
  billable.value = data.billable
  reimbursed.value = !!data.reimbursed_at
  billingInterval.value = data.billing_interval || 'monthly'
  nextRenewalAt.value = data.next_renewal_at?.slice(0, 10) || ''
  description.value = data.description || ''
  notes.value = data.notes || ''
  receiptUrl.value = data.receipt_url
  status.value = data.status
  if (data.client_id) loadProjects(data.client_id)
}

watch(() => props.open, (o) => {
  if (!o) return
  reset()
  if (!contacts.value.length) loadContacts()
  if (props.expenseId != null) loadExpense(props.expenseId)
})

// Changing the client resets the project unless we're mid-load of an edit.
watch(clientId, (cid, prev) => {
  if (prev === undefined) return
  projectId.value = null
  projects.value = [{ label: 'No project', value: null }]
  if (cid) loadProjects(cid)
})

async function onReceiptPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await upload(file)
    receiptUrl.value = res.path
  } catch {
    toast.add({ title: 'Upload failed', color: 'error' })
  } finally {
    uploading.value = false
  }
}

function validate() {
  const e: Record<string, string> = {}
  if (!vendor.value.trim()) e.vendor = 'Vendor is required.'
  if (!(Number(amount.value) > 0)) e.amount = 'Enter an amount greater than 0.'
  if (!expenseDate.value) e.expense_date = 'Pick a date.'
  if (category.value === 'client' && !clientId.value) e.client_id = 'Choose a client.'
  if (category.value === 'subscription') {
    if (!billingInterval.value) e.billing_interval = 'Choose a billing cycle.'
    if (!nextRenewalAt.value) e.next_renewal_at = 'Pick a renewal date.'
  }
  errors.value = e
  return Object.keys(e).length === 0
}

function payload() {
  return {
    category: category.value,
    vendor: vendor.value.trim(),
    amount: Number(amount.value),
    currency: currency.value || 'USD',
    expense_date: expenseDate.value,
    payment_method: paymentMethod.value,
    client_id: clientId.value,
    project_id: projectId.value,
    billable: category.value === 'client' ? billable.value : false,
    reimbursed_at: category.value === 'client' && reimbursed.value ? true : null,
    billing_interval: category.value === 'subscription' ? billingInterval.value : null,
    next_renewal_at: category.value === 'subscription' ? nextRenewalAt.value : null,
    description: description.value || null,
    notes: notes.value || null,
    receipt_url: receiptUrl.value
  }
}

async function save() {
  if (saving.value) return
  if (!validate()) return
  saving.value = true
  try {
    if (isEdit.value) {
      await api(`/expenses/${props.expenseId}`, { method: 'PATCH', body: payload() })
      toast.add({ title: 'Expense updated', color: 'success' })
    } else {
      await api('/expenses', { method: 'POST', body: payload() })
      toast.add({ title: 'Expense recorded', color: 'success' })
    }
    emit('saved')
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string }, fields?: Record<string, string> } }
    if (e?.data?.fields) errors.value = { ...errors.value, ...e.data.fields }
    toast.add({ title: 'Could not save expense', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function cancelSubscription() {
  if (!isEdit.value) return
  saving.value = true
  try {
    await api(`/expenses/${props.expenseId}/cancel`, { method: 'POST' })
    toast.add({ title: 'Subscription cancelled', color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not cancel', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!isEdit.value) return
  if (!confirm('Delete this expense? This cannot be undone.')) return
  saving.value = true
  try {
    await api(`/expenses/${props.expenseId}`, { method: 'DELETE' })
    toast.add({ title: 'Expense deleted', color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch {
    toast.add({ title: 'Could not delete', color: 'error' })
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
                Billing · Expense
              </div>
              <h2 class="mt-1 font-display text-[22px] font-semibold tracking-tight text-highlighted">
                {{ isEdit ? 'Edit Expense' : 'New Expense' }}
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
                label="Type"
                :required="true"
              >
                <USelect
                  v-model="category"
                  :items="CATEGORY_ITEMS"
                  :disabled="isEdit"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Vendor"
                :required="true"
                :error="errors.vendor"
              >
                <UInput
                  v-model="vendor"
                  placeholder="Figma, DigitalOcean, …"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField
                label="Amount"
                :required="true"
                :error="errors.amount"
                class="sm:col-span-1"
              >
                <UInput
                  v-model.number="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  icon="i-lucide-dollar-sign"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="category === 'subscription' ? 'Started / last charge' : 'Date'"
                :required="true"
                :error="errors.expense_date"
              >
                <UInput
                  v-model="expenseDate"
                  type="date"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Method">
                <USelect
                  v-model="paymentMethod"
                  :items="METHOD_ITEMS"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- subscription-only: billing cycle + renewal -->
            <div
              v-if="category === 'subscription'"
              class="grid grid-cols-1 gap-4 rounded-[12px] bg-muted/40 p-4 sm:grid-cols-2"
            >
              <UFormField
                label="Billing cycle"
                :required="true"
                :error="errors.billing_interval"
              >
                <USelect
                  v-model="billingInterval"
                  :items="INTERVAL_ITEMS"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Next renewal"
                :required="true"
                :error="errors.next_renewal_at"
              >
                <UInput
                  v-model="nextRenewalAt"
                  type="date"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- client link (required for a client expense, optional otherwise) -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                :label="category === 'client' ? 'Client' : 'Client (optional)'"
                :required="category === 'client'"
                :error="errors.client_id"
              >
                <USelect
                  v-model="clientId"
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
                  :disabled="!clientId"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- client-only: billable / reimbursed toggles -->
            <div
              v-if="category === 'client'"
              class="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[12px] bg-muted/40 px-4 py-3"
            >
              <USwitch
                v-model="billable"
                label="Rebill to client"
              />
              <USwitch
                v-if="billable"
                v-model="reimbursed"
                label="Already reimbursed"
              />
            </div>

            <UFormField label="Description">
              <UInput
                v-model="description"
                placeholder="What was this for?"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Notes">
              <UTextarea
                v-model="notes"
                :rows="2"
                autoresize
                placeholder="Anything worth remembering…"
                class="w-full"
              />
            </UFormField>

            <!-- receipt -->
            <UFormField label="Receipt">
              <div class="flex items-center gap-3">
                <label class="inline-flex cursor-pointer items-center gap-2 rounded-chip border border-default bg-default px-3.5 py-1.5 text-[13px] font-medium text-default transition-colors hover:border-accented">
                  <UIcon
                    :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-paperclip'"
                    class="size-4"
                    :class="uploading ? 'animate-spin' : ''"
                  />
                  {{ receiptUrl ? 'Replace' : 'Attach' }}
                  <input
                    type="file"
                    class="hidden"
                    accept="image/*,application/pdf"
                    @change="onReceiptPick"
                  >
                </label>
                <a
                  v-if="receiptUrl"
                  :href="resolveUrl(receiptUrl)"
                  target="_blank"
                  class="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                >
                  <UIcon
                    name="i-lucide-file-check"
                    class="size-4"
                  /> View receipt
                </a>
                <button
                  v-if="receiptUrl"
                  class="text-[13px] text-muted hover:text-error"
                  @click="receiptUrl = null"
                >
                  Remove
                </button>
              </div>
            </UFormField>
          </div>
        </div>

        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex flex-wrap items-center justify-between gap-2.5 gap-y-2">
            <div class="flex items-center gap-2">
              <UButton
                v-if="isEdit"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                @click="remove"
              >
                Delete
              </UButton>
              <UButton
                v-if="isEdit && category === 'subscription' && status === 'active'"
                color="neutral"
                variant="outline"
                size="sm"
                class="rounded-full"
                icon="i-lucide-ban"
                @click="cancelSubscription"
              >
                Cancel Subscription
              </UButton>
            </div>
            <div class="flex items-center gap-2.5">
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
                icon="i-lucide-check"
                :loading="saving"
                @click="save"
              >
                {{ isEdit ? 'Save' : 'Add Expense' }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
