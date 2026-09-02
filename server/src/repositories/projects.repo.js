import { query, withTransaction } from '../db/pool.js'
import { applyTemplateToProject, getDefaultTemplateId } from './projectTemplates.repo.js'
import { claimContractForProject } from './contracts.repo.js'

export const PROJECT_STATUSES = new Set([
  'planning', 'awaiting_signature', 'awaiting_deposit', 'in_progress', 'in_review', 'awaiting_final', 'on_hold', 'completed'
])
// Forward pipeline order for automatic lifecycle transitions (see advanceProject).
// `on_hold` is intentionally excluded — it's a manual pause that blocks auto-advance.
export const PROJECT_LIFECYCLE_ORDER = [
  'planning', 'awaiting_signature', 'awaiting_deposit', 'in_progress', 'in_review', 'awaiting_final', 'completed'
]
export const CONTENT_BY = new Set(['client', 'developer', 'mix'])

// What a create/update may set — the DELIVERY half only. client_id and
// project_type_id are set at creation; code is generated.
//
// The Statement of Work is gone from here: it belongs to the proposal, and
// BASE_SELECT reads it back through the link. Leaving the SOW writable would be
// actively misleading, because the read path prefers the proposal's values —
// an edit here would look accepted and change nothing on screen.
const UPDATABLE = ['name', 'status']

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

// The Statement of Work lives on the PROPOSAL now. It's surfaced here under the
// same column names it used to have on `projects`, which is what lets the money
// card, the balance invoice, time billing and the ClickUp date push keep working
// untouched.
//
// COALESCE for the transition only: projects created before the move still hold
// their own values, and every one of them gets a proposal backfilled before the
// old columns are dropped (see migrate.js). Once that's done the fallback half
// goes away with the columns.
//
// LEFT JOIN, not INNER: a project can be created by hand without a proposal, and
// then it simply has no SOW — the UI shows empty states rather than zeroes.
const SOW_SELECT = [
  'goals', 'pages_included', 'key_features', 'design_deliverables', 'content_provided_by',
  'revision_rounds', 'third_party_costs', 'project_fee', 'deposit_pct', 'hourly_rate',
  'content_deadline', 'start_date', 'target_launch_date', 'special_terms',
  'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days'
].map(c => `COALESCE(pr.${c}, p.${c}) AS ${c}`).join(',\n    ')

const BASE_SELECT = `SELECT p.*,
    ${SOW_SELECT},
    pr.id AS proposal_id, pr.code AS proposal_code,
    c.name AS client_name, c.company AS client_company, c.logo_url AS client_logo_url,
    pt.name AS type_name, pt.\`key\` AS type_key, pt.code_prefix AS type_code_prefix,
    pt.contract_template_id AS type_contract_template_id,
    COALESCE(tr.task_total, 0) AS task_total, COALESCE(tr.task_done, 0) AS task_done
  FROM projects p
  JOIN clients c ON c.id = p.client_id
  JOIN project_types pt ON pt.id = p.project_type_id
  LEFT JOIN proposals pr ON pr.project_id = p.id
  ${TASK_ROLLUP}`

/**
 * Create a project, then assign its code from the type's prefix + zero-padded id
 * (e.g. WEB-0007). Runs in one transaction so the code is set before we return.
 */
export async function createProject(data) {
  const cols = ['client_id', 'project_type_id', 'name', ...UPDATABLE.filter(c => c !== 'name' && data[c] !== undefined)]
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
    // Seed the delivery plan (milestones + tasks) from a template. An explicit
    // template_id (number) uses it; explicit null means "(None)" → seed nothing;
    // omitting it entirely falls back to this type's default template (if any).
    const templateId = data.template_id === undefined
      ? await getDefaultTemplateId(data.project_type_id)
      : data.template_id
    if (templateId) {
      await applyTemplateToProject(q, templateId, projectId)
    }
    return projectId
  })
  return getProject(id)
}

/**
 * Create a project AND claim it for a contract, atomically.
 *
 * This is how a paid deposit becomes a project. Stripe retries `invoice.paid`
 * and the handler 500s on error, so two deliveries can genuinely race here —
 * and a duplicate project means a duplicate `code`, a duplicate template tree
 * and a second ClickUp workspace.
 *
 * The claim is the LAST statement in the transaction, not the first. It takes an
 * exclusive lock on the contract row: going first would hold that lock across
 * the whole template-seeding loop while the loser sat blocked on it for up to
 * innodb_lock_wait_timeout. Going last means the winner holds it only until
 * commit, and the loser simply does some throwaway work and rolls back.
 *
 * Throws CONTRACT_ALREADY_CLAIMED when it loses; withTransaction then rolls the
 * whole half-built project away, so there's nothing to compensate for. (The
 * auto-increment id is still consumed — InnoDB never rolls those back — so
 * project codes can skip a number. Cosmetic, and already true of any failed create.)
 */
export async function createProjectForContract(data, contractId) {
  const cols = ['client_id', 'project_type_id', 'name', ...UPDATABLE.filter(c => c !== 'name' && data[c] !== undefined)]
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
    const templateId = data.template_id === undefined
      ? await getDefaultTemplateId(data.project_type_id)
      : data.template_id
    if (templateId) await applyTemplateToProject(q, templateId, projectId)

    if (!await claimContractForProject(q, contractId, projectId)) {
      const err = new Error(`Contract ${contractId} already has a project`)
      err.code = 'CONTRACT_ALREADY_CLAIMED'
      throw err
    }
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
  if (opts.client_id) { where.push('p.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_type_id) { where.push('p.project_type_id = :project_type_id'); params.project_type_id = opts.project_type_id }
  if (opts.status) { where.push('p.status = :status'); params.status = opts.status }
  if (opts.active) { where.push("p.status <> 'completed'") }
  // Follows the SOW: the launch date is the proposal's (falling back to the
  // project's own until the old columns are dropped).
  if (opts.overdue) {
    where.push(`COALESCE(pr.target_launch_date, p.target_launch_date) IS NOT NULL
      AND COALESCE(pr.target_launch_date, p.target_launch_date) < CURDATE() AND p.status <> 'completed'`)
  }
  if (opts.search) {
    where.push('(p.name LIKE :q OR p.code LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.search}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(`${BASE_SELECT}${whereSql} ORDER BY p.updated_at DESC LIMIT ${limit} OFFSET ${offset}`, params)
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN proposals pr ON pr.project_id = p.id${whereSql}`,
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
  await query('UPDATE invoices SET project_id = NULL WHERE project_id = :id', { id })
  const result = await query('DELETE FROM projects WHERE id = :id', { id })
  return result.affectedRows > 0
}
