// End-to-end backend proof of the proposal-first flow — both legs: the deposit
// path (signed -> deposit invoice -> paid -> project) and the no-deposit path
// (deposit_pct = 0: signed -> project). Run with PANDADOC_API_KEY= RESEND_API_KEY=
// CLICKUP_API_TOKEN= STRIPE_SECRET_KEY= so nothing leaves the box.
const B = '/Users/kasanfrancis/Projects/fwa/server/src'
const { query } = await import(`${B}/db/pool.js`)
const { createProposal, getProposal } = await import(`${B}/repositories/proposals.repo.js`)
const { issueProposalToken, findProposalByToken } = await import(`${B}/repositories/proposalTokens.repo.js`)
const { acceptProposal } = await import(`${B}/services/proposalAcceptance.js`)
const { issueDepositForContract } = await import(`${B}/services/projectBilling.js`)
const { ensureProjectForContract, onContractSigned, hasNoDeposit } = await import(`${B}/services/contractToProject.js`)
const { getContract, updateContract } = await import(`${B}/repositories/contracts.repo.js`)
const { getProject } = await import(`${B}/repositories/projects.repo.js`)
const { getInvoice, updateInvoice } = await import(`${B}/repositories/invoices.repo.js`)
const { getClient } = await import(`${B}/repositories/clients.repo.js`)

const ok = (label, cond, extra = '') => console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)

// Which client the test hangs its rows off, and when this run began — both are
// needed by the cleanup at the bottom. MySQL's clock, not node's: this
// connection isn't timezone-pinned, so a JS Date can land hours off.
const CLIENT_ID = 62
const runStartedAt = (await query('SELECT NOW() AS now'))[0].now

console.log('\n1. Create a proposal carrying the SOW')
const proposal = await createProposal({
  client_id: CLIENT_ID,
  project_type_id: (await query("SELECT id FROM project_types WHERE `key`='website'"))[0].id,
  title: 'Acme Redesign (flow test)',
  total: 20000,
  items: [],
  sow: { goals: 'Rebuild the marketing site', project_fee: 20000, deposit_pct: 40, target_launch_date: '2026-12-01' }
})
ok('proposal created with code', !!proposal.code, `${proposal.code} · fee ${proposal.project_fee} · ${proposal.deposit_pct}%`)

console.log('\n2. Mint a public link and read it back (GET must not consume it)')
await query("UPDATE proposals SET status='sent', sent_at=NOW() WHERE id=:id", { id: proposal.id })
const token = await issueProposalToken(proposal.id)
ok('token resolves', (await findProposalByToken(token))?.id === proposal.id)
ok('still resolves after a read', (await findProposalByToken(token))?.id === proposal.id)
ok('a wrong token resolves to nothing', (await findProposalByToken('nope')) === null)

console.log('\n3. Accept it (the public path)')
const accepted = await acceptProposal(await getProposal(proposal.id), { acceptedBy: 'Dana Cole', source: 'client' })
ok('accepted', accepted.ok, `contract ${accepted.contract?.id}`)
ok('contract carries the signed deposit pct', Number(accepted.contract?.deposit_pct) === 40)
ok('contract total came from the proposal', Number(accepted.contract?.total) === 20000)
ok('link is burned after the decision', (await findProposalByToken(token)) === null)

console.log('\n4. A second accept is refused (double-click / replay)')
const again = await acceptProposal(await getProposal(proposal.id), { source: 'client' })
ok('second accept loses the claim', !again.ok, `status ${again.status}`)
const contracts = await query('SELECT id FROM contracts WHERE proposal_id = :id', { id: proposal.id })
ok('exactly one contract exists', contracts.length === 1, `${contracts.length}`)

console.log('\n5. Sign the contract -> deposit raised against the CONTRACT, no project')
await updateContract(accepted.contract.id, { status: 'signed', signed_at: new Date() })
const client = await getClient(62)
const dep = await issueDepositForContract(await getContract(accepted.contract.id), client)
ok('deposit invoice created', dep.created, `$${dep.amount}`)
ok('amount is 40% of 20000', dep.amount === 8000)
ok('scoped to the contract, not a project', dep.invoice.contract_id == accepted.contract.id && dep.invoice.project_id == null)
const dep2 = await issueDepositForContract(await getContract(accepted.contract.id), client)
ok('issuing twice is idempotent', !dep2.created && dep2.invoice.id === dep.invoice.id)

console.log('\n6. Pay it -> the project is born')
await updateInvoice(dep.invoice.id, { status: 'paid', amount_paid: dep.amount, paid_at: new Date() })
const born = await ensureProjectForContract(await getContract(accepted.contract.id), { invoice: await getInvoice(dep.invoice.id) })
ok('project created', born.created, `#${born.projectId} ${born.project?.code}`)
ok('born in progress', born.project?.status === 'in_progress')
ok('delivery template seeded', (await query('SELECT COUNT(*) n FROM project_milestones WHERE project_id=:p', { p: born.projectId }))[0].n > 0,
  `${(await query('SELECT COUNT(*) n FROM tasks WHERE project_id=:p', { p: born.projectId }))[0].n} tasks`)
ok('invoice back-linked to the project', (await getInvoice(dep.invoice.id)).project_id == born.projectId)
ok('proposal points at what it produced', (await getProposal(proposal.id)).project_id == born.projectId)
ok('project reads the SOW through the link', (await query('SELECT project_fee FROM proposals WHERE id=:i', { i: proposal.id }))[0].project_fee == 20000)

console.log('\n7. Replay the payment -> no second project (the claim)')
const replay = await ensureProjectForContract(await getContract(accepted.contract.id), { invoice: await getInvoice(dep.invoice.id) })
ok('replay creates nothing', !replay.created, `returned project ${replay.projectId}`)
const count = (await query('SELECT COUNT(*) n FROM projects WHERE client_id=62 AND name=:n', { n: proposal.title }))[0].n
ok('exactly one project for this contract', count === 1, `${count}`)

// ---- The no-deposit branch: deposit_pct = 0 means the signature IS the purchase.

console.log('\n8. A proposal with no deposit')
const p2 = await createProposal({
  client_id: CLIENT_ID,
  project_type_id: proposal.project_type_id,
  title: 'Acme Redesign (no-deposit flow test)',
  total: 20000,
  items: [],
  sow: { goals: 'Rebuild the marketing site', project_fee: 20000, deposit_pct: 0, target_launch_date: '2026-12-01' }
})
ok('proposal accepts 0%', p2.deposit_pct === 0, `${p2.code} · ${p2.deposit_pct}%`)

console.log('\n9. Accept it -> the contract snapshots 0, not NULL')
await query("UPDATE proposals SET status='sent', sent_at=NOW() WHERE id=:id", { id: p2.id })
const accepted2 = await acceptProposal(await getProposal(p2.id), { acceptedBy: 'Dana Cole', source: 'client' })
ok('accepted', accepted2.ok, `contract ${accepted2.contract?.id}`)
const c2 = await getContract(accepted2.contract.id)
ok('contract carries 0 (not NULL, which would mean 50)', c2.deposit_pct === 0 && c2.deposit_pct !== null)
ok('hasNoDeposit reads it', hasNoDeposit(c2))

console.log('\n10. The signature guard: an unsigned contract must not start a project')
const early = await onContractSigned(c2, client)
ok('refused while still unsigned', !early.created && early.reason === 'not_signed', `mode ${early.mode}`)
ok('no project exists yet', (await query('SELECT COUNT(*) n FROM projects WHERE client_id=62 AND name=:n', { n: p2.title }))[0].n === 0)

console.log('\n11. Sign it -> the project is born directly, with NO invoice')
await updateContract(c2.id, { status: 'signed', signed_at: new Date() })
const born2 = await onContractSigned(await getContract(c2.id), client)
ok('took the no-deposit branch', born2.mode === 'no_deposit')
ok('project created', born2.created, `#${born2.projectId} ${born2.project?.code}`)
ok('born in progress', born2.project?.status === 'in_progress')
ok('no deposit invoice was raised', (await query('SELECT COUNT(*) n FROM invoices WHERE contract_id=:c', { c: c2.id }))[0].n === 0)
ok('proposal points at what it produced', (await getProposal(p2.id)).project_id == born2.projectId)
ok('delivery template seeded', (await query('SELECT COUNT(*) n FROM project_milestones WHERE project_id=:p', { p: born2.projectId }))[0].n > 0)

console.log('\n12. Replay the signature -> no second project (the same claim)')
const replay2 = await onContractSigned(await getContract(c2.id), client)
ok('replay creates nothing', !replay2.created, `returned project ${replay2.projectId}`)
const count2 = (await query('SELECT COUNT(*) n FROM projects WHERE client_id=62 AND name=:n', { n: p2.title }))[0].n
ok('exactly one project for this contract', count2 === 1, `${count2}`)

console.log('\n13. The final invoice sees the full fee')
// The final-invoice route is inline and Stripe-bound, so assert the inputs it
// reads (through the SOW join) and reproduce its arithmetic.
const proj2 = await getProject(born2.projectId)
ok('project reads 0% through the SOW join', proj2.deposit_pct === 0, `${proj2.deposit_pct}%`)
const balance2 = Math.round((proj2.project_fee - Math.round((proj2.project_fee * proj2.deposit_pct / 100) * 100) / 100) * 100) / 100
ok('balance is the whole fee', balance2 === 20000, `$${balance2}`)

console.log('\ncleanup')
// Captured before the deletes: client_activity and notifications are written by
// the services under test and outlive the rows that caused them, so a run that
// only removed the business rows still left a trail in the client's timeline and
// the alert feed.
const startedAt = runStartedAt
await query('DELETE FROM projects WHERE id IN (:a, :b)', { a: born.projectId, b: born2.projectId })
await query('DELETE FROM invoices WHERE contract_id IN (:a, :b)', { a: accepted.contract.id, b: c2.id })
await query('DELETE FROM contracts WHERE id IN (:a, :b)', { a: accepted.contract.id, b: c2.id })
await query('DELETE FROM proposals WHERE id IN (:a, :b)', { a: proposal.id, b: p2.id })
const trail = await query(
  'DELETE FROM client_activity WHERE client_id = :c AND occurred_at >= :since',
  { c: CLIENT_ID, since: startedAt }
)
const alerts = await query('DELETE FROM notifications WHERE created_at >= :since', { since: startedAt })
console.log(`  removed the test rows (+ ${trail.affectedRows} activity, ${alerts.affectedRows} notification)`)
process.exit(0)
