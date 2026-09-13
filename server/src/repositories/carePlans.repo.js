import { query } from '../db/pool.js'

// care_plans — the subscription record (see schema.sql for the lifecycle).
// Status moves ONLY through claimCarePlanStatus: every transition is a
// conditional UPDATE, so a replayed webhook or a double-clicked button can't
// move a plan twice or backwards. `status` is deliberately absent from
// UPDATABLE for that reason (the same rule as proposals/contracts).

export const CARE_PLAN_STATUSES = new Set(['draft', 'pending_signature', 'awaiting_card', 'active', 'past_due', 'cancelled'])
export const LIVE_STATUSES = ['active', 'past_due']

const UPDATABLE = [
  'name', 'description', 'price', 'currency', 'start_date', 'requires_agreement', 'contract_id',
  'service_id', 'cancel_at_period_end', 'activated_at', 'cancelled_at',
  'stripe_price_id', 'stripe_subscription_id', 'pm_brand', 'pm_last4',
  'current_period_start', 'current_period_end', 'next_charge_at'
]

const num = v => (v == null ? null : Number(v))
function mapPlan(row) {
  if (!row) return row
  return {
    ...row,
    price: num(row.price),
    requires_agreement: !!row.requires_agreement,
    cancel_at_period_end: !!row.cancel_at_period_end
  }
}

const SELECT = `
  SELECT cp.*, c.company AS client_company, c.name AS client_name, c.email AS client_email,
         ct.status AS contract_status, ct.pandadoc_document_id AS contract_document_id
  FROM care_plans cp
  JOIN clients c ON c.id = cp.client_id
  LEFT JOIN contracts ct ON ct.id = cp.contract_id
`

export async function listCarePlans({ client_id, statuses, limit = 200 } = {}) {
  const where = []
  const params = {}
  if (client_id) { where.push('cp.client_id = :client_id'); params.client_id = client_id }
  if (statuses?.length) {
    where.push(`cp.status IN (${statuses.map((_, i) => `:st${i}`).join(', ')})`)
    statuses.forEach((s, i) => { params[`st${i}`] = s })
  }
  const rows = await query(
    `${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY cp.created_at DESC LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 500)}`,
    params
  )
  return rows.map(mapPlan)
}

export async function getCarePlan(id) {
  const rows = await query(`${SELECT} WHERE cp.id = :id LIMIT 1`, { id })
  return mapPlan(rows[0] ?? null)
}

export async function getCarePlanBySubscription(stripeSubscriptionId) {
  const rows = await query(`${SELECT} WHERE cp.stripe_subscription_id = :sid LIMIT 1`, { sid: stripeSubscriptionId })
  return mapPlan(rows[0] ?? null)
}

export async function getCarePlanByContract(contractId) {
  const rows = await query(`${SELECT} WHERE cp.contract_id = :cid LIMIT 1`, { cid: contractId })
  return mapPlan(rows[0] ?? null)
}

export async function createCarePlan({ client_id, service_id = null, contract_id = null, name, description = null, price, currency = 'USD', status = 'draft', requires_agreement = false, start_date }) {
  const res = await query(
    `INSERT INTO care_plans (client_id, service_id, contract_id, name, description, price, currency, status, requires_agreement, start_date)
     VALUES (:client_id, :service_id, :contract_id, :name, :description, :price, :currency, :status, :requires_agreement, :start_date)`,
    { client_id, service_id, contract_id, name, description, price, currency, status, requires_agreement: requires_agreement ? 1 : 0, start_date }
  )
  return getCarePlan(res.insertId)
}

export async function updateCarePlan(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getCarePlan(id)
  const params = { id }
  for (const c of cols) params[c] = typeof data[c] === 'boolean' ? (data[c] ? 1 : 0) : data[c]
  await query(`UPDATE care_plans SET ${cols.map(c => `${c} = :${c}`).join(', ')} WHERE id = :id`, params)
  return getCarePlan(id)
}

/**
 * Move a plan's status, but only from a state that allows it. Returns true for
 * the one caller that actually moved it — a replayed Stripe event or a second
 * click reads the new status and gets false. `extra` columns ride along in the
 * same statement so the stamp and the status can't drift apart.
 */
export async function claimCarePlanStatus(id, toStatus, fromStatuses, extra = {}) {
  const stamp = { active: 'activated_at', cancelled: 'cancelled_at' }[toStatus]
  const cols = Object.keys(extra).filter(c => UPDATABLE.includes(c))
  const params = { id, toStatus, ...Object.fromEntries(fromStatuses.map((v, i) => [`from${i}`, v])) }
  for (const c of cols) params[c] = typeof extra[c] === 'boolean' ? (extra[c] ? 1 : 0) : extra[c]
  const res = await query(
    `UPDATE care_plans SET status = :toStatus${stamp ? `, ${stamp} = COALESCE(${stamp}, NOW())` : ''}
       ${cols.length ? ', ' + cols.map(c => `${c} = :${c}`).join(', ') : ''}
     WHERE id = :id AND status IN (${fromStatuses.map((_, i) => `:from${i}`).join(', ')})`,
    params
  )
  return (res.affectedRows ?? 0) === 1
}

export async function deleteCarePlan(id) {
  const res = await query('DELETE FROM care_plans WHERE id = :id', { id })
  return (res.affectedRows ?? 0) === 1
}

/** Monthly recurring revenue for one client: every plan that is live (active,
 *  or past due but not yet cancelled). */
export async function careplanMrr(clientId) {
  const rows = await query(
    `SELECT COALESCE(SUM(price), 0) AS mrr FROM care_plans
      WHERE client_id = :clientId AND status IN ('active', 'past_due')`,
    { clientId }
  )
  return Number(rows[0]?.mrr ?? 0)
}
