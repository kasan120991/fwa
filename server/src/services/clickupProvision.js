import * as cu from './clickup.js'
import { buildStatusMap, dateToClickUp, milestoneStateToOps } from './clickupMap.js'
import { getClient } from '../repositories/clients.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import * as repo from '../repositories/clickup.repo.js'

// Provisions the ClickUp side of the tree: a Folder per client, a task per
// project, and a subtask per milestone. Every function is an `ensure` —
// idempotent, short-circuiting on stored ids — which is what makes the
// lazy-heal path free: any entry point can call the chain from the top and it
// costs one DB read when everything already exists.
//
// Milestone tasks live here rather than in clickupSync.js for two reasons. They
// are one-way (Ops -> ClickUp) with no shadow and no CAS, so they have nothing
// in common with that file's two-way engine — and delivery.service.js has to
// push a derived milestone state, which would be an import cycle if it went
// through clickupSync (that file already imports deliveryChanged).
//
// Shaped results, never thrown, per the websiteSync.js convention.

export const isConfigured = cu.isConfigured

const PROJECTS_LIST = 'Projects'
const CAREPLAN_LIST = 'Care Plan'

/* ------------------------------------------------------------- status maps */

// A List's statuses are user-defined, so Ops' four-value enum has to be
// resolved against whatever this list actually has. Cached per list: PUT /task
// with a status the list doesn't define is a 400, and the set rarely moves.
const statusCache = new Map() // listId -> { map, lossy, at }
const STATUS_TTL_MS = 60 * 60_000

export async function statusMapFor(listId) {
  const hit = statusCache.get(listId)
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit
  const list = await cu.getList(listId)
  const built = buildStatusMap(list?.statuses ?? [])
  const entry = { ...built, at: Date.now() }
  statusCache.set(listId, entry)
  if (built.lossy.length) {
    console.warn(`[clickup] list ${listId}: no ClickUp status for ${built.lossy.join(', ')}`)
  }
  return entry
}

/* ------------------------------------------------------------ client folder */

/**
 * The project's schedule, as ClickUp wants it. start_date/due_date are epoch ms;
 * the *_time flags off keep them date-only, matching Ops' DATE columns. Dates go
 * up at noon UTC (see dateToClickUp) so timezone normalization on either side
 * can't cross midnight and shift the day.
 */
export function projectDates(project, { clearEmpty = false } = {}) {
  const start = dateToClickUp(project.start_date)
  const due = dateToClickUp(project.target_launch_date)
  // On create, omit what isn't set — a project is created before it's scoped,
  // so both dates are normally still null at that point. On update, send an
  // explicit null instead, or clearing a date in Ops would leave the old one
  // standing in ClickUp.
  const field = (key, value) => (value
    ? { [key]: value, [`${key}_time`]: false }
    : (clearEmpty ? { [key]: null } : {}))
  return { ...field('start_date', start), ...field('due_date', due) }
}

export function folderName(client) {
  return client.company?.trim() || client.name?.trim() || `Client ${client.id}`
}

/**
 * The client's Folder + its Projects and Care Plan lists. Each id is persisted
 * the moment it exists, so a crash between steps leaves a resumable state
 * rather than an orphaned folder.
 */
export async function ensureClientSpace(clientOrId) {
  if (!isConfigured()) return { linked: false, configured: false }
  const client = typeof clientOrId === 'object' ? clientOrId : await getClient(clientOrId)
  if (!client) return { linked: false, notFound: true }
  if (client.clickup_folder_id && client.clickup_list_id) {
    return { linked: true, folderId: client.clickup_folder_id, listId: client.clickup_list_id }
  }
  try {
    let folderId = client.clickup_folder_id
    if (!folderId) {
      const name = folderName(client)
      // Match by name before creating — same shape as the DO project lookup.
      // Only valid on FIRST link; afterwards the stored id is authoritative.
      const existing = (await cu.listFolders()).filter(f => f.name === name)
      if (existing.length > 1) console.warn(`[clickup] ${existing.length} folders named "${name}"`)
      folderId = existing[0]?.id ?? (await cu.createFolder(name)).id
      await repo.setClientClickup(client.id, { clickup_folder_id: folderId })
    }
    const lists = (await cu.listFolderLists(folderId)) ?? []
    const pick = async (name, col) => {
      if (client[col]) return client[col]
      const id = lists.find(l => l.name === name)?.id ?? (await cu.createList(folderId, name)).id
      await repo.setClientClickup(client.id, { [col]: id })
      return id
    }
    const listId = await pick(PROJECTS_LIST, 'clickup_list_id')
    await pick(CAREPLAN_LIST, 'clickup_careplan_list_id')
    return { linked: true, folderId, listId, created: true }
  } catch (err) {
    await repo.setClientSyncError(client.id, err.message)
    console.error(`[clickup] ensure space client ${client.id}:`, err.message)
    return { linked: false, error: err.message }
  }
}

/* ------------------------------------------------------------- project task */

/**
 * The ClickUp task standing for a project. Heals upward: if the client's folder
 * is missing (ClickUp was down when the client was created), it's provisioned
 * here, so a project created later still links.
 */
export async function ensureProjectTask(projectOrId) {
  if (!isConfigured()) return { linked: false, configured: false }
  const project = typeof projectOrId === 'object' ? projectOrId : await getProject(projectOrId)
  if (!project) return { linked: false, notFound: true }

  const space = await ensureClientSpace(project.client_id)
  if (!space.linked) return { linked: false, reason: 'client folder not provisioned', ...space }
  if (project.clickup_task_id) {
    return { linked: true, listId: space.listId, clickup_task_id: project.clickup_task_id, project }
  }
  try {
    const remote = await cu.createTask(space.listId, {
      name: `${project.code ? project.code + ' — ' : ''}${project.name}`,
      description: project.goals || undefined,
      ...projectDates(project)
    })
    await repo.setProjectClickup(project.id, { clickup_task_id: remote.id })
    return { linked: true, listId: space.listId, clickup_task_id: remote.id, created: true, project }
  } catch (err) {
    await repo.setProjectSyncError(project.id, err.message)
    console.error(`[clickup] ensure project ${project.id}:`, err.message)
    return { linked: false, error: err.message }
  }
}

/* ----------------------------------------------------------- milestone task */

/**
 * The milestone task's name, numbered by its rank among its siblings.
 *
 * ClickUp has no way to order subtasks: `orderindex` is server-assigned from
 * creation time, the API accepts and silently ignores it (ClickUp's own FAQ
 * says tasks "no longer use the order_index"), and dragging subtasks inside a
 * task card isn't supported either. So a phase's position can only be carried
 * in its name — which also makes a List view sortable into the right order.
 *
 * Ranked by ARRAY INDEX, not the `position` value: positions can have gaps (a
 * delete doesn't renumber) and templates copy them verbatim. Padded to two
 * digits only past nine phases, so "10." can't sort above "2." while a normal
 * four-phase project stays clean.
 *
 * Safe because milestones are one-way: the prefix never round-trips into an
 * Ops title.
 */
export function milestoneTaskName(milestone, siblings = []) {
  const title = String(milestone.title ?? '').trim()
  const i = siblings.findIndex(m => Number(m.id) === Number(milestone.id))
  if (i === -1) return title
  const width = siblings.length > 9 ? 2 : 1
  return `${String(i + 1).padStart(width, '0')}. ${title}`
}

/** The milestone's fields as ClickUp wants them. Status is Ops' derived state. */
function milestoneBody(milestone, siblings, statusMap, { clearEmpty = false } = {}) {
  const status = statusMap?.map?.[milestoneStateToOps(milestone.state)]
  const due = dateToClickUp(milestone.target_date)
  return {
    name: milestoneTaskName(milestone, siblings),
    // '' clears it; undefined leaves whatever is there. Matches pushProject.
    description: clearEmpty ? (milestone.description || '') : (milestone.description || undefined),
    ...(status ? { status } : {}),
    // Noon UTC and date-only, exactly as task and project dates go up, so
    // neither side's timezone normalization can shift the day.
    ...(due ? { due_date: due, due_date_time: false } : (clearEmpty ? { due_date: null } : {}))
  }
}

/**
 * The ClickUp task standing for a milestone: a subtask of the project's task,
 * and the parent of that milestone's work items. Heals upward through
 * ensureProjectTask, so a milestone can be provisioned before its project was.
 *
 * `parent` and the list id go on the same POST — legal, because the parent task
 * lives in that list.
 */
export async function ensureMilestoneTask(milestoneOrId, { siblings } = {}) {
  if (!isConfigured()) return { linked: false, configured: false }
  const milestone = typeof milestoneOrId === 'object'
    ? milestoneOrId
    : await repo.getMilestoneForSync(milestoneOrId)
  if (!milestone) return { linked: false, notFound: true }

  const link = await ensureProjectTask(milestone.project_id)
  if (!link.linked) return { linked: false, reason: 'project task not provisioned', ...link }
  // Needed for the name's number; the caller passes it when it already has the
  // list (pushProjectMilestones), so a bulk push is still one read.
  const peers = siblings ?? await repo.listMilestonesForSync(milestone.project_id)
  if (milestone.clickup_task_id) {
    return { linked: true, listId: link.listId, clickup_task_id: milestone.clickup_task_id, milestone, siblings: peers }
  }
  try {
    const statusMap = await statusMapFor(link.listId)
    const remote = await cu.createTask(link.listId, {
      ...milestoneBody(milestone, peers, statusMap),
      parent: link.clickup_task_id
    })
    await repo.setMilestoneClickup(milestone.id, { clickup_task_id: remote.id })
    return { linked: true, listId: link.listId, clickup_task_id: remote.id, created: true, milestone, siblings: peers }
  } catch (err) {
    await repo.setMilestoneSyncError(milestone.id, err.message)
    console.error(`[clickup] ensure milestone ${milestone.id}:`, err.message)
    return { linked: false, error: err.message }
  }
}

/**
 * Push a milestone's fields onto its ClickUp task. One-way by design: these are
 * the phases the client sees in the portal, and the state is derived from the
 * task rollup, so Ops owns them and the webhook ignores milestone tasks
 * entirely. There is no shadow to clear on failure — there isn't one.
 */
export async function pushMilestone(milestoneId, { siblings } = {}) {
  if (!isConfigured()) return { pushed: false, configured: false }
  const link = await ensureMilestoneTask(milestoneId, { siblings })
  if (!link.linked) return { pushed: false, ...link }
  if (link.created) return { pushed: true, created: true } // everything rode the create
  try {
    const statusMap = await statusMapFor(link.listId)
    await cu.updateTask(link.clickup_task_id, milestoneBody(link.milestone, link.siblings, statusMap, { clearEmpty: true }))
    return { pushed: true, clickup_task_id: link.clickup_task_id }
  } catch (err) {
    await repo.setMilestoneSyncError(link.milestone.id, err.message)
    console.error(`[clickup] push milestone ${link.milestone.id}:`, err.message)
    return { pushed: false, error: err.message }
  }
}

/**
 * Provision every not-yet-linked milestone on a project, in `position, id`
 * order so the phases land in ClickUp in the order Ops shows them.
 *
 * The unlinked-only filter is what makes this free to call from the sweep every
 * 15 minutes: zero HTTP when everything is already linked. It's also the only
 * path that reaches a milestone with NO tasks, which pushTask never would.
 */
export async function pushProjectMilestones(projectId) {
  if (!isConfigured()) return { pushed: 0, total: 0, configured: false }
  const milestones = await repo.listMilestonesForSync(projectId)
  let pushed = 0
  for (const m of milestones) {
    if (m.clickup_task_id) continue
    // Sequential on purpose: parallel creates blow the rate limit and produce
    // a nondeterministic orderindex.
    const res = await ensureMilestoneTask(m, { siblings: milestones })
    if (res.linked) pushed++
  }
  return { pushed, total: milestones.length }
}
