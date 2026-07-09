<script setup lang="ts">
// Outreach cockpit — the main panel of the lead detail page for manual (outreach)
// leads. Cadence hero + stage pipeline + a timeline of logged touches
// (GET/POST /api/leads/:id/touches). Emits `changed` after any write so the
// parent reloads the lead (header chip + profile cadence stay in sync).
type Stage = 'new' | 'qualifying' | 'to_contact' | 'contacted' | 'engaged' | 'qualified'
type Channel = 'call' | 'email' | 'sms' | 'meeting' | 'note' | 'other'

interface Lead {
  id: number
  stage: Stage
  created_at: string
  last_contacted_at: string | null
  next_action_at: string | null
}
interface Touch {
  id: number
  channel: Channel
  body: string | null
  occurred_at: string
}

const props = defineProps<{ leadId: number, lead: Lead }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const OUTREACH_STAGES: Stage[] = ['to_contact', 'contacted', 'engaged', 'qualified']
const STAGE_LABEL: Record<Stage, string> = { new: 'New', qualifying: 'Qualifying', to_contact: 'To Contact', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified' }

const CHANNELS: { key: Channel, label: string, icon: string }[] = [
  { key: 'call', label: 'Call', icon: 'i-lucide-phone' },
  { key: 'email', label: 'Email', icon: 'i-lucide-mail' },
  { key: 'sms', label: 'SMS', icon: 'i-lucide-message-square' },
  { key: 'meeting', label: 'Meeting', icon: 'i-lucide-users' },
  { key: 'note', label: 'Note', icon: 'i-lucide-sticky-note' },
  { key: 'other', label: 'Other', icon: 'i-lucide-ellipsis' }
]
const channelMeta = (c: Channel) => CHANNELS.find(x => x.key === c) ?? CHANNELS[5]

// ---- cadence hero ----
const nextAction = computed(() => {
  const nextAt = props.lead.next_action_at
  if (nextAt) {
    const overdue = new Date(nextAt.replace(' ', 'T')).getTime() < Date.now()
    const d = daysFromNow(nextAt) ?? 0
    return { label: overdue ? `Follow-up · ${Math.abs(d)}d overdue` : `Follow up in ${d}d`, overdue, scheduled: true }
  }
  if (props.lead.stage === 'qualified') return { label: 'Ready To Convert', overdue: false, scheduled: false }
  return { label: 'No Follow-Up Scheduled', overdue: false, scheduled: false }
})

// ---- stage pipeline ----
const stageIndex = computed(() => OUTREACH_STAGES.indexOf(props.lead.stage))
const canAdvance = computed(() => stageIndex.value >= 0 && stageIndex.value < OUTREACH_STAGES.length - 1)
const savingStage = ref(false)
async function setStage(k: Stage) {
  if (props.lead.stage === k || savingStage.value) return
  savingStage.value = true
  try {
    await api(`/leads/${props.leadId}`, { method: 'PATCH', body: { stage: k } })
    emit('changed')
  } catch {
    toast.add({ title: "Couldn't update stage", color: 'error' })
  } finally {
    savingStage.value = false
  }
}
function advanceStage() {
  if (canAdvance.value) setStage(OUTREACH_STAGES[stageIndex.value + 1]!)
}

// ---- touches ----
const touches = ref<Touch[]>([])
const loadingTouches = ref(true)
async function loadTouches() {
  loadingTouches.value = true
  try {
    const { data } = await api<{ data: Touch[] }>(`/leads/${props.leadId}/touches`)
    touches.value = data
  } catch {
    touches.value = []
  } finally {
    loadingTouches.value = false
  }
}
onMounted(loadTouches)
watch(() => props.leadId, loadTouches)

async function removeTouch(t: Touch) {
  const prev = touches.value
  touches.value = touches.value.filter(x => x.id !== t.id)
  try {
    await api(`/leads/${props.leadId}/touches/${t.id}`, { method: 'DELETE' })
  } catch {
    touches.value = prev
    toast.add({ title: "Couldn't delete touch", color: 'error' })
  }
}

// ---- log-touch modal ----
const logOpen = ref(false)
const saving = ref(false)
const form = reactive<{ channel: Channel, body: string, followUp: number | null }>({ channel: 'call', body: '', followUp: 7 })
const FOLLOWUPS: { label: string, days: number | null }[] = [
  { label: 'No Follow-Up', days: null },
  { label: 'In 3 Days', days: 3 },
  { label: 'In 1 Week', days: 7 },
  { label: 'In 2 Weeks', days: 14 }
]
function openLog() {
  form.channel = 'call'
  form.body = ''
  form.followUp = 7
  logOpen.value = true
}
function isoInDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
async function logTouch() {
  if (saving.value) return
  saving.value = true
  try {
    await api(`/leads/${props.leadId}/touches`, {
      method: 'POST',
      body: {
        channel: form.channel,
        body: form.body.trim() || null,
        next_action_at: form.followUp != null ? isoInDays(form.followUp) : null
      }
    })
    logOpen.value = false
    await loadTouches()
    emit('changed')
    toast.add({ title: 'Touch logged', color: 'success' })
  } catch {
    toast.add({ title: "Couldn't log touch", color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <!-- cadence hero + actions -->
    <div class="rounded-card bg-default p-[18px] ring ring-default">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span
            class="inline-flex size-11 flex-none items-center justify-center rounded-[12px]"
            :class="nextAction.overdue ? 'bg-warning/10 text-warning' : 'bg-mist text-primary'"
          >
            <UIcon
              :name="nextAction.overdue ? 'i-lucide-triangle-alert' : 'i-lucide-calendar-clock'"
              class="size-5"
            />
          </span>
          <div>
            <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Next action
            </div>
            <div
              class="text-[15px] font-semibold"
              :class="nextAction.overdue ? 'text-warning' : 'text-highlighted'"
            >
              {{ nextAction.label }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2.5">
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="outline"
            class="rounded-full"
            :disabled="!canAdvance"
            :loading="savingStage"
            @click="advanceStage"
          >
            Advance Stage
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            @click="openLog"
          >
            Log Touch
          </UButton>
        </div>
      </div>

      <!-- stage pipeline -->
      <div class="mt-5 flex items-center">
        <template
          v-for="(s, i) in OUTREACH_STAGES"
          :key="s"
        >
          <div
            v-if="i > 0"
            class="h-px flex-1"
            :class="i <= stageIndex ? 'bg-teal-500' : 'bg-default'"
          />
          <button
            class="inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-3 text-xs font-semibold transition-colors"
            :class="i === stageIndex ? 'bg-teal-800 text-white'
              : (i < stageIndex ? 'bg-mist text-primary hover:bg-mist/80' : 'bg-muted text-muted hover:text-highlighted')"
            @click="setStage(s)"
          >
            <UIcon
              :name="i < stageIndex ? 'i-lucide-check' : 'i-lucide-circle'"
              class="size-3"
              :class="i === stageIndex ? 'opacity-90' : 'opacity-70'"
            />{{ STAGE_LABEL[s] }}
          </button>
        </template>
      </div>
    </div>

    <!-- timeline -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div class="flex items-center gap-2.5 border-b border-default px-[18px] py-4">
        <UIcon
          name="i-lucide-history"
          class="size-[18px] text-muted"
        />
        <span class="text-[15px] font-semibold text-highlighted">Outreach timeline</span>
        <span
          v-if="touches.length"
          class="rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted tabular-nums"
        >{{ touches.length }}</span>
      </div>

      <div
        v-if="loadingTouches"
        class="px-[18px] py-10 text-center text-sm text-muted"
      >
        Loading…
      </div>

      <div class="px-[18px] py-4">
        <div class="relative pl-1.5">
          <!-- logged touches -->
          <div
            v-for="t in touches"
            :key="t.id"
            class="group relative flex gap-3.5 pb-5"
          >
            <div class="flex flex-none flex-col items-center">
              <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-muted text-default">
                <UIcon
                  :name="channelMeta(t.channel).icon"
                  class="size-4"
                />
              </span>
              <span class="mt-1 w-px flex-1 bg-default" />
            </div>
            <div class="min-w-0 flex-1 pt-1">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-semibold text-highlighted">{{ channelMeta(t.channel).label }}</span>
                <span class="text-xs text-muted tabular-nums">{{ timeAgo(t.occurred_at) }}</span>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                  :aria-label="`Delete ${channelMeta(t.channel).label} touch`"
                  @click="removeTouch(t)"
                />
              </div>
              <p
                v-if="t.body"
                class="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-default"
              >
                {{ t.body }}
              </p>
            </div>
          </div>

          <!-- synthetic origin entry -->
          <div class="relative flex gap-3.5">
            <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px] bg-mist text-primary">
              <UIcon
                name="i-lucide-user-plus"
                class="size-4"
              />
            </span>
            <div class="min-w-0 pt-1">
              <div class="text-[13px] font-semibold text-highlighted">
                Added to outreach
              </div>
              <div class="mt-0.5 text-xs text-muted tabular-nums">
                {{ timeAgo(lead.created_at) }}
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="!loadingTouches && !touches.length"
          class="mt-1 rounded-[12px] bg-muted/40 p-4 text-center"
        >
          <p class="text-[13px] text-muted">
            No touches logged yet. Record your first call or email to start the cadence.
          </p>
        </div>
      </div>
    </div>

    <!-- log-touch modal -->
    <UModal
      v-model:open="logOpen"
      title="Log A Touch"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div>
            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Channel
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="c in CHANNELS"
                :key="c.key"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
                :class="form.channel === c.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
                @click="form.channel = c.key"
              >
                <UIcon
                  :name="c.icon"
                  class="size-3.5"
                />{{ c.label }}
              </button>
            </div>
          </div>

          <UFormField label="What Happened?">
            <UTextarea
              v-model="form.body"
              :rows="3"
              autoresize
              placeholder="e.g. Left a voicemail, sent pricing…"
              class="w-full"
            />
          </UFormField>

          <div>
            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Next follow-up
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="f in FOLLOWUPS"
                :key="f.label"
                class="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] transition-colors"
                :class="form.followUp === f.days ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
                @click="form.followUp = f.days"
              >
                {{ f.label }}
              </button>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="logOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            class="rounded-full"
            :loading="saving"
            @click="logTouch"
          >
            Log Touch
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
