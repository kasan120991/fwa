import { query } from '../db/pool.js'

// transcript is stored as a JSON string (array of {r,t} turns); extracted is a
// JSON column. Parse both into JS on read so the API returns structured data.
function mapRow(row) {
  if (!row) return row
  let transcript = null
  if (row.transcript != null) {
    try { transcript = JSON.parse(row.transcript) } catch { transcript = row.transcript }
  }
  return { ...row, transcript, reviewed: row.reviewed_at != null }
}

const CLASSIFICATIONS = new Set(['inquiry', 'client', 'spam', 'wrong_number', 'other'])

export async function listCalls(opts = {}) {
  const { classifications, q } = opts
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)

  const where = []
  const params = {}
  if (classifications?.length) {
    where.push(`classification IN (${classifications.map((_, i) => `:c${i}`).join(', ')})`)
    classifications.forEach((c, i) => { params[`c${i}`] = c })
  }
  if (q) {
    where.push('(caller_name LIKE :q OR caller_number LIKE :q OR summary LIKE :q)')
    params.q = `%${q}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT * FROM calls${whereSql} ORDER BY occurred_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM calls${whereSql}`, params)
  return { rows: rows.map(mapRow), total, limit, offset }
}

export async function getCall(id) {
  const rows = await query('SELECT * FROM calls WHERE id = :id LIMIT 1', { id })
  return mapRow(rows[0] ?? null)
}

/** Count of new (unreviewed) calls — powers the AI Receptionist nav badge. */
export async function unreviewedCount() {
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM calls WHERE reviewed_at IS NULL')
  return Number(n)
}

export async function createCall(data) {
  const payload = {
    lead_id: data.lead_id ?? null,
    client_id: data.client_id ?? null,
    classification: data.classification,
    caller_number: data.caller_number,
    caller_name: data.caller_name ?? null,
    summary: data.summary ?? null,
    transcript: data.transcript != null ? JSON.stringify(data.transcript) : null,
    recording_url: data.recording_url ?? null,
    duration_seconds: data.duration_seconds ?? null,
    extracted: data.extracted != null ? JSON.stringify(data.extracted) : null,
    occurred_at: data.occurred_at
  }
  const cols = Object.keys(payload)
  const result = await query(
    `INSERT INTO calls (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    payload
  )
  return getCall(result.insertId)
}

export async function updateCall(id, data) {
  const set = []
  const params = { id }
  if (data.classification !== undefined) { set.push('classification = :classification'); params.classification = data.classification }
  if (data.lead_id !== undefined) { set.push('lead_id = :lead_id'); params.lead_id = data.lead_id }
  if (data.client_id !== undefined) { set.push('client_id = :client_id'); params.client_id = data.client_id }
  if (data.reviewed !== undefined) { set.push('reviewed_at = :reviewed_at'); params.reviewed_at = data.reviewed ? new Date() : null }
  if (set.length === 0) return getCall(id)
  await query(`UPDATE calls SET ${set.join(', ')} WHERE id = :id`, params)
  return getCall(id)
}

export { CLASSIFICATIONS }
