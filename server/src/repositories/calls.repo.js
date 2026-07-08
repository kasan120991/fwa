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
  const { classifications, q, client_id } = opts
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)

  const where = []
  const params = {}
  if (classifications?.length) {
    where.push(`classification IN (${classifications.map((_, i) => `:c${i}`).join(', ')})`)
    classifications.forEach((c, i) => { params[`c${i}`] = c })
  }
  if (client_id) {
    where.push('client_id = :client_id')
    params.client_id = client_id
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

/** Look up a call by its Vapi call id — the idempotency key for webhook ingestion. */
export async function getCallByVapiId(vapiCallId) {
  if (!vapiCallId) return null
  const rows = await query('SELECT * FROM calls WHERE vapi_call_id = :v LIMIT 1', { v: vapiCallId })
  return mapRow(rows[0] ?? null)
}

/** Count of new (unreviewed) calls — powers the AI Receptionist nav badge. */
export async function unreviewedCount() {
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM calls WHERE reviewed_at IS NULL')
  return Number(n)
}

/** Rolling 7-day receptionist metrics for the header stat strip. */
export async function callStats() {
  const [row] = await query(`
    SELECT
      COUNT(*)                                            AS calls_week,
      SUM(classification = 'inquiry')                     AS inquiries,
      SUM(HOUR(occurred_at) < 9 OR HOUR(occurred_at) >= 17) AS after_hours,
      ROUND(AVG(duration_seconds))                        AS avg_duration,
      SUM(lead_id IS NOT NULL)                            AS converted
    FROM calls
    WHERE occurred_at >= (NOW() - INTERVAL 7 DAY)
  `)
  return {
    calls_week: Number(row.calls_week) || 0,
    inquiries: Number(row.inquiries) || 0,
    after_hours: Number(row.after_hours) || 0,
    avg_duration: Number(row.avg_duration) || 0,
    converted: Number(row.converted) || 0
  }
}

export async function createCall(data) {
  const payload = {
    lead_id: data.lead_id ?? null,
    client_id: data.client_id ?? null,
    vapi_call_id: data.vapi_call_id ?? null,
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
