import * as repo from '../repositories/tasks.repo.js'
import { emitTaskCreated, emitTaskUpdated, emitTaskDeleted } from '../realtime/io.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createTask(data) {
  const task = await repo.createTask(data)
  emitTaskCreated(task)
  return task
}

export async function updateTask(id, data) {
  const task = await repo.updateTask(id, data)
  if (task) emitTaskUpdated(task)
  return task
}

export async function deleteTask(id) {
  const existing = await repo.getTask(id)
  const ok = await repo.deleteTask(id)
  if (ok) emitTaskDeleted(id, existing?.project_id ?? null)
  return ok
}

// ---- checklist items: mutate, then push the parent task so its progress bar
// re-rolls live (listeners key off task:updated + refetch the task list). ----
async function touchTask(taskId) {
  const task = await repo.getTask(taskId)
  if (task) emitTaskUpdated(task)
}

export async function addChecklistItem(taskId, title) {
  const item = await repo.addChecklistItem(taskId, title)
  await touchTask(taskId)
  return item
}

export async function updateChecklistItem(id, data) {
  const item = await repo.updateChecklistItem(id, data)
  if (item) await touchTask(item.task_id)
  return item
}

export async function deleteChecklistItem(id) {
  const item = await repo.getChecklistItem(id)
  if (!item) return false
  const ok = await repo.deleteChecklistItem(id)
  if (ok) await touchTask(item.task_id)
  return ok
}
