<script setup lang="ts">
// Rail timeline panel: key dates + a launch countdown chip that tints amber
// once the target launch is past (and the project isn't completed).
interface ProjectLike {
  status: string
  start_date: string | null
  content_deadline: string | null
  target_launch_date: string | null
}
const props = defineProps<{ project: ProjectLike }>()

const launchDays = computed(() => daysFromNow(props.project.target_launch_date))
const overdueLaunch = computed(() => launchDays.value != null && launchDays.value < 0 && props.project.status !== 'completed')
const countdown = computed(() => {
  const d = launchDays.value
  if (d == null) return null
  if (d === 0) return 'Today'
  if (d < 0) return `${Math.abs(d)}d overdue`
  return `in ${d}d`
})

const rows = computed(() => [
  { label: 'Start', value: props.project.start_date },
  { label: 'Content deadline', value: props.project.content_deadline },
  { label: 'Target launch', value: props.project.target_launch_date, launch: true }
])
</script>

<template>
  <div class="rounded-card bg-default p-[18px] ring ring-default">
    <div class="mb-3 flex items-center justify-between">
      <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Timeline</span>
      <span
        v-if="countdown"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums"
        :class="overdueLaunch ? 'bg-warning/10 text-warning' : 'bg-mist text-primary'"
      >
        <UIcon
          name="i-lucide-rocket"
          class="size-3.5"
        />
        Launch {{ countdown }}
      </span>
    </div>
    <div class="flex flex-col gap-2 text-[13px]">
      <div
        v-for="r in rows"
        :key="r.label"
        class="flex justify-between gap-2"
      >
        <span class="text-muted">{{ r.label }}</span>
        <span
          class="tabular-nums"
          :class="r.launch && overdueLaunch ? 'font-semibold text-warning' : 'text-default'"
        >{{ r.value ? shortDate(r.value) : '—' }}</span>
      </div>
    </div>
  </div>
</template>
