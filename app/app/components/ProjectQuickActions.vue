<script setup lang="ts">
// Four things you reach for constantly on a project. Add Task and Upload File
// jump to where those already live; Log Time and Note open their own panels
// rather than growing the page.
const emit = defineEmits<{
  'add-task': []
  'upload-file': []
  'log-time': []
  'note': []
}>()
defineProps<{ timeHours?: number, noteCount?: number }>()

const ACTIONS = [
  { key: 'add-task', label: 'Add Task', icon: 'i-lucide-circle-plus' },
  { key: 'upload-file', label: 'Upload File', icon: 'i-lucide-upload' },
  { key: 'log-time', label: 'Log Time', icon: 'i-lucide-clock' },
  { key: 'note', label: 'Note', icon: 'i-lucide-sticky-note' }
] as const
</script>

<template>
  <div class="rounded-card bg-default p-5 ring ring-default">
    <p class="eyebrow mb-3">
      Quick Actions
    </p>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="a in ACTIONS"
        :key="a.key"
        type="button"
        class="flex flex-col items-center gap-1.5 rounded-btn border border-default px-2 py-3 text-[12px] text-default transition-colors hover:border-line-strong hover:bg-elevated"
        @click="emit(a.key)"
      >
        <UIcon
          :name="a.icon"
          class="size-[18px] text-muted"
        />
        {{ a.label }}
        <span
          v-if="a.key === 'log-time' && timeHours"
          class="text-[10.5px] text-muted tabular-nums"
        >{{ timeHours }} hrs</span>
        <span
          v-else-if="a.key === 'note' && noteCount"
          class="text-[10.5px] text-muted tabular-nums"
        >{{ noteCount }}</span>
      </button>
    </div>
  </div>
</template>
