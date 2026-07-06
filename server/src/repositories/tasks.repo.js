import { query } from '../db/pool.js'

export const TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done'])
export const TASK_PRIORITIES = new Set(['low', 'medium', 'high'])

const UPDATABLE = ['project_id', 'title', 'description', 'status', 'priority', 'due_date', 'position']

// Join the parent project for display on the cross-project /tasks page.
const BASE_SELECT = `SELECT t.*, p.name AS project_name, p.code AS project_code
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id`

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
  if (opts.status) { where.push('t.status = :status'); params.status = opts.status }
  if (opts.overdue) { where.push("t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status <> 'done'") }
  if (opts.dueToday) { where.push("t.due_date = CURDATE() AND t.status <> 'done'") }
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
