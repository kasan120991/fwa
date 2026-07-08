import { query } from '../db/pool.js'

// Writable columns (id/created_at/updated_at are managed by the DB). Leads are
// top-of-funnel only — no billing/address/stripe/client_since (those are client
// concerns).
export const WRITABLE = [
  'source', 'stage', 'name', 'email', 'phone', 'company', 'title', 'website',
  'message', 'notes', 'tags', 'last_contacted_at', 'next_action_at'
]

const SORTABLE = new Set(['created_at', 'updated_at', 'name', 'company', 'stage', 'last_contacted_at', 'next_action_at'])

// tags is a JSON column — mysql2 parses it on read, but needs a JSON string on write.
function toParams(data) {
  const out = {}
  for (const col of WRITABLE) {
    if (data[col] === undefined) continue
    out[col] = col === 'tags' && data[col] != null ? JSON.stringify(data[col]) : data[col]
  }
  return out
}

export async function listLeads(opts = {}) {
  const { stages, sources, q } = opts
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const sort = SORTABLE.has(opts.sort) ? opts.sort : 'created_at'
  const dir = String(opts.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const where = []
  const params = {}
  if (stages?.length) {
    where.push(`stage IN (${stages.map((_, i) => `:stage${i}`).join(', ')})`)
    stages.forEach((s, i) => { params[`stage${i}`] = s })
  }
  if (sources?.length) {
    where.push(`source IN (${sources.map((_, i) => `:src${i}`).join(', ')})`)
    sources.forEach((s, i) => { params[`src${i}`] = s })
  }
  if (q) {
    where.push('(name LIKE :q OR company LIKE :q OR email LIKE :q OR phone LIKE :q)')
    params.q = `%${q}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  // limit/offset are validated integers, safe to inline (avoids prepared LIMIT quirks).
  const rows = await query(
    `SELECT * FROM leads${whereSql} ORDER BY ${sort} ${dir} LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM leads${whereSql}`, params)
  return { rows, total, limit, offset }
}

export async function getLead(id) {
  const rows = await query('SELECT * FROM leads WHERE id = :id LIMIT 1', { id })
  return rows[0] ?? null
}

/** A recent website lead with this email — used to dedupe double-submitted
 *  contact-form webhooks. `minutes` inlined (mysql2 can't bind INTERVAL). */
export async function getRecentWebsiteLeadByEmail(email, minutes = 10) {
  const m = Math.max(1, Math.floor(Number(minutes) || 10))
  const rows = await query(
    `SELECT * FROM leads
     WHERE email = :email AND source = 'website' AND created_at >= (NOW() - INTERVAL ${m} MINUTE)
     ORDER BY created_at DESC LIMIT 1`,
    { email }
  )
  return rows[0] ?? null
}

export async function createLead(data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  const sql = `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`
  const result = await query(sql, params)
  return getLead(result.insertId)
}

export async function updateLead(id, data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  if (cols.length === 0) return getLead(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  await query(`UPDATE leads SET ${set} WHERE id = :id`, { ...params, id })
  return getLead(id)
}

export async function deleteLead(id) {
  const result = await query('DELETE FROM leads WHERE id = :id', { id })
  return result.affectedRows > 0
}
