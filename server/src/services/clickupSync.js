import { config } from '../config/env.js'
import * as cu from './clickup.js'
import * as map from './clickupMap.js'
import { ensureMilestoneField, ensureMilestoneOption, ensureClientSpace, ensureProjectTask, isConfigured } from './clickupProvision.js'
import * as repo from '../repositories/clickup.repo.js'
import * as tasksService from './tasks.service.js'
import { getTask } from '../repositories/tasks.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import { emitTaskCreated, emitTaskUpdated } from '../realtime/io.js'
import { notifyDeliveryChanged } from './delivery.notify.js'

// The bidirectional engine. Two directions live in two functions that never
// call each other — applyRemoteTask (ClickUp -> Ops) can't push, pushTask
// (Ops -> ClickUp) can't apply. That separation is what keeps the echo guard
// honest; putting either inside tasks.service.updateTask would reintroduce
// the loop, because that function is called by both directions.
//
// Shaped results, never thrown, per the websiteSync.js convention.

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
      await notifyDeliveryChanged(project.id)
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
    await notifyDeliveryChanged(project.id)
    return { created: true, id: newId, warn: mapped.warn }
  }

  if (map.shadowEq(shadow, local.clickup_shadow)) return { echo: true, warn: mapped.warn }

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
  await notifyDeliveryChanged(project.id)
  return { updated: true, id: local.id, warn: mapped.warn }
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
    return { pushed: true, clickup_task_id: remote.id }
  } catch (err) {
    // Unknown remote state -> NULL shadow, which makes the next pull apply
    // unconditionally and re-converge.
    await repo.setTaskSyncError(local.id, err.message, { clearShadow: true })
    console.error(`[clickupSync] push task ${local.id}:`, err.message)
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
      const res = await applyRemoteTask(p, s, byCu.get(s.id) ?? null, field, { position: i })
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
    for (const p of linked) await notifyDeliveryChanged(p.id)
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
