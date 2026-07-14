import { query } from '../db/pool.js'
import { last10 } from '../utils/phone.js'

// Writable columns (id/created_at/updated_at are managed by the DB).
export const WRITABLE = [
  'status', 'source', 'name', 'email', 'phone', 'company', 'title', 'website', 'logo_url',
  'notes', 'tags',
  'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country', 'billing_email',
  'client_since',
  // Set internally by the Stripe integration, never from request bodies.
  'stripe_customer_id'
]

const SORTABLE = new Set(['created_at', 'updated_at', 'name', 'company', 'status', 'client_since'])

// tags is a JSON column — mysql2 parses it on read, but needs a JSON string on write.
function toParams(data) {
  const out = {}
  for (const col of WRITABLE) {
    if (data[col] === undefined) continue
    out[col] = col === 'tags' && data[col] != null ? JSON.stringify(data[col]) : data[col]
  }
  return out
}

/**
 * Every client with its portal-login status, for the Settings → Client Portal
 * Access table. LEFT JOINs the client's portal user (role='client'), including
 * revoked ones (is_active=0) so they still show. One portal user per client.
 */
export async function listClientsWithPortalStatus() {
  return query(
    `SELECT c.id, c.name, c.company, c.email,
            u.email AS portal_email, u.is_active AS portal_active, u.last_login_at AS portal_last_login
       FROM clients c
       LEFT JOIN users u ON u.client_id = c.id AND u.role = 'client'
      ORDER BY (u.id IS NULL) ASC, u.is_active DESC, COALESCE(c.company, c.name)`
  )
}

export async function listClients(opts = {}) {
  const { statuses, q } = opts
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const sort = SORTABLE.has(opts.sort) ? opts.sort : 'created_at'
  const dir = String(opts.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const where = []
  const params = {}
  if (statuses?.length) {
    where.push(`status IN (${statuses.map((_, i) => `:status${i}`).join(', ')})`)
    statuses.forEach((s, i) => { params[`status${i}`] = s })
  }
  if (q) {
    where.push('(name LIKE :q OR company LIKE :q OR email LIKE :q OR phone LIKE :q)')
    params.q = `%${q}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT clients.*,
       (SELECT COUNT(*) FROM projects p WHERE p.client_id = clients.id AND p.status <> 'completed') AS active_projects,
       (SELECT COALESCE(SUM(i.amount_due - i.amount_paid), 0) FROM invoices i
          WHERE i.client_id = clients.id AND i.status = 'open') AS outstanding,
       (SELECT COUNT(*) FROM invoices i
          WHERE i.client_id = clients.id AND i.status = 'open'
            AND i.due_date IS NOT NULL AND i.due_date < CURDATE()) AS overdue_count
     FROM clients${whereSql} ORDER BY ${sort} ${dir} LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM clients${whereSql}`, params)
  return { rows, total, limit, offset }
}

export async function getClient(id) {
  const rows = await query('SELECT * FROM clients WHERE id = :id LIMIT 1', { id })
  return rows[0] ?? null
}

/**
 * One-pass rollup for the client detail page: metric strip + tab badges,
 * without loading any of the underlying lists. Correlated COUNT subqueries all
 * hit (client_id, …) indexes, so this stays one cheap round trip.
 */
export async function getClientSummary(id) {
  const rows = await query(
    `SELECT
       (SELECT COUNT(*) FROM projects p
         WHERE p.client_id = c.id AND p.status <> 'completed')             AS projects_active,
       (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id)          AS projects_total,
       (SELECT COUNT(*) FROM tickets t
         WHERE t.client_id = c.id
           AND t.status NOT IN ('resolved', 'closed'))                     AS tickets_open,
       (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id)           AS tickets_total,
       (SELECT COUNT(*) FROM websites w WHERE w.client_id = c.id)          AS websites_total,
       (SELECT COUNT(*) FROM websites w
         WHERE w.client_id = c.id AND w.environment = 'live')              AS websites_live,
       (SELECT COUNT(*) FROM invoices i
         WHERE i.client_id = c.id AND i.status = 'open')                   AS invoices_open,
       (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id)          AS invoices_total,
       (SELECT COALESCE(SUM(i.amount_due - i.amount_paid), 0) FROM invoices i
         WHERE i.client_id = c.id AND i.status = 'open')                   AS outstanding,
       (SELECT COALESCE(SUM(i.amount_due), 0) FROM invoices i
         WHERE i.client_id = c.id
           AND i.status NOT IN ('draft', 'void'))                          AS total_billed,
       (SELECT COUNT(*) FROM calls k WHERE k.client_id = c.id)             AS calls_total,
       (SELECT COUNT(*) FROM proposals pr WHERE pr.client_id = c.id)
         + (SELECT COUNT(*) FROM contracts ct WHERE ct.client_id = c.id)   AS agreements_total,
       (SELECT COUNT(*) FROM files f WHERE f.client_id = c.id)             AS files_total,
       (SELECT COUNT(*) FROM client_activity a WHERE a.client_id = c.id)   AS activity_total
     FROM clients c WHERE c.id = :id`,
    { id }
  )
  const row = rows[0]
  if (!row) return null

  // Attention data for the Overview strips: the most overdue open invoice and
  // the most pressing open ticket. Two indexed LIMIT-1 lookups.
  const [overdue] = await query(
    `SELECT id, number, amount_due, amount_paid, due_date,
            DATEDIFF(CURDATE(), due_date) AS days_overdue
     FROM invoices
     WHERE client_id = :id AND status = 'open'
       AND due_date IS NOT NULL AND due_date < CURDATE()
     ORDER BY due_date ASC LIMIT 1`,
    { id }
  )
  const [ticket] = await query(
    `SELECT id, subject, priority, status, created_at
     FROM tickets
     WHERE client_id = :id AND status NOT IN ('resolved', 'closed')
     ORDER BY FIELD(priority, 'high', 'medium', 'low'), created_at ASC LIMIT 1`,
    { id }
  )

  // DECIMAL sums come back as strings from mysql2 — normalize to numbers.
  return {
    ...row,
    outstanding: Number(row.outstanding),
    total_billed: Number(row.total_billed),
    overdue_invoice: overdue
      ? { ...overdue, amount_due: Number(overdue.amount_due), amount_paid: Number(overdue.amount_paid) }
      : null,
    attention_ticket: ticket ?? null
  }
}

/** Link a client to its DigitalOcean Project (resource group). Managed by the
 *  provisioning flow, not user-settable — hence a dedicated setter, not WRITABLE. */
export async function setClientDoProject(id, doProjectId) {
  await query('UPDATE clients SET do_project_id = :doProjectId WHERE id = :id', { id, doProjectId })
}

export async function getClientByStripeCustomerId(customerId) {
  const rows = await query('SELECT * FROM clients WHERE stripe_customer_id = :cid LIMIT 1', { cid: customerId })
  return rows[0] ?? null
}

// Resolve an inbound caller number to a client by matching the trailing 10
// digits (E.164 +1… vs. either raw-digit or human-formatted storage — seed rows
// keep "(415) 555-0132", API writes strip to digits). REGEXP_REPLACE normalizes
// the stored side (MySQL 8+). The idx_clients_phone index can't serve this, but
// the clients table is small (solo agency), so the scan is fine.
export async function getClientByPhone(phone) {
  const digits = last10(phone)
  if (digits.length < 10) return null
  const rows = await query(
    "SELECT * FROM clients WHERE phone <> '' AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = :d LIMIT 1",
    { d: digits }
  )
  return rows[0] ?? null
}

export async function createClient(data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  const sql = `INSERT INTO clients (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`
  const result = await query(sql, params)
  return getClient(result.insertId)
}

export async function updateClient(id, data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  if (cols.length === 0) return getClient(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  await query(`UPDATE clients SET ${set} WHERE id = :id`, { ...params, id })
  return getClient(id)
}

export async function deleteClient(id) {
  const result = await query('DELETE FROM clients WHERE id = :id', { id })
  return result.affectedRows > 0
}
