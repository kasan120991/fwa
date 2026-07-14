import { query } from '../db/pool.js'

export const TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done'])
export const TASK_PRIORITIES = new Set(['low', 'medium', 'high'])

const UPDATABLE = ['project_id', 'milestone_id', 'title', 'description', 'status', 'priority', 'due_date', 'position']

// Join the parent project for display on the cross-project /tasks page, plus a
// checklist rollup so every task row carries its checklist progress.
const BASE_SELECT = `SELECT t.*, p.name AS project_name, p.code AS project_code,
    (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id AND c.done = 1) AS checklist_done
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id`

const mapItem = r => (r ? { ...r, done: !!r.done } : r)
const ITEM_COLS = 'id, task_id, title, done, position'

export async function createTask(data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  const params = {}
  for (const c of cols) params[c] = data[c]
  // Stamp completion if a task is created already done.
  const doneNow = data.status === 'done'
  const insertCols = [...cols, ...(doneNow ? ['completed_at'] : [])]
  const values = [...cols.map(c => `:${c}`), ...(doneNow ? ['NOW()'] : [])]
  const rows = await query(
    `INSERT INTO tasks (${insertCols.join(', ')}) VALUES (${values.join(', ')})`,
    params
  )
  return getTask(rows.insertId)
}

export async function getTask(id) {
  const rows = await query(`${BASE_SELECT} WHERE t.id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function listTasks(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.project_id) { where.push('t.project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.noProject) { where.push('t.project_id IS NULL') }
  if (opts.milestone_id) { where.push('t.milestone_id = :milestone_id'); params.milestone_id = opts.milestone_id }
  if (opts.noMilestone) { where.push('t.milestone_id IS NULL') }
  if (opts.status) { where.push('t.status = :status'); params.status = opts.status }
  if (opts.overdue) { where.push("t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status <> 'done'") }
  if (opts.dueToday) { where.push("t.due_date = CURDATE() AND t.status <> 'done'") }
  // Everything whose due date has arrived — late or due today.
  if (opts.dueByToday) { where.push("t.due_date IS NOT NULL AND t.due_date <= CURDATE() AND t.status <> 'done'") }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  // Open tasks first (done last), then by position, then soonest due.
  const rows = await query(
    `${BASE_SELECT}${whereSql}
     ORDER BY (t.status = 'done') ASC, t.position ASC, t.due_date IS NULL ASC, t.due_date ASC, t.id ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM tasks t${whereSql}`, params)
  return { rows, total, limit, offset }
}

export async function updateTask(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getTask(id)
  const set = cols.map(c => `${c} = :${c}`)
  const params = { id }
  for (const c of cols) params[c] = data[c]
  // Cross the done boundary: stamp/clear completed_at when status changes.
  if (data.status !== undefined) {
    set.push(data.status === 'done' ? 'completed_at = NOW()' : 'completed_at = NULL')
  }
  await query(`UPDATE tasks SET ${set.join(', ')} WHERE id = :id`, params)
  return getTask(id)
}

export async function deleteTask(id) {
  const result = await query('DELETE FROM tasks WHERE id = :id', { id })
  return result.affectedRows > 0
}

// ---- checklist items (a flat checklist under a task) ----

export async function listChecklist(task_id) {
  const rows = await query(`SELECT ${ITEM_COLS} FROM task_checklist_items WHERE task_id = :task_id ORDER BY position ASC, id ASC`, { task_id })
  return rows.map(mapItem)
}

export async function getChecklistItem(id) {
  const rows = await query(`SELECT ${ITEM_COLS} FROM task_checklist_items WHERE id = :id LIMIT 1`, { id })
  return mapItem(rows[0] ?? null)
}

export async function addChecklistItem(task_id, title) {
  const [{ maxPos }] = await query('SELECT COALESCE(MAX(position), -1) AS maxPos FROM task_checklist_items WHERE task_id = :task_id', { task_id })
  const res = await query(
    'INSERT INTO task_checklist_items (task_id, title, position) VALUES (:task_id, :title, :position)',
    { task_id, title, position: Number(maxPos) + 1 }
  )
  return getChecklistItem(res.insertId)
}

export async function updateChecklistItem(id, data) {
  const set = []
  const params = { id }
  if (data.title !== undefined) { set.push('title = :title'); params.title = data.title }
  if (data.done !== undefined) { set.push('done = :done'); params.done = data.done ? 1 : 0 }
  if (!set.length) return getChecklistItem(id)
  await query(`UPDATE task_checklist_items SET ${set.join(', ')} WHERE id = :id`, params)
  return getChecklistItem(id)
}

export async function deleteChecklistItem(id) {
  const res = await query('DELETE FROM task_checklist_items WHERE id = :id', { id })
  return res.affectedRows > 0
}
