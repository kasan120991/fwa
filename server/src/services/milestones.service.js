import * as repo from '../repositories/milestones.repo.js'
import { emitMilestoneCreated, emitMilestoneUpdated, emitMilestoneDeleted } from '../realtime/io.js'
import { deliveryChanged } from './delivery.service.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createMilestone(data) {
  const milestone = await repo.createMilestone(data)
  emitMilestoneCreated(milestone)
  return milestone
}

export async function updateMilestone(id, data) {
  const milestone = await repo.updateMilestone(id, data)
  if (!milestone) return milestone
  // Handing a pinned milestone back to auto-pilot should take effect at once,
  // not wait for the next task change.
  if (data.state_manual === 0) {
    await deliveryChanged(milestone.project_id)
    const fresh = await repo.getMilestone(id)
    if (fresh) { emitMilestoneUpdated(fresh); return fresh }
  }
  emitMilestoneUpdated(milestone)
  return milestone
}

export async function deleteMilestone(id) {
  const existing = await repo.getMilestone(id)
  const ok = await repo.deleteMilestone(id)
  if (ok) {
    emitMilestoneDeleted(id, existing?.project_id ?? null)
    // Its tasks were just detached, so the remaining milestones' rollups and
    // the portal's counts both moved.
    await deliveryChanged(existing?.project_id)
  }
  return ok
}

export async function reorderMilestones(project_id, orderedIds) {
  const milestones = await repo.setPositions(project_id, orderedIds)
  // Positions changed across the set; a per-row update ping keeps listeners in
  // sync without a bespoke bulk event.
  for (const m of milestones) emitMilestoneUpdated(m)
  return milestones
}
