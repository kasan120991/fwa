<script setup lang="ts">
// A single project task, on ONE line: check · title · priority · due · checklist
// · actions. It used to stack a title over a wrapping meta row, which cost two
// or three lines each and was most of what made the tasks tab feel bulky.
// The right-hand cells carry fixed widths so they align down the column.
//
// Since delivery moved to ClickUp, a task that HAS a checklist no longer owns
// its own status: finishing the checklist completes the task and un-ticking an
// item reopens it (services/delivery.service.js). So the done toggle is
// disabled for those tasks in both directions — otherwise the click is
// accepted and then silently reversed a second later.
type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
interface Task {
  id: number
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  checklist_total: number
  checklist_done: number
  clickup_task_id?: string | null
  clickup_sync_error?: string | null
}
interface ChecklistItem { id: number, task_id: number, title: string, done: boolean, position: number }
interface MenuItem { label: string, icon?: string, color?: 'error', onSelect: () => void }

const props = withDefaults(defineProps<{
  task: Task
  expanded?: boolean
  checklistItems?: ChecklistItem[]
  menu: MenuItem[][]
  density?: 'comfortable' | 'compact'
}>(), { density: 'comfortable' })

const emit = defineEmits<{
  'toggle': []
  'set-due': [string | null]
  'toggle-expand': []
  'add-item': [string]
  'toggle-item': [ChecklistItem]
  'remove-item': [ChecklistItem]
}>()

const PRIORITY_META: Record<'low' | 'high', { label: string, color: 'warning' | 'neutral' }> = {
  high: { label: 'High', color: 'warning' },
  low: { label: 'Low', color: 'neutral' }
}

const done = computed(() => props.task.status === 'done')
const overdue = computed(() => {
  const d = daysFromNow(props.task.due_date)
  return d != null && d < 0 && !done.value
})
// A checklist makes the task's status derived, not chosen.
const governed = computed(() => props.task.checklist_total > 0)
const complete = computed(() => governed.value && props.task.checklist_done === props.task.checklist_total)
const clickupUrl = computed(() => (props.task.clickup_task_id
  ? `https://app.clickup.com/t/${props.task.clickup_task_id}`
  : null))
const rowPad = computed(() => (props.density === 'compact' ? 'py-1.5' : 'py-2.5'))

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
    <div
      class="group flex items-center gap-3 px-4 transition-colors hover:bg-muted"
      :class="rowPad"
    >
      <!-- done toggle — read-only while a checklist governs the status -->
      <UTooltip
        :disabled="!governed"
        :text="done ? 'Completed by its checklist. Un-tick an item to reopen it.' : 'Finish the checklist to complete this task.'"
      >
        <UCheckbox
          :model-value="done"
          :disabled="governed"
          :aria-label="done ? 'Mark not done' : 'Mark done'"
          @update:model-value="emit('toggle')"
        />
      </UTooltip>

      <!-- title -->
      <span
        class="min-w-0 flex-1 truncate text-[13.5px]"
        :class="done ? 'text-muted line-through' : 'text-highlighted'"
      >{{ task.title }}</span>

      <!-- a push to ClickUp failed; the row is stale until it succeeds -->
      <UTooltip
        v-if="task.clickup_sync_error"
        :text="task.clickup_sync_error"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-3.5 flex-none text-error"
        />
      </UTooltip>

      <!-- priority — only when it isn't the default -->
      <span class="hidden w-12 flex-none justify-center sm:flex">
        <UBadge
          v-if="task.priority !== 'medium'"
          :color="PRIORITY_META[task.priority].color"
          variant="soft"
          size="sm"
        >
          {{ PRIORITY_META[task.priority].label }}
        </UBadge>
      </span>

      <!-- due date — click to set or clear -->
      <span class="hidden w-[86px] flex-none justify-end sm:flex">
        <UPopover>
          <button
            type="button"
            class="inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] tabular-nums transition-colors"
            :class="task.due_date ? (overdue ? 'font-semibold text-warning hover:bg-warning/10' : 'text-muted hover:bg-elevated') : 'text-muted opacity-0 group-hover:opacity-100 hover:text-highlighted'"
          >
            <span>{{ task.due_date ? shortDate(task.due_date) : 'Set due' }}</span>
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
      </span>

      <!-- checklist — a bar at rest, opens on click -->
      <span class="flex w-[92px] flex-none items-center justify-end gap-2">
        <template v-if="governed">
          <button
            type="button"
            class="flex flex-1 items-center gap-2 transition-opacity hover:opacity-80"
            :aria-label="expanded ? 'Hide checklist' : 'Show checklist'"
            @click="emit('toggle-expand')"
          >
            <UProgress
              :model-value="task.checklist_done"
              :max="task.checklist_total"
              size="2xs"
              :color="complete ? 'success' : 'primary'"
              class="flex-1"
            />
            <span class="flex-none text-[11px] text-muted tabular-nums">
              {{ task.checklist_done }}/{{ task.checklist_total }}
            </span>
          </button>
        </template>
        <UIcon
          v-else-if="done"
          name="i-lucide-circle-check"
          class="size-4 text-success"
        />
      </span>

      <!-- actions -->
      <span class="flex flex-none items-center gap-0.5">
        <UTooltip
          v-if="clickupUrl"
          text="Open in ClickUp"
        >
          <UButton
            :to="clickupUrl"
            target="_blank"
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="xs"
            class="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Open in ClickUp"
          />
        </UTooltip>
        <UDropdownMenu :items="menu">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Actions for ${task.title}`"
          />
        </UDropdownMenu>
      </span>
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
        <UCheckbox
          :model-value="item.done"
          :aria-label="item.done ? 'Mark item not done' : 'Mark item done'"
          @update:model-value="emit('toggle-item', item)"
        />
        <span
          class="min-w-0 flex-1 text-[13px]"
          :class="item.done ? 'text-muted line-through' : 'text-default'"
        >{{ item.title }}</span>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="flex-none opacity-0 transition-opacity hover:text-error group-hover/item:opacity-100"
          aria-label="Remove item"
          @click="emit('remove-item', item)"
        />
      </div>
      <UInput
        v-model="newItem"
        placeholder="Add a checklist item…"
        size="xs"
        icon="i-lucide-plus"
        class="mt-1 w-full"
        @keydown.enter="submitItem"
      />
    </div>
  </div>
</template>
