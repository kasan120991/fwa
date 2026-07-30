<script setup lang="ts">
// Lead detail — the read view for a lead (GET /api/leads/:id). Trimmed to what a
// lead needs (no invoices/websites/tickets). Its reason to exist: surface the
// full inquiry message, which the edit form never showed. Converting turns the
// lead into a client + project (POST /api/leads/:id/convert).
const route = useRoute()
const api = useApi()
const toast = useToast()
const { resolveUrl } = useUploads()

type Source = 'website' | 'manual'
type Stage = 'new' | 'qualifying' | 'to_contact' | 'contacted' | 'engaged' | 'qualified'

interface ApiContact {
  id: number
  source: Source
  stage: Stage
  name: string
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  website: string | null
  logo_url: string | null
  message: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
  last_contacted_at: string | null
  next_action_at: string | null
}

// Pipeline stage styling — kept in sync with the Leads list so a lead's chip
// reads the same here as in the table it came from.
const STAGE_LABEL: Record<Stage, string> = { new: 'New', qualifying: 'Qualifying', to_contact: 'To Contact', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified' }
function stageChipClass(k: Stage) {
  if (k === 'new' || k === 'to_contact') return 'bg-muted text-default'
  if (k === 'qualifying' || k === 'contacted' || k === 'engaged') return 'bg-info/10 text-info'
  if (k === 'qualified') return 'bg-success/10 text-success'
  return 'bg-mist text-primary'
}
const AVATAR = ['bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default', 'bg-warning/10 text-warning']

const SOURCE_META: Record<Source, { label: string, icon: string }> = {
  website: { label: 'Website Form', icon: 'i-lucide-layout-panel-top' },
  manual: { label: 'Outreach', icon: 'i-lucide-pencil' }
}

const contact = ref<ApiContact | null>(null)
const pending = ref(true)
const notes = ref('')

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiContact }>(`/leads/${route.params.id}`)
    contact.value = data
    notes.value = data.notes || ''
  } catch {
    contact.value = null
  } finally {
    pending.value = false
  }
}
onMounted(load)

useHead({ title: () => `${contact.value ? (contact.value.company || contact.value.name) : 'Lead'} · Lead · Francis Web Agency` })

// ---- derived ----
const displayName = computed(() => contact.value ? (contact.value.company || contact.value.name) : '')
const avatarClass = computed(() => AVATAR[(contact.value?.id ?? 0) % AVATAR.length])
const nextAction = computed(() => {
  const c = contact.value
  if (!c) return null
  const nextAt = c.next_action_at
  const overdue = !!nextAt && new Date(nextAt.replace(' ', 'T')).getTime() < Date.now()
  if (nextAt) {
    const d = daysFromNow(nextAt) ?? 0
    return { label: overdue ? `Follow-up · ${Math.abs(d)}d overdue` : `Follow up in ${d}d`, overdue }
  }
  if (c.stage === 'to_contact') return { label: 'Start Outreach', overdue: false }
  if (c.stage === 'qualified') return { label: 'Convert To Project', overdue: false }
  return null
})

// ---- notes autosave ----
function saveNotes() {
  api(`/leads/${route.params.id}`, { method: 'PATCH', body: { notes: notes.value } }).catch(() => {})
}

// ---- convert to project (creates a client + project, deletes this lead) ----
const converting = ref(false)
const convertOpen = ref(false)
const convertName = ref('')
watch(convertOpen, (open) => {
  if (open) convertName.value = `${displayName.value} website`
})
async function confirmConvert() {
  const c = contact.value
  if (!c || converting.value) return
  const name = convertName.value.trim()
  if (!name) return
  converting.value = true
  try {
    const { data } = await api<{ data: { client: { id: number }, project: { id: number } | null } }>(
      `/leads/${c.id}/convert`, { method: 'POST', body: { project: { name } } }
    )
    toast.add({ title: 'Converted to project', description: `${c.name} is now a client.`, color: 'success' })
    convertOpen.value = false
    if (data.project) await navigateTo(`/projects/${data.project.id}`)
    else await navigateTo(`/clients/${data.client.id}`)
  } catch {
    toast.add({ title: "Couldn't convert", color: 'error' })
  } finally {
    converting.value = false
  }
}
</script>

<template>
  <div
    v-if="pending"
    class="flex min-h-[60vh] items-center justify-center text-sm text-muted"
  >
    Loading lead…
  </div>

  <div
    v-else-if="!contact"
    class="flex min-h-[60vh] items-center justify-center"
  >
    <div class="flex max-w-md flex-col items-center rounded-card bg-default px-10 py-14 text-center ring ring-default">
      <span class="mb-5 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          name="i-lucide-user-x"
          class="size-6"
        />
      </span>
      <h2 class="font-display text-2xl font-semibold tracking-tight text-highlighted">
        Lead Not Found
      </h2>
      <p class="mt-2 text-[15px] text-muted">
        We couldn't find that lead.
      </p>
      <UButton
        to="/leads"
        variant="soft"
        color="primary"
        class="mt-6"
        icon="i-lucide-arrow-left"
      >
        Back To Leads
      </UButton>
    </div>
  </div>

  <template v-else>
    <!-- back link -->
    <NuxtLink
      to="/leads"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />Leads
    </NuxtLink>

    <!-- header identity -->
    <div class="flex flex-wrap items-center justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="contact.logo_url"
          :src="resolveUrl(contact.logo_url)"
          alt=""
          class="size-[58px] flex-none rounded-[14px] object-cover ring ring-default"
        >
        <span
          v-else
          class="inline-flex size-[58px] flex-none items-center justify-center rounded-[14px] font-display text-2xl font-semibold tracking-tight"
          :class="avatarClass"
        >{{ initials(displayName) }}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-[28px] font-semibold tracking-tight text-highlighted">
              {{ displayName }}
            </h1>
            <span
              class="inline-flex items-center rounded-chip py-1 px-3 text-xs font-semibold"
              :class="stageChipClass(contact.stage)"
            >{{ STAGE_LABEL[contact.stage] }}</span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-3.5">
            <span class="inline-flex items-center gap-1.5 text-sm text-muted">
              <UIcon
                :name="SOURCE_META[contact.source].icon"
                class="size-[15px]"
              />{{ SOURCE_META[contact.source].label }}
            </span>
            <a
              v-if="contact.website"
              :href="`https://${contact.website}`"
              target="_blank"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
            >
              <UIcon
                name="i-lucide-globe"
                class="size-[15px]"
              />{{ contact.website }}
            </a>
          </div>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <UButton
          :to="`/leads/${contact.id}/edit`"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          class="rounded-full"
        >
          Edit
        </UButton>
        <UButton
          icon="i-lucide-folder-plus"
          color="primary"
          @click="convertOpen = true"
        >
          Convert To Project
        </UButton>
      </div>
    </div>

    <!-- body -->
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
      <!-- profile panel -->
      <div class="flex flex-col gap-4 lg:sticky lg:top-4">
        <div class="overflow-hidden rounded-card bg-default ring ring-default">
          <div class="border-b border-default p-[18px]">
            <div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Primary contact
            </div>
            <div class="mt-2.5 flex items-center gap-3">
              <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-full bg-sand text-[13px] font-semibold text-highlighted">
                {{ initials(contact.name) }}
              </span>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-highlighted">
                  {{ contact.name }}
                </div>
                <div
                  v-if="contact.title"
                  class="text-[13px] text-muted"
                >
                  {{ contact.title }}
                </div>
              </div>
            </div>
            <div class="mt-3.5 flex flex-col gap-2.5">
              <a
                v-if="contact.email"
                :href="`mailto:${contact.email}`"
                class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
              >
                <UIcon
                  name="i-lucide-mail"
                  class="size-[15px] flex-none text-muted"
                />{{ contact.email }}
              </a>
              <a
                v-if="contact.phone"
                :href="`tel:${phoneDigits(contact.phone)}`"
                class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
              >
                <UIcon
                  name="i-lucide-phone"
                  class="size-[15px] flex-none text-muted"
                />{{ formatPhone(contact.phone) }}
              </a>
            </div>
          </div>

          <div
            v-if="contact.tags && contact.tags.length"
            class="border-b border-default p-[18px]"
          >
            <div class="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Tags
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="t in contact.tags"
                :key="t"
                color="neutral"
                variant="soft"
                size="sm"
                class="rounded-full"
              >
                {{ t }}
              </UBadge>
            </div>
          </div>

          <div class="flex flex-col gap-3 p-[18px]">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[13px] text-muted">Received</span>
              <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ timeAgo(contact.created_at) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-[13px] text-muted">Last contacted</span>
              <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ contact.last_contacted_at ? timeAgo(contact.last_contacted_at) : '—' }}</span>
            </div>
            <div
              v-if="nextAction"
              class="flex items-center justify-between gap-3"
            >
              <span class="text-[13px] text-muted">Next action</span>
              <span
                class="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tabular-nums"
                :class="nextAction.overdue ? 'text-warning' : 'text-highlighted'"
              >
                <UIcon
                  v-if="nextAction.overdue"
                  name="i-lucide-triangle-alert"
                  class="size-3.5 flex-none"
                />{{ nextAction.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- notes -->
        <div class="rounded-card bg-default p-[18px] ring ring-default">
          <div class="mb-2.5 flex items-center justify-between">
            <div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Internal notes
            </div>
            <span class="text-xs text-muted">{{ notes.length }} chars</span>
          </div>
          <UTextarea
            v-model="notes"
            :rows="4"
            autoresize
            placeholder="Add a private note about this lead…"
            class="w-full"
            @blur="saveNotes"
          />
        </div>
      </div>

      <!-- main panel -->
      <div class="flex min-w-0 flex-col gap-[18px]">
        <!-- website: inbound inquiry (the contact-form message) -->
        <div
          v-if="contact.source === 'website'"
          class="overflow-hidden rounded-card bg-default ring ring-default"
        >
          <div class="flex items-center gap-2.5 border-b border-default px-[18px] py-4">
            <UIcon
              name="i-lucide-message-square-text"
              class="size-[18px] text-muted"
            />
            <span class="text-[15px] font-semibold text-highlighted">Inquiry</span>
          </div>
          <div class="p-[18px]">
            <p
              v-if="contact.message"
              class="whitespace-pre-line text-[14.5px] leading-relaxed text-default"
            >{{ contact.message }}</p>
            <div
              v-else
              class="flex flex-col items-center py-8 text-center"
            >
              <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-message-square-dashed"
                class="size-5"
              /></span>
              <p class="text-sm text-muted">
                This website lead didn't include a message.
              </p>
            </div>
          </div>
        </div>

        <!-- manual/outreach: the outreach cockpit (cadence + touch timeline) -->
        <OutreachPanel
          v-else
          :lead-id="contact.id"
          :lead="contact"
          @changed="load"
        />
      </div>
    </div>

    <!-- convert-to-project modal -->
    <UModal
      v-model:open="convertOpen"
      title="Convert To Project"
    >
      <template #body>
        <span class="mb-4 inline-flex size-[46px] items-center justify-center rounded-xl bg-mist text-primary"><UIcon
          name="i-lucide-folder-plus"
          class="size-5"
        /></span>
        <p class="text-[14.5px] leading-relaxed text-default">
          Convert <strong class="text-highlighted">{{ contact.name }}</strong> into a client and start a project.
          This creates the client record and removes the lead.
        </p>
        <UFormField
          label="Project Name"
          class="mt-4"
        >
          <UInput
            v-model="convertName"
            placeholder="e.g. Acme website"
            class="w-full"
            @keydown.enter="confirmConvert"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="convertOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            icon="i-lucide-folder-plus"
            color="primary"
            class="rounded-full"
            :loading="converting"
            :disabled="!convertName.trim()"
            @click="confirmConvert"
          >
            Convert To Project
          </UButton>
        </div>
      </template>
    </UModal>
  </template>
</template>
