// End-to-end backend proof of the proposal-first flow.
// Run with PANDADOC_API_KEY= RESEND_API_KEY= CLICKUP_API_TOKEN= so nothing leaves the box.
const B = '/Users/kasanfrancis/Projects/fwa/server/src'
const { query } = await import(`${B}/db/pool.js`)
const { createProposal, getProposal } = await import(`${B}/repositories/proposals.repo.js`)
const { issueProposalToken, findProposalByToken } = await import(`${B}/repositories/proposalTokens.repo.js`)
const { acceptProposal } = await import(`${B}/services/proposalAcceptance.js`)
const { issueDepositForContract } = await import(`${B}/services/projectBilling.js`)
const { ensureProjectForContract } = await import(`${B}/services/contractToProject.js`)
const { getContract, updateContract } = await import(`${B}/repositories/contracts.repo.js`)
const { getInvoice, updateInvoice } = await import(`${B}/repositories/invoices.repo.js`)
const { getClient } = await import(`${B}/repositories/clients.repo.js`)

const ok = (label, cond, extra = '') => console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)

console.log('\n1. Create a proposal carrying the SOW')
const proposal = await createProposal({
  client_id: 62,
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

console.log('\ncleanup')
await query('DELETE FROM projects WHERE id = :p', { p: born.projectId })
await query('DELETE FROM invoices WHERE contract_id = :c', { c: accepted.contract.id })
await query('DELETE FROM contracts WHERE id = :c', { c: accepted.contract.id })
await query('DELETE FROM proposals WHERE id = :p', { p: proposal.id })
console.log('  removed the test rows')
process.exit(0)
