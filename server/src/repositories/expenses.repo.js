import { query } from '../db/pool.js'

export const EXPENSE_CATEGORIES = new Set(['client', 'business', 'subscription'])
export const EXPENSE_STATUSES = new Set(['active', 'cancelled'])
export const PAYMENT_METHODS = new Set(['card', 'bank', 'cash', 'other'])
export const BILLING_INTERVALS = new Set(['monthly', 'yearly'])

// Columns an update may touch. category is fixed at creation (like an invoice's
// kind) — changing an expense's type is a delete + re-create, not an edit.
const UPDATABLE = [
  'client_id', 'project_id', 'vendor', 'description', 'amount', 'currency',
  'expense_date', 'payment_method', 'billable', 'reimbursed_at', 'receipt_url',
  'billing_interval', 'next_renewal_at', 'renewal_reminded_on', 'status', 'notes'
]

const num = v => (v == null ? null : Number(v))
function mapExpense(row) {
  if (!row) return row
  return {
    ...row,
    amount: num(row.amount),
    billable: Boolean(row.billable)
  }
}

// Selected on list + get so the frontend can label the client without a second call.
const CLIENT_COLS = 'c.name AS client_name, c.company AS client_company'

export async function createExpense({
  category, client_id = null, project_id = null, vendor, description = null,
  amount, currency = 'USD', expense_date, payment_method = 'card', billable = 0,
  receipt_url = null, billing_interval = null, next_renewal_at = null,
  status = 'active', notes = null
}) {
  const rows = await query(
    `INSERT INTO expenses
       (category, client_id, project_id, vendor, description, amount, currency,
        expense_date, payment_method, billable, receipt_url, billing_interval,
        next_renewal_at, status, notes)
     VALUES
       (:category, :client_id, :project_id, :vendor, :description, :amount, :currency,
        :expense_date, :payment_method, :billable, :receipt_url, :billing_interval,
        :next_renewal_at, :status, :notes)`,
    {
      category, client_id, project_id, vendor, description, amount, currency,
      expense_date, payment_method, billable: billable ? 1 : 0, receipt_url,
      billing_interval, next_renewal_at, status, notes
    }
  )
  return getExpense(rows.insertId)
}

export async function getExpense(id) {
  const rows = await query(
    `SELECT e.*, ${CLIENT_COLS}
       FROM expenses e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.id = :id LIMIT 1`,
    { id }
  )
  return mapExpense(rows[0] ?? null)
}

export async function listExpenses(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.category) { where.push('e.category = :category'); params.category = opts.category }
  if (opts.client_id) { where.push('e.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_id) { where.push('e.project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.status) { where.push('e.status = :status'); params.status = opts.status }
  if (opts.billable != null) { where.push('e.billable = :billable'); params.billable = opts.billable ? 1 : 0 }
  if (opts.search) {
    where.push('(e.vendor LIKE :q OR e.description LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.search}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(
    `SELECT e.*, ${CLIENT_COLS}
       FROM expenses e LEFT JOIN clients c ON c.id = e.client_id${whereSql}
      ORDER BY e.expense_date DESC, e.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM expenses e LEFT JOIN clients c ON c.id = e.client_id${whereSql}`,
    params
  )
  return { rows: rows.map(mapExpense), total, limit, offset }
}

export async function updateExpense(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getExpense(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = c === 'billable' ? (data[c] ? 1 : 0) : data[c]
  await query(`UPDATE expenses SET ${set} WHERE id = :id`, params)
  return getExpense(id)
}

export async function deleteExpense(id) {
  const result = await query('DELETE FROM expenses WHERE id = :id', { id })
  return result.affectedRows > 0
}

// Aggregates for the Expenses page stat tiles + the dashboard.
export async function expenseStats() {
  const [{ this_month }] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS this_month FROM expenses
      WHERE expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`
  )
  const byCategoryRows = await query(
    `SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses GROUP BY category`
  )
  const by_category = { client: 0, business: 0, subscription: 0 }
  for (const r of byCategoryRows) by_category[r.category] = num(r.total)
  // Active subscriptions normalized to a monthly figure.
  const [{ monthly_burn }] = await query(
    `SELECT COALESCE(SUM(CASE billing_interval WHEN 'yearly' THEN amount / 12 ELSE amount END), 0) AS monthly_burn
       FROM expenses WHERE category = 'subscription' AND status = 'active'`
  )
  const [{ upcoming_renewals }] = await query(
    `SELECT COUNT(*) AS upcoming_renewals FROM expenses
      WHERE category = 'subscription' AND status = 'active'
        AND next_renewal_at IS NOT NULL AND next_renewal_at <= (CURDATE() + INTERVAL 30 DAY)`
  )
  const [{ billable_outstanding }] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS billable_outstanding FROM expenses
      WHERE billable = 1 AND reimbursed_at IS NULL`
  )
  return {
    this_month: num(this_month),
    by_category,
    monthly_burn: num(monthly_burn),
    upcoming_renewals: Number(upcoming_renewals),
    billable_outstanding: num(billable_outstanding)
  }
}

// --- Renewal reminder job helpers -------------------------------------------

// Active subscriptions due to renew within `days`, not yet reminded for the
// current cycle (renewal_reminded_on trails next_renewal_at until we send).
export async function listUpcomingRenewals(days = 7) {
  const rows = await query(
    `SELECT e.*, ${CLIENT_COLS}
       FROM expenses e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.category = 'subscription' AND e.status = 'active'
        AND e.next_renewal_at IS NOT NULL
        AND e.next_renewal_at <= (CURDATE() + INTERVAL :days DAY)
        AND (e.renewal_reminded_on IS NULL OR e.renewal_reminded_on <> e.next_renewal_at)
      ORDER BY e.next_renewal_at ASC`,
    { days }
  )
  return rows.map(mapExpense)
}

export async function markRenewalReminded(id, date) {
  await query('UPDATE expenses SET renewal_reminded_on = :date WHERE id = :id', { id, date })
}

// Roll a lapsed subscription's next_renewal_at forward by its interval and clear
// the reminder marker so the next cycle can notify again. Loops until the date is
// in the future (covers subscriptions missed for more than one cycle).
export async function advanceRenewal(id) {
  await query(
    `UPDATE expenses
        SET next_renewal_at = CASE billing_interval
              WHEN 'yearly'  THEN DATE_ADD(next_renewal_at, INTERVAL CEIL(DATEDIFF(CURDATE(), next_renewal_at) / 365) YEAR)
              ELSE                DATE_ADD(next_renewal_at, INTERVAL (TIMESTAMPDIFF(MONTH, next_renewal_at, CURDATE()) + 1) MONTH)
            END,
            renewal_reminded_on = NULL
      WHERE id = :id AND category = 'subscription' AND status = 'active'
        AND next_renewal_at IS NOT NULL AND next_renewal_at < CURDATE()`,
    { id }
  )
  return getExpense(id)
}

// Subscriptions whose renewal date has already passed (need advancing).
export async function listLapsedRenewals() {
  const rows = await query(
    `SELECT id FROM expenses
      WHERE category = 'subscription' AND status = 'active'
        AND next_renewal_at IS NOT NULL AND next_renewal_at < CURDATE()`
  )
  return rows.map(r => r.id)
}
