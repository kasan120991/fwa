import { query } from '../db/pool.js'

// All SQL for the ClickUp mirror lives here. The compare-and-swap in
// applyRemoteTask() is the reason this is one file: keeping the guard in a
// single place is what makes it auditable.

/* ------------------------------------------------------------------ client */

/** Persist link ids one step at a time, so a crash mid-provision is resumable. */
export async function setClientClickup(id, fields) {
  const allowed = ['clickup_folder_id', 'clickup_list_id', 'clickup_careplan_list_id']
  const sets = Object.keys(fields).filter(k => allowed.includes(k))
  if (!sets.length) return
  await query(
    `UPDATE clients SET ${sets.map(k => `${k} = :${k}`).join(', ')}, clickup_sync_error = NULL WHERE id = :id`,
    { id, ...fields }
  )
}

export async function setClientSyncError(id, message) {
  await query('UPDATE clients SET clickup_sync_error = :message WHERE id = :id',
    { id, message: message ? String(message).slice(0, 255) : null })
}

/** Clients whose Projects list is linked — the reconcile sweep's work list. */
export async function listSyncableClients() {
  return query(
    `SELECT id, name, company, clickup_folder_id, clickup_list_id, clickup_careplan_list_id
       FROM clients WHERE clickup_list_id IS NOT NULL ORDER BY id`
  )
}

/** Active clients still missing a folder — the bounded lazy-heal work list. */
export async function listUnlinkedClients(limit = 5) {
  return query(
    `SELECT id, name, company FROM clients
      WHERE status = 'active' AND clickup_folder_id IS NULL
      ORDER BY id LIMIT ${Math.max(1, Math.min(100, Number(limit) || 5))}`
  )
}

/* ----------------------------------------------------------------- project */

export async function setProjectClickup(id, { clickup_task_id }) {
  await query(
    'UPDATE projects SET clickup_task_id = :clickup_task_id, clickup_sync_error = NULL WHERE id = :id',
    { id, clickup_task_id }
  )
}

export async function setProjectSyncError(id, message) {
  await query('UPDATE projects SET clickup_sync_error = :message WHERE id = :id',
    { id, message: message ? String(message).slice(0, 255) : null })
}

/** Unlink without deleting — used when a ClickUp task was moved or archived. */
export async function unlinkProject(id, reason) {
  await query(
    'UPDATE projects SET clickup_task_id = NULL, clickup_sync_error = :reason WHERE id = :id',
    { id, reason: reason ? String(reason).slice(0, 255) : null })
}

/** The project whose ClickUp task is `clickupTaskId` (a subtask's parent). */
export async function getProjectByClickupTaskId(clickupTaskId) {
  const rows = await query(
    `SELECT p.id, p.code, p.name, p.client_id, p.clickup_task_id, c.clickup_list_id
       FROM projects p JOIN clients c ON c.id = p.client_id
      WHERE p.clickup_task_id = :clickupTaskId LIMIT 1`,
    { clickupTaskId })
  return rows[0] ?? null
}

export async function listProjectsForClient(clientId) {
  return query(
    'SELECT id, code, name, clickup_task_id, client_id FROM projects WHERE client_id = :clientId ORDER BY id',
    { clientId })
}

/* -------------------------------------------------------------------- task */

const TASK_COLS = `id, project_id, milestone_id, title, description, status, priority,
  due_date, position, completed_at, clickup_task_id, clickup_shadow, clickup_version,
  clickup_status, clickup_synced_at, clickup_sync_error, clickup_checklist_id`

function mapTask(row) {
  if (!row) return null
  // mysql2 returns a JSON column already parsed on MySQL 8, but a string on
  // some 5.7 configs — normalize so callers never have to care.
  let shadow = row.clickup_shadow
  if (typeof shadow === 'string') { try { shadow = JSON.parse(shadow) } catch { shadow = null } }
  return { ...row, clickup_shadow: shadow ?? null, clickup_version: row.clickup_version == null ? null : Number(row.clickup_version) }
}

export async function getTaskByClickupId(clickupTaskId) {
  const rows = await query(`SELECT ${TASK_COLS} FROM tasks WHERE clickup_task_id = :clickupTaskId LIMIT 1`,
    { clickupTaskId })
  return mapTask(rows[0])
}

export async function getSyncTask(id) {
  const rows = await query(`SELECT ${TASK_COLS} FROM tasks WHERE id = :id LIMIT 1`, { id })
  return mapTask(rows[0])
}

export async function listSyncTasksForProject(projectId) {
  const rows = await query(`SELECT ${TASK_COLS} FROM tasks WHERE project_id = :projectId ORDER BY position, id`,
    { projectId })
  return rows.map(mapTask)
}

/**
 * Insert a task ALREADY linked to its ClickUp id, in one statement.
 *
 * Creating the row and then attaching the link is two steps, and ClickUp fires
 * taskCreated and taskUpdated concurrently for a single new task — so both
 * handlers could find no local row, both insert, and only the second link would
 * trip uq_tasks_clickup, leaving an orphan duplicate behind. Putting
 * clickup_task_id in the INSERT itself makes the unique key reject the
 * duplicate ROW atomically, which is the thing that actually needed guarding.
 *
 * Throws ER_DUP_ENTRY when another handler won the race; the caller re-reads
 * by remote id and treats it as an update.
 */
export async function createLinkedTask(data, { clickupTaskId, shadow, version, clickupStatus }) {
  const cols = ['project_id', 'milestone_id', 'title', 'description', 'status', 'priority', 'due_date', 'position']
    .filter(c => data[c] !== undefined)
  const params = Object.fromEntries(cols.map(c => [c, data[c]]))
  const doneNow = data.status === 'done'
  const insertCols = [...cols, 'clickup_task_id', 'clickup_shadow', 'clickup_version', 'clickup_status',
    'clickup_synced_at', ...(doneNow ? ['completed_at'] : [])]
  const values = [...cols.map(c => `:${c}`), ':clickupTaskId', ':shadow', ':version', ':clickupStatus',
    'NOW()', ...(doneNow ? ['NOW()'] : [])]
  const res = await query(
    `INSERT INTO tasks (${insertCols.join(', ')}) VALUES (${values.join(', ')})`,
    {
      ...params, clickupTaskId, version: version ?? null,
      clickupStatus: clickupStatus ?? null,
      shadow: shadow ? JSON.stringify(shadow) : null
    }
  )
  return res.insertId
}

/** Bind a local task to its remote id. Throws ER_DUP_ENTRY if already claimed. */
export async function linkTask(id, clickupTaskId, shadow = null, version = null) {
  await query(
    `UPDATE tasks SET clickup_task_id = :clickupTaskId, clickup_shadow = :shadow,
       clickup_version = :version, clickup_synced_at = NOW(), clickup_sync_error = NULL
     WHERE id = :id`,
    { id, clickupTaskId, shadow: shadow ? JSON.stringify(shadow) : null, version }
  )
}

/**
 * Apply remote state under a monotonic compare-and-swap on ClickUp's
 * date_updated. Returns false when a newer state already landed — which is how
 * out-of-order webhooks, re-deliveries, and a stale sweep snapshot are all
 * rejected without a lock. Equal versions also return false, giving free
 * idempotency on a re-delivery.
 */
export async function applyRemote(id, { fields, shadow, version, clickupStatus }) {
  const cols = ['title', 'description', 'status', 'priority', 'due_date', 'milestone_id']
    .filter(k => k in fields)
  const res = await query(
    `UPDATE tasks SET ${cols.map(k => `${k} = :${k}`).join(', ')}${cols.length ? ',' : ''}
       completed_at = IF(:statusIsDone, COALESCE(completed_at, NOW()), NULL),
       clickup_status = :clickupStatus,
       clickup_shadow = :shadow, clickup_version = :version,
       clickup_synced_at = NOW(), clickup_sync_error = NULL
     WHERE id = :id AND (clickup_version IS NULL OR clickup_version < :version)`,
    {
      id, version, clickupStatus: clickupStatus ?? null,
      shadow: shadow ? JSON.stringify(shadow) : null,
      statusIsDone: fields.status === 'done' ? 1 : 0,
      ...Object.fromEntries(cols.map(k => [k, fields[k]]))
    }
  )
  return res.affectedRows > 0
}

/** Record what ClickUp confirmed after a push — always from the response. */
export async function setShadow(id, shadow, version, clickupStatus = null) {
  await query(
    `UPDATE tasks SET clickup_shadow = :shadow, clickup_version = :version,
       clickup_status = :clickupStatus, clickup_synced_at = NOW(), clickup_sync_error = NULL
     WHERE id = :id`,
    { id, shadow: shadow ? JSON.stringify(shadow) : null, version, clickupStatus }
  )
}

/**
 * A failed push leaves the remote state unknown. NULL the shadow rather than
 * leaving a stale one: a shadow claiming a state ClickUp never received is
 * invisible divergence that nothing would ever detect. NULL means "unknown",
 * and under ClickUp-wins the next pull re-converges automatically.
 */
export async function setTaskSyncError(id, message, { clearShadow = false } = {}) {
  await query(
    `UPDATE tasks SET clickup_sync_error = :message${clearShadow ? ', clickup_shadow = NULL, clickup_version = NULL' : ''}
     WHERE id = :id`,
    { id, message: message ? String(message).slice(0, 255) : null })
}

export async function unlinkTask(id, reason) {
  await query(
    `UPDATE tasks SET clickup_task_id = NULL, clickup_shadow = NULL, clickup_version = NULL,
       clickup_sync_error = :reason WHERE id = :id`,
    { id, reason: reason ? String(reason).slice(0, 255) : null })
}

/* --------------------------------------------------------------- milestone */

// A milestone's ClickUp task is a subtask of the project's task and the parent
// of that milestone's work items, so membership is structural. The link is
// one-way (Ops -> ClickUp): there's no shadow and no version here, because
// nothing is ever pulled back out of a milestone task.

const MILESTONE_COLS = `id, project_id, title, description, state, target_date, position,
  clickup_task_id, clickup_sync_error`

/**
 * Every milestone on a project, in the order they're created in ClickUp.
 * The `position, id` ordering is load-bearing — it's what makes the initial
 * push land the phases in the right order remotely.
 */
export async function listMilestonesForSync(projectId) {
  return query(
    `SELECT ${MILESTONE_COLS} FROM project_milestones
      WHERE project_id = :projectId ORDER BY position, id`,
    { projectId })
}

export async function getMilestoneForSync(id) {
  const rows = await query(`SELECT ${MILESTONE_COLS} FROM project_milestones WHERE id = :id LIMIT 1`,
    { id })
  return rows[0] ?? null
}

/** The milestone whose ClickUp task is `clickupTaskId` — the classifier's lookup. */
export async function getMilestoneByClickupTaskId(clickupTaskId) {
  if (!clickupTaskId) return null
  const rows = await query(
    `SELECT ${MILESTONE_COLS} FROM project_milestones WHERE clickup_task_id = :clickupTaskId LIMIT 1`,
    { clickupTaskId })
  return rows[0] ?? null
}

export async function setMilestoneClickup(id, { clickup_task_id }) {
  await query(
    `UPDATE project_milestones SET clickup_task_id = :clickup_task_id, clickup_sync_error = NULL
      WHERE id = :id`,
    { id, clickup_task_id })
}

export async function setMilestoneSyncError(id, message) {
  await query('UPDATE project_milestones SET clickup_sync_error = :message WHERE id = :id',
    { id, message: message ? String(message).slice(0, 255) : null })
}

/** Unlink without deleting — Ops owns milestone existence, so this is never a delete. */
export async function unlinkMilestone(id, reason) {
  await query(
    'UPDATE project_milestones SET clickup_task_id = NULL, clickup_sync_error = :reason WHERE id = :id',
    { id, reason: reason ? String(reason).slice(0, 255) : null })
}

/**
 * Unlink every task on a milestone, in ONE statement.
 *
 * Deleting a milestone task in ClickUp cascades to its subtasks, and ClickUp
 * fires a taskDeleted per child in no particular order. This runs first so
 * those handlers find nothing linked and no-op — a per-row loop would let a
 * racing child webhook slip in between and delete real Ops work.
 */
export async function unlinkTasksForMilestone(milestoneId, reason) {
  // Checklist items FIRST. Their remote counterparts died with the parent too,
  // and a stale clickup_item_id is worse than none: pushTask skips an item that
  // already has one, so it never goes back up, and the next pull sees a linked
  // local item missing from the (new, empty) remote checklist and DELETES the
  // row. That silently destroys every checklist under a milestone deleted in
  // ClickUp. Nulling the id makes them unlinked, so pushTask carries them up.
  await query(
    `UPDATE task_checklist_items SET clickup_item_id = NULL
      WHERE task_id IN (SELECT id FROM tasks WHERE milestone_id = :milestoneId)`,
    { milestoneId })
  const res = await query(
    `UPDATE tasks SET clickup_task_id = NULL, clickup_shadow = NULL, clickup_version = NULL,
       clickup_checklist_id = NULL, clickup_sync_error = :reason
     WHERE milestone_id = :milestoneId AND clickup_task_id IS NOT NULL`,
    { milestoneId, reason: reason ? String(reason).slice(0, 255) : null })
  return res.affectedRows ?? 0
}

/**
 * Unlink ONE task whose remote counterpart is confirmed gone (a cascade).
 *
 * Distinct from unlinkTask(), which is for a task that still exists remotely
 * but has moved out of scope — there the remote checklist is intact, and
 * clearing the item ids would re-push every item as a duplicate.
 */
export async function unlinkCascadedTask(id, reason) {
  await query('UPDATE task_checklist_items SET clickup_item_id = NULL WHERE task_id = :id', { id })
  await query(
    `UPDATE tasks SET clickup_task_id = NULL, clickup_shadow = NULL, clickup_version = NULL,
       clickup_checklist_id = NULL, clickup_sync_error = :reason
     WHERE id = :id`,
    { id, reason: reason ? String(reason).slice(0, 255) : null })
}

/* --------------------------------------------------------------- checklists */

/** Which ClickUp checklist Ops appends new items to (the task's first). */
export async function setTaskChecklistId(taskId, checklistId) {
  await query('UPDATE tasks SET clickup_checklist_id = :checklistId WHERE id = :taskId',
    { taskId, checklistId })
}

export async function listSyncChecklistItems(taskId) {
  return query(
    `SELECT id, task_id, title, done, position, clickup_item_id
       FROM task_checklist_items WHERE task_id = :taskId ORDER BY position, id`,
    { taskId })
}

export async function getChecklistItemById(id) {
  const rows = await query(
    `SELECT id, task_id, title, done, position, clickup_item_id
       FROM task_checklist_items WHERE id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function getChecklistItemByClickupId(clickupItemId) {
  const rows = await query(
    `SELECT id, task_id, title, done, position, clickup_item_id
       FROM task_checklist_items WHERE clickup_item_id = :clickupItemId LIMIT 1`,
    { clickupItemId })
  return rows[0] ?? null
}

/**
 * Insert an item already linked to its remote id, in one statement — the same
 * reason tasks use createLinkedTask: ClickUp can deliver two webhooks for one
 * change, and an insert-then-link would let both land a row before either
 * claimed the id.
 */
export async function createLinkedChecklistItem(taskId, { title, done, position, clickupItemId }) {
  const res = await query(
    `INSERT INTO task_checklist_items (task_id, title, done, position, clickup_item_id)
     VALUES (:taskId, :title, :done, :position, :clickupItemId)`,
    { taskId, title, done: done ? 1 : 0, position, clickupItemId })
  return res.insertId
}

export async function updateChecklistItemFields(id, { title, done, position }) {
  const res = await query(
    `UPDATE task_checklist_items SET title = :title, done = :done, position = :position
      WHERE id = :id AND (title <> :title OR done <> :done OR position <> :position)`,
    { id, title, done: done ? 1 : 0, position })
  return res.affectedRows > 0
}

export async function deleteChecklistItemRow(id) {
  const res = await query('DELETE FROM task_checklist_items WHERE id = :id', { id })
  return res.affectedRows > 0
}

export async function linkChecklistItem(id, clickupItemId) {
  await query('UPDATE task_checklist_items SET clickup_item_id = :clickupItemId WHERE id = :id',
    { id, clickupItemId })
}

/** Item counts for the auto-done rule. */
export async function checklistCounts(taskId) {
  const rows = await query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(done = 1), 0) AS done
       FROM task_checklist_items WHERE task_id = :taskId`,
    { taskId })
  return { total: Number(rows[0]?.total ?? 0), done: Number(rows[0]?.done ?? 0) }
}
