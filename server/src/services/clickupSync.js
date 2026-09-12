import { config } from '../config/env.js'
import * as cu from './clickup.js'
import * as map from './clickupMap.js'
import {
  ensureClientSpace, ensureProjectTask, ensureMilestoneTask, pushMilestone,
  pushProjectMilestones, milestoneTaskName, projectTaskBody, statusMapFor, isConfigured
} from './clickupProvision.js'
import * as repo from '../repositories/clickup.repo.js'
import * as tasksService from './tasks.service.js'
import { getTask } from '../repositories/tasks.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import { emitTaskCreated, emitTaskUpdated } from '../realtime/io.js'
import { deliveryChanged, applyChecklistRule } from './delivery.service.js'

// The bidirectional engine. Two directions live in two functions that never
// call each other — applyRemoteTask (ClickUp -> Ops) can't push, pushTask
// (Ops -> ClickUp) can't apply. That separation is what keeps the echo guard
// honest; putting either inside tasks.service.updateTask would reintroduce
// the loop, because that function is called by both directions.
//
// Shaped results, never thrown, per the websiteSync.js convention.

/* --------------------------------------------------------------- task locks */

// ClickUp delivers TWO webhooks for a single change (taskUpdated alongside the
// specific event), so two handlers routinely process the same task at once.
// Chain per-task work so they run in order: without this, both see the same
// pre-write state and duplicate whatever they create.
const taskLocks = new Map()
function withTaskLock(key, fn) {
  const prev = taskLocks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  taskLocks.set(key, next.catch(() => {}).finally(() => {
    if (taskLocks.get(key) === next) taskLocks.delete(key)
  }))
  return next
}

/* -------------------------------------------------------------- classifying */

/**
 * What a remote task IS, decided only from ids Ops has stored.
 *
 * The tree is three deep — project task -> milestone task -> work item — and
 * every tier is an ordinary ClickUp task, so depth has to be resolved rather
 * than guessed. This is a WHITELIST: `too-deep` is the fallthrough, because a
 * depth-3 item's parent is itself a legitimate `tasks.clickup_task_id` and any
 * blacklist-shaped check would let it through as a work item.
 *
 * `top_level_parent` is the project task's id for BOTH lower tiers (it comes
 * back null on a top-level task, not its own id), so it resolves the project in
 * one lookup and `parent` alone separates a milestone from a work item.
 */
export async function classifyRemote(remote) {
  if (!remote?.parent) return { kind: 'project-or-orphan' }

  const own = await repo.getMilestoneByClickupTaskId(remote.id)
  if (own) return { kind: 'milestone', milestone: own }

  const project = await repo.getProjectByClickupTaskId(remote.top_level_parent ?? remote.parent)
  if (!project) return { kind: 'foreign' }

  if (String(remote.parent) === String(project.clickup_task_id)) {
    return { kind: 'work-item', project, milestone_id: null }
  }
  const ms = await repo.getMilestoneByClickupTaskId(remote.parent)
  if (ms && Number(ms.project_id) === Number(project.id)) {
    return { kind: 'work-item', project, milestone_id: ms.id }
  }
  return { kind: 'too-deep', project, parent: remote.parent }
}

/* ------------------------------------------------------------ remote -> Ops */

/** Index a project's milestones by their ClickUp task id. */
const byMilestoneTask = milestones =>
  new Map((milestones ?? []).filter(m => m.clickup_task_id).map(m => [String(m.clickup_task_id), m]))

/**
 * A remote task expressed in Ops terms.
 *
 * `milestone_id` comes from the task's PARENT — the ClickUp tree is the source
 * of truth for membership now, so it's always present in `fields` and every
 * pull re-asserts it. A direct child of the project task is milestone-less,
 * which is exactly what Ops means by the "General" bucket.
 */
function toOpsTask(project, remote, milestoneByCuId) {
  return {
    fields: {
      title: String(remote.name ?? '').trim(),
      description: String(remote.description ?? '').trim() || null,
      status: map.statusToOps(remote.status),
      priority: map.priorityToOps(remote.priority),
      due_date: map.dateToOps(remote.due_date, config.clickup.tzOffsetMinutes),
      milestone_id: String(remote.parent) === String(project.clickup_task_id)
        ? null
        : milestoneByCuId.get(String(remote.parent))?.id ?? null
    },
    clickup_status: remote.status?.status ?? null
  }
}

/**
 * Flatten a remote task's checklists into the one flat list Ops keeps.
 *
 * ClickUp allows several named checklists per task and can nest items; Ops has
 * a single flat list. The model is one checklist per task, but items from ALL of
 * them are mirrored so nothing on the task is invisible in Ops — and so a
 * forgotten second checklist can't let the auto-done rule fire early. Nesting is
 * flattened in order; it survives in ClickUp, it just isn't represented here.
 */
function flattenChecklists(remote) {
  const out = []
  const walk = (items) => {
    for (const it of items ?? []) {
      out.push({ id: it.id, title: String(it.name ?? '').trim(), done: !!it.resolved })
      if (it.children?.length) walk(it.children)
    }
  }
  for (const cl of [...(remote.checklists ?? [])].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))) {
    walk(cl.items)
  }
  return out
}

/**
 * Reconcile a task's checklist against ClickUp.
 *
 * Called on EVERY pull path, including the echo path: ticking a checklist item
 * leaves the task's synced fields untouched, so the shadow compares equal and
 * the task itself is a no-op — the checklist change would be dropped if this
 * only ran when the task changed.
 */
async function applyRemoteChecklist(taskId, remote) {
  const first = [...(remote.checklists ?? [])].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))[0]
  await repo.setTaskChecklistId(taskId, first?.id ?? null)

  const wanted = flattenChecklists(remote)
  const local = await repo.listSyncChecklistItems(taskId)
  const byRemote = new Map(local.filter(i => i.clickup_item_id).map(i => [i.clickup_item_id, i]))
  const seen = new Set()
  let changed = 0

  for (const [pos, w] of wanted.entries()) {
    seen.add(w.id)
    const existing = byRemote.get(w.id)
    if (!existing) {
      try {
        await repo.createLinkedChecklistItem(taskId, { title: w.title, done: w.done, position: pos, clickupItemId: w.id })
        changed++
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err // another delivery won the race
      }
    } else if (await repo.updateChecklistItemFields(existing.id, { title: w.title, done: w.done, position: pos })) {
      changed++
    }
  }
  // Linked locally but gone from ClickUp — the item was deleted there.
  for (const i of local) {
    if (i.clickup_item_id && !seen.has(i.clickup_item_id)) {
      await repo.deleteChecklistItemRow(i.id)
      changed++
    }
  }
  return { changed, unlinked: local.filter(i => !i.clickup_item_id) }
}

/**
 * Everything that must follow a pulled task, on every path.
 *
 * Reconciles the checklist, then applies the auto-done rule. If the rule moved
 * the task, the new status is pushed straight back up — the one place the pull
 * path deliberately writes to ClickUp. It converges rather than loops: once
 * ClickUp holds the corrected status, the rule agrees with it and stops acting.
 */
async function afterRemoteTask(taskId, remote, projectId) {
  const cl = await applyRemoteChecklist(taskId, remote)
  const rule = await applyChecklistRule(taskId)
  if (rule.changed) {
    console.log(`[clickupSync] task ${taskId}: checklist ${rule.status === 'done' ? 'completed' : 'reopened'} it`)
    await pushTask(taskId).catch(err => console.error('[clickupSync] push rule status:', err.message))
    await deliveryChanged(projectId)
  }
  // NOTE: unlinked local items are deliberately NOT pushed from here. This runs
  // on every delivery, so pushing would race itself and create a remote item per
  // delivery, each returning as a fresh Ops row. Unlinked items go up once, from
  // pushTask, which the link/backfill paths call sequentially.
  return { checklistChanged: cl.changed, ruleChanged: rule.changed }
}

/**
 * Apply one remote task. The four outcomes, in order:
 *   created — no local row yet
 *   echo    — remote maps to exactly the shadow, so nothing happened. This is
 *             the echo suppressor: it fires for our own push coming back, a
 *             re-delivered webhook, and a ClickUp edit that maps to the same
 *             Ops value. No write, no emit, no push back.
 *   stale   — a newer remote state already landed (CAS rejected it)
 *   updated — genuine remote change, applied wholesale
 */
export async function applyRemoteTask(project, remote, local, milestones, { position = 0 } = {}) {
  const milestoneByCuId = byMilestoneTask(milestones)

  // A milestone task is NOT work — it's the parent of work. This function is
  // the only path to createLinkedTask/linkTask/applyRemote, so guarding here
  // makes a phantom `tasks` row impossible rather than merely unlikely. It
  // matters because every progress bar in both apps is task_done/task_total:
  // one phantom row per milestone skews all of them, silently.
  if (milestoneByCuId.has(String(remote.id))) return { skipped: 'milestone task' }

  // A drag into another project's subtree. applyRemote doesn't write
  // project_id, so writing here would leave the two sides permanently
  // disagreeing about who owns the task. Unlink and let the sweep re-adopt it
  // under the project it actually lives in now.
  if (local && Number(local.project_id) !== Number(project.id)) {
    await repo.unlinkTask(local.id, 'Moved to another project in ClickUp')
    return { warn: `Task ${local.id} moved to another project in ClickUp — unlinked` }
  }

  const version = Number(remote.date_updated) || Date.now()
  const mapped = toOpsTask(project, remote, milestoneByCuId)
  const shadow = map.shadowOf(mapped.fields)

  if (!local) {
    // Adopt an unlinked local task with the same title before creating a new
    // one. Without this, un-archiving a task in ClickUp (which unlinks it, see
    // confirmRemote) would come back as a duplicate rather than the original.
    // Prefer a candidate on the SAME milestone: a template seeds the same title
    // under different phases often enough ("Client review & revisions"), and a
    // project-wide match would adopt the wrong one and then move it.
    const unlinked = (await repo.listSyncTasksForProject(project.id))
      .filter(t => !t.clickup_task_id && map.normTitle(t.title) === map.normTitle(mapped.fields.title))
    const adopt = unlinked.find(t => Number(t.milestone_id) === Number(mapped.fields.milestone_id))
      ?? unlinked[0]
    if (adopt) {
      await repo.linkTask(adopt.id, remote.id, shadow, version)
      await repo.applyRemote(adopt.id, {
        fields: mapped.fields, shadow, version, clickupStatus: mapped.clickup_status
      })
      const fresh = await getTask(adopt.id)
      if (fresh) emitTaskUpdated(fresh)
      await deliveryChanged(project.id)
      return { updated: true, id: adopt.id, adopted: true }
    }
    // Insert already-linked, in one statement. ClickUp fires taskCreated and
    // taskUpdated concurrently for one new task, so a create-then-link would
    // let both handlers insert a row before either could claim the id.
    let newId
    try {
      newId = await repo.createLinkedTask({
        project_id: project.id,
        milestone_id: mapped.fields.milestone_id ?? null,
        title: mapped.fields.title || '(untitled)',
        description: mapped.fields.description,
        status: mapped.fields.status,
        priority: mapped.fields.priority,
        due_date: mapped.fields.due_date,
        // ClickUp's orderindex is a very large per-view float, not a rank, so
        // it can't go in an INT column — use the rank among its siblings.
        position
      }, { clickupTaskId: remote.id, shadow, version, clickupStatus: mapped.clickup_status })
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY') throw err
      // The concurrent handler won. Re-read its row and fall through to the
      // normal converge path rather than creating anything.
      const winner = await repo.getTaskByClickupId(remote.id)
      if (!winner) throw err
      return applyRemoteTask(project, remote, winner, milestones, { position })
    }
    const created = await getTask(newId)
    if (created) emitTaskCreated(created)
    await afterRemoteTask(newId, remote, project.id)
    await deliveryChanged(project.id)
    return { created: true, id: newId }
  }

  // Reconcile the checklist BEFORE the shadow comparison: ticking an item
  // doesn't touch any synced task field, so this is an echo as far as the task
  // is concerned and would otherwise return with the checklist change dropped.
  const post = await afterRemoteTask(local.id, remote, project.id)

  if (map.shadowEq(shadow, local.clickup_shadow)) {
    return { echo: !post.checklistChanged, updated: post.checklistChanged, id: local.id }
  }

  // Whether the LOCAL row had also drifted from the shadow, i.e. there is an
  // unpushed Ops edit about to be discarded. The row carries milestone_id
  // directly, so this is a straight shadowOf() now — it used to need a title
  // lookup, which reported a false divergence on every milestone-tagged task.
  const localShadow = map.shadowOf(local)
  const localDrifted = local.clickup_shadow && !map.shadowEq(localShadow, local.clickup_shadow)

  const applied = await repo.applyRemote(local.id, {
    fields: mapped.fields, shadow, version, clickupStatus: mapped.clickup_status
  })
  if (!applied) return { stale: true }

  // That unpushed Ops edit is now gone. It's the intended "ClickUp wins"
  // semantics, but it must never be silent.
  if (localDrifted) {
    console.log(`[clickupSync] task ${local.id}: local edit overwritten by ClickUp (${map.changedFields(localShadow, local.clickup_shadow).join(', ')})`)
  }
  const fresh = await getTask(local.id)
  if (fresh) emitTaskUpdated(fresh)
  await deliveryChanged(project.id)
  return { updated: true, id: local.id }
}

/**
 * The entry point external callers should use. Serializes per remote task id so
 * ClickUp's two-deliveries-per-change can't be processed concurrently. The
 * recursive call inside applyRemoteTask stays unlocked on purpose — re-entering
 * here would deadlock.
 */
export function syncRemoteTask(project, remote, local, milestones, opts) {
  return withTaskLock(remote.id, () => applyRemoteTask(project, remote, local, milestones, opts))
}

/* ------------------------------------------------------------ Ops -> remote */

function toClickUpBody(shadowFields, statusMap) {
  const body = {}
  if ('title' in shadowFields) body.name = shadowFields.title
  if ('description' in shadowFields) body.description = shadowFields.description ?? ''
  if ('status' in shadowFields && statusMap.map[shadowFields.status]) body.status = statusMap.map[shadowFields.status]
  if ('priority' in shadowFields) body.priority = map.priorityToClickUp(shadowFields.priority)
  if ('due_date' in shadowFields) body.due_date = map.dateToClickUp(shadowFields.due_date)
  return body
}

/** Push one Ops task up. Sends only the fields that actually changed. */
export async function pushTask(taskId) {
  if (!isConfigured()) return { pushed: false, configured: false }
  const local = await repo.getSyncTask(taskId)
  if (!local) return { pushed: false, notFound: true }
  if (!local.project_id) return { pushed: false, reason: 'standalone task' }

  const link = await ensureProjectTask(local.project_id)
  if (!link.linked) return { pushed: false, ...link }

  const now = map.shadowOf(local)
  const changed = map.changedFields(now, local.clickup_shadow)
  if (local.clickup_task_id && !changed.length) return { pushed: false, noop: true }

  // The ClickUp parent IS the milestone link, so resolve it before anything
  // else. Both aborts below deliberately omit `clearShadow`: no remote write
  // was issued, so the stored shadow is still true. Clearing it would make the
  // next pull apply unconditionally, which for a failed milestone MOVE means
  // silently reverting the task to the milestone it came from.
  let parentId = link.clickup_task_id
  if (local.milestone_id) {
    const ms = await repo.getMilestoneForSync(local.milestone_id)
    // Nothing validates that a task's milestone belongs to its project (see
    // tasks.routes.validateTask), and under nesting that would re-parent the
    // task into another project's subtree — which succeeds outright when both
    // projects belong to the same client.
    if (!ms || Number(ms.project_id) !== Number(local.project_id)) {
      await repo.setTaskSyncError(local.id, 'Milestone does not belong to this project')
      return { pushed: false, error: 'milestone/project mismatch' }
    }
    const msLink = await ensureMilestoneTask(ms)
    if (!msLink.linked) {
      await repo.setTaskSyncError(local.id, `Milestone task not provisioned: ${msLink.error ?? msLink.reason ?? ''}`.trim())
      return { pushed: false, reason: 'milestone task not provisioned' }
    }
    parentId = msLink.clickup_task_id
  }

  try {
    const statusMap = await statusMapFor(link.listId)
    const milestones = await repo.listMilestonesForSync(local.project_id)
    let remote

    if (!local.clickup_task_id) {
      remote = await cu.createTask(link.listId, {
        ...toClickUpBody(now, statusMap),
        parent: parentId
      })
      try {
        await repo.linkTask(local.id, remote.id, null, null)
      } catch (err) {
        // Roll back the remote task rather than leave an orphan that the next
        // sweep would mirror back as a duplicate (same shape as the droplet
        // rollback in websiteProvision).
        await cu.deleteTask(remote.id).catch(() => {})
        throw err
      }
    } else {
      // A milestone move is a re-parent, and it rides the SAME PUT as any other
      // changed field — where the dropdown write used to cost an extra call
      // plus a re-read, moving a task between phases is now free.
      const body = toClickUpBody(Object.fromEntries(changed.filter(f => f !== 'milestone_id').map(f => [f, now[f]])), statusMap)
      if (changed.includes('milestone_id')) body.parent = parentId
      if (Object.keys(body).length) await cu.updateTask(local.clickup_task_id, body)
      // Always re-read: ClickUp's PUT response isn't reliably authoritative
      // about `parent`, and the shadow has to reflect what ClickUp holds.
      remote = await cu.getTask(local.clickup_task_id)
    }

    // Shadow from the RESPONSE, never from what we meant to send: if ClickUp
    // normalizes the value we adopt its version immediately, so the next
    // comparison is against what ClickUp actually holds.
    const confirmed = toOpsTask(
      { id: local.project_id, clickup_task_id: link.clickup_task_id },
      remote,
      byMilestoneTask(milestones)
    )
    await repo.setShadow(
      local.id,
      map.shadowOf(confirmed.fields),
      Number(remote.date_updated) || Date.now(),
      confirmed.clickup_status
    )
    // Carry up any checklist items that have never been linked (a template
    // seed, or items added while ClickUp was unreachable). Sequential and only
    // from this path, so it can't race itself the way a per-delivery push would.
    for (const i of await repo.listSyncChecklistItems(local.id)) {
      if (i.clickup_item_id) continue
      await pushChecklistItem(i.id).catch(e => console.error(`[clickupSync] push item ${i.id}:`, e.message))
    }
    return { pushed: true, clickup_task_id: remote.id }
  } catch (err) {
    // Unknown remote state -> NULL shadow, which makes the next pull apply
    // unconditionally and re-converge.
    await repo.setTaskSyncError(local.id, err.message, { clearShadow: true })
    console.error(`[clickupSync] push task ${local.id}:`, err.message)
    return { pushed: false, error: err.message }
  }
}

/**
 * Push one Ops checklist item up. Creates the task's checklist on first use —
 * Ops keeps exactly one per task, which is why the id is cached on the task.
 */
export async function pushChecklistItem(itemId) {
  if (!isConfigured()) return { pushed: false, configured: false }
  const item = await repo.getChecklistItemById(itemId)
  if (!item) return { pushed: false, notFound: true }
  const task = await repo.getSyncTask(item.task_id)
  if (!task?.clickup_task_id) return { pushed: false, reason: 'task not linked' }

  let checklistId = task.clickup_checklist_id
  if (!checklistId) {
    // Reuse the task's existing checklist if it already has one, so an Ops-side
    // add doesn't create a second list alongside the one you made in ClickUp.
    const remote = await cu.getTask(task.clickup_task_id)
    checklistId = [...(remote.checklists ?? [])].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))[0]?.id
      ?? (await cu.createChecklist(task.clickup_task_id)).id
    await repo.setTaskChecklistId(task.id, checklistId)
  }

  if (item.clickup_item_id) {
    await cu.updateChecklistItem(checklistId, item.clickup_item_id, {
      name: item.title, resolved: !!item.done
    })
    return { pushed: true, clickup_item_id: item.clickup_item_id }
  }

  // Create returns the whole checklist; the new item is the one carrying our
  // name that no local row has claimed yet.
  const checklist = await cu.createChecklistItem(checklistId, item.title)
  const known = new Set((await repo.listSyncChecklistItems(item.task_id))
    .map(i => i.clickup_item_id).filter(Boolean))
  const created = (checklist.items ?? []).find(i => i.name === item.title && !known.has(i.id))
  if (!created) return { pushed: false, error: 'could not identify the created item' }
  await repo.linkChecklistItem(item.id, created.id)
  if (item.done) {
    await cu.updateChecklistItem(checklistId, created.id, { resolved: true })
  }
  return { pushed: true, clickup_item_id: created.id }
}

/** Remove a checklist item from ClickUp after it's deleted in Ops. */
export async function deleteRemoteChecklistItem(task, clickupItemId) {
  if (!isConfigured() || !clickupItemId) return { deleted: false }
  // The delete path is nested under the checklist, so fall back to reading it
  // off the task rather than skipping the delete — silently leaving the remote
  // item behind means the next sweep mirrors it straight back into Ops.
  let checklistId = task?.clickup_checklist_id
  if (!checklistId && task?.clickup_task_id) {
    const remote = await cu.getTask(task.clickup_task_id)
    checklistId = [...(remote.checklists ?? [])].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))[0]?.id
  }
  if (!checklistId) return { deleted: false, reason: 'no checklist on task' }
  await cu.deleteChecklistItem(checklistId, clickupItemId)
  return { deleted: true }
}

/**
 * Push the project's own fields onto its ClickUp task — name, the scope
 * summary, and the schedule: start_date comes from the project's start date,
 * due_date from its target launch date, so the ClickUp task carries the same
 * window as the SOW.
 *
 * One-way by design. These are Statement of Work fields that drive the contract
 * and the client's portal, so Ops owns them; the webhook already ignores
 * parentless tasks rather than reading a project back out of ClickUp. The
 * description is overwritten wholesale on every push, so a hand edit in ClickUp
 * lasts only until the next link/backfill.
 */
export async function pushProject(projectId) {
  if (!isConfigured()) return { pushed: false, configured: false }
  const project = await getProject(projectId)
  if (!project) return { pushed: false, notFound: true }
  const link = await ensureProjectTask(project)
  if (!link.linked) return { pushed: false, ...link }
  if (link.created) return { pushed: true, created: true } // dates went up with the create
  try {
    await cu.updateTask(link.clickup_task_id, projectTaskBody(project, { clearEmpty: true }))
    return { pushed: true, clickup_task_id: link.clickup_task_id }
  } catch (err) {
    await repo.setProjectSyncError(project.id, err.message)
    console.error(`[clickupSync] push project ${project.id}:`, err.message)
    return { pushed: false, error: err.message }
  }
}

/** Push every not-yet-linked task on a project (template seed, or backfill). */
export async function pushProjectTasks(projectId) {
  const tasks = await repo.listSyncTasksForProject(projectId)
  let pushed = 0
  for (const t of tasks.filter(t => !t.clickup_task_id)) {
    // Sequential on purpose: parallel creates blow the rate limit and produce
    // a nondeterministic orderindex.
    const res = await pushTask(t.id)
    if (res.pushed) pushed++
  }
  return { pushed, total: tasks.length }
}

/* ---------------------------------------------------------------- reconcile */

/**
 * A task vanishing from a list read has THREE causes and only one is a delete.
 * Deleting on a move would mean a drag-and-drop in ClickUp destroys Ops data,
 * so every delete candidate is confirmed individually first.
 */
export async function confirmRemote(taskId, expectedListId) {
  try {
    const t = await cu.getTask(taskId)
    if (t.archived) return { gone: false, reason: 'archived' }
    if (expectedListId && String(t.list?.id) !== String(expectedListId)) {
      return { gone: false, reason: 'moved to another list' }
    }
    return { gone: false, reason: 'still present' }
  } catch (err) {
    if (/^ClickUp 404/.test(err.message)) return { gone: true }
    throw err // 5xx / 429 — never delete on an error we can't interpret
  }
}

/** Reconcile one client's Projects list. One list read covers the whole tree. */
export async function reconcileClient(client) {
  if (!client.clickup_list_id) return { skipped: 'unlinked' }
  // Guard against a mis-set id dragging never-synced care-plan work into the diff.
  if (String(client.clickup_list_id) === String(client.clickup_careplan_list_id)) {
    return { skipped: 'projects list id equals care plan list id' }
  }
  const sweepStart = Date.now()
  const remote = await cu.listTasks(client.clickup_list_id)
  const byId = new Map(remote.map(t => [t.id, t]))
  // One read covers all three levels, so index children once by parent id.
  const childrenOf = new Map()
  for (const t of remote) {
    if (!t.parent) continue
    const key = String(t.parent)
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key).push(t)
  }
  const kids = id => [...(childrenOf.get(String(id)) ?? [])]
    .sort((a, b) => Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0))

  const projects = await repo.listProjectsForClient(client.id)
  const linked = projects.filter(p => p.clickup_task_id)
  const byRemote = new Map(linked.map(p => [p.clickup_task_id, p]))

  const out = {
    created: 0, updated: 0, echo: 0, deleted: 0, pushed: 0,
    milestones: 0, milestonesFixed: 0,
    warnings: [], orphans: [], tooDeep: []
  }

  // A ClickUp task in the Projects list with no Ops project. NEVER auto-create:
  // an Ops project carries commercial data (client, type, fee, contract) that a
  // ClickUp task can't supply, and projects are the SOW hub that originate
  // contracts. Report it and skip its subtree.
  for (const t of remote.filter(t => !t.parent && !byRemote.has(t.id))) {
    out.orphans.push({ id: t.id, name: t.name, url: t.url })
  }

  // A linked project whose ClickUp task is gone. Absence never deletes a
  // project — that would cascade its milestones and tasks and rewrite what the
  // client sees in the portal. Unlink and report.
  for (const p of linked.filter(p => !byId.has(p.clickup_task_id))) {
    const state = await confirmRemote(p.clickup_task_id, client.clickup_list_id)
    await repo.unlinkProject(p.id, `Project task ${state.gone ? 'deleted in ClickUp' : state.reason}`)
    out.warnings.push(`Project ${p.code ?? p.id} unlinked: task ${state.gone ? 'deleted' : state.reason}`)
  }

  const deleteCandidates = []
  // Milestones whose ClickUp task was genuinely deleted. Deleting a task in
  // ClickUp cascades to its subtasks, so their work items go missing in the
  // same sweep — they must be unlinked, never deleted.
  const cascaded = new Set()

  for (const p of linked.filter(p => byId.has(p.clickup_task_id))) {
    // One read for both milestone passes below.
    const projectMilestones = await repo.listMilestonesForSync(p.id)

    /* --- milestones: absent ------------------------------------------------ */
    // Unlink ONLY on a genuine 404. ensureMilestoneTask has no match-by-name
    // path and milestones have no equivalent of the tasks' grace window below,
    // so unlinking one that was merely archived, moved, or created a moment
    // after the snapshot would heal into a SECOND milestone task.
    for (const m of projectMilestones) {
      if (!m.clickup_task_id || byId.has(m.clickup_task_id)) continue
      const state = await confirmRemote(m.clickup_task_id, client.clickup_list_id)
      if (!state.gone) {
        out.warnings.push(`Milestone "${m.title}": ClickUp task ${state.reason} — link kept`)
        continue
      }
      cascaded.add(Number(m.id))
      // Unlink its work items NOW, in the same statement shape the webhook
      // uses. Their remote tasks died with the parent, and leaving the dead ids
      // on them is not survivable: the tasks' 60s grace window can push them
      // past this sweep's delete pass, and by the NEXT sweep the milestone has
      // been re-created, `cascaded` is empty, and a 404 on a work item is
      // indistinguishable from someone deleting that one task on purpose — so
      // they'd be destroyed. Unlinked here, the lazy heal re-pushes them below.
      const n = await repo.unlinkTasksForMilestone(m.id, 'Milestone task deleted in ClickUp — unlinked, not deleted')
      await repo.unlinkMilestone(m.id, 'Milestone task deleted in ClickUp')
      out.warnings.push(`Milestone "${m.title}" was deleted in ClickUp — Ops owns phases, so it and its ${n} task(s) will be re-created`)
    }

    /* --- milestones: drift ------------------------------------------------- */
    // The one-way channel has no shadow, so "ignore what ClickUp says" only
    // holds if Ops re-asserts. The milestone tasks are already in the snapshot,
    // so this costs no extra read.
    for (const m of projectMilestones) {
      const r = m.clickup_task_id && byId.get(m.clickup_task_id)
      if (!r) continue
      // 'blocked' has no milestone equivalent; treat it as work in flight.
      const remoteState = map.statusToOps(r.status) === 'blocked' ? 'in_progress' : map.statusToOps(r.status)
      // Compare the NUMBERED name — that's what Ops sends. This is also what
      // re-numbers a phase whose rank moved by some path that didn't push
      // (a mid-list insert), so the numbering self-heals within one sweep.
      const drifted = remoteState !== map.milestoneStateToOps(m.state)
        || String(r.name ?? '').trim() !== milestoneTaskName(m, projectMilestones)
        || map.dateToOps(r.due_date, config.clickup.tzOffsetMinutes) !== (m.target_date ? String(m.target_date).slice(0, 10) : null)
      if (drifted) { await pushMilestone(m.id, { siblings: projectMilestones }); out.milestonesFixed++ }
    }

    /* --- milestones: provision --------------------------------------------- */
    // Also the only path that reaches a milestone with NO tasks, which pushTask
    // would never provision.
    out.milestones += (await pushProjectMilestones(p.id)).pushed

    /* --- work items -------------------------------------------------------- */
    // Re-read: the two passes above may have unlinked or provisioned tasks.
    const milestones = await repo.listMilestonesForSync(p.id)
    const msTaskIds = new Set(milestones.filter(m => m.clickup_task_id).map(m => String(m.clickup_task_id)))
    // Direct children of the project task that aren't milestones are the
    // "General" bucket; then each milestone's own children, in phase order.
    const work = [
      ...kids(p.clickup_task_id).filter(t => !msTaskIds.has(String(t.id))),
      ...milestones.filter(m => m.clickup_task_id).flatMap(m => kids(m.clickup_task_id))
    ]
    const rIds = new Set(work.map(s => s.id))

    const local = await repo.listSyncTasksForProject(p.id)
    const byCu = new Map(local.filter(t => t.clickup_task_id).map(t => [t.clickup_task_id, t]))

    for (const [i, s] of work.entries()) {
      // position only matters on create (applyRemote excludes it), so
      // re-ranking every sweep costs nothing.
      const res = await syncRemoteTask(p, s, byCu.get(s.id) ?? null, milestones, { position: i })
      if (res.created) out.created++
      else if (res.updated) out.updated++
      else if (res.echo) out.echo++
      if (res.warn) out.warnings.push(res.warn)

      // Anything under a work item is a level deeper than Ops models. Report
      // and ignore — a human can nest four deep in ClickUp.
      for (const deep of kids(s.id)) out.tooDeep.push({ id: deep.id, name: deep.name, url: deep.url, parent: s.id })
    }

    for (const t of local) {
      if (!t.clickup_task_id || rIds.has(t.clickup_task_id)) continue
      // Grace window: pushed after the list snapshot was taken.
      if (map.utcMs(t.clickup_synced_at) > sweepStart - 60_000) continue
      deleteCandidates.push({ task: t, listId: client.clickup_list_id })
    }

    // Lazy heal: tasks created in Ops while ClickUp was unreachable.
    for (const t of local.filter(t => !t.clickup_task_id)) {
      const res = await pushTask(t.id)
      if (res.pushed) out.pushed++
    }
  }

  // Split the cascade out BEFORE counting. One deleted milestone takes its
  // whole subtree with it, so a 13-task phase would blow a threshold of 10 —
  // and tripping the fuse would skip the unlinks too, stranding every one of
  // those rows against a dead ClickUp id where they'd fail to push forever.
  const cascadedDeletes = deleteCandidates.filter(c => c.task.milestone_id && cascaded.has(Number(c.task.milestone_id)))
  const realDeletes = deleteCandidates.filter(c => !cascadedDeletes.includes(c))

  for (const { task } of cascadedDeletes) {
    // Cascade-aware: also clears its checklist items' remote ids, which died
    // with the parent and would otherwise be deleted locally on the next pull.
    await repo.unlinkCascadedTask(task.id, 'Milestone task deleted in ClickUp — unlinked, not deleted')
  }
  if (cascadedDeletes.length) {
    out.warnings.push(`${cascadedDeletes.length} task(s) unlinked after a milestone was deleted in ClickUp — they will be re-pushed`)
  }

  // Safety fuse, still guarding what it was written for: a wrong list id, a
  // dropped include_closed, or an API blip returning an empty page.
  if (realDeletes.length > config.clickup.maxSweepDeletes) {
    const msg = `Delete threshold exceeded (${realDeletes.length}) — deletes skipped this sweep`
    await repo.setClientSyncError(client.id, msg)
    console.error(`[clickupSync] client ${client.id}: ${msg}`)
    out.warnings.push(msg)
  } else if (config.clickup.allowRemoteDeletes) {
    for (const { task, listId } of realDeletes) {
      const state = await confirmRemote(task.clickup_task_id, listId)
      if (state.gone) { await tasksService.deleteTask(task.id); out.deleted++ }
      else { await repo.unlinkTask(task.id, `Task ${state.reason} — no longer synced`) }
    }
  }

  if (out.deleted || out.created || out.updated) {
    for (const p of linked) await deliveryChanged(p.id)
  }
  return out
}

/** Sweep every linked client. Catches missed webhooks; the only path in dev. */
export async function syncAllClickup() {
  if (!isConfigured()) return { synced: false, configured: false }
  const clients = await repo.listSyncableClients()
  const totals = {
    clients: 0, created: 0, updated: 0, echo: 0, deleted: 0, pushed: 0,
    milestones: 0, milestonesFixed: 0,
    warnings: [], orphans: [], tooDeep: []
  }
  for (const c of clients) {
    try {
      const res = await reconcileClient(c)
      if (res.skipped) continue
      totals.clients++
      for (const k of ['created', 'updated', 'echo', 'deleted', 'pushed', 'milestones', 'milestonesFixed']) totals[k] += res[k] ?? 0
      totals.warnings.push(...(res.warnings ?? []))
      totals.orphans.push(...(res.orphans ?? []))
      totals.tooDeep.push(...(res.tooDeep ?? []))
    } catch (err) {
      console.error(`[clickupSync] client ${c.id} failed:`, err.message)
      totals.warnings.push(`Client ${c.company || c.name}: ${err.message}`)
    }
  }
  return { synced: true, total: clients.length, ...totals }
}

export {
  ensureClientSpace, ensureProjectTask, ensureMilestoneTask,
  pushMilestone, pushProjectMilestones, isConfigured
}
