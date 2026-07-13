<script setup lang="ts">
// Lifecycle stepper across the project's linear commercial/billing pipeline
// (planning → signature → deposit → … → completed) — distinct from the delivery
// "Milestones" that group tasks. `on_hold` is a side-state (a pause), not a step
// — it renders as an amber overlay badge and mutes the track. Clicking a step
// emits `advance`; the page owns the PATCH.
type Status = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'
type Step = Exclude<Status, 'on_hold'>

const props = defineProps<{ status: Status }>()
const emit = defineEmits<{ advance: [Status] }>()

// The 7-step lifecycle — deliberately excludes `on_hold` (see above).
const LIFECYCLE: { status: Step, label: string }[] = [
  { status: 'planning', label: 'Planning' },
  { status: 'awaiting_signature', label: 'Signature' },
  { status: 'awaiting_deposit', label: 'Deposit' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'in_review', label: 'Review' },
  { status: 'awaiting_final', label: 'Final Payment' },
  { status: 'completed', label: 'Completed' }
]

const onHold = computed(() => props.status === 'on_hold')
const currentIndex = computed(() => LIFECYCLE.findIndex(s => s.status === props.status))

function stateOf(i: number): 'done' | 'current' | 'future' {
  if (i < currentIndex.value) return 'done'
  if (i === currentIndex.value) return 'current'
  return 'future'
}
</script>

<template>
  <div class="relative">
    <div class="flex min-w-max items-start gap-0 overflow-x-auto pb-1">
      <template
        v-for="(step, i) in LIFECYCLE"
        :key="step.status"
      >
        <!-- connector (between steps) -->
        <div
          v-if="i > 0"
          class="mt-[13px] h-0.5 w-6 flex-none rounded-full sm:w-10"
          :class="!onHold && i <= currentIndex ? 'bg-teal-600' : 'bg-default'"
        />
        <button
          type="button"
          class="group flex flex-none flex-col items-center gap-1.5 transition-opacity hover:opacity-80"
          :aria-label="`Set status to ${step.label}`"
          @click="emit('advance', step.status)"
        >
          <span
            class="flex size-[26px] items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
            :class="onHold
              ? 'bg-muted text-muted ring-1 ring-default'
              : stateOf(i) === 'done'
                ? 'bg-teal-600 text-white'
                : stateOf(i) === 'current'
                  ? 'bg-mist text-primary ring-2 ring-teal-400'
                  : 'bg-muted text-muted ring-1 ring-default'"
          >
            <UIcon
              v-if="!onHold && stateOf(i) === 'done'"
              name="i-lucide-check"
              class="size-3.5"
            />
            <span
              v-else-if="!onHold && stateOf(i) === 'current'"
              class="size-2 rounded-full bg-teal-500"
            />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span
            class="whitespace-nowrap text-[11.5px] font-medium transition-colors"
            :class="!onHold && stateOf(i) === 'current' ? 'text-highlighted' : 'text-muted'"
          >{{ step.label }}</span>
        </button>
      </template>
    </div>

    <!-- on_hold side-state overlay -->
    <div
      v-if="onHold"
      class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[12px] font-semibold text-warning"
    >
      <UIcon
        name="i-lucide-pause"
        class="size-3.5"
      />
      On hold
    </div>
  </div>
</template>
