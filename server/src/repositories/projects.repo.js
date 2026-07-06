import { query, withTransaction } from '../db/pool.js'

export const PROJECT_STATUSES = new Set(['planning', 'in_progress', 'in_review', 'on_hold', 'completed'])
export const CONTENT_BY = new Set(['client', 'developer', 'mix'])

// Business columns a create/update may set. contact_id + project_type_id are set
// only at creation; code is generated. Everything else is the Statement of Work.
const UPDATABLE = [
  'name', 'status', 'goals', 'pages_included', 'key_features', 'design_deliverables',
  'content_provided_by', 'revision_rounds', 'third_party_costs', 'project_fee', 'deposit_pct',
  'hourly_rate', 'content_deadline', 'start_date', 'target_launch_date', 'special_terms',
  'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days'
]

const num = v => (v == null ? null : Number(v))
const int = v => (v == null ? 0 : Number(v))

function mapProject(row) {
  if (!row) return row
  return {
    ...row,
    project_fee: num(row.project_fee),
    deposit_pct: num(row.deposit_pct),
    hourly_rate: num(row.hourly_rate),
    task_total: int(row.task_total),
    task_done: int(row.task_done)
  }
}

// Task rollup subquery, joined into list/get so progress bars need no N+1.
const TASK_ROLLUP = `LEFT JOIN (
    SELECT project_id, COUNT(*) AS task_total, COALESCE(SUM(status = 'done'), 0) AS task_done
    FROM tasks WHERE project_id IS NOT NULL GROUP BY project_id
  ) tr ON tr.project_id = p.id`

const BASE_SELECT = `SELECT p.*,
    c.name AS contact_name, c.company AS contact_company, c.logo_url AS contact_logo_url,
    pt.name AS type_name, pt.\`key\` AS type_key, pt.code_prefix AS type_code_prefix,
    pt.contract_template_id AS type_contract_template_id,
    COALESCE(tr.task_total, 0) AS task_total, COALESCE(tr.task_done, 0) AS task_done
  FROM projects p
  JOIN contacts c ON c.id = p.contact_id
  JOIN project_types pt ON pt.id = p.project_type_id
  ${TASK_ROLLUP}`

/**
 * Create a project, then assign its code from the type's prefix + zero-padded id
 * (e.g. WEB-0007). Runs in one transaction so the code is set before we return.
 */
export async function createProject(data) {
  const cols = ['contact_id', 'project_type_id', 'name', ...UPDATABLE.filter(c => c !== 'name' && data[c] !== undefined)]
  const params = {}
  for (const c of cols) params[c] = data[c] ?? null

  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO projects (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
      params
    )
    const projectId = rows.insertId
    const typeRows = await q('SELECT code_prefix FROM project_types WHERE id = :tid LIMIT 1', { tid: data.project_type_id })
    const prefix = typeRows[0]?.code_prefix || 'PRJ'
    await q('UPDATE projects SET code = :code WHERE id = :id', { code: `${prefix}-${String(projectId).padStart(4, '0')}`, id: projectId })
    return projectId
  })
  return getProject(id)
}

export async function getProject(id) {
  const rows = await query(`${BASE_SELECT} WHERE p.id = :id LIMIT 1`, { id })
  const project = rows[0] ?? null
  if (!project) return null
  return mapProject(project)
}

export async function listProjects(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.contact_id) { where.push('p.contact_id = :contact_id'); params.contact_id = opts.contact_id }
  if (opts.project_type_id) { where.push('p.project_type_id = :project_type_id'); params.project_type_id = opts.project_type_id }
  if (opts.status) { where.push('p.status = :status'); params.status = opts.status }
  if (opts.active) { where.push("p.status <> 'completed'") }
  if (opts.overdue) { where.push("p.target_launch_date IS NOT NULL AND p.target_launch_date < CURDATE() AND p.status <> 'completed'") }
  if (opts.search) {
    where.push('(p.name LIKE :q OR p.code LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.search}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(`${BASE_SELECT}${whereSql} ORDER BY p.updated_at DESC LIMIT ${limit} OFFSET ${offset}`, params)
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM projects p JOIN contacts c ON c.id = p.contact_id${whereSql}`,
    params
  )
  return { rows: rows.map(mapProject), total, limit, offset }
}

export async function updateProject(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getProject(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = data[c]
  await query(`UPDATE projects SET ${set} WHERE id = :id`, params)
  return getProject(id)
}

export async function deleteProject(id) {
  // Soft-linked docs keep existing but lose the back-link (no FK to cascade).
  // tasks cascade via their FK.
  await query('UPDATE proposals SET project_id = NULL WHERE project_id = :id', { id })
  await query('UPDATE contracts SET project_id = NULL WHERE project_id = :id', { id })
  const result = await query('DELETE FROM projects WHERE id = :id', { id })
  return result.affectedRows > 0
}
