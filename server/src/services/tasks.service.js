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
