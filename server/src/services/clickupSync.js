import { config } from '../config/env.js'
import * as cu from './clickup.js'
import * as map from './clickupMap.js'
import { ensureMilestoneField, ensureMilestoneOption, ensureClientSpace, ensureProjectTask, isConfigured } from './clickupProvision.js'
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

/* ------------------------------------------------------------- status cache */

const statusCache = new Map() // listId -> { map, lossy, at }
const STATUS_TTL_MS = 60 * 60_000

async function statusMapFor(listId) {
  const hit = statusCache.get(listId)
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit
  const list = await cu.getList(listId)
  const built = map.buildStatusMap(list?.statuses ?? [])
  const entry = { ...built, at: Date.now() }
  statusCache.set(listId, entry)
  if (built.lossy.length) {
    console.warn(`[clickupSync] list ${listId}: no ClickUp status for ${built.lossy.join(', ')}`)
  }
  return entry
}

/* ------------------------------------------------------------ remote -> Ops */

/** Resolve a remote task's Milestone dropdown value to an Ops milestone row. */
async function resolveMilestone(projectId, remote, field) {
  if (!field?.field_id) return { skip: true }
  const raw = remote.custom_fields?.find(f => f.id === field.field_id)
  if (!raw || raw.value == null || raw.value === '') return { milestone_id: null, title: null }

  // ClickUp returns a dropdown value as the option UUID in some payloads and as
  // an orderindex integer in others. Accept both.
  const optionId = typeof raw.value === 'number'
    ? (raw.type_config?.options ?? field.options).find(o => o.orderindex === raw.value)?.id
    : String(raw.value)
  const option = field.options.find(o => o.id === optionId)
  if (!option) return { milestone_id: null, title: null, warn: `Unknown milestone option ${optionId}` }

  const milestones = await repo.listMilestonesForSync(projectId)
  // UUID first — that's what survives a rename of the milestone in Ops.
  let ms = milestones.find(m => m.clickup_option_id === option.id)
  if (!ms) {
    ms = milestones.find(m => map.normTitle(m.title) === map.normTitle(option.name))
    // Bind durably on the first title match, so later renames are harmless.
    if (ms) await repo.setMilestoneClickupOption(ms.id, option.id)
  }
  if (!ms) return { milestone_id: null, title: option.name, warn: `Milestone "${option.name}" has no match on this project` }
  return { milestone_id: ms.id, title: option.name }
}

/** A remote task expressed in Ops terms. */
async function toOpsTask(projectId, remote, field) {
  const ms = await resolveMilestone(projectId, remote, field)
  return {
    fields: {
      title: String(remote.name ?? '').trim(),
      description: String(remote.description ?? '').trim() || null,
      status: map.statusToOps(remote.status),
      priority: map.priorityToOps(remote.priority),
      due_date: map.dateToOps(remote.due_date, config.clickup.tzOffsetMinutes),
      ...(ms.skip ? {} : { milestone_id: ms.milestone_id })
    },
    milestone_title: ms.skip ? undefined : ms.title,
    clickup_status: remote.status?.status ?? null,
    warn: ms.warn
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
export async function applyRemoteTask(project, remote, local, field, { position = 0 } = {}) {
  const version = Number(remote.date_updated) || Date.now()
  const mapped = await toOpsTask(project.id, remote, field)
  const shadow = map.shadowOf({ ...mapped.fields, milestone_title: mapped.milestone_title })

  if (!local) {
    // Adopt an unlinked local task with the same title before creating a new
    // one. Without this, un-archiving a task in ClickUp (which unlinks it, see
    // confirmRemote) would come back as a duplicate rather than the original.
    const adopt = (await repo.listSyncTasksForProject(project.id))
      .find(t => !t.clickup_task_id && map.normTitle(t.title) === map.normTitle(mapped.fields.title))
    if (adopt) {
      await repo.linkTask(adopt.id, remote.id, shadow, version)
      await repo.applyRemote(adopt.id, {
        fields: mapped.fields, shadow, version, clickupStatus: mapped.clickup_status
      })
      const fresh = await getTask(adopt.id)
      if (fresh) emitTaskUpdated(fresh)
      await deliveryChanged(project.id)
      return { updated: true, id: adopt.id, adopted: true, warn: mapped.warn }
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
      return applyRemoteTask(project, remote, winner, field, { position })
    }
    const created = await getTask(newId)
    if (created) emitTaskCreated(created)
    await afterRemoteTask(newId, remote, project.id)
    await deliveryChanged(project.id)
    return { created: true, id: newId, warn: mapped.warn }
  }

  // Reconcile the checklist BEFORE the shadow comparison: ticking an item
  // doesn't touch any synced task field, so this is an echo as far as the task
  // is concerned and would otherwise return with the checklist change dropped.
  const post = await afterRemoteTask(local.id, remote, project.id)

  if (map.shadowEq(shadow, local.clickup_shadow)) {
    return { echo: !post.checklistChanged, updated: post.checklistChanged, id: local.id, warn: mapped.warn }
  }

  // Whether the LOCAL row had also drifted from the shadow, i.e. there is an
  // unpushed Ops edit about to be discarded. Resolve the milestone title the
  // same way the shadow stores it — comparing the bare row would report a
  // divergence on every milestone-tagged task, since the row has no title on it.
  const localMilestones = await repo.listMilestonesForSync(project.id)
  const localShadow = map.shadowOf({
    ...local,
    milestone_title: local.milestone_id
      ? localMilestones.find(m => Number(m.id) === Number(local.milestone_id))?.title ?? null
      : null
  })
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
  return { updated: true, id: local.id, warn: mapped.warn }
}

/**
 * The entry point external callers should use. Serializes per remote task id so
 * ClickUp's two-deliveries-per-change can't be processed concurrently. The
 * recursive call inside applyRemoteTask stays unlocked on purpose — re-entering
 * here would deadlock.
 */
export function syncRemoteTask(project, remote, local, field, opts) {
  return withTaskLock(remote.id, () => applyRemoteTask(project, remote, local, field, opts))
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

  const milestones = await repo.listMilestonesForSync(local.project_id)
  const msTitle = local.milestone_id
    ? milestones.find(m => Number(m.id) === Number(local.milestone_id))?.title ?? null
    : null
  const now = map.shadowOf({ ...local, milestone_title: msTitle })
  const changed = map.changedFields(now, local.clickup_shadow)
  if (local.clickup_task_id && !changed.length) return { pushed: false, noop: true }

  try {
    const statusMap = await statusMapFor(link.listId)
    const field = await ensureMilestoneField()
    const option = msTitle ? await ensureMilestoneOption(msTitle) : null
    let remote

    if (!local.clickup_task_id) {
      // Create carries the custom field inline, so a new task costs one call.
      remote = await cu.createTask(link.listId, {
        ...toClickUpBody(now, statusMap),
        parent: link.clickup_task_id,
        ...(option && field.field_id ? { custom_fields: [{ id: field.field_id, value: option.id }] } : {})
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
      const body = toClickUpBody(Object.fromEntries(changed.filter(f => f !== 'milestone_title').map(f => [f, now[f]])), statusMap)
      if (Object.keys(body).length) remote = await cu.updateTask(local.clickup_task_id, body)
      if (changed.includes('milestone_title')) {
        if (option && field.field_id) await cu.setCustomField(local.clickup_task_id, field.field_id, option.id)
        else if (field.field_id && !msTitle) await cu.clearCustomField(local.clickup_task_id, field.field_id).catch(() => {})
        remote = await cu.getTask(local.clickup_task_id) // re-read for a truthful shadow
      }
      if (!remote) remote = await cu.getTask(local.clickup_task_id)
    }

    // Shadow from the RESPONSE, never from what we meant to send: if ClickUp
    // normalizes the value we adopt its version immediately, so the next
    // comparison is against what ClickUp actually holds.
    const confirmed = await toOpsTask(local.project_id, remote, field)
    await repo.setShadow(
      local.id,
      map.shadowOf({ ...confirmed.fields, milestone_title: confirmed.milestone_title }),
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
async function confirmRemote(taskId, expectedListId) {
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
  const field = await ensureMilestoneField()
  const remote = await cu.listTasks(client.clickup_list_id)
  const byId = new Map(remote.map(t => [t.id, t]))
  const subs = remote.filter(t => t.parent)

  const projects = await repo.listProjectsForClient(client.id)
  const linked = projects.filter(p => p.clickup_task_id)
  const byRemote = new Map(linked.map(p => [p.clickup_task_id, p]))

  const out = { created: 0, updated: 0, echo: 0, deleted: 0, pushed: 0, warnings: [], orphans: [] }

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
  for (const p of linked.filter(p => byId.has(p.clickup_task_id))) {
    const rSubs = subs.filter(s => s.parent === p.clickup_task_id) // direct children only
    const rIds = new Set(rSubs.map(s => s.id))
    const local = await repo.listSyncTasksForProject(p.id)
    const byCu = new Map(local.filter(t => t.clickup_task_id).map(t => [t.clickup_task_id, t]))

    const ranked = [...rSubs].sort((a, b) => Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0))
    for (const [i, s] of ranked.entries()) {
      const res = await syncRemoteTask(p, s, byCu.get(s.id) ?? null, field, { position: i })
      if (res.created) out.created++
      else if (res.updated) out.updated++
      else if (res.echo) out.echo++
      if (res.warn) out.warnings.push(res.warn)
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

  // Safety fuse. A wrong list id, a dropped include_closed, or an API blip
  // returning an empty page would otherwise nominate every task for deletion.
  if (deleteCandidates.length > config.clickup.maxSweepDeletes) {
    const msg = `Delete threshold exceeded (${deleteCandidates.length}) — deletes skipped this sweep`
    await repo.setClientSyncError(client.id, msg)
    console.error(`[clickupSync] client ${client.id}: ${msg}`)
    out.warnings.push(msg)
  } else if (config.clickup.allowRemoteDeletes) {
    for (const { task, listId } of deleteCandidates) {
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
  const totals = { clients: 0, created: 0, updated: 0, echo: 0, deleted: 0, pushed: 0, warnings: [], orphans: [] }
  for (const c of clients) {
    try {
      const res = await reconcileClient(c)
      if (res.skipped) continue
      totals.clients++
      for (const k of ['created', 'updated', 'echo', 'deleted', 'pushed']) totals[k] += res[k] ?? 0
      totals.warnings.push(...(res.warnings ?? []))
      totals.orphans.push(...(res.orphans ?? []))
    } catch (err) {
      console.error(`[clickupSync] client ${c.id} failed:`, err.message)
      totals.warnings.push(`Client ${c.company || c.name}: ${err.message}`)
    }
  }
  return { synced: true, total: clients.length, ...totals }
}

export { ensureClientSpace, ensureProjectTask, isConfigured }
