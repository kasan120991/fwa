<script setup lang="ts">
// Dual-mode client form (create + edit). A client is a contacts row with a
// client stage (active/past/lost) — create posts a new row with source=manual;
// edit loads the row and PATCHes changes. Fields map straight onto the contacts
// schema; `name` is the person, `company` is the business (the headline shown
// across the app as company||name).
const props = defineProps<{ mode: 'create' | 'edit', clientId?: string | number }>()

const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

type Stage = 'active' | 'past' | 'lost'

interface FormState {
  company: string
  logoUrl: string
  website: string
  stage: Stage
  contactName: string
  role: string
  email: string
  phone: string
  billStreet: string
  billCity: string
  billState: string
  billZip: string
  billCountry: string
  billEmail: string
  since: string
  notes: string
}

interface ApiContact {
  id: number
  company: string | null
  logo_url: string | null
  website: string | null
  stage: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  billing_email: string | null
  client_since: string | null
  notes: string | null
  tags: string[] | null
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function blankForm(): FormState {
  return {
    company: '', logoUrl: '', website: '', stage: 'active',
    contactName: '', role: '', email: '', phone: '',
    billStreet: '', billCity: '', billState: '', billZip: '', billCountry: 'United States', billEmail: '',
    since: todayISO(), notes: ''
  }
}

const form = reactive<FormState>(blankForm())
const tags = ref<string[]>([])
const loaded = ref(props.mode === 'create')
const notFound = ref(false)

// ---- dirty tracking ----
const initial = ref('')
function snapshot() {
  // Spread the reactive `form` (not toRaw) so the dirty computed tracks every
  // field as a dependency and recomputes when any of them change.
  return JSON.stringify({ ...form, tags: [...tags.value] })
}
function markPristine() {
  initial.value = snapshot()
}
const dirty = computed(() => loaded.value && snapshot() !== initial.value)

// ---- edit: load existing ----
async function load() {
  try {
    const { data } = await api<{ data: ApiContact }>(`/contacts/${props.clientId}`)
    Object.assign(form, {
      company: data.company || '',
      logoUrl: data.logo_url || '',
      website: data.website || '',
      stage: (['active', 'past', 'lost'].includes(data.stage) ? data.stage : 'active') as Stage,
      contactName: data.name || '',
      role: data.title || '',
      email: data.email || '',
      phone: data.phone || '',
      billStreet: data.address_line1 || '',
      billCity: data.city || '',
      billState: data.region || '',
      billZip: data.postal_code || '',
      billCountry: data.country || 'United States',
      billEmail: data.billing_email || '',
      since: data.client_since ? String(data.client_since).slice(0, 10) : '',
      notes: data.notes || ''
    })
    tags.value = data.tags || []
    loaded.value = true
    await nextTick()
    markPristine()
  } catch {
    notFound.value = true
    loaded.value = true
  }
}

onMounted(() => {
  if (props.mode === 'edit') load()
  else markPristine()
})

const displayName = computed(() => form.company.trim() || form.contactName.trim())

useHead({
  title: () => props.mode === 'edit'
    ? `Edit ${displayName.value || 'client'} · Francis Web Agency`
    : 'New client · Francis Web Agency'
})

// ---- validation ----
const submitted = ref(false)
const errors = ref<{ company?: string, email?: string, billEmail?: string }>({})
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function computeErrors() {
  const e: typeof errors.value = {}
  if (!form.company.trim()) e.company = 'Client name is required.'
  if (!form.email.trim()) e.email = 'A contact email is required.'
  else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.'
  if (form.billEmail.trim() && !EMAIL_RE.test(form.billEmail.trim())) e.billEmail = 'Enter a valid email address.'
  errors.value = e
  return Object.keys(e).length === 0
}
watch(form, () => { if (submitted.value) computeErrors() })

// ---- saved indicator ----
const saved = ref(false)
watch(dirty, (d) => { if (d) saved.value = false })

// ---- logo (real upload → stored path) ----
const logoInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)
function pickLogo() { logoInput.value?.click() }
async function onLogoChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    logoUploading.value = true
    try {
      const res = await upload(file)
      form.logoUrl = res.path
    } catch {
      toast.add({ title: 'Could not upload that image', color: 'error' })
    } finally {
      logoUploading.value = false
    }
  }
  input.value = ''
}
function removeLogo() { form.logoUrl = '' }

// ---- select options ----
const stageItems = [
  { label: 'Active', value: 'active' },
  { label: 'Past', value: 'past' },
  { label: 'Lost', value: 'lost' }
]
const STAGE_META: Record<Stage, { status: 'success' | 'neutral' | 'error', label: string }> = {
  active: { status: 'success', label: 'Active' },
  past: { status: 'neutral', label: 'Past' },
  lost: { status: 'error', label: 'Lost' }
}
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia']
const countryItems = computed(() => {
  const set = [...COUNTRIES]
  if (form.billCountry && !set.includes(form.billCountry)) set.unshift(form.billCountry)
  return set.map(c => ({ label: c, value: c }))
})

// ---- submit ----
const saving = ref(false)

function nn(v: string) {
  const t = v.trim()
  return t === '' ? null : t
}
function payload() {
  return {
    stage: form.stage,
    // name is required by the API; a client's headline is the business, so fall
    // back to the company name when no contact person is given.
    name: form.contactName.trim() || form.company.trim(),
    company: nn(form.company),
    logo_url: form.logoUrl || null,
    website: form.website.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || null,
    title: nn(form.role),
    email: nn(form.email),
    phone: nn(form.phone),
    address_line1: nn(form.billStreet),
    city: nn(form.billCity),
    region: nn(form.billState),
    postal_code: nn(form.billZip),
    country: nn(form.billCountry),
    billing_email: nn(form.billEmail),
    tags: tags.value.length ? tags.value : null,
    client_since: form.since || null,
    notes: nn(form.notes)
  }
}

async function save({ another = false } = {}) {
  if (saving.value) return
  submitted.value = true
  if (!computeErrors()) return
  saving.value = true
  saved.value = false
  try {
    if (props.mode === 'create') {
      const body = { source: 'manual', ...payload() }
      const { data } = await api<{ data: { id: number } }>('/contacts', { method: 'POST', body })
      if (another) {
        const name = displayName.value
        Object.assign(form, blankForm())
        tags.value = []
        submitted.value = false
        errors.value = {}
        await nextTick()
        markPristine()
        saved.value = true
        toast.add({ title: 'Client created', description: `${name} was added. Ready for the next one.`, color: 'success' })
      } else {
        toast.add({ title: 'Client created', description: `${displayName.value} was added.`, color: 'success' })
        await navigateTo(`/clients/${data.id}`)
      }
    } else {
      await api(`/contacts/${props.clientId}`, { method: 'PATCH', body: payload() })
      markPristine()
      saved.value = true
      toast.add({ title: 'Changes saved', color: 'success' })
    }
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    const f = err?.data?.error?.fields
    if (f?.email) errors.value = { ...errors.value, email: 'Enter a valid email address.' }
    if (f?.billing_email) errors.value = { ...errors.value, billEmail: 'Enter a valid email address.' }
    toast.add({
      title: props.mode === 'create' ? "Couldn't create client" : "Couldn't save changes",
      description: err?.data?.error?.message || 'Please check the form and try again.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// ---- cancel ----
const cancelConfirm = ref(false)
function leave() {
  navigateTo(props.mode === 'edit' ? `/clients/${props.clientId}` : '/clients')
}
function requestCancel() {
  if (dirty.value) cancelConfirm.value = true
  else leave()
}
function keepEditing() {
  cancelConfirm.value = false
}
function discard() {
  cancelConfirm.value = false
  leave()
}

const primaryDisabled = computed(() => saving.value || (props.mode === 'edit' && !dirty.value))
const primaryLabel = computed(() =>
  saving.value
    ? (props.mode === 'edit' ? 'Saving…' : 'Creating…')
    : (props.mode === 'edit' ? 'Save changes' : 'Create client'))

const title = computed(() => props.mode === 'edit' ? 'Edit client' : 'New client')
const subtitle = computed(() => props.mode === 'edit'
  ? 'Update this client’s details. Changes save across the workspace.'
  : 'Add a business to your workspace. You can fill in the rest later.')
</script>

<template>
  <div>
    <!-- loading (edit) -->
    <div v-if="!loaded" class="mx-auto max-w-[720px] py-24 text-center text-sm text-muted">Loading client…</div>

    <!-- not found (edit) -->
    <div v-else-if="notFound" class="mx-auto flex max-w-[720px] flex-col items-center rounded-card bg-default px-10 py-16 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon name="i-lucide-user-x" class="size-6" />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">Client not found</h2>
      <p class="mt-2 text-[15px] text-muted">We couldn't find that client to edit.</p>
      <UButton to="/clients" variant="soft" color="primary" class="mt-6" icon="i-lucide-arrow-left">Back to clients</UButton>
    </div>

    <template v-else>
      <div class="mx-auto max-w-[720px] pb-6">
        <!-- breadcrumb -->
        <nav class="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <NuxtLink to="/clients" class="font-medium transition-colors hover:text-highlighted">Clients</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-50" />
          <template v-if="mode === 'edit'">
            <NuxtLink :to="`/clients/${clientId}`" class="max-w-[220px] truncate font-medium transition-colors hover:text-highlighted">{{ displayName || 'Client' }}</NuxtLink>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-50" />
          </template>
          <span class="font-semibold text-highlighted">{{ mode === 'edit' ? 'Edit' : 'New client' }}</span>
        </nav>

        <!-- header -->
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">{{ title }}</h1>
            <p class="mt-1.5 text-sm text-muted">{{ subtitle }}</p>
          </div>
          <StatusChip v-if="mode === 'edit'" :status="STAGE_META[form.stage].status">{{ STAGE_META[form.stage].label }}</StatusChip>
        </div>

        <div class="flex flex-col gap-3.5">
          <!-- ===== Company ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">Company</div>
              <p class="mt-1.5 text-[13.5px] text-muted">The business you're working with and how it shows up across the app.</p>
            </div>

            <UFormField label="Client name" required :error="errors.company" class="mb-[18px]">
              <UInput v-model="form.company" placeholder="Acme Studio" size="lg" class="w-full" />
            </UFormField>

            <!-- logo -->
            <div class="mb-[18px]">
              <label class="mb-1.5 block text-sm font-medium text-default">Logo</label>
              <div class="flex items-center gap-4">
                <span v-if="logoUploading" class="flex size-14 flex-none items-center justify-center rounded-[12px] bg-muted text-muted ring ring-default">
                  <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
                </span>
                <img v-else-if="form.logoUrl" :src="resolveUrl(form.logoUrl)" alt="Client logo" class="size-14 flex-none rounded-[12px] object-cover ring ring-default">
                <button
                  v-else
                  type="button"
                  class="flex size-14 flex-none items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-accented bg-muted text-muted transition-colors hover:border-primary hover:bg-mist hover:text-teal-700"
                  aria-label="Upload logo"
                  @click="pickLogo"
                >
                  <UIcon name="i-lucide-image" class="size-5" />
                </button>
                <div class="min-w-0">
                  <template v-if="logoUploading">
                    <span class="text-sm font-medium text-muted">Uploading…</span>
                  </template>
                  <template v-else-if="form.logoUrl">
                    <div class="flex gap-2">
                      <UButton size="xs" color="neutral" variant="outline" class="rounded-full" @click="pickLogo">Replace</UButton>
                      <UButton size="xs" color="neutral" variant="ghost" @click="removeLogo">Remove</UButton>
                    </div>
                  </template>
                  <template v-else>
                    <button type="button" class="text-sm font-semibold text-primary transition-colors hover:text-primary/80" @click="pickLogo">Upload logo</button>
                    <p class="mt-0.5 text-[12.5px] text-muted">PNG or SVG, square works best.</p>
                  </template>
                </div>
                <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" @change="onLogoChange">
              </div>
            </div>

            <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Website domain" help="No http:// needed — just the domain.">
                <UInput v-model="form.website" placeholder="example.com" icon="i-lucide-globe" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Status">
                <USelect v-model="form.stage" :items="stageItems" size="lg" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Tags" help="Press Enter or comma to add. Used for filtering and grouping clients.">
              <TagInput v-model="tags" placeholder="Retainer, Priority…" />
            </UFormField>
          </section>

          <!-- ===== Primary contact ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">Primary contact</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Your main point of contact for this account.</p>
            </div>

            <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Contact name">
                <UInput v-model="form.contactName" placeholder="Jordan Lee" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Role / title">
                <UInput v-model="form.role" placeholder="Marketing Lead" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Email" required :error="errors.email">
                <UInput v-model="form.email" type="email" placeholder="name@company.com" icon="i-lucide-mail" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Phone">
                <UInput v-model="form.phone" type="tel" placeholder="(555) 000-0000" icon="i-lucide-phone" size="lg" class="w-full" />
              </UFormField>
            </div>
          </section>

          <!-- ===== Billing ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">Billing</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Where invoices are addressed. Leave the billing email blank to use the contact email.</p>
            </div>

            <UFormField label="Street address" class="mb-4">
              <UInput v-model="form.billStreet" placeholder="123 Main St, Suite 200" size="lg" class="w-full" />
            </UFormField>

            <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
              <UFormField label="City">
                <UInput v-model="form.billCity" placeholder="Portland" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="State">
                <UInput v-model="form.billState" placeholder="OR" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="ZIP">
                <UInput v-model="form.billZip" placeholder="97209" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Country">
                <USelect v-model="form.billCountry" :items="countryItems" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Billing email" :error="errors.billEmail">
                <UInput v-model="form.billEmail" type="email" placeholder="billing@company.com" icon="i-lucide-mail" size="lg" class="w-full" />
              </UFormField>
            </div>
          </section>

          <!-- ===== Internal ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">Internal</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Only your team sees this. Notes never appear on invoices or the client portal.</p>
            </div>

            <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Client since">
                <UInput v-model="form.since" type="date" icon="i-lucide-calendar" size="lg" class="w-full" />
              </UFormField>
              <div class="hidden sm:block" />
            </div>

            <UFormField label="Internal notes">
              <UTextarea v-model="form.notes" :rows="4" autoresize placeholder="Context, preferences, anything the team should know…" class="w-full" />
            </UFormField>
          </section>
        </div>
      </div>

      <!-- ===== sticky action bar ===== -->
      <div class="sticky bottom-0 z-20 border-t border-default bg-default/95 shadow-[0_-1px_2px_rgba(18,24,23,0.04)] backdrop-blur">
        <div class="mx-auto flex max-w-[720px] items-center gap-3 py-3.5">
          <span v-if="dirty" class="inline-flex items-center gap-2 text-[13px] text-muted">
            <span class="size-[7px] rounded-full bg-warning" />Unsaved changes
          </span>
          <span v-else-if="saved" class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
            <UIcon name="i-lucide-check" class="size-4" />{{ mode === 'edit' ? 'All changes saved' : 'Client created' }}
          </span>
          <div class="flex-1" />
          <UButton color="neutral" variant="outline" class="rounded-full" @click="requestCancel">Cancel</UButton>
          <UButton v-if="mode === 'create'" color="neutral" variant="outline" class="rounded-full" :disabled="saving" @click="save({ another: true })">Create &amp; add another</UButton>
          <UButton color="primary" class="rounded-full" :disabled="primaryDisabled" :loading="saving" @click="save()">{{ primaryLabel }}</UButton>
        </div>
      </div>

      <!-- cancel confirm -->
      <UModal v-model:open="cancelConfirm" title="Discard your changes?">
        <template #body>
          <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-warning/10 text-warning">
            <UIcon name="i-lucide-triangle-alert" class="size-5" />
          </span>
          <p class="text-[14.5px] leading-relaxed text-default">
            You've made changes that haven't been saved. Leaving now will lose them.
          </p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2.5">
            <UButton color="neutral" variant="outline" class="rounded-full" @click="keepEditing">Keep editing</UButton>
            <UButton color="error" class="rounded-full" @click="discard">Discard changes</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
