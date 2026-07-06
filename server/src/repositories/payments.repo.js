import { query } from '../db/pool.js'

export const PAYMENT_METHODS = new Set(['card', 'bank', 'manual', 'other'])

const num = v => (v == null ? null : Number(v))
function mapPayment(row) {
  if (!row) return row
  return { ...row, amount: num(row.amount) }
}

export async function createPayment({ contact_id, invoice_id = null, stripe_payment_intent_id = null, amount, currency = 'USD', method = 'card', status = 'succeeded', note = null, paid_at = null }) {
  const result = await query(
    `INSERT INTO payments (contact_id, invoice_id, stripe_payment_intent_id, amount, currency, method, status, note, paid_at)
     VALUES (:contact_id, :invoice_id, :stripe_payment_intent_id, :amount, :currency, :method, :status, :note, :paid_at)`,
    { contact_id, invoice_id, stripe_payment_intent_id, amount, currency, method, status, note, paid_at: paid_at ?? new Date() }
  )
  return getPayment(result.insertId)
}

export async function getPayment(id) {
  const rows = await query(
    `SELECT p.*, c.name AS contact_name, c.company AS contact_company, i.number AS invoice_number
     FROM payments p
     JOIN contacts c ON c.id = p.contact_id
     LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.id = :id LIMIT 1`,
    { id }
  )
  return mapPayment(rows[0] ?? null)
}

/** A payment already recorded for a Stripe PaymentIntent (webhook idempotency). */
export async function getPaymentByIntentId(intentId) {
  const rows = await query('SELECT * FROM payments WHERE stripe_payment_intent_id = :pi LIMIT 1', { pi: intentId })
  return mapPayment(rows[0] ?? null)
}

export async function listPayments(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.contact_id) { where.push('p.contact_id = :contact_id'); params.contact_id = opts.contact_id }
  if (opts.invoice_id) { where.push('p.invoice_id = :invoice_id'); params.invoice_id = opts.invoice_id }
  if (opts.method) { where.push('p.method = :method'); params.method = opts.method }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(
    `SELECT p.*, c.name AS contact_name, c.company AS contact_company, i.number AS invoice_number
     FROM payments p
     JOIN contacts c ON c.id = p.contact_id
     LEFT JOIN invoices i ON i.id = p.invoice_id${whereSql}
     ORDER BY p.paid_at DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM payments p${whereSql}`, params)
  return { rows: rows.map(mapPayment), total, limit, offset }
}

export async function paymentStats() {
  const [{ received_30d }] = await query("SELECT COALESCE(SUM(amount), 0) AS received_30d FROM payments WHERE status = 'succeeded' AND paid_at >= (NOW() - INTERVAL 30 DAY)")
  const [{ count_30d }] = await query("SELECT COUNT(*) AS count_30d FROM payments WHERE status = 'succeeded' AND paid_at >= (NOW() - INTERVAL 30 DAY)")
  return { received_30d: num(received_30d), count_30d: Number(count_30d) }
}
