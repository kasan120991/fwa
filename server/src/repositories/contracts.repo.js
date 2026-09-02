import { query, withTransaction } from '../db/pool.js'

export const CONTRACT_STATUSES = new Set(['draft', 'sent', 'viewed', 'signed', 'declined', 'expired', 'voided'])
export const CONTRACT_TYPES = new Set(['project', 'care_plan'])

// NB: project_id is deliberately absent. Attaching a project to a contract is a
// CLAIM (see claimContractForProject) — an unconditional SET would both let two
// concurrent payments each birth a project and expose the field to PATCH.
const UPDATABLE = [
  'status', 'total', 'billing_interval', 'deposit_pct', 'start_date', 'pandadoc_document_id',
  'pandadoc_template_id', 'pandadoc_status', 'last_webhook_at',
  'sent_at', 'viewed_at', 'signed_at', 'declined_at', 'expires_at'
]

const num = v => (v == null ? null : Number(v))
function mapContract(row) {
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

async function insertItems(q, contractId, items) {
  for (const [i, li] of items.entries()) {
    await q(
      `INSERT INTO contract_line_items
         (contract_id, service_id, name_snapshot, description_snapshot,
          unit_price_snapshot, qty, billing_interval_snapshot, sort_order)
       VALUES (:contract_id, :service_id, :name_snapshot, :description_snapshot,
          :unit_price_snapshot, :qty, :billing_interval_snapshot, :sort_order)`,
      {
        contract_id: contractId,
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

/** Create a standalone contract (e.g. a Care Plan) with fresh line items. */
export async function createContract({ client_id, proposal_id = null, project_id = null, type, title, currency = 'USD', total = 0, billing_interval = 'one_time', start_date = null, items = [] }) {
  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO contracts (client_id, proposal_id, project_id, type, title, currency, total, billing_interval, start_date, status)
       VALUES (:client_id, :proposal_id, :project_id, :type, :title, :currency, :total, :billing_interval, :start_date, 'draft')`,
      { client_id, proposal_id, project_id, type, title, currency, total, billing_interval, start_date }
    )
    const contractId = rows.insertId
    await insertItems(q, contractId, items)
    return contractId
  })
  return getContract(id)
}

/**
 * Model B: generate a contract from an accepted proposal. Re-snapshots the
 * proposal's line items into contract_line_items (INSERT..SELECT) so a price
 * edit between acceptance and signature can't change what the contract carries.
 * Runs in one transaction. Returns the new contract.
 */
export async function generateContractFromProposal(proposal, { type = 'project', billing_interval = 'one_time', start_date = null } = {}) {
  const id = await withTransaction(async (q) => {
    const rows = await q(
      `INSERT INTO contracts (client_id, proposal_id, type, title, currency, total, billing_interval, deposit_pct, start_date, status)
       VALUES (:client_id, :proposal_id, :type, :title, :currency, :total, :billing_interval, :deposit_pct, :start_date, 'draft')`,
      {
        client_id: proposal.client_id,
        proposal_id: proposal.id,
        type,
        title: proposal.title,
        currency: proposal.currency || 'USD',
        total: proposal.total ?? 0,
        billing_interval,
        // Carried across so the deposit's amount and its percentage come from
        // one snapshot — editing the proposal later can't move the goalposts on
        // a signed contract.
        deposit_pct: proposal.deposit_pct ?? null,
        // The SOW's start date is the contract's unless the caller overrides.
        start_date: start_date ?? proposal.start_date ?? null
      }
    )
    const contractId = rows.insertId
    await q(
      `INSERT INTO contract_line_items
         (contract_id, service_id, name_snapshot, description_snapshot,
          unit_price_snapshot, qty, billing_interval_snapshot, sort_order)
       SELECT :contract_id, service_id, name_snapshot, description_snapshot,
          unit_price_snapshot, qty, billing_interval_snapshot, sort_order
       FROM proposal_line_items WHERE proposal_id = :proposal_id`,
      { contract_id: contractId, proposal_id: proposal.id }
    )
    return contractId
  })
  return getContract(id)
}

/** A client's monthly recurring revenue from signed monthly care-plan contracts. */
export async function careplanMrr(clientId) {
  const [row] = await query(
    `SELECT COALESCE(SUM(total), 0) AS mrr FROM contracts
      WHERE client_id = :clientId AND type = 'care_plan'
        AND billing_interval = 'monthly' AND status = 'signed'`,
    { clientId }
  )
  return Number(row?.mrr ?? 0)
}

export async function getContract(id) {
  const rows = await query('SELECT * FROM contracts WHERE id = :id LIMIT 1', { id })
  const contract = rows[0] ?? null
  if (!contract) return null
  const items = await query('SELECT * FROM contract_line_items WHERE contract_id = :id ORDER BY sort_order ASC, id ASC', { id })
  return { ...mapContract(contract), items: items.map(mapItem) }
}

export async function listContracts(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_id) { where.push('project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.type) { where.push('type = :type'); params.type = opts.type }
  if (opts.statuses?.length) {
    where.push(`status IN (${opts.statuses.map((_, i) => `:s${i}`).join(', ')})`)
    opts.statuses.forEach((s, i) => { params[`s${i}`] = s })
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(`SELECT * FROM contracts${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params)
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM contracts${whereSql}`, params)
  return { rows: rows.map(mapContract), total, limit, offset }
}

export async function getContractByDocumentId(documentId) {
  const rows = await query('SELECT * FROM contracts WHERE pandadoc_document_id = :d LIMIT 1', { d: documentId })
  return mapContract(rows[0] ?? null)
}

/** The contract generated from a proposal, if one exists (keeps contract
 *  generation idempotent when a webhook event is redelivered). */
export async function getContractByProposalId(proposalId) {
  const rows = await query('SELECT * FROM contracts WHERE proposal_id = :p LIMIT 1', { p: proposalId })
  return mapContract(rows[0] ?? null)
}

/**
 * Attach a project to a contract, but only if it doesn't have one yet.
 *
 * This single statement is what makes project birth idempotent. Stripe retries
 * `invoice.paid`, and the handler 500s on error so retries are guaranteed — two
 * deliveries can therefore race to create a project for the same contract.
 * Whoever loses this UPDATE throws inside createProjectForContract's
 * transaction, which rolls their half-built project away.
 *
 * Takes `q` so it can run on a transaction connection. Sibling of
 * proposals.repo's claimProposalStatus — same pattern, same reason.
 */
export async function claimContractForProject(q, contractId, projectId) {
  const res = await q(
    'UPDATE contracts SET project_id = :projectId WHERE id = :contractId AND project_id IS NULL',
    { projectId, contractId }
  )
  return (res.affectedRows ?? 0) === 1
}

export async function updateContract(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getContract(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = data[c]
  await query(`UPDATE contracts SET ${set} WHERE id = :id`, params)
  return getContract(id)
}

export async function deleteContract(id) {
  const result = await query('DELETE FROM contracts WHERE id = :id', { id })
  return result.affectedRows > 0
}
