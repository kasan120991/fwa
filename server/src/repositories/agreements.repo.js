import { query } from '../db/pool.js'

// The Agreements page merges proposals and contracts into one list. Per the
// build plan that merge is a query-layer concern (the tables stay separate), so
// it lives here rather than in the schema. Each row carries a `kind`
// discriminator and a `uid` (kind + id) that's unique across the union.

// Common projection over both tables. `closed_at` is the terminal-event
// timestamp (accepted for proposals, signed for contracts). `recurring` is
// derived from a contract's billing_interval.
const UNION = `
  SELECT 'proposal' AS kind, p.id AS id, CONCAT('proposal-', p.id) AS uid,
         p.contact_id, p.title, p.status, p.total,
         NULL AS ctype, 'one_time' AS billing_interval, NULL AS proposal_id,
         p.expires_at, p.sent_at, p.viewed_at, p.accepted_at AS closed_at,
         p.pandadoc_document_id, p.created_at, p.updated_at,
         c.company AS client_company, c.name AS client_name
  FROM proposals p JOIN contacts c ON c.id = p.contact_id
  UNION ALL
  SELECT 'contract' AS kind, ct.id AS id, CONCAT('contract-', ct.id) AS uid,
         ct.contact_id, ct.title, ct.status, ct.total,
         ct.type AS ctype, ct.billing_interval, ct.proposal_id,
         ct.expires_at, ct.sent_at, ct.viewed_at, ct.signed_at AS closed_at,
         ct.pandadoc_document_id, ct.created_at, ct.updated_at,
         c.company AS client_company, c.name AS client_name
  FROM contracts ct JOIN contacts c ON c.id = ct.contact_id
`

function mapRow(row) {
  return {
    ...row,
    total: row.total == null ? null : Number(row.total),
    recurring: row.billing_interval === 'monthly',
    client: row.client_company || row.client_name || 'Unknown'
  }
}

/** Merged proposals + contracts list for the Agreements page (and, filtered by
 *  contact_id, a client's Agreements tab). */
export async function listAgreements(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.contact_id) { where.push('a.contact_id = :contact_id'); params.contact_id = opts.contact_id }
  if (opts.kind) { where.push('a.kind = :kind'); params.kind = opts.kind }
  if (opts.statuses?.length) {
    where.push(`a.status IN (${opts.statuses.map((_, i) => `:st${i}`).join(', ')})`)
    opts.statuses.forEach((s, i) => { params[`st${i}`] = s })
  }
  if (opts.q) { where.push('(a.title LIKE :q OR a.client_company LIKE :q OR a.client_name LIKE :q)'); params.q = `%${opts.q}%` }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT * FROM (${UNION}) a${whereSql} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM (${UNION}) a${whereSql}`, params)
  return { rows: rows.map(mapRow), total, limit, offset }
}

/** Summary numbers for the Agreements page tiles. */
export async function agreementsSummary() {
  const [[resp], [sign], [flight]] = await Promise.all([
    query("SELECT COUNT(*) AS n FROM proposals WHERE status IN ('sent', 'viewed')"),
    query("SELECT COUNT(*) AS n FROM contracts WHERE status IN ('sent', 'viewed')"),
    // Value in flight — one-time totals of everything still awaiting a close.
    query(`SELECT COALESCE(SUM(total), 0) AS v FROM (
             SELECT total FROM proposals WHERE status IN ('sent', 'viewed')
             UNION ALL
             SELECT total FROM contracts WHERE status IN ('sent', 'viewed') AND billing_interval = 'one_time'
           ) t`)
  ])
  return {
    awaiting_response: Number(resp.n),
    awaiting_signature: Number(sign.n),
    value_in_flight: Number(flight.v)
  }
}
