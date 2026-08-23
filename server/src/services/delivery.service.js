import { query } from '../db/pool.js'
import { getProject } from '../repositories/projects.repo.js'
import { listMilestones } from '../repositories/milestones.repo.js'
import {
  emitMilestoneUpdated, emitClientProjectChanged, emitClientMilestoneChanged
} from '../realtime/io.js'

// The single choke point for "a task changed, so the delivery picture moved".
//
// Two things have to happen and both were previously missing: milestone state
// has to follow the task rollup (nobody flips it by hand any more now that work
// lives in ClickUp), and the client's portal has to hear about it (every
// project/task/milestone event used to go to role:admin alone).
//
// Best-effort and never throws, mirroring notify() and logClientActivity(): a
// failed recompute must not break the business action that triggered it.

/**
 * Recompute every derived milestone state on a project.
 *
 * The rule is the rollup, in both directions — reopening a task genuinely
 * un-completes its milestone. Two milestones are left alone: one pinned by hand
 * (state_manual = 1), and one with no tasks at all, which has nothing to derive
 * from and would otherwise be stuck at 'upcoming' forever.
 *
 * NOTE: 'started' here means at least one task DONE. A milestone whose tasks are
 * all in progress but none finished still reads 'upcoming' — and the portal
 * renders no bar for upcoming. To make any non-todo task count as started,
 * change `tr.done = 0` below to `tr.started = 0` and use the commented column.
 */
export async function syncMilestoneStates(projectId) {
  if (!projectId) return { changed: 0 }
  const res = await query(
    `UPDATE project_milestones m
       JOIN (
         SELECT milestone_id,
                COUNT(*) AS total,
                COALESCE(SUM(status = 'done'), 0) AS done,
                COALESCE(SUM(status <> 'todo'), 0) AS started
         FROM tasks WHERE milestone_id IS NOT NULL GROUP BY milestone_id
       ) tr ON tr.milestone_id = m.id
        SET m.state = CASE WHEN tr.done = tr.total THEN 'complete'
                           WHEN tr.done = 0        THEN 'upcoming'
                           ELSE 'in_progress' END,
            m.completed_at = CASE WHEN tr.done = tr.total
                                  THEN COALESCE(m.completed_at, NOW()) ELSE NULL END
      WHERE m.project_id = :projectId
        AND m.state_manual = 0
        AND tr.total > 0
        AND m.state <> CASE WHEN tr.done = tr.total THEN 'complete'
                            WHEN tr.done = 0        THEN 'upcoming'
                            ELSE 'in_progress' END`,
    { projectId }
  )
  return { changed: res.affectedRows ?? 0 }
}

/**
 * Call after any write that moves a task's status or milestone. Recomputes the
 * derived states, tells admins which milestones moved, and pushes the rollup
 * change into the client's own room so an open portal page updates live.
 *
 * The portal only ever receives the derived counts — never a task.
 */
export async function deliveryChanged(projectId) {
  if (!projectId) return
  try {
    const { changed } = await syncMilestoneStates(projectId)
    const project = await getProject(projectId)
    if (!project) return

    if (changed) {
      // Milestone rows carry their own rollup, so re-read once and push the lot.
      for (const m of await listMilestones(projectId)) emitMilestoneUpdated(m)
    }
    if (project.client_id) {
      emitClientProjectChanged(project.client_id, project.id)
      emitClientMilestoneChanged(project.client_id, project.id)
    }
  } catch (err) {
    console.error(`[delivery] project ${projectId}:`, err.message)
  }
}
