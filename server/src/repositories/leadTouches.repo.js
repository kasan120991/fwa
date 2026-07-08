import { query } from '../db/pool.js'

export const TOUCH_CHANNELS = new Set(['call', 'email', 'sms', 'meeting', 'note', 'other'])

export async function listTouches(leadId) {
  return query(
    'SELECT * FROM lead_touches WHERE lead_id = :id ORDER BY occurred_at DESC, id DESC',
    { id: leadId }
  )
}

export async function getTouch(id) {
  const rows = await query('SELECT * FROM lead_touches WHERE id = :id LIMIT 1', { id })
  return rows[0] ?? null
}

export async function createTouch(leadId, { channel, body = null, occurred_at }) {
  const result = await query(
    `INSERT INTO lead_touches (lead_id, channel, body, occurred_at)
     VALUES (:lead_id, :channel, :body, :occurred_at)`,
    { lead_id: leadId, channel, body, occurred_at }
  )
  return getTouch(result.insertId)
}

export async function deleteTouch(id) {
  const result = await query('DELETE FROM lead_touches WHERE id = :id', { id })
  return result.affectedRows > 0
}
