import { query } from '../db/pool.js'

// Producer-chosen semantics (see schema.sql). Kept here so the service can
// validate writes without touching the routes.
export const ACTIVITY_CATEGORIES = new Set([
  'invoice', 'payment', 'project', 'agreement',
  'ticket', 'call', 'website', 'portal', 'file', 'note', 'status'
])

export async function createClientActivity(data) {
  const payload = {
    client_id: data.client_id,
    category: data.category,
    icon: data.icon,
    title: data.title,
    meta: data.meta ?? null,
    link: data.link ?? null,
    occurred_at: data.occurred_at ?? new Date()
  }
  const cols = Object.keys(payload)
  const result = await query(
    `INSERT INTO client_activity (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    payload
  )
  const rows = await query('SELECT * FROM client_activity WHERE id = :id', { id: result.insertId })
  return rows[0] ?? null
}

/** A client's timeline, newest first, paginated. */
export async function listClientActivity(clientId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const rows = await query(
    `SELECT * FROM client_activity
     WHERE client_id = :client_id
     ORDER BY occurred_at DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    { client_id: clientId }
  )
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM client_activity WHERE client_id = :client_id',
    { client_id: clientId }
  )
  return { rows, total, limit, offset }
}
