import { query } from '../db/pool.js'
import { getProject } from '../repositories/projects.repo.js'
import { listMilestones } from '../repositories/milestones.repo.js'
import { getTask, updateTask } from '../repositories/tasks.repo.js'
import { checklistCounts } from '../repositories/clickup.repo.js'
import { pushMilestone } from './clickupProvision.js'
import {
  emitMilestoneUpdated, emitTaskUpdated, emitClientProjectChanged, emitClientMilestoneChanged
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
 * 'Started' means at least one task has moved off 'todo' — in progress, blocked,
 * or done. Counting only DONE tasks would leave a milestone you're actively
 * working stuck at 'upcoming', and the portal renders no bar, no description and
 * no counter for an upcoming milestone: the client would see a bare title while
 * the work is underway.
 */
export async function syncMilestoneStates(projectId) {
  if (!projectId) return { changed: 0, movedIds: [] }
  // Snapshot before the bulk UPDATE so we can name the milestones that moved.
  // The UPDATE is a set-based JOIN with no per-row hook, and the callers need
  // the ids: ClickUp has to be told which phase changed (see deliveryChanged).
  const before = new Map(
    (await query('SELECT id, state FROM project_milestones WHERE project_id = :projectId', { projectId }))
      .map(m => [Number(m.id), m.state])
  )
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
                           WHEN tr.started = 0     THEN 'upcoming'
                           ELSE 'in_progress' END,
            m.completed_at = CASE WHEN tr.done = tr.total
                                  THEN COALESCE(m.completed_at, NOW()) ELSE NULL END
      WHERE m.project_id = :projectId
        AND m.state_manual = 0
        AND tr.total > 0
        AND m.state <> CASE WHEN tr.done = tr.total THEN 'complete'
                            WHEN tr.started = 0     THEN 'upcoming'
                            ELSE 'in_progress' END`,
    { projectId }
  )
  const changed = res.affectedRows ?? 0
  if (!changed) return { changed: 0, movedIds: [] }
  const after = await query('SELECT id, state FROM project_milestones WHERE project_id = :projectId', { projectId })
  return { changed, movedIds: after.filter(m => before.get(Number(m.id)) !== m.state).map(m => Number(m.id)) }
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
    const { changed, movedIds } = await syncMilestoneStates(projectId)
    const project = await getProject(projectId)
    if (!project) return

    if (changed) {
      // Milestone rows carry their own rollup, so re-read once and push the lot.
      for (const m of await listMilestones(projectId)) emitMilestoneUpdated(m)
      // And tell ClickUp, because this is the ONLY place the derived state
      // moves — finishing a milestone's last task in ClickUp would otherwise
      // turn the phase green in Ops and leave its ClickUp task in To Do.
      //
      // A service-layer push looks like it breaks the "pushes live in routes"
      // rule. It doesn't: that rule exists to stop the two-way TASK loop
      // echoing, and milestone tasks have no pull path, so no echo is possible.
      // Never awaited — a ClickUp 429 must not stall a sweep mid-project.
      for (const id of movedIds) {
        pushMilestone(id).catch(err => console.error(`[delivery] push milestone ${id}:`, err.message))
      }
    }
    if (project.client_id) {
      emitClientProjectChanged(project.client_id, project.id)
      emitClientMilestoneChanged(project.client_id, project.id)
    }
  } catch (err) {
    console.error(`[delivery] project ${projectId}:`, err.message)
  }
}

/**
 * A fully-ticked checklist completes its parent task; un-ticking reopens it.
 *
 * This makes the checklist the definition of the task being done, which is the
 * first link in the chain the whole feature exists for: tick the last item ->
 * task done -> milestone rollup moves -> milestone state advances -> the
 * client's portal bar fills.
 *
 * Two deliberate limits. A task with NO checklist items is never touched —
 * "every item is done" is vacuously true of an empty list, and the rule would
 * otherwise complete every checklist-free task in the system. And the rule only
 * moves a task INTO or OUT OF 'done'; it never picks between todo and
 * in_progress, which stays ClickUp's business.
 *
 * Consequence worth knowing: a task can't be marked done while items remain
 * unticked — it reopens on the next pass. That's the reactive behavior asked
 * for, not an accident.
 *
 * Writes through the repo rather than tasks.service to avoid a cycle
 * (tasks.service -> delivery.service). Returns the new status when it acted.
 */
export async function applyChecklistRule(taskId) {
  if (!taskId) return { changed: false }
  const { total, done } = await checklistCounts(taskId)
  if (total === 0) return { changed: false, reason: 'no checklist' }

  const task = await getTask(taskId)
  if (!task) return { changed: false }
  const allDone = done === total

  let next = null
  if (allDone && task.status !== 'done') next = 'done'
  else if (!allDone && task.status === 'done') next = 'in_progress'
  if (!next) return { changed: false }

  const updated = await updateTask(taskId, { status: next })
  if (updated) emitTaskUpdated(updated)
  return { changed: true, status: next, project_id: task.project_id }
}
