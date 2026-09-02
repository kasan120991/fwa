import { query, withTransaction } from '../db/pool.js'

export const PROPOSAL_STATUSES = new Set(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'voided'])

// Columns an update may touch. The Statement of Work is editable while the
// proposal is still in flight — it IS the product here — but client_id stays
// fixed at creation, and `status` is deliberately absent: a status move is a
// claim, not an update (see claimProposalStatus).
const SOW_FIELDS = [
  'goals', 'pages_included', 'key_features', 'design_deliverables', 'content_provided_by',
  'revision_rounds', 'third_party_costs', 'project_fee', 'deposit_pct', 'hourly_rate',
  'content_deadline', 'start_date', 'target_launch_date', 'special_terms',
  'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days'
]
export { SOW_FIELDS }

const UPDATABLE = [
  'title', 'project_id', 'project_type_id', 'currency', 'total', ...SOW_FIELDS,
  'status', 'pandadoc_document_id', 'pandadoc_template_id', 'pandadoc_status',
  'last_webhook_at', 'sent_at', 'viewed_at', 'accepted_at', 'declined_at', 'expires_at',
  'accept_source', 'accepted_by'
]

const num = v => (v == null ? null : Number(v))
function mapProposal(row) {
  if (!row) return row
  // Cast the money out of MySQL's DECIMAL strings, the same way mapProject did
  // when these columns lived on the project — the UI and the deposit maths both
  // assume numbers.
  return {
    ...row,
    total: num(row.total),
    project_fee: num(row.project_fee),
    deposit_pct: num(row.deposit_pct),
    hourly_rate: num(row.hourly_rate)
  }
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
export async function createProposal({
  client_id, project_id = null, project_type_id = null, title,
  currency = 'USD', total = 0, items = [], sow = {}
}) {
  const sowCols = SOW_FIELDS.filter(f => sow[f] !== undefined)
  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO proposals (client_id, project_id, project_type_id, title, currency, total, status
         ${sowCols.length ? ', ' + sowCols.join(', ') : ''})
       VALUES (:client_id, :project_id, :project_type_id, :title, :currency, :total, 'draft'
         ${sowCols.length ? ', ' + sowCols.map(c => ':' + c).join(', ') : ''})`,
      {
        client_id, project_id, project_type_id, title, currency, total,
        ...Object.fromEntries(sowCols.map(c => [c, sow[c]]))
      }
    )
    const proposalId = rows.insertId
    // The code needs the auto-increment id, so it's a second statement in the
    // same transaction — the same shape projects.repo uses for WEB-0007.
    await q(
      "UPDATE proposals SET code = CONCAT('PROP-', LPAD(:proposalId, 4, '0')) WHERE id = :proposalId",
      { proposalId }
    )
    await insertItems(q, proposalId, items)
    return proposalId
  })
  return getProposal(id)
}

/**
 * Move a proposal's status, but only from a state that allows it.
 *
 * This is a CLAIM, not an update, and that's why it isn't expressible through
 * UPDATABLE: `updateProposal` issues an unconditional SET, which would let two
 * concurrent accepts both win. A hundred POSTs on one valid link all read
 * status='sent'; this conditional UPDATE serializes them to exactly one, and
 * everything expensive downstream (contract generation, PandaDoc) hangs off the
 * winner. Returns true only for the caller that actually moved it.
 *
 * Sibling of contracts.repo's claimContractForProject — same pattern, same reason.
 */
export async function claimProposalStatus(id, toStatus, fromStatuses, extra = {}) {
  const stamp = { accepted: 'accepted_at', declined: 'declined_at' }[toStatus]
  const cols = Object.keys(extra)
  const res = await query(
    `UPDATE proposals SET status = :toStatus${stamp ? `, ${stamp} = NOW()` : ''}
       ${cols.length ? ', ' + cols.map(c => `${c} = :${c}`).join(', ') : ''}
     WHERE id = :id AND status IN (${fromStatuses.map((_, i) => `:from${i}`).join(', ')})`,
    {
      id, toStatus, ...extra,
      ...Object.fromEntries(fromStatuses.map((v, i) => [`from${i}`, v]))
    }
  )
  return (res.affectedRows ?? 0) === 1
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
  if (opts.client_id) { where.push('p.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_id) { where.push('p.project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.statuses?.length) {
    where.push(`p.status IN (${opts.statuses.map((_, i) => `:s${i}`).join(', ')})`)
    opts.statuses.forEach((s, i) => { params[`s${i}`] = s })
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  // The list is client-facing work, so it carries who each proposal is for.
  const rows = await query(
    `SELECT p.*, c.name AS client_name, c.company AS client_company
       FROM proposals p JOIN clients c ON c.id = p.client_id
       ${whereSql} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM proposals p JOIN clients c ON c.id = p.client_id${whereSql}`,
    params
  )
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
