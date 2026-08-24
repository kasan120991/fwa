<script setup lang="ts">
// Log Time — reached from the project's Quick Actions.
// Every entry records time; `billable` decides whether it can reach an invoice.
// Once an entry has been billed it's frozen: the API refuses edits and deletes
// with a 409 rather than rewriting an invoice after the fact.
interface TimeEntry {
  id: number
  minutes: number
  note: string | null
  billable: boolean
  billed: boolean
  occurred_at: string
  task_title: string | null
}
interface Summary {
  total_minutes: number
  billable_minutes: number
  unbilled_minutes: number
  unbilled_count: number
}

const props = defineProps<{ open: boolean, projectId: number, hourlyRate: number | null }>()
const emit = defineEmits<{ 'update:open': [boolean], 'changed': [Summary] }>()

const api = useApi()
const toast = useToast()

const entries = ref<TimeEntry[]>([])
const summary = ref<Summary>({ total_minutes: 0, billable_minutes: 0, unbilled_minutes: 0, unbilled_count: 0 })
const pending = ref(false)
const saving = ref(false)

const duration = ref('')
const note = ref('')
const billable = ref(true)

const hours = (m: number) => Math.round((m / 60) * 100) / 100
const rate = computed(() => Number(props.hourlyRate) || 0)
const unbilledValue = computed(() => Math.round(hours(summary.value.unbilled_minutes) * rate.value * 100) / 100)

async function load() {
  pending.value = true
  try {
    const res = await api<{ data: TimeEntry[], summary: Summary }>(`/projects/${props.projectId}/time`)
    entries.value = res.data
    summary.value = res.summary
    emit('changed', res.summary)
  } catch {
    toast.add({ title: 'Could not load time entries', color: 'error' })
  } finally {
    pending.value = false
  }
}
watch(() => props.open, (o) => {
  if (o) load()
})

async function submit() {
  if (!duration.value.trim()) return
  saving.value = true
  try {
    const res = await api<{ data: TimeEntry, summary: Summary }>(`/projects/${props.projectId}/time`, {
      method: 'POST',
      body: { minutes: duration.value.trim(), note: note.value.trim() || null, billable: billable.value }
    })
    entries.value = [res.data, ...entries.value]
    summary.value = res.summary
    emit('changed', res.summary)
    duration.value = ''
    note.value = ''
  } catch (err: unknown) {
    // Surface the server's reason — the duration parser is picky on purpose.
    const e = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    toast.add({
      title: 'Could not log the time',
      description: e?.data?.error?.fields?.minutes || e?.data?.error?.message,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function remove(entry: TimeEntry) {
  try {
    const res = await api<{ summary: Summary }>(`/projects/${props.projectId}/time/${entry.id}`, { method: 'DELETE' })
    entries.value = entries.value.filter(e => e.id !== entry.id)
    summary.value = res.summary
    emit('changed', res.summary)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not delete the entry', description: e?.data?.error?.message, color: 'error' })
  }
}
</script>

<template>
  <USlideover
    :open="open"
    title="Log Time"
    :description="`Hours on this project. Billable time joins the final invoice.`"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <!-- create -->
        <form
          class="flex flex-col gap-3"
          @submit.prevent="submit"
        >
          <UFormField
            label="Duration"
            hint="90m · 1.5h · 1h30m"
          >
            <UInput
              v-model="duration"
              placeholder="90m"
              size="md"
              class="w-full"
            />
          </UFormField>
          <UFormField label="What was it?">
            <UInput
              v-model="note"
              placeholder="Extra revision round"
              size="md"
              class="w-full"
            />
          </UFormField>
          <div class="flex items-center gap-3">
            <UCheckbox
              v-model="billable"
              :label="rate ? `Billable at $${rate}/hr` : 'Billable'"
            />
            <UButton
              type="submit"
              class="ms-auto rounded-full"
              :loading="saving"
              :disabled="!duration.trim()"
            >
              Log
            </UButton>
          </div>
          <p
            v-if="!rate"
            class="text-[12px] text-muted"
          >
            No hourly rate on this project yet — time still logs, it just can't be priced.
          </p>
        </form>

        <!-- totals -->
        <div class="rounded-card bg-elevated p-4">
          <div class="flex items-center justify-between text-[13px]">
            <span class="text-muted">Logged</span>
            <span class="font-semibold text-highlighted tabular-nums">{{ hours(summary.total_minutes) }} hrs</span>
          </div>
          <div
            v-if="rate"
            class="mt-2 flex items-center justify-between text-[13px]"
          >
            <span class="text-muted">Billable, not yet invoiced</span>
            <span class="font-semibold text-highlighted tabular-nums">
              {{ hours(summary.unbilled_minutes) }} hrs · ${{ unbilledValue.toLocaleString('en-US') }}
            </span>
          </div>
        </div>

        <!-- entries -->
        <div>
          <p class="eyebrow mb-2">
            Entries
          </p>
          <p
            v-if="!pending && !entries.length"
            class="text-[13px] text-muted"
          >
            Nothing logged yet.
          </p>
          <div
            v-for="e in entries"
            :key="e.id"
            class="group flex items-center gap-3 border-b border-default py-2.5 last:border-b-0"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] text-highlighted">
                {{ e.note || 'Logged time' }}
              </p>
              <p class="text-[11.5px] text-muted">
                {{ shortDate(e.occurred_at) }}
                <template v-if="e.task_title">
                  · {{ e.task_title }}
                </template>
              </p>
            </div>
            <UBadge
              v-if="e.billed"
              color="neutral"
              variant="soft"
              size="sm"
            >
              Invoiced
            </UBadge>
            <UBadge
              v-else-if="e.billable"
              color="warning"
              variant="soft"
              size="sm"
            >
              Unbilled
            </UBadge>
            <UBadge
              v-else
              color="neutral"
              variant="outline"
              size="sm"
            >
              Non-billable
            </UBadge>
            <span class="w-12 flex-none text-right text-[13px] font-semibold text-highlighted tabular-nums">
              {{ hours(e.minutes) }}h
            </span>
            <UTooltip
              :text="e.billed ? 'On an invoice — can’t be removed' : 'Delete entry'"
            >
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="e.billed"
                class="flex-none opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete entry"
                @click="remove(e)"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
