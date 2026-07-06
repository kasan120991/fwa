import { query, withTransaction } from '../db/pool.js'

export const INVOICE_STATUSES = new Set(['draft', 'open', 'paid', 'uncollectible', 'void'])
export const INVOICE_KINDS = new Set(['deposit', 'balance', 'custom'])

// Columns a status/sync update may touch (business columns + line items are set
// at creation). Mirrors the contracts repo's UPDATABLE pattern.
const UPDATABLE = [
  'status', 'number', 'stripe_invoice_id', 'hosted_invoice_url', 'invoice_pdf',
  'amount_due', 'amount_paid', 'due_date', 'finalized_at', 'paid_at', 'voided_at'
]

const num = v => (v == null ? null : Number(v))
function mapInvoice(row) {
  if (!row) return row
  return {
    ...row,
    amount_due: num(row.amount_due),
    amount_paid: num(row.amount_paid),
    is_overdue: row.is_overdue != null ? Boolean(Number(row.is_overdue)) : undefined
  }
}
function mapItem(row) {
  return { ...row, unit_price_snapshot: num(row.unit_price_snapshot), qty: num(row.qty), line_total: num(row.line_total) }
}
function mapPayment(row) {
  return { ...row, amount: num(row.amount) }
}

// Derived past-due flag, reused by list + get.
const OVERDUE_EXPR = "(i.status = 'open' AND i.due_date IS NOT NULL AND i.due_date < CURDATE())"

async function insertItems(q, invoiceId, items) {
  for (const [i, li] of items.entries()) {
    await q(
      `INSERT INTO invoice_line_items
         (invoice_id, service_id, name_snapshot, description_snapshot,
          unit_price_snapshot, qty, billing_interval_snapshot, sort_order)
       VALUES (:invoice_id, :service_id, :name_snapshot, :description_snapshot,
          :unit_price_snapshot, :qty, :billing_interval_snapshot, :sort_order)`,
      {
        invoice_id: invoiceId,
        service_id: li.service_id ?? null,
        name_snapshot: li.name_snapshot,
        description_snapshot: li.description_snapshot ?? null,
        unit_price_snapshot: li.unit_price_snapshot,
        qty: li.qty ?? 1,
        billing_interval_snapshot: li.billing_interval_snapshot ?? 'one_time',
        sort_order: li.sort_order ?? i
      }
    )
  }
}

export async function createInvoice({ contact_id, project_id = null, kind = 'custom', currency = 'USD', description = null, amount_due = 0, due_date = null, status = 'draft', stripe_invoice_id = null, items = [] }) {
  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO invoices (contact_id, project_id, kind, currency, description, amount_due, due_date, status, stripe_invoice_id)
       VALUES (:contact_id, :project_id, :kind, :currency, :description, :amount_due, :due_date, :status, :stripe_invoice_id)`,
      { contact_id, project_id, kind, currency, description, amount_due, due_date, status, stripe_invoice_id }
    )
    const invoiceId = rows.insertId
    if (items.length) await insertItems(q, invoiceId, items)
    return invoiceId
  })
  return getInvoice(id)
}

export async function getInvoice(id) {
  const rows = await query(
    `SELECT i.*, ${OVERDUE_EXPR} AS is_overdue,
       c.name AS contact_name, c.company AS contact_company, c.email AS contact_email
     FROM invoices i JOIN contacts c ON c.id = i.contact_id
     WHERE i.id = :id LIMIT 1`,
    { id }
  )
  const invoice = rows[0] ?? null
  if (!invoice) return null
  const items = await query('SELECT * FROM invoice_line_items WHERE invoice_id = :id ORDER BY sort_order ASC, id ASC', { id })
  const payments = await query('SELECT * FROM payments WHERE invoice_id = :id ORDER BY paid_at DESC, id DESC', { id })
  return { ...mapInvoice(invoice), items: items.map(mapItem), payments: payments.map(mapPayment) }
}

export async function getInvoiceByStripeId(stripeInvoiceId) {
  const rows = await query('SELECT * FROM invoices WHERE stripe_invoice_id = :sid LIMIT 1', { sid: stripeInvoiceId })
  return mapInvoice(rows[0] ?? null)
}

export async function listInvoices(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.contact_id) { where.push('i.contact_id = :contact_id'); params.contact_id = opts.contact_id }
  if (opts.project_id) { where.push('i.project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.status) { where.push('i.status = :status'); params.status = opts.status }
  if (opts.overdue) { where.push(OVERDUE_EXPR) }
  if (opts.search) {
    where.push('(i.number LIKE :q OR i.description LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.search}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(
    `SELECT i.*, ${OVERDUE_EXPR} AS is_overdue, c.name AS contact_name, c.company AS contact_company
     FROM invoices i JOIN contacts c ON c.id = i.contact_id${whereSql}
     ORDER BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM invoices i JOIN contacts c ON c.id = i.contact_id${whereSql}`, params)
  return { rows: rows.map(mapInvoice), total, limit, offset }
}

export async function updateInvoice(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getInvoice(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = data[c]
  await query(`UPDATE invoices SET ${set} WHERE id = :id`, params)
  return getInvoice(id)
}

/** Sync a mapped Stripe invoice into the local row. Resolves the row by
 *  stripe_invoice_id, then by a local-id hint (app-created invoices carry their
 *  id in Stripe metadata to dodge the create/webhook race), then — for invoices
 *  born in the Stripe dashboard — creates a bare row against the resolved
 *  contact. Always writes `stripe_invoice_id` so the link is set exactly once. */
export async function upsertFromStripe(stripeInvoiceId, contactId, fields, localIdHint = null) {
  let existing = await getInvoiceByStripeId(stripeInvoiceId)
  if (!existing && localIdHint) existing = await getInvoice(localIdHint)
  if (existing) return updateInvoice(existing.id, { stripe_invoice_id: stripeInvoiceId, ...fields })
  if (!contactId) return null
  const created = await createInvoice({
    contact_id: contactId,
    stripe_invoice_id: stripeInvoiceId,
    kind: 'custom',
    amount_due: fields.amount_due ?? 0,
    due_date: fields.due_date ?? null,
    status: fields.status ?? 'open',
    description: fields.description ?? null,
    items: []
  })
  return updateInvoice(created.id, fields)
}

export async function invoiceStats() {
  const [{ outstanding }] = await query("SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS outstanding FROM invoices WHERE status = 'open'")
  const [{ paid_30d }] = await query("SELECT COALESCE(SUM(amount_paid), 0) AS paid_30d FROM invoices WHERE status = 'paid' AND paid_at >= (NOW() - INTERVAL 30 DAY)")
  const [{ overdue_count }] = await query("SELECT COUNT(*) AS overdue_count FROM invoices WHERE status = 'open' AND due_date IS NOT NULL AND due_date < CURDATE()")
  return { outstanding: num(outstanding), paid_30d: num(paid_30d), overdue_count: Number(overdue_count) }
}

export async function deleteInvoice(id) {
  const result = await query('DELETE FROM invoices WHERE id = :id', { id })
  return result.affectedRows > 0
}
