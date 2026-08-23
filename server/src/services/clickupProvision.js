import { config } from '../config/env.js'
import * as cu from './clickup.js'
import { normTitle } from './clickupMap.js'
import { getClient } from '../repositories/clients.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import * as repo from '../repositories/clickup.repo.js'
import { query } from '../db/pool.js'

// Provisions the ClickUp side of the tree and keeps the Milestone dropdown in
// step. Every function is an `ensure` — idempotent, short-circuiting on stored
// ids — which is what makes the lazy-heal path free: any entry point can call
// the chain from the top and it costs one DB read when everything already exists.
//
// Shaped results, never thrown, per the websiteSync.js convention.

export const isConfigured = cu.isConfigured

const PROJECTS_LIST = 'Projects'
const CAREPLAN_LIST = 'Care Plan'

/* --------------------------------------------------- Milestone custom field */

// Space-level, so it's global — cache in memory with a TTL rather than adding a
// table. A process restart just re-fetches; the cost is one request.
let fieldCache = { at: 0, field: null }
const FIELD_TTL_MS = 6 * 60 * 60_000

/**
 * The "Milestone" dropdown, created if absent. Returns { field_id, options }
 * or { field_id: null } — never throws, because a transient failure here must
 * NOT be allowed to null out existing milestone links (see clickupSync).
 */
export async function ensureMilestoneField({ force = false } = {}) {
  if (!force && fieldCache.field && Date.now() - fieldCache.at < FIELD_TTL_MS) return fieldCache.field
  try {
    const wanted = normTitle(config.clickup.milestoneFieldName)
    const found = (await cu.listSpaceFields())
      .find(f => normTitle(f.name) === wanted && f.type === 'drop_down')
    if (found) {
      const field = {
        field_id: found.id,
        options: (found.type_config?.options ?? []).map(o => ({ id: o.id, name: o.name, orderindex: o.orderindex }))
      }
      fieldCache = { at: Date.now(), field }
      return field
    }
    // Not there — create it from the milestone vocabulary Ops actually uses.
    const titles = await distinctMilestoneTitles()
    const created = await cu.createSpaceField({
      name: config.clickup.milestoneFieldName,
      type: 'drop_down',
      type_config: { options: titles.map((name, i) => ({ name, orderindex: i })) }
    })
    const field = {
      field_id: created.id,
      options: (created.type_config?.options ?? []).map(o => ({ id: o.id, name: o.name, orderindex: o.orderindex }))
    }
    fieldCache = { at: Date.now(), field }
    console.log(`[clickup] created "${config.clickup.milestoneFieldName}" field with ${field.options.length} options`)
    return field
  } catch (err) {
    console.error('[clickup] milestone field:', err.message)
    // A null field pauses milestone sync only; title/status/due keep flowing.
    return { field_id: null, options: [], error: err.message }
  }
}

/** The union of milestone titles Ops uses — templates first, then live projects. */
async function distinctMilestoneTitles() {
  const rows = await query(
    `SELECT title FROM project_template_milestones
     UNION SELECT title FROM project_milestones`
  )
  const seen = new Map()
  for (const r of rows) if (!seen.has(normTitle(r.title))) seen.set(normTitle(r.title), r.title)
  return [...seen.values()]
}

/**
 * Resolve a milestone title to its dropdown option.
 *
 * ClickUp can CREATE a custom field via the API but not UPDATE one (PUT
 * /field/{id} is a hard 405), so the option set is fixed when the field is
 * first created. ensureMilestoneField seeds it with every milestone title Ops
 * knows; a title added afterwards has no option and simply isn't tagged — the
 * task still syncs its title/status/due date. Drift is reported by
 * missingMilestoneOptions() so the UI can say which option to add by hand.
 */
export async function ensureMilestoneOption(title) {
  if (!title) return null
  const field = await ensureMilestoneField()
  if (!field.field_id) return null
  return field.options.find(o => normTitle(o.name) === normTitle(title)) ?? null
}

/** Milestone titles Ops uses that the ClickUp dropdown has no option for. */
export async function missingMilestoneOptions() {
  const field = await ensureMilestoneField()
  if (!field.field_id) return []
  const have = new Set(field.options.map(o => normTitle(o.name)))
  return (await distinctMilestoneTitles()).filter(t => !have.has(normTitle(t)))
}

/* ------------------------------------------------------------ client folder */

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
      description: project.goals || undefined
    })
    await repo.setProjectClickup(project.id, { clickup_task_id: remote.id })
    return { linked: true, listId: space.listId, clickup_task_id: remote.id, created: true, project }
  } catch (err) {
    await repo.setProjectSyncError(project.id, err.message)
    console.error(`[clickup] ensure project ${project.id}:`, err.message)
    return { linked: false, error: err.message }
  }
}
