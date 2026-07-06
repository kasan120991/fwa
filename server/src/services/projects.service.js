import * as repo from '../repositories/projects.repo.js'
import { emitProjectCreated, emitProjectUpdated, emitProjectDeleted } from '../realtime/io.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createProject(data) {
  const project = await repo.createProject(data)
  emitProjectCreated(project)
  return project
}

export async function updateProject(id, data) {
  const project = await repo.updateProject(id, data)
  if (project) emitProjectUpdated(project)
  return project
}

export async function deleteProject(id) {
  const ok = await repo.deleteProject(id)
  if (ok) emitProjectDeleted(id)
  return ok
}
