import { query } from '../db/pool.js'

export const TICKET_STATUSES = new Set(['open', 'in_progress', 'waiting', 'resolved', 'closed'])
export const TICKET_PRIORITIES = new Set(['low', 'medium', 'high'])
export const TICKET_TYPES = new Set(['update', 'issue', 'bug', 'question', 'other'])

/** Display number for a ticket: SR-001, SR-002, … (mirrors app/utils/format.ts). */
export const ticketCode = id => `SR-${String(id).padStart(3, '0')}`

// Statuses that count as "still needs work" (drives the open badge/metric).
const OPEN_STATUSES = "('open', 'in_progress', 'waiting')"

const UPDATABLE = ['client_id', 'website_id', 'subject', 'description', 'type', 'status', 'priority', 'opened_by']

// Join the client + optional website for display on the cross-client /support
// page, plus reply/attachment counts so every row carries its rollups.
const BASE_SELECT = `SELECT t.*,
    c.name AS client_name, c.company AS client_company,
    w.name AS website_name, w.domain AS website_domain,
    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
    (SELECT COUNT(*) FROM ticket_attachments a WHERE a.ticket_id = t.id) AS attachment_count
  FROM tickets t
  JOIN clients c ON c.id = t.client_id
  LEFT JOIN websites w ON w.id = t.website_id`

export async function createTicket(data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  const params = {}
  for (const c of cols) params[c] = data[c]
  // Stamp the resolution boundary if a ticket is created already resolved/closed.
  const extraCols = []
  if (data.status === 'resolved') extraCols.push('resolved_at')
  if (data.status === 'closed') extraCols.push('closed_at')
  const insertCols = [...cols, ...extraCols]
  const values = [...cols.map(c => `:${c}`), ...extraCols.map(() => 'NOW()')]
  const rows = await query(
    `INSERT INTO tickets (${insertCols.join(', ')}) VALUES (${values.join(', ')})`,
    params
  )
  return getTicket(rows.insertId)
}

export async function getTicket(id) {
  const rows = await query(`${BASE_SELECT} WHERE t.id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function listTickets(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('t.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.website_id) { where.push('t.website_id = :website_id'); params.website_id = opts.website_id }
  if (opts.status) { where.push('t.status = :status'); params.status = opts.status }
  if (opts.open) { where.push(`t.status IN ${OPEN_STATUSES}`) }
  if (opts.q) {
    where.push('(t.subject LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.q}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  // Open tickets first (resolved/closed last), then most recently active.
  const rows = await query(
    `${BASE_SELECT}${whereSql}
     ORDER BY (t.status IN ('resolved', 'closed')) ASC, t.last_activity_at DESC, t.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM tickets t JOIN clients c ON c.id = t.client_id${whereSql}`, params)
  return { rows, total, limit, offset }
}

export async function updateTicket(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  const set = cols.map(c => `${c} = :${c}`)
  const params = { id }
  for (const c of cols) params[c] = data[c]
  // Cross the resolution boundary: stamp/clear resolved_at / closed_at.
  if (data.status !== undefined) {
    set.push(data.status === 'resolved' ? 'resolved_at = NOW()' : 'resolved_at = NULL')
    set.push(data.status === 'closed' ? 'closed_at = NOW()' : 'closed_at = NULL')
  }
  // Any edit counts as activity.
  set.push('last_activity_at = NOW()')
  await query(`UPDATE tickets SET ${set.join(', ')} WHERE id = :id`, params)
  return getTicket(id)
}

export async function deleteTicket(id) {
  const result = await query('DELETE FROM tickets WHERE id = :id', { id })
  return result.affectedRows > 0
}

/** Bump a ticket's last-activity clock (called when a reply/attachment lands). */
export async function touchTicket(id) {
  await query('UPDATE tickets SET last_activity_at = NOW() WHERE id = :id', { id })
}

// ---- reply thread ----------------------------------------------------------

const MSG_SELECT = `SELECT m.id, m.ticket_id, m.author_type, m.author_user_id, m.body, m.created_at,
    u.name AS author_name
  FROM ticket_messages m
  LEFT JOIN users u ON u.id = m.author_user_id`

export async function listMessages(ticket_id) {
  return query(`${MSG_SELECT} WHERE m.ticket_id = :ticket_id ORDER BY m.id ASC`, { ticket_id })
}

export async function getMessage(id) {
  const rows = await query(`${MSG_SELECT} WHERE m.id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function createMessage(ticket_id, { body, author_type = 'admin', author_user_id = null }) {
  const res = await query(
    `INSERT INTO ticket_messages (ticket_id, author_type, author_user_id, body)
     VALUES (:ticket_id, :author_type, :author_user_id, :body)`,
    { ticket_id, author_type, author_user_id, body }
  )
  return getMessage(res.insertId)
}

// ---- attachments -----------------------------------------------------------

const ATT_COLS = 'id, ticket_id, message_id, path, name, mime, size_bytes, uploaded_by, uploaded_user_id, created_at'

export async function listAttachments(ticket_id) {
  return query(`SELECT ${ATT_COLS} FROM ticket_attachments WHERE ticket_id = :ticket_id ORDER BY id ASC`, { ticket_id })
}

export async function getAttachment(id) {
  const rows = await query(`SELECT ${ATT_COLS} FROM ticket_attachments WHERE id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function createAttachment(ticket_id, data) {
  const res = await query(
    `INSERT INTO ticket_attachments (ticket_id, message_id, path, name, mime, size_bytes, uploaded_by, uploaded_user_id)
     VALUES (:ticket_id, :message_id, :path, :name, :mime, :size_bytes, :uploaded_by, :uploaded_user_id)`,
    {
      ticket_id,
      message_id: data.message_id ?? null,
      path: data.path,
      name: data.name,
      mime: data.mime ?? null,
      size_bytes: data.size_bytes ?? null,
      uploaded_by: data.uploaded_by ?? 'admin',
      uploaded_user_id: data.uploaded_user_id ?? null
    }
  )
  return getAttachment(res.insertId)
}

export async function deleteAttachment(id) {
  const res = await query('DELETE FROM ticket_attachments WHERE id = :id', { id })
  return res.affectedRows > 0
}
