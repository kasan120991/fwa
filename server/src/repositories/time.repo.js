import { query } from '../db/pool.js'

// Logged work on a project. Every entry records time; `billable` decides
// whether it can reach an invoice, and `invoice_id` is stamped once it has —
// that stamp is what stops the same hours being billed twice.

const BASE_SELECT = `SELECT e.id, e.project_id, e.task_id, e.minutes, e.note,
    e.billable, e.invoice_id, e.occurred_at, e.created_at,
    t.title AS task_title
  FROM time_entries e
  LEFT JOIN tasks t ON t.id = e.task_id`

const map = r => (r ? {
  ...r,
  minutes: Number(r.minutes),
  billable: !!r.billable,
  billed: r.invoice_id != null
} : r)

export async function listTimeEntries(projectId) {
  const rows = await query(
    `${BASE_SELECT} WHERE e.project_id = :projectId ORDER BY e.occurred_at DESC, e.id DESC`,
    { projectId })
  return rows.map(map)
}

export async function getTimeEntry(id) {
  const rows = await query(`${BASE_SELECT} WHERE e.id = :id LIMIT 1`, { id })
  return map(rows[0])
}

export async function createTimeEntry(data) {
  const res = await query(
    `INSERT INTO time_entries (project_id, task_id, minutes, note, billable, occurred_at)
     VALUES (:project_id, :task_id, :minutes, :note, :billable, :occurred_at)`,
    {
      project_id: data.project_id,
      task_id: data.task_id ?? null,
      minutes: data.minutes,
      note: data.note ?? null,
      billable: data.billable ? 1 : 0,
      occurred_at: data.occurred_at
    })
  return getTimeEntry(res.insertId)
}

const UPDATABLE = ['task_id', 'minutes', 'note', 'billable', 'occurred_at']

export async function updateTimeEntry(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (!cols.length) return getTimeEntry(id)
  const params = { id }
  for (const c of cols) params[c] = c === 'billable' ? (data[c] ? 1 : 0) : data[c]
  // Editing a billed entry would change an invoice after the fact — refuse it
  // at the query, so there's no path that silently rewrites billed history.
  await query(
    `UPDATE time_entries SET ${cols.map(c => `${c} = :${c}`).join(', ')}
      WHERE id = :id AND invoice_id IS NULL`,
    params)
  return getTimeEntry(id)
}

export async function deleteTimeEntry(id) {
  const res = await query('DELETE FROM time_entries WHERE id = :id AND invoice_id IS NULL', { id })
  return res.affectedRows > 0
}

/** Totals for the money card: everything logged, and what's billable-but-unbilled. */
export async function timeSummary(projectId) {
  const rows = await query(
    `SELECT
       COALESCE(SUM(minutes), 0)                                        AS total_minutes,
       COALESCE(SUM(CASE WHEN billable = 1 THEN minutes END), 0)        AS billable_minutes,
       COALESCE(SUM(CASE WHEN billable = 1 AND invoice_id IS NULL
                         THEN minutes END), 0)                          AS unbilled_minutes,
       COALESCE(SUM(CASE WHEN billable = 1 AND invoice_id IS NULL
                         THEN 1 END), 0)                                AS unbilled_count
     FROM time_entries WHERE project_id = :projectId`,
    { projectId })
  const r = rows[0] ?? {}
  return {
    total_minutes: Number(r.total_minutes ?? 0),
    billable_minutes: Number(r.billable_minutes ?? 0),
    unbilled_minutes: Number(r.unbilled_minutes ?? 0),
    unbilled_count: Number(r.unbilled_count ?? 0)
  }
}

export async function listUnbilledBillable(projectId) {
  const rows = await query(
    `SELECT id, minutes, note FROM time_entries
      WHERE project_id = :projectId AND billable = 1 AND invoice_id IS NULL
      ORDER BY occurred_at, id`,
    { projectId })
  return rows.map(r => ({ ...r, minutes: Number(r.minutes) }))
}

/**
 * Stamp entries as billed. Scoped to still-unbilled rows so a concurrent
 * invoice can't claim the same hours twice.
 */
export async function markBilled(ids, invoiceId) {
  if (!ids?.length) return 0
  const list = ids.map(n => Number(n)).filter(Number.isInteger)
  if (!list.length) return 0
  const res = await query(
    `UPDATE time_entries SET invoice_id = :invoiceId
      WHERE invoice_id IS NULL AND id IN (${list.join(',')})`,
    { invoiceId })
  return res.affectedRows
}

/** Release entries claimed by an invoice that never sent (Stripe rollback). */
export async function unmarkBilled(invoiceId) {
  const res = await query(
    'UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = :invoiceId', { invoiceId })
  return res.affectedRows
}
