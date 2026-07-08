import { query, withTransaction } from '../db/pool.js'

export const PROPOSAL_STATUSES = new Set(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'voided'])

// Columns a status/sync write may touch (used by send + the webhook). The
// business columns (client_id, title, currency) and line items are set only at
// creation.
const UPDATABLE = [
  'status', 'total', 'pandadoc_document_id', 'pandadoc_template_id', 'pandadoc_status',
  'last_webhook_at', 'sent_at', 'viewed_at', 'accepted_at', 'declined_at', 'expires_at'
]

const num = v => (v == null ? null : Number(v))
function mapProposal(row) {
  if (!row) return row
  return { ...row, total: num(row.total) }
}
function mapItem(row) {
  return {
    ...row,
    unit_price_snapshot: num(row.unit_price_snapshot),
    qty: num(row.qty),
    line_total: num(row.line_total)
  }
}

// Insert a proposal's snapshotted line items on a given connection (tx-safe).
async function insertItems(q, proposalId, items) {
  for (const [i, li] of items.entries()) {
    await q(
      `INSERT INTO proposal_line_items
         (proposal_id, service_id, name_snapshot, description_snapshot,
          unit_price_snapshot, qty, billing_interval_snapshot, sort_order)
       VALUES (:proposal_id, :service_id, :name_snapshot, :description_snapshot,
          :unit_price_snapshot, :qty, :billing_interval_snapshot, :sort_order)`,
      {
        proposal_id: proposalId,
        service_id: li.service_id ?? null,
        name_snapshot: li.name_snapshot,
        description_snapshot: li.description_snapshot ?? null,
        unit_price_snapshot: li.unit_price_snapshot,
        qty: li.qty ?? 1,
        billing_interval_snapshot: li.billing_interval_snapshot ?? 'one_time',
        sort_order: li.sort_order ?? i
      }
    )
  }
}

/** Create a proposal and its snapshotted line items atomically. `items` are
 *  ready-to-insert snapshot rows; `total` is the caller-computed sum. */
export async function createProposal({ client_id, project_id = null, title, currency = 'USD', total = 0, items = [] }) {
  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO proposals (client_id, project_id, title, currency, total, status)
       VALUES (:client_id, :project_id, :title, :currency, :total, 'draft')`,
      { client_id, project_id, title, currency, total }
    )
    const proposalId = rows.insertId
    await insertItems(q, proposalId, items)
    return proposalId
  })
  return getProposal(id)
}

export async function getProposal(id) {
  const rows = await query('SELECT * FROM proposals WHERE id = :id LIMIT 1', { id })
  const proposal = rows[0] ?? null
  if (!proposal) return null
  const items = await query('SELECT * FROM proposal_line_items WHERE proposal_id = :id ORDER BY sort_order ASC, id ASC', { id })
  return { ...mapProposal(proposal), items: items.map(mapItem) }
}

export async function getProposalItems(id) {
  const items = await query('SELECT * FROM proposal_line_items WHERE proposal_id = :id ORDER BY sort_order ASC, id ASC', { id })
  return items.map(mapItem)
}

export async function listProposals(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_id) { where.push('project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.statuses?.length) {
    where.push(`status IN (${opts.statuses.map((_, i) => `:s${i}`).join(', ')})`)
    opts.statuses.forEach((s, i) => { params[`s${i}`] = s })
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(`SELECT * FROM proposals${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params)
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM proposals${whereSql}`, params)
  return { rows: rows.map(mapProposal), total, limit, offset }
}

/** Look up a proposal by its PandaDoc document id (webhook resolution). */
export async function getProposalByDocumentId(documentId) {
  const rows = await query('SELECT * FROM proposals WHERE pandadoc_document_id = :d LIMIT 1', { d: documentId })
  return mapProposal(rows[0] ?? null)
}

export async function updateProposal(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getProposal(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = data[c]
  await query(`UPDATE proposals SET ${set} WHERE id = :id`, params)
  return getProposal(id)
}

export async function deleteProposal(id) {
  // proposal_line_items cascade on delete (FK).
  const result = await query('DELETE FROM proposals WHERE id = :id', { id })
  return result.affectedRows > 0
}
