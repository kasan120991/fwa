import * as repo from '../repositories/milestones.repo.js'
import { emitMilestoneCreated, emitMilestoneUpdated, emitMilestoneDeleted } from '../realtime/io.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createMilestone(data) {
  const milestone = await repo.createMilestone(data)
  emitMilestoneCreated(milestone)
  return milestone
}

export async function updateMilestone(id, data) {
  const milestone = await repo.updateMilestone(id, data)
  if (milestone) emitMilestoneUpdated(milestone)
  return milestone
}

export async function deleteMilestone(id) {
  const existing = await repo.getMilestone(id)
  const ok = await repo.deleteMilestone(id)
  if (ok) emitMilestoneDeleted(id, existing?.project_id ?? null)
  return ok
}

export async function reorderMilestones(project_id, orderedIds) {
  const milestones = await repo.setPositions(project_id, orderedIds)
  // Positions changed across the set; a per-row update ping keeps listeners in
  // sync without a bespoke bulk event.
  for (const m of milestones) emitMilestoneUpdated(m)
  return milestones
}
