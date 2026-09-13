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
         p.client_id, p.title, p.status, p.total,
         NULL AS ctype, 'one_time' AS billing_interval, NULL AS proposal_id,
         p.expires_at, p.sent_at, p.viewed_at, p.accepted_at AS closed_at,
         p.pandadoc_document_id, p.created_at, p.updated_at,
         c.company AS client_company, c.name AS client_name
  FROM proposals p JOIN clients c ON c.id = p.client_id
  UNION ALL
  SELECT 'contract' AS kind, ct.id AS id, CONCAT('contract-', ct.id) AS uid,
         ct.client_id, ct.title, ct.status, ct.total,
         ct.type AS ctype, ct.billing_interval, ct.proposal_id,
         ct.expires_at, ct.sent_at, ct.viewed_at, ct.signed_at AS closed_at,
         ct.pandadoc_document_id, ct.created_at, ct.updated_at,
         c.company AS client_company, c.name AS client_name
  FROM contracts ct JOIN clients c ON c.id = ct.client_id
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
 *  client_id, a client's Agreements tab). */
export async function listAgreements(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('a.client_id = :client_id'); params.client_id = opts.client_id }
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

/* ------------------------------------------------------------------ deals */

// The Sales page: ONE row per deal — the proposal with the contract it
// produced folded in (the latest project contract for that proposal, so a
// voided-and-regenerated one doesn't double the row) plus the project the
// signature created. Care plans have no proposal, so they ride along as their
// own rows with kind = 'care_plan'. Stage derivation lives in the app
// (utils/deals.ts); this is just the flat join.
const DEALS = `
  SELECT 'deal' AS kind, p.id AS proposal_id, p.code, p.title, p.client_id,
         p.status AS proposal_status, p.total, p.deposit_pct, p.expires_at,
         p.sent_at, p.viewed_at, p.accepted_at, p.declined_at, p.accept_source,
         p.created_at, p.updated_at,
         ct.id AS contract_id, ct.status AS contract_status,
         ct.sent_at AS contract_sent_at, ct.viewed_at AS contract_viewed_at,
         ct.signed_at, ct.updated_at AS contract_updated_at, 'one_time' AS billing_interval,
         pr.id AS project_id, pr.code AS project_code, pr.status AS project_status,
         c.company AS client_company, c.name AS client_name
  FROM proposals p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN contracts ct ON ct.id = (SELECT MAX(x.id) FROM contracts x WHERE x.proposal_id = p.id)
  LEFT JOIN projects pr ON pr.id = ct.project_id
  UNION ALL
  SELECT 'care_plan' AS kind, NULL AS proposal_id, CONCAT('CON-', LPAD(ct.id, 4, '0')) AS code, ct.title, ct.client_id,
         NULL AS proposal_status, ct.total, NULL AS deposit_pct, ct.expires_at,
         NULL AS sent_at, NULL AS viewed_at, NULL AS accepted_at, NULL AS declined_at, NULL AS accept_source,
         ct.created_at, ct.updated_at,
         ct.id AS contract_id, ct.status AS contract_status,
         ct.sent_at AS contract_sent_at, ct.viewed_at AS contract_viewed_at,
         ct.signed_at, ct.updated_at AS contract_updated_at, ct.billing_interval,
         NULL AS project_id, NULL AS project_code, NULL AS project_status,
         c.company AS client_company, c.name AS client_name
  FROM contracts ct
  JOIN clients c ON c.id = ct.client_id
  WHERE ct.proposal_id IS NULL
`

export async function listDeals(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('d.client_id = :client_id'); params.client_id = opts.client_id }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(`SELECT * FROM (${DEALS}) d${whereSql} ORDER BY d.updated_at DESC LIMIT ${limit}`, params)
  return rows.map(r => ({
    ...r,
    total: r.total == null ? null : Number(r.total),
    deposit_pct: r.deposit_pct == null ? null : Number(r.deposit_pct),
    recurring: r.billing_interval === 'monthly',
    client: r.client_company || r.client_name || 'Unknown'
  }))
}
