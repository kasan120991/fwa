import * as repo from '../repositories/projects.repo.js'
import { emitProjectCreated, emitProjectUpdated, emitProjectDeleted } from '../realtime/io.js'
import { logClientActivity } from './clientActivity.service.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createProject(data) {
  const project = await repo.createProject(data)
  emitProjectCreated(project)
  await logClientActivity(project.client_id, {
    category: 'project', icon: 'i-lucide-folder-plus',
    title: `Project “${project.name}” created`,
    link: `/projects/${project.id}`
  })
  return project
}

export async function updateProject(id, data) {
  const project = await repo.updateProject(id, data)
  if (project) emitProjectUpdated(project)
  return project
}

/**
 * Automatic lifecycle advance driven by contract/invoice events. Forward-only
 * along PROJECT_LIFECYCLE_ORDER, and never overrides a manual `on_hold` pause or
 * moves backward (guards against out-of-order / re-delivered webhooks). No-ops
 * when the project is missing, already there, or the move isn't a forward step.
 * Returns the (possibly unchanged) project. Manual UI status changes bypass this.
 */
export async function advanceProject(projectId, toStatus) {
  if (!projectId) return null
  const project = await repo.getProject(projectId)
  if (!project) return null
  if (project.status === 'on_hold') return project
  const from = repo.PROJECT_LIFECYCLE_ORDER.indexOf(project.status)
  const to = repo.PROJECT_LIFECYCLE_ORDER.indexOf(toStatus)
  if (to < 0 || to <= from) return project
  return updateProject(projectId, { status: toStatus })
}

export async function deleteProject(id) {
  const ok = await repo.deleteProject(id)
  if (ok) emitProjectDeleted(id)
  return ok
}
