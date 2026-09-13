<script setup lang="ts">
// The proposal editor — a full page, not a modal. The Statement of Work is the
// substance here (it's what the client agrees to, and accepting it generates
// the contract), and six paragraph-length fields never fit in a 650px dialog.
//
// Layout is the Settings pattern: a sticky rail on the left to jump between
// the four sections, one wide column of cards on the right so every textarea
// gets the full width, and a sticky action bar at the bottom (ContactForm's).
// Backs both /proposals/new and /proposals/:id.
const props = defineProps<{
  mode: 'create' | 'edit'
  proposalId?: string | number
}>()

const api = useApi()
const toast = useToast()
const router = useRouter()

interface ClientOpt { id: number, name: string, company: string | null }
interface TypeOpt { id: number, name: string }
type Status = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'voided'

const STATUS_META: Record<Status, { label: string, status: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  sent: { label: 'Sent', status: 'info' },
  viewed: { label: 'Viewed', status: 'info' },
  accepted: { label: 'Accepted', status: 'success' },
  declined: { label: 'Declined', status: 'error' },
  expired: { label: 'Expired', status: 'warning' },
  voided: { label: 'Voided', status: 'neutral' }
}

const CONTENT_BY_ITEMS = [
  { label: 'Client', value: 'client' },
  { label: 'Developer', value: 'developer' },
  { label: 'Mix', value: 'mix' }
]

// ---- sections + rail ----
type Section = 'basics' | 'scope' | 'fees' | 'terms'
const SECTIONS: { id: Section, label: string, icon: string }[] = [
  { id: 'basics', label: 'Basics', icon: 'i-lucide-file-text' },
  { id: 'scope', label: 'Scope', icon: 'i-lucide-layers' },
  { id: 'fees', label: 'Fees & Dates', icon: 'i-lucide-hand-coins' },
  { id: 'terms', label: 'Terms & Policies', icon: 'i-lucide-scroll-text' }
]
const active = ref<Section>('basics')
const sectionEls = ref<Record<Section, HTMLElement | null>>({ basics: null, scope: null, fees: null, terms: null })
function setSectionEl(id: Section, el: unknown) {
  sectionEls.value[id] = (el as HTMLElement | null) ?? null
}
function go(id: Section) {
  active.value = id
  sectionEls.value[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
// The rail follows the scroll: whichever section is highest in the top third
// of the viewport is the one you're in.
let observer: IntersectionObserver | null = null
function watchSections() {
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    const id = visible[0]?.target.getAttribute('data-section') as Section | undefined
    if (id) active.value = id
  }, { rootMargin: '-72px 0px -60% 0px', threshold: 0 })
  for (const el of Object.values(sectionEls.value)) if (el) observer.observe(el)
}
onBeforeUnmount(() => observer?.disconnect())

// ---- state ----
const clients = ref<ClientOpt[]>([])
const types = ref<TypeOpt[]>([])
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const basics = reactive({ client_id: undefined as number | undefined, project_type_id: undefined as number | undefined, title: '' })
const sow = ref<SowState>(blankSow())
const meta = reactive({ code: null as string | null, status: 'draft' as Status })

// A decided proposal is the record of what was agreed — the server refuses
// edits, so the form shows it read-only rather than letting you try.
const decided = computed(() => meta.status === 'accepted' || meta.status === 'declined')

// ---- dirty tracking (ContactForm's pattern) ----
const initial = ref('')
const snapshot = () => JSON.stringify({ ...basics, ...sow.value })
function markPristine() {
  initial.value = snapshot()
}
const dirty = computed(() => loaded.value && snapshot() !== initial.value)
const saved = ref(false)
watch(dirty, (d) => {
  if (d) saved.value = false
})

async function load() {
  const [c, t] = await Promise.all([
    api<{ data: ClientOpt[] }>('/clients?limit=200'),
    api<{ data: TypeOpt[] }>('/project-types')
  ])
  clients.value = c.data
  types.value = t.data

  if (props.mode === 'create') {
    basics.project_type_id = types.value[0]?.id
    loaded.value = true
    await nextTick()
    markPristine()
    watchSections()
    return
  }
  try {
    const { data } = await api<{ data: Record<string, unknown> }>(`/proposals/${props.proposalId}`)
    basics.client_id = Number(data.client_id)
    basics.project_type_id = data.project_type_id ? Number(data.project_type_id) : undefined
    basics.title = String(data.title ?? '')
    meta.code = (data.code as string | null) ?? null
    meta.status = data.status as Status
    const next = blankSow()
    for (const k of Object.keys(next) as (keyof SowState)[]) {
      const v = data[k]
      if (v === null || v === undefined) continue
      // Dates come back as ISO timestamps; the date inputs want YYYY-MM-DD.
      ;(next[k] as unknown) = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v
    }
    sow.value = next
    loaded.value = true
    await nextTick()
    markPristine()
    watchSections()
  } catch {
    notFound.value = true
    loaded.value = true
  }
}
onMounted(load)

// ---- derived ----
const clientItems = computed(() => clients.value.map(c => ({ label: c.company || c.name, value: c.id })))
const typeItems = computed(() => types.value.map(t => ({ label: t.name, value: t.id })))
const clientName = computed(() => {
  const c = clients.value.find(x => x.id === basics.client_id)
  return c ? (c.company || c.name) : null
})

const money = (n: number | null) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const noDeposit = computed(() => sow.value.deposit_pct === 0)
const deposit = computed(() => {
  const fee = sow.value.project_fee
  if (fee == null) return null
  return Math.round((fee * (sow.value.deposit_pct || 0) / 100) * 100) / 100
})
const balance = computed(() => {
  const fee = sow.value.project_fee
  if (fee == null || deposit.value == null) return null
  return Math.round((fee - deposit.value) * 100) / 100
})

const title = computed(() => props.mode === 'edit' ? (basics.title || 'Edit Proposal') : 'New Proposal')
const subtitle = computed(() => {
  if (props.mode === 'create') return 'The scope the client agrees to — accepting it generates the contract.'
  return [meta.code, clientName.value, 'The scope the client agrees to — accepting it generates the contract.'].filter(Boolean).join(' · ')
})
useHead({ title: computed(() => `${title.value} · Francis Web Agency`) })

// ---- validate + save ----
function validate() {
  const e: Record<string, string> = {}
  if (!basics.title.trim()) e.title = 'A title is required.'
  if (props.mode === 'create' && !basics.client_id) e.client_id = 'Choose a client.'
  if (sow.value.deposit_pct < 0 || sow.value.deposit_pct > 100) e.deposit_pct = 'Between 0 and 100.'
  errors.value = e
  if (e.client_id || e.title) go('basics')
  else if (e.deposit_pct) go('fees')
  return Object.keys(e).length === 0
}

/** '' and undefined both mean "cleared"; the API expresses that as null. */
function payload() {
  const out: Record<string, unknown> = { title: basics.title.trim(), project_type_id: basics.project_type_id }
  for (const [k, v] of Object.entries(sow.value)) out[k] = (v === '' || v === undefined) ? null : v
  return out
}

async function save() {
  if (saving.value || decided.value || !validate()) return
  saving.value = true
  try {
    if (props.mode === 'edit') {
      await api(`/proposals/${props.proposalId}`, { method: 'PATCH', body: payload() })
      markPristine()
      saved.value = true
      toast.add({ title: 'Proposal saved', color: 'success' })
    } else {
      const { data } = await api<{ data: { id: number } }>('/proposals', { method: 'POST', body: { client_id: basics.client_id, ...payload() } })
      markPristine()
      toast.add({ title: 'Proposal created', description: 'Send it, or accept it if they already said yes.', color: 'success' })
      await router.replace(`/proposals/${data.id}`)
    }
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    if (e?.data?.error?.fields) errors.value = e.data.error.fields
    toast.add({ title: 'Could not save', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

// ---- cancel (confirm when dirty) ----
const cancelConfirm = ref(false)
function leave() {
  cancelConfirm.value = false
  markPristine()
  router.push('/sales')
}
function requestCancel() {
  if (dirty.value) cancelConfirm.value = true
  else leave()
}
function keepEditing() {
  cancelConfirm.value = false
}

const primaryDisabled = computed(() => saving.value || decided.value || (props.mode === 'edit' && !dirty.value))
const primaryLabel = computed(() =>
  saving.value
    ? (props.mode === 'edit' ? 'Saving…' : 'Creating…')
    : (props.mode === 'edit' ? 'Save Proposal' : 'Create Proposal'))
</script>

<template>
  <!-- -mb cancels the layout main's p-[26px] bottom so the sticky action bar sits
       flush against the viewport bottom at the end of the page. -->
  <div class="-mb-[26px]">
    <div
      v-if="!loaded"
      class="mx-auto max-w-[720px] py-24 text-center text-sm text-muted"
    >
      Loading proposal…
    </div>

    <div
      v-else-if="notFound"
      class="mx-auto flex max-w-[720px] flex-col items-center rounded-card bg-default px-10 py-16 text-center ring ring-default"
    >
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          name="i-lucide-file-x"
          class="size-6"
        />
      </span>
      <h2 class="font-display text-2xl font-semibold tracking-tight text-highlighted">
        Proposal Not Found
      </h2>
      <p class="mt-2 text-[15px] text-muted">
        We couldn't find that proposal to edit.
      </p>
      <UButton
        to="/proposals"
        variant="soft"
        color="primary"
        class="mt-6"
        icon="i-lucide-arrow-left"
      >
        Back To Proposals
      </UButton>
    </div>

    <template v-else>
      <div class="mx-auto w-full max-w-[1120px] pb-6">
        <!-- breadcrumb -->
        <nav class="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <NuxtLink
            to="/proposals"
            class="font-medium transition-colors hover:text-highlighted"
          >Proposals</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 opacity-50"
          />
          <span class="font-semibold text-highlighted">{{ mode === 'edit' ? 'Edit Proposal' : 'New Proposal' }}</span>
        </nav>

        <!-- header -->
        <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="truncate font-display text-[28px] font-semibold tracking-tight text-highlighted">
              {{ title }}
            </h1>
            <p class="mt-1.5 text-sm text-muted">
              {{ subtitle }}
            </p>
          </div>
          <StatusChip
            v-if="mode === 'edit'"
            :status="STATUS_META[meta.status].status"
          >
            {{ STATUS_META[meta.status].label }}
          </StatusChip>
        </div>

        <div class="grid grid-cols-1 items-start gap-7 md:grid-cols-[210px_1fr]">
          <!-- section rail -->
          <nav class="flex gap-1 overflow-x-auto md:sticky md:top-[84px] md:flex-col md:overflow-visible">
            <button
              v-for="s in SECTIONS"
              :key="s.id"
              type="button"
              class="flex flex-none items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors"
              :class="active === s.id
                ? 'border-primary/25 bg-mist font-semibold text-primary'
                : 'border-transparent text-toned hover:bg-default'"
              @click="go(s.id)"
            >
              <UIcon
                :name="s.icon"
                class="size-[17px] flex-none"
                :class="active === s.id ? 'text-primary' : 'text-muted'"
              />
              <span class="whitespace-nowrap">{{ s.label }}</span>
            </button>

            <!-- the split the contract will quote, always in view -->
            <div class="mt-4 hidden rounded-card bg-sand p-3.5 md:block">
              <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Fee Split
              </div>
              <div class="mt-2 flex flex-col gap-1.5 text-[13px] text-muted">
                <div
                  v-if="!noDeposit"
                  class="flex items-center justify-between gap-2"
                >
                  <span>Deposit ({{ sow.deposit_pct || 0 }}%)</span>
                  <span class="font-semibold text-highlighted tabular-nums">{{ money(deposit) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span>Final ({{ 100 - (sow.deposit_pct || 0) }}%)</span>
                  <span class="font-semibold text-highlighted tabular-nums">{{ money(balance) }}</span>
                </div>
                <div
                  v-if="noDeposit"
                  class="text-[12px]"
                >
                  No deposit — billed in full on completion.
                </div>
              </div>
            </div>
          </nav>

          <!-- the form -->
          <fieldset
            :disabled="decided"
            class="flex min-w-0 flex-col gap-3.5"
          >
            <UAlert
              v-if="decided"
              icon="i-lucide-lock"
              color="neutral"
              variant="soft"
              title="This proposal has been decided"
              description="Its scope is the record of what was agreed, so it can't be edited."
            />

            <!-- ===== Basics ===== -->
            <section
              :ref="el => setSectionEl('basics', el)"
              data-section="basics"
              class="scroll-mt-[84px] rounded-card bg-default p-6 ring ring-default"
            >
              <div class="mb-5">
                <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Basics
                </div>
                <p class="mt-1.5 text-[13.5px] text-muted">
                  Who it's for and which agreement it turns into.
                </p>
              </div>
              <div class="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField
                  label="Client"
                  :required="mode === 'create'"
                  :error="errors.client_id"
                >
                  <UInput
                    v-if="mode === 'edit'"
                    :model-value="clientName || '—'"
                    disabled
                    size="lg"
                    class="w-full"
                  />
                  <USelectMenu
                    v-else
                    v-model="basics.client_id"
                    :items="clientItems"
                    value-key="value"
                    placeholder="Choose a client…"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Project Type"
                  :error="errors.project_type_id"
                  help="Pins which agreement it generates."
                >
                  <USelectMenu
                    v-model="basics.project_type_id"
                    :items="typeItems"
                    value-key="value"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>
              <UFormField
                label="Title"
                required
                :error="errors.title"
              >
                <UInput
                  v-model="basics.title"
                  placeholder="Marketing site rebuild"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </section>

            <!-- ===== Scope ===== -->
            <section
              :ref="el => setSectionEl('scope', el)"
              data-section="scope"
              class="scroll-mt-[84px] rounded-card bg-default p-6 ring ring-default"
            >
              <div class="mb-5">
                <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Scope
                </div>
                <p class="mt-1.5 text-[13.5px] text-muted">
                  The Statement of Work. Write as much as the project needs — each field grows with it.
                </p>
              </div>
              <div class="flex flex-col gap-[18px]">
                <UFormField label="Goals / Description">
                  <UTextarea
                    v-model="sow.goals"
                    :rows="4"
                    autoresize
                    placeholder="What this project is for, in the client's words."
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Pages Included">
                  <UTextarea
                    v-model="sow.pages_included"
                    :rows="4"
                    autoresize
                    placeholder="Home, About, Services, Contact"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Key Features">
                  <UTextarea
                    v-model="sow.key_features"
                    :rows="4"
                    autoresize
                    placeholder="Contact form, gallery, booking, blog"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Design Deliverables">
                  <UTextarea
                    v-model="sow.design_deliverables"
                    :rows="4"
                    autoresize
                    placeholder="Custom design, mobile-responsive, brand colors"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Third-Party Costs">
                  <UTextarea
                    v-model="sow.third_party_costs"
                    :rows="4"
                    autoresize
                    placeholder="Hosting, domain, plugins — who pays"
                    class="w-full"
                  />
                </UFormField>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <UFormField label="Content Provided By">
                    <USelect
                      v-model="sow.content_provided_by"
                      :items="CONTENT_BY_ITEMS"
                      placeholder="Select…"
                      size="lg"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Revision Rounds Included">
                    <UInput
                      v-model.number="sow.revision_rounds"
                      type="number"
                      min="0"
                      size="lg"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </section>

            <!-- ===== Fees & Dates ===== -->
            <section
              :ref="el => setSectionEl('fees', el)"
              data-section="fees"
              class="scroll-mt-[84px] rounded-card bg-default p-6 ring ring-default"
            >
              <div class="mb-5">
                <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Fees &amp; Dates
                </div>
                <p class="mt-1.5 text-[13.5px] text-muted">
                  The split the contract quotes and the dates the schedule is built from.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UFormField label="Project Fee (Total)">
                  <UInput
                    v-model.number="sow.project_fee"
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
                  label="Deposit %"
                  :error="errors.deposit_pct"
                  :help="noDeposit ? 'No deposit — the full fee is due on the final invoice.' : undefined"
                >
                  <UInput
                    v-model.number="sow.deposit_pct"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Hourly Rate (Extra Work)">
                  <UInput
                    v-model.number="sow.hourly_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    icon="i-lucide-dollar-sign"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>
              <div class="mt-3 flex items-center gap-4 text-[13px] text-muted">
                <span v-if="!noDeposit">Deposit ({{ sow.deposit_pct || 0 }}%): <span class="font-semibold text-highlighted tabular-nums">{{ money(deposit) }}</span></span>
                <span>Final ({{ 100 - (sow.deposit_pct || 0) }}%): <span class="font-semibold text-highlighted tabular-nums">{{ money(balance) }}</span></span>
              </div>
              <div class="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UFormField label="Content Deadline">
                  <UInput
                    v-model="sow.content_deadline"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Start Date">
                  <UInput
                    v-model="sow.start_date"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Target Launch">
                  <UInput
                    v-model="sow.target_launch_date"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </section>

            <!-- ===== Terms & Policies ===== -->
            <section
              :ref="el => setSectionEl('terms', el)"
              data-section="terms"
              class="scroll-mt-[84px] rounded-card bg-default p-6 ring ring-default"
            >
              <div class="mb-5">
                <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Terms &amp; Policies
                </div>
                <p class="mt-1.5 text-[13.5px] text-muted">
                  Engagement-specific terms, and the day counts the agreement's clauses use.
                </p>
              </div>
              <UFormField
                label="Special Terms / Notes"
                class="mb-[18px]"
              >
                <UTextarea
                  v-model="sow.special_terms"
                  :rows="3"
                  autoresize
                  placeholder="Anything specific to this engagement."
                  class="w-full"
                />
              </UFormField>
              <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <UFormField label="Inactivity (Days)">
                  <UInput
                    v-model.number="sow.inactivity_days"
                    type="number"
                    min="0"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Feedback (Days)">
                  <UInput
                    v-model.number="sow.feedback_days"
                    type="number"
                    min="0"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Late (Days)">
                  <UInput
                    v-model.number="sow.late_fee_days"
                    type="number"
                    min="0"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Bug-Fix (Days)">
                  <UInput
                    v-model.number="sow.bugfix_days"
                    type="number"
                    min="0"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </section>
          </fieldset>
        </div>
      </div>

      <!-- ===== sticky action bar ===== -->
      <!-- Spans the full content column (100cqw of the layout's size container)
           whatever the sidebar width / max-width cap; px restores the inset. -->
      <div class="sticky bottom-0 z-20 mx-[calc((100%_-_100cqw)/2)] border-t border-default bg-default/95 px-4 shadow-[0_-1px_2px_rgba(18,24,23,0.04)] backdrop-blur sm:px-5 lg:px-[26px]">
        <div class="flex w-full flex-wrap items-center gap-3 py-3.5">
          <span
            v-if="dirty"
            class="inline-flex items-center gap-2 text-[13px] text-muted"
          >
            <span class="size-[7px] rounded-full bg-warning" />Unsaved changes
          </span>
          <span
            v-else-if="saved"
            class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success"
          >
            <UIcon
              name="i-lucide-check"
              class="size-4"
            />All changes saved
          </span>
          <div class="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <UButton
              color="neutral"
              variant="outline"
              class="w-full justify-center rounded-full sm:w-auto"
              @click="requestCancel"
            >
              {{ decided ? 'Back To Proposals' : 'Cancel' }}
            </UButton>
            <UButton
              v-if="!decided"
              color="primary"
              class="w-full justify-center rounded-full sm:w-auto"
              :disabled="primaryDisabled"
              :loading="saving"
              @click="save"
            >
              {{ primaryLabel }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- cancel confirm -->
      <UModal
        v-model:open="cancelConfirm"
        title="Discard Your Changes?"
      >
        <template #body>
          <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-warning/10 text-warning">
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-5"
            />
          </span>
          <p class="text-[14.5px] leading-relaxed text-default">
            You've made changes that haven't been saved. Leaving now will lose them.
          </p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="keepEditing"
            >
              Keep Editing
            </UButton>
            <UButton
              color="error"
              @click="leave"
            >
              Discard Changes
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
