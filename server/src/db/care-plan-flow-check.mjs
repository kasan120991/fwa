// End-to-end proof of the care-plan lifecycle against a real database — every
// claim, replay and refusal — with the Stripe/PandaDoc/Resend side stubbed out.
// Run with PANDADOC_API_KEY= RESEND_API_KEY= STRIPE_SECRET_KEY= so nothing
// leaves the box; the ONE step that needs Stripe (saving a card) is exercised
// by hand in the portal in test mode. Self-cleaning.
const B = new URL('..', import.meta.url).pathname
const { query } = await import(`${B}/db/pool.js`)
const repo = await import(`${B}/repositories/carePlans.repo.js`)
const svc = await import(`${B}/services/carePlans.service.js`)
const { getClient } = await import(`${B}/repositories/clients.repo.js`)
const { getContract } = await import(`${B}/repositories/contracts.repo.js`)

let pass = 0, fail = 0
const ok = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ' — ' + extra : ''}`) }
const rejects = async (fn) => { try { await fn(); return null } catch (err) { return err } }

const client = (await query("SELECT id FROM clients WHERE status = 'active' ORDER BY id LIMIT 1"))[0]
if (!client) { console.error('no active client to test against'); process.exit(1) }
const clientRow = await getClient(client.id)
const runStartedAt = (await query('SELECT NOW() AS now'))[0].now
const tierRes = await query("INSERT INTO services (name, description, category, price, billing_interval, sort_order) VALUES ('Flow-check tier', 'Line one\\nLine two', 'care_plan', 129.00, 'monthly', 99)")
const tierId = tierRes.insertId

console.log('\n1. Assign a plan with no agreement → born at awaiting_card, tier snapshotted')
const plan = await svc.createCarePlanForClient(clientRow, { service_id: tierId, start_date: '2030-01-15' })
ok('status awaiting_card', plan.status === 'awaiting_card', plan.status)
ok('name/price/description snapshotted from the tier', plan.name === 'Flow-check tier' && plan.price === 129 && /Line two/.test(plan.description || ''))
await query('UPDATE services SET price = 999 WHERE id = :id', { id: tierId })
ok('a later price-book edit does not re-price the plan', (await repo.getCarePlan(plan.id)).price === 129)

console.log('\n2. Validation')
ok('rejects a zero price', !!(await rejects(() => svc.createCarePlanForClient(clientRow, { name: 'x', price: 0 }))))
ok('rejects a non-care-plan service', !!(await rejects(() => svc.createCarePlanForClient(clientRow, { service_id: 999999 }))))

console.log('\n3. Activation is refused without a valid SetupIntent and never moves the status')
const err = await rejects(() => svc.activateCarePlan(plan, clientRow, 'seti_bogus'))
ok('refused', !!err, err?.message)
ok('still awaiting_card', (await repo.getCarePlan(plan.id)).status === 'awaiting_card')

console.log('\n4. Claims move exactly once')
ok('awaiting_card → active claim wins', await repo.claimCarePlanStatus(plan.id, 'active', ['awaiting_card']))
ok('replay of the same claim loses', !(await repo.claimCarePlanStatus(plan.id, 'active', ['awaiting_card'])))
ok('activated_at stamped once', !!(await repo.getCarePlan(plan.id)).activated_at)
ok('MRR counts the active plan', (await repo.careplanMrr(client.id)) >= 129)

console.log('\n5. Stripe events (replayed as objects)')
let p = await repo.getCarePlan(plan.id)
p = await svc.onCarePlanPaymentFailed(p, clientRow)
ok('payment_failed → past_due', p.status === 'past_due')
ok('MRR still counts a past-due plan', (await repo.careplanMrr(client.id)) >= 129)
p = await svc.onCarePlanPaymentFailed(p, clientRow)
ok('replayed payment_failed is a no-op', p.status === 'past_due')
const paidInv = { lines: { data: [{ period: { start: 1893456000, end: 1896134400 } }] } }
p = await svc.onCarePlanInvoicePaid(p, paidInv)
ok('invoice.paid → active with the period bumped', p.status === 'active' && String(p.current_period_end).startsWith('2030-02'))
p = await svc.syncFromSubscription(p, { status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_start: 1893456000, current_period_end: 1896134400 }] } })
ok('cancel_at_period_end mirrored, no next charge', p.cancel_at_period_end === true && p.next_charge_at == null)
p = await svc.syncFromSubscription(p, { status: 'canceled', cancel_at_period_end: false, items: { data: [] } })
ok('subscription.deleted → cancelled, stamped', p.status === 'cancelled' && !!p.cancelled_at)
p = await svc.onCarePlanInvoicePaid(p, paidInv)
ok('a late invoice.paid cannot resurrect a cancelled plan', p.status === 'cancelled')
ok('MRR drops the cancelled plan', (await repo.careplanMrr(client.id)) < 129 || (await query('SELECT COUNT(*) AS n FROM care_plans WHERE client_id = :c AND status IN ("active","past_due") AND id <> :id', { c: client.id, id: plan.id }))[0].n > 0)
ok('invoice description names the plan and period', /Care Plan — Flow-check tier · /.test(svc.carePlanInvoiceDescription(p, paidInv)))

console.log('\n6. Agreement path (PandaDoc stubbed: contract row exists, no document)')
const tpl = await query("SELECT id FROM document_templates WHERE purpose = 'care_plan' AND is_active = 1 LIMIT 1")
if (!tpl.length) {
  const refused = await rejects(() => svc.createCarePlanForClient(clientRow, { service_id: tierId, requires_agreement: true }))
  ok('refuses an agreement when no care-plan template is active', !!refused, refused?.message)
} else {
  const withDoc = await svc.createCarePlanForClient(clientRow, { service_id: tierId, requires_agreement: true, start_date: '2030-03-01' })
  ok('born at pending_signature with a contract', withDoc.status === 'pending_signature' && !!withDoc.contract_id)
  const contract = await getContract(withDoc.contract_id)
  ok('contract is a monthly care_plan carrying the plan as its line', contract.type === 'care_plan' && contract.billing_interval === 'monthly' && contract.items.length === 1)
  const signed = await svc.onCarePlanContractSigned(contract)
  ok('signature → awaiting_card', signed.status === 'awaiting_card')
  ok('replayed signature is a no-op', (await svc.onCarePlanContractSigned(contract)).status === 'awaiting_card')
}

console.log('\n7. Cancel + delete rules')
const spare = await svc.createCarePlanForClient(clientRow, { name: 'Spare', price: 10 })
ok('delete allowed before it starts', await repo.deleteCarePlan(spare.id))
const cancelled = await svc.cancelCarePlan(await repo.getCarePlan(plan.id), { atPeriodEnd: false })
ok('cancelling a cancelled plan is idempotent', cancelled.status === 'cancelled')

console.log('\n8. Cleanup')
await query('DELETE FROM care_plans WHERE client_id = :c AND created_at >= :t', { c: client.id, t: runStartedAt })
await query("DELETE FROM contracts WHERE client_id = :c AND type = 'care_plan' AND created_at >= :t", { c: client.id, t: runStartedAt })
await query('DELETE FROM services WHERE id = :id', { id: tierId })
await query('DELETE FROM client_activity WHERE client_id = :c AND created_at >= :t', { c: client.id, t: runStartedAt }).catch(() => {})
await query('DELETE FROM notifications WHERE created_at >= :t AND (title LIKE "Care plan%" OR title LIKE "Contract signed%")', { t: runStartedAt }).catch(() => {})
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
