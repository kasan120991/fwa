import { query } from '../db/pool.js'

// Presentation + semantics are producer-chosen (see schema). Kept here so the
// routes can validate any future write path.
const CATEGORIES = new Set(['lead', 'call', 'proposal', 'contract', 'invoice', 'payment', 'task', 'ticket', 'system'])
const TONES = new Set(['brand', 'success', 'warning', 'info', 'error'])

// A notification is visible to a user if it's targeted to them or broadcast
// (user_id IS NULL). Single admin today; ready for the client portal later.
const SCOPE = '(user_id IS NULL OR user_id = :uid)'

function mapRow(row) {
  if (!row) return row
  return { ...row, read: row.read_at != null }
}

export async function listNotifications(userId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)

  const where = [SCOPE]
  if (opts.unreadOnly) where.push('read_at IS NULL')
  const whereSql = `WHERE ${where.join(' AND ')}`
  const params = { uid: userId }

  const rows = await query(
    `SELECT * FROM notifications ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM notifications ${whereSql}`, params)
  const [{ unread }] = await query(
    `SELECT COUNT(*) AS unread FROM notifications WHERE ${SCOPE} AND read_at IS NULL`,
    { uid: userId }
  )
  return { rows: rows.map(mapRow), total, unread, limit, offset }
}

export async function getNotification(userId, id) {
  const rows = await query(
    `SELECT * FROM notifications WHERE id = :id AND ${SCOPE} LIMIT 1`,
    { id, uid: userId }
  )
  return mapRow(rows[0] ?? null)
}

export async function setRead(userId, id, read) {
  await query(
    `UPDATE notifications SET read_at = :read_at WHERE id = :id AND ${SCOPE}`,
    { id, uid: userId, read_at: read ? new Date() : null }
  )
  return getNotification(userId, id)
}

/** Mark every visible unread notification as read. Returns the new unread count. */
export async function markAllRead(userId) {
  const result = await query(
    `UPDATE notifications SET read_at = :now WHERE ${SCOPE} AND read_at IS NULL`,
    { uid: userId, now: new Date() }
  )
  return { updated: result.affectedRows ?? 0, unread: 0 }
}

/** Delete every notification visible to the user. Returns the number removed. */
export async function clearNotifications(userId) {
  const result = await query(
    `DELETE FROM notifications WHERE ${SCOPE}`,
    { uid: userId }
  )
  return { deleted: result.affectedRows ?? 0 }
}

export async function unreadCount(userId) {
  const [{ unread }] = await query(
    `SELECT COUNT(*) AS unread FROM notifications WHERE ${SCOPE} AND read_at IS NULL`,
    { uid: userId }
  )
  return unread
}

export async function createNotification(data) {
  const payload = {
    user_id: data.user_id ?? null,
    category: data.category,
    tone: data.tone ?? 'brand',
    icon: data.icon,
    title: data.title,
    body: data.body ?? null,
    link: data.link ?? null,
    read_at: data.read_at ?? null,
    created_at: data.created_at ?? null
  }
  // Let the DB default created_at when not supplied.
  if (payload.created_at == null) delete payload.created_at
  const cols = Object.keys(payload)
  const result = await query(
    `INSERT INTO notifications (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    payload
  )
  return getNotification(payload.user_id, result.insertId)
}

export { CATEGORIES, TONES }
