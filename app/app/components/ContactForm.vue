<script setup lang="ts">
// Contact form — backs both the leads and clients tables. `kind` picks target:
//   client → POST/PATCH /api/clients; status active/past/lost, full billing/logo/since
//   lead   → POST/PATCH /api/leads;   stage defaults to_contact, billing/logo/since hidden
// `form.stage` doubles as the client's `status` (mapped on load/save).
// `name` is the person, `company` is the business (headline = company||name).
const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  kind?: 'client' | 'lead'
  clientId?: string | number
}>(), { kind: 'client' })

const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

// ---- kind (client vs lead) copy + targets ----
const noun = props.kind === 'lead' ? 'lead' : 'client'
const nounCap = props.kind === 'lead' ? 'Lead' : 'Client'
const rootLabel = props.kind === 'lead' ? 'Leads' : 'Clients'
const rootTo = props.kind === 'lead' ? '/leads' : '/clients'
const endpoint = props.kind === 'lead' ? '/leads' : '/clients'
const nameLabel = props.kind === 'lead' ? 'Business Name' : 'Client Name'

type Stage = 'new' | 'qualifying' | 'to_contact' | 'contacted' | 'engaged' | 'qualified' | 'proposal' | 'active' | 'past' | 'lost'

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
  stage?: string // leads
  status?: string // clients
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

function blankForm(kind: 'client' | 'lead'): FormState {
  return {
    company: '', logoUrl: '', website: '', stage: kind === 'lead' ? 'to_contact' : 'active',
    contactName: '', role: '', email: '', phone: '',
    billStreet: '', billCity: '', billState: '', billZip: '', billCountry: 'United States', billEmail: '',
    since: kind === 'lead' ? '' : todayISO(), notes: ''
  }
}

const form = reactive<FormState>(blankForm(props.kind))
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
    const { data } = await api<{ data: ApiContact }>(`${endpoint}/${props.clientId}`)
    Object.assign(form, {
      company: data.company || '',
      logoUrl: data.logo_url || '',
      website: data.website || '',
      stage: (props.kind === 'lead' ? data.stage : data.status) as Stage,
      contactName: data.name || '',
      role: data.title || '',
      email: data.email || '',
      phone: phoneDigits(data.phone), // raw digits; PhoneInput masks for display
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
    ? `Edit ${displayName.value || noun} · Francis Web Agency`
    : `New ${noun} · Francis Web Agency`
})

// ---- validation ----
const submitted = ref(false)
const errors = ref<{ company?: string, email?: string, billEmail?: string }>({})
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function computeErrors() {
  const e: typeof errors.value = {}
  if (props.kind === 'lead') {
    // A lead just needs an identity to hang follow-up on — contact details are
    // optional (e.g. a phone-only prospect). The API's required `name` is
    // satisfied by contactName || company, so require at least one of them.
    if (!form.company.trim() && !form.contactName.trim()) e.company = 'Add a business or contact name.'
  } else {
    if (!form.company.trim()) e.company = `${nameLabel} is required.`
    if (!form.email.trim()) e.email = 'A contact email is required.'
  }
  // Format-check email + billing email whenever they're filled in (both kinds).
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.'
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

// ---- stage options + meta (client stages vs lead pipeline) ----
const STAGE_LABEL: Record<Stage, string> = {
  new: 'New', qualifying: 'Qualifying', to_contact: 'To Contact', contacted: 'Contacted',
  engaged: 'Engaged', qualified: 'Qualified', proposal: 'Proposal',
  active: 'Active', past: 'Past', lost: 'Lost'
}
const STAGE_STATUS: Record<Stage, 'success' | 'neutral' | 'error' | 'info'> = {
  new: 'neutral', qualifying: 'info', to_contact: 'neutral', contacted: 'info',
  engaged: 'info', qualified: 'success', proposal: 'info',
  active: 'success', past: 'neutral', lost: 'error'
}
const CLIENT_STAGES: Stage[] = ['active', 'past', 'lost']
const LEAD_STAGES: Stage[] = ['new', 'qualifying', 'to_contact', 'contacted', 'engaged', 'qualified']
// Show the kind's stages, but always include the loaded stage so editing an
// off-motion contact (e.g. an inbound lead at 'new') still renders correctly.
const stageItems = computed(() => {
  const base = props.kind === 'lead' ? LEAD_STAGES : CLIENT_STAGES
  const set = base.includes(form.stage) ? base : [form.stage, ...base]
  return set.map(s => ({ label: STAGE_LABEL[s], value: s }))
})

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
  // Shared identity fields. name is required by the API; a headline falls back
  // to the company when no contact person is given.
  const base = {
    name: form.contactName.trim() || form.company.trim(),
    company: nn(form.company),
    website: form.website.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || null,
    title: nn(form.role),
    email: nn(form.email),
    phone: nn(form.phone),
    tags: tags.value.length ? tags.value : null,
    notes: nn(form.notes)
  }
  if (props.kind === 'lead') {
    return { ...base, stage: form.stage }
  }
  // Client: form.stage carries the status; plus billing/logo/since.
  return {
    ...base,
    status: form.stage,
    logo_url: form.logoUrl || null,
    address_line1: nn(form.billStreet),
    city: nn(form.billCity),
    region: nn(form.billState),
    postal_code: nn(form.billZip),
    country: nn(form.billCountry),
    billing_email: nn(form.billEmail),
    client_since: form.since || null
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
      // Leads default source manual (outreach); clients created directly = 'direct'.
      const body = { source: props.kind === 'lead' ? 'manual' : 'direct', ...payload() }
      const { data } = await api<{ data: { id: number } }>(endpoint, { method: 'POST', body })
      if (another) {
        const name = displayName.value
        Object.assign(form, blankForm(props.kind))
        tags.value = []
        submitted.value = false
        errors.value = {}
        await nextTick()
        markPristine()
        saved.value = true
        toast.add({ title: `${nounCap} created`, description: `${name} was added. Ready for the next one.`, color: 'success' })
      } else {
        toast.add({ title: `${nounCap} created`, description: `${displayName.value} was added.`, color: 'success' })
        // Open the new record's detail page — /leads/:id for a lead, /clients/:id for a client.
        await navigateTo(props.kind === 'lead' ? `/leads/${data.id}` : `/clients/${data.id}`)
      }
    } else {
      await api(`${endpoint}/${props.clientId}`, { method: 'PATCH', body: payload() })
      markPristine()
      toast.add({ title: 'Changes saved', color: 'success' })
      // Head back to the record's detail page (lead or client).
      leave()
    }
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    const f = err?.data?.error?.fields
    if (f?.email) errors.value = { ...errors.value, email: 'Enter a valid email address.' }
    if (f?.billing_email) errors.value = { ...errors.value, billEmail: 'Enter a valid email address.' }
    toast.add({
      title: props.mode === 'create' ? `Couldn't create ${noun}` : "Couldn't save changes",
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
  // On edit, return to the record's detail page (lead or client); on create, the section root.
  if (props.mode === 'edit') navigateTo(`/${props.kind === 'lead' ? 'leads' : 'clients'}/${props.clientId}`)
  else navigateTo(rootTo)
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
    : (props.mode === 'edit' ? 'Save Changes' : `Create ${nounCap}`))

const title = computed(() => props.mode === 'edit' ? `Edit ${nounCap}` : `New ${nounCap}`)
const subtitle = computed(() => {
  if (props.kind === 'lead') {
    return props.mode === 'edit'
      ? 'Update this lead’s details.'
      : 'Add a prospect to your pipeline. You can fill in the rest later.'
  }
  return props.mode === 'edit'
    ? 'Update this client’s details. Changes save across the workspace.'
    : 'Add a business to your workspace. You can fill in the rest later.'
})
</script>

<template>
  <!-- -mb cancels the layout main's p-[26px] bottom so the sticky action bar sits
       flush against the viewport bottom (no gap) at the end of the page. -->
  <div class="-mb-[26px]">
    <!-- loading (edit) -->
    <div v-if="!loaded" class="mx-auto max-w-[720px] py-24 text-center text-sm text-muted">Loading {{ noun }}…</div>

    <!-- not found (edit) -->
    <div v-else-if="notFound" class="mx-auto flex max-w-[720px] flex-col items-center rounded-card bg-default px-10 py-16 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon name="i-lucide-user-x" class="size-6" />
      </span>
      <h2 class="font-display text-2xl font-medium tracking-tight text-highlighted">{{ nounCap }} Not Found</h2>
      <p class="mt-2 text-[15px] text-muted">We couldn't find that {{ noun }} to edit.</p>
      <UButton :to="rootTo" variant="soft" color="primary" class="mt-6" icon="i-lucide-arrow-left">Back To {{ rootLabel }}</UButton>
    </div>

    <template v-else>
      <div class="mx-auto max-w-[720px] pb-6">
        <!-- breadcrumb -->
        <nav class="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <NuxtLink :to="rootTo" class="font-medium transition-colors hover:text-highlighted">{{ rootLabel }}</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-50" />
          <!-- clients have a detail page to link back to; leads don't -->
          <template v-if="mode === 'edit' && kind === 'client'">
            <NuxtLink :to="`/clients/${clientId}`" class="max-w-[220px] truncate font-medium transition-colors hover:text-highlighted">{{ displayName || 'Client' }}</NuxtLink>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-50" />
          </template>
          <span class="font-semibold text-highlighted">{{ mode === 'edit' ? `Edit ${noun}` : `New ${noun}` }}</span>
        </nav>

        <!-- header -->
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-[28px] font-medium tracking-tight text-highlighted">{{ title }}</h1>
            <p class="mt-1.5 text-sm text-muted">{{ subtitle }}</p>
          </div>
          <StatusChip v-if="mode === 'edit'" :status="STAGE_STATUS[form.stage]">{{ STAGE_LABEL[form.stage] }}</StatusChip>
        </div>

        <div class="flex flex-col gap-3.5">
          <!-- ===== Company ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Company</div>
              <p class="mt-1.5 text-[13.5px] text-muted">The business you're working with and how it shows up across the app.</p>
            </div>

            <UFormField :label="nameLabel" :required="kind === 'client'" :error="errors.company" class="mb-[18px]">
              <UInput v-model="form.company" placeholder="Acme Studio" size="lg" class="w-full" />
            </UFormField>

            <!-- logo (clients only) -->
            <div v-if="kind === 'client'" class="mb-[18px]">
              <label class="mb-1.5 block text-sm font-medium text-default">Logo</label>
              <div class="flex items-center gap-4">
                <span v-if="logoUploading" class="flex size-14 flex-none items-center justify-center rounded-[12px] bg-muted text-muted ring ring-default">
                  <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
                </span>
                <img v-else-if="form.logoUrl" :src="resolveUrl(form.logoUrl)" alt="Client logo" class="size-14 flex-none rounded-[12px] object-cover ring ring-default">
                <button
                  v-else
                  type="button"
                  class="flex size-14 flex-none items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-accented bg-muted text-muted transition-colors hover:border-primary hover:bg-mist hover:text-primary"
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
                    <button type="button" class="text-sm font-semibold text-primary transition-colors hover:text-primary/80" @click="pickLogo">Upload Logo</button>
                    <p class="mt-0.5 text-[12.5px] text-muted">PNG or SVG, square works best.</p>
                  </template>
                </div>
                <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" @change="onLogoChange">
              </div>
            </div>

            <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Website Domain" help="No http:// needed — just the domain.">
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
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Primary contact</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Your main point of contact for this account.</p>
            </div>

            <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Contact Name">
                <UInput v-model="form.contactName" placeholder="Jordan Lee" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Role / Title">
                <UInput v-model="form.role" placeholder="Marketing Lead" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Email" :required="kind === 'client'" :error="errors.email">
                <UInput v-model="form.email" type="email" placeholder="name@company.com" icon="i-lucide-mail" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Phone">
                <PhoneInput v-model="form.phone" />
              </UFormField>
            </div>
          </section>

          <!-- ===== Billing (clients only) ===== -->
          <section v-if="kind === 'client'" class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Billing</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Where invoices are addressed. Leave the billing email blank to use the contact email.</p>
            </div>

            <UFormField label="Street Address" class="mb-4">
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
              <UFormField label="Billing Email" :error="errors.billEmail">
                <UInput v-model="form.billEmail" type="email" placeholder="billing@company.com" icon="i-lucide-mail" size="lg" class="w-full" />
              </UFormField>
            </div>
          </section>

          <!-- ===== Internal ===== -->
          <section class="rounded-card bg-default p-6 ring ring-default">
            <div class="mb-5">
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Internal</div>
              <p class="mt-1.5 text-[13.5px] text-muted">Only your team sees this. Notes never appear on invoices or the client portal.</p>
            </div>

            <div v-if="kind === 'client'" class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Client Since">
                <UInput v-model="form.since" type="date" icon="i-lucide-calendar" size="lg" class="w-full" />
              </UFormField>
              <div class="hidden sm:block" />
            </div>

            <UFormField label="Internal Notes">
              <UTextarea v-model="form.notes" :rows="4" autoresize placeholder="Context, preferences, anything the team should know…" class="w-full" />
            </UFormField>
          </section>
        </div>
      </div>

      <!-- ===== sticky action bar ===== -->
      <div class="sticky bottom-0 z-20 border-t border-default bg-default/95 shadow-[0_-1px_2px_rgba(18,24,23,0.04)] backdrop-blur">
        <div class="mx-auto flex max-w-[720px] flex-wrap items-center gap-3 py-3.5">
          <span v-if="dirty" class="inline-flex items-center gap-2 text-[13px] text-muted">
            <span class="size-[7px] rounded-full bg-warning" />Unsaved changes
          </span>
          <span v-else-if="saved" class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
            <UIcon name="i-lucide-check" class="size-4" />{{ mode === 'edit' ? 'All changes saved' : `${nounCap} created` }}
          </span>
          <div class="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <UButton color="neutral" variant="outline" class="w-full justify-center rounded-full sm:w-auto" @click="requestCancel">Cancel</UButton>
            <UButton v-if="mode === 'create'" color="neutral" variant="outline" class="w-full justify-center rounded-full sm:w-auto" :disabled="saving" @click="save({ another: true })">Create &amp; Add Another</UButton>
            <UButton color="primary" class="w-full justify-center rounded-full sm:w-auto" :disabled="primaryDisabled" :loading="saving" @click="save()">{{ primaryLabel }}</UButton>
          </div>
        </div>
      </div>

      <!-- cancel confirm -->
      <UModal v-model:open="cancelConfirm" title="Discard Your Changes?">
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
            <UButton color="neutral" variant="outline" class="rounded-full" @click="keepEditing">Keep Editing</UButton>
            <UButton color="error" class="rounded-full" @click="discard">Discard Changes</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
