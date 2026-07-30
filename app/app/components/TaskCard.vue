<script setup lang="ts">
// A single project task: check + title on line 1, a wrapping meta row of chips
// (priority / due / checklist) below, and hover-revealed actions. All mutations
// emit back to the page — this component makes no API calls of its own.
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
interface Task {
  id: number
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  checklist_total: number
  checklist_done: number
}
interface ChecklistItem { id: number, task_id: number, title: string, done: boolean, position: number }
interface MenuItem { label: string, icon?: string, color?: 'error', onSelect: () => void }

const props = defineProps<{
  task: Task
  expanded?: boolean
  checklistItems?: ChecklistItem[]
  menu: MenuItem[][]
}>()
const emit = defineEmits<{
  'toggle': []
  'set-due': [string | null]
  'toggle-expand': []
  'add-item': [string]
  'toggle-item': [ChecklistItem]
  'remove-item': [ChecklistItem]
}>()

const PRIORITY_META: Record<'low' | 'high', { label: string, class: string }> = {
  high: { label: 'High', class: 'bg-warning/10 text-warning' },
  low: { label: 'Low', class: 'bg-muted text-muted' }
}

const done = computed(() => props.task.status === 'done')
const overdue = computed(() => {
  const d = daysFromNow(props.task.due_date)
  return d != null && d < 0 && !done.value
})
const checklistPct = computed(() => (props.task.checklist_total ? Math.round((props.task.checklist_done / props.task.checklist_total) * 100) : 0))

const newItem = ref('')
function submitItem() {
  const title = newItem.value.trim()
  if (!title) return
  emit('add-item', title)
  newItem.value = ''
}
</script>

<template>
  <div class="border-b border-default last:border-b-0">
    <div class="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted">
      <!-- done toggle -->
      <button
        type="button"
        class="mt-0.5 flex size-[18px] flex-none items-center justify-center rounded-full border transition-colors"
        :class="done ? 'border-primary bg-primary text-inverted' : 'border-accented hover:border-primary'"
        :aria-label="done ? 'Mark not done' : 'Mark done'"
        @click="emit('toggle')"
      >
        <UIcon
          v-if="done"
          name="i-lucide-check"
          class="size-3"
        />
      </button>

      <div class="min-w-0 flex-1">
        <span
          class="block text-[13.5px] leading-snug"
          :class="done ? 'text-muted line-through' : 'text-highlighted'"
        >{{ task.title }}</span>

        <!-- wrapping meta row -->
        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            v-if="task.priority !== 'medium'"
            class="rounded-chip px-2 py-0.5 text-[10.5px] font-semibold"
            :class="PRIORITY_META[task.priority].class"
          >{{ PRIORITY_META[task.priority].label }}</span>

          <!-- due date — click to set/clear -->
          <UPopover>
            <button
              type="button"
              class="inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] tabular-nums transition-colors"
              :class="task.due_date ? (overdue ? 'font-semibold text-warning hover:bg-warning/10' : 'text-muted hover:bg-elevated') : 'text-muted opacity-0 group-hover:opacity-100 hover:text-highlighted'"
            >
              <UIcon
                name="i-lucide-calendar"
                class="size-3.5"
              />
              <span>{{ task.due_date ? shortDate(task.due_date) : 'Due' }}</span>
            </button>
            <template #content>
              <div class="flex flex-col gap-2 p-3">
                <UInput
                  type="date"
                  :model-value="task.due_date ? task.due_date.slice(0, 10) : ''"
                  size="sm"
                  @update:model-value="(v) => emit('set-due', (v as string) || null)"
                />
                <UButton
                  v-if="task.due_date"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-x"
                  class="justify-center"
                  @click="emit('set-due', null)"
                >
                  Clear due date
                </UButton>
              </div>
            </template>
          </UPopover>

          <!-- checklist mini-bar -->
          <button
            v-if="task.checklist_total > 0"
            type="button"
            class="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
            :aria-label="expanded ? 'Hide checklist' : 'Show checklist'"
            @click="emit('toggle-expand')"
          >
            <span class="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span
                class="block h-full rounded-full bg-primary transition-[width] duration-300"
                :style="{ width: checklistPct + '%' }"
              />
            </span>
            <span class="text-[11px] text-muted tabular-nums">{{ task.checklist_done }}/{{ task.checklist_total }}</span>
          </button>
        </div>
      </div>

      <!-- actions -->
      <div class="flex flex-none items-center gap-0.5">
        <button
          type="button"
          class="inline-flex items-center rounded-chip px-1.5 py-1 text-muted opacity-0 transition-colors hover:text-highlighted group-hover:opacity-100"
          :class="expanded ? 'opacity-100' : ''"
          :aria-label="expanded ? 'Hide checklist' : 'Show checklist'"
          @click="emit('toggle-expand')"
        >
          <UIcon
            name="i-lucide-list-checks"
            class="size-3.5"
          />
          <UIcon
            name="i-lucide-chevron-down"
            class="size-3.5 transition-transform"
            :class="expanded ? 'rotate-180' : ''"
          />
        </button>
        <UDropdownMenu :items="menu">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Actions for ${task.title}`"
          />
        </UDropdownMenu>
      </div>
    </div>

    <!-- checklist panel -->
    <div
      v-if="expanded"
      class="border-t border-default bg-muted/40 py-2.5 pl-11 pr-4"
    >
      <div
        v-for="item in (checklistItems ?? [])"
        :key="item.id"
        class="group/item flex items-center gap-2.5 py-1"
      >
        <button
          type="button"
          class="flex size-4 flex-none items-center justify-center rounded-[5px] border transition-colors"
          :class="item.done ? 'border-primary bg-primary text-inverted' : 'border-accented hover:border-primary'"
          :aria-label="item.done ? 'Mark item not done' : 'Mark item done'"
          @click="emit('toggle-item', item)"
        >
          <UIcon
            v-if="item.done"
            name="i-lucide-check"
            class="size-2.5"
          />
        </button>
        <span
          class="min-w-0 flex-1 text-[13px]"
          :class="item.done ? 'text-muted line-through' : 'text-default'"
        >{{ item.title }}</span>
        <button
          type="button"
          class="flex-none text-muted opacity-0 transition-opacity hover:text-error group-hover/item:opacity-100"
          aria-label="Remove item"
          @click="emit('remove-item', item)"
        >
          <UIcon
            name="i-lucide-x"
            class="size-3.5"
          />
        </button>
      </div>
      <UInput
        v-model="newItem"
        placeholder="Add a checklist item…"
        size="xs"
        icon="i-lucide-plus"
        class="mt-1 w-full"
        :ui="{ base: 'rounded-full' }"
        @keydown.enter="submitItem"
      />
    </div>
  </div>
</template>
