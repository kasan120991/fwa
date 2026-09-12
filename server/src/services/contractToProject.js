import { createProjectForContract, getProject } from '../repositories/projects.repo.js'
import { getContract } from '../repositories/contracts.repo.js'
import { getProposal, updateProposal } from '../repositories/proposals.repo.js'
import { updateInvoice } from '../repositories/invoices.repo.js'
import { emitProjectCreated } from '../realtime/io.js'
import { notify } from './notifications.service.js'
import { logClientActivity } from './clientActivity.service.js'
import { provisionLater } from './projectProvision.js'
import { issueDepositForContract } from './projectBilling.js'

// The paid deposit — or, for a no-deposit contract, the signature itself —
// becomes a project.
//
// This is the last link in the chain: proposal -> accepted -> contract ->
// signed -> deposit invoice -> PAID -> project. Work only exists once it's been
// bought, and the scope it delivers is the one on the proposal the client
// accepted. A contract with deposit_pct = 0 has nothing to wait for, so its
// signature is the purchase and the project is born right there.
//
// Reached from the Stripe `invoice.paid` webhook AND from the manual mark-paid
// route, because a deposit settled by cash or bank transfer has to start a
// project just the same — and from `onContractSigned` for 0% contracts.

/**
 * The contract's deposit percentage as a number. NULL is legacy and means 50;
 * 0 is exact and means "no deposit". `contracts.deposit_pct` is a DECIMAL and
 * can arrive as a string, hence the Number().
 */
export function contractDepositPct(contract) {
  return Number(contract?.deposit_pct ?? 50)
}
export const hasNoDeposit = contract => contractDepositPct(contract) === 0

/**
 * What a signature sets in motion. Deposit contracts raise the deposit invoice
 * and wait for it to be paid; no-deposit contracts have nothing to wait for,
 * so the project is born here.
 *
 * Re-reads the contract and refuses unless it is actually `signed` — the
 * webhook hands us the pre-update row, and this is the one place a project can
 * be created without money changing hands, so it must not trust its caller.
 * Never throws (neither branch does).
 */
export async function onContractSigned(contract, client, { actorUserId = null } = {}) {
  const fresh = contract?.id ? await getContract(contract.id) : null
  if (!fresh || fresh.status !== 'signed') return { mode: null, created: false, reason: 'not_signed' }
  if (!hasNoDeposit(fresh)) {
    return { mode: 'deposit', ...(await issueDepositForContract(fresh, client, { actorUserId })) }
  }
  return { mode: 'no_deposit', ...(await ensureProjectForContract(fresh, { invoice: null, actorUserId })) }
}

/**
 * Ensure the project for a paid — or signed no-deposit — contract exists.
 *
 * Idempotent, and it has to be: Stripe retries `invoice.paid`, and the webhook
 * handler returns 500 on error specifically so it will. The guard is the
 * conditional claim inside createProjectForContract's transaction — not the
 * fast path below, which is only an optimisation.
 *
 * Never throws. Every failure here is one a retry cannot fix (a deleted
 * proposal, a broken template), so raising would turn it into three days of
 * Stripe redelivery against an unsatisfiable condition while the client, who
 * has paid, waits. Report and return instead.
 */
export async function ensureProjectForContract(contract, { invoice = null, actorUserId = null } = {}) {
  if (!contract) return { created: false, reason: 'no_contract' }

  let projectId = contract.project_id ?? null
  let created = false

  if (!projectId) {
    const proposal = contract.proposal_id ? await getProposal(contract.proposal_id) : null
    if (!proposal) {
      // contracts.proposal_id is ON DELETE SET NULL, so this can be permanent.
      await report(contract, 'has no proposal, so there is no scope to build a project from')
      return { created: false, reason: 'no_proposal' }
    }
    try {
      const project = await createProjectForContract({
        client_id: contract.client_id,
        project_type_id: proposal.project_type_id,
        name: proposal.title,
        // Born in flight. It has been scoped, signed and paid for — the
        // planning/awaiting_signature/awaiting_deposit run-up all happened on
        // the sales side, and advanceProject is forward-only so it could never
        // climb out of an earlier state anyway.
        status: 'in_progress'
      }, contract.id)
      projectId = project.id
      created = true
      // Point the proposal at what it produced. This is the link the project
      // reads its Statement of Work back through.
      await updateProposal(proposal.id, { project_id: project.id })
    } catch (err) {
      if (err.code === 'CONTRACT_ALREADY_CLAIMED') {
        // Another delivery won. That's success, not failure — fall through to
        // the repair steps against whatever it created.
        projectId = (await getContract(contract.id))?.project_id ?? null
      } else {
        console.error(`Project creation failed for contract ${contract.id}:`, err.message)
        await report(contract, `couldn't be turned into a project — ${err.message}`)
        return { created: false, reason: 'create_failed', error: err.message }
      }
    }
  }
  if (!projectId) return { created: false, reason: 'unclaimed' }

  // --- Repair steps: deliberately NOT gated on `created` ---------------------
  // If the transaction committed and the process then died, a retry takes the
  // fast path above and would skip everything below — leaving a paid project
  // with no ClickUp tree, forever. Running these every time makes a retry
  // self-healing rather than self-hiding. Both are idempotent.
  if (invoice?.id && !invoice.project_id) {
    await updateInvoice(invoice.id, { project_id: projectId }).catch(err =>
      console.error(`Back-linking invoice ${invoice.id} to project ${projectId} failed:`, err.message))
  }
  provisionLater(projectId)

  if (!created) return { created: false, projectId }

  const project = await getProject(projectId)
  if (project) emitProjectCreated(project)
  await logClientActivity(contract.client_id, {
    category: 'project',
    icon: 'i-lucide-folder-plus',
    title: `Project “${project?.name ?? projectId}” started`,
    meta: invoice ? 'Deposit paid' : 'Contract signed — no deposit',
    link: `/projects/${projectId}`
  })
  try {
    await notify({
      category: 'project', tone: 'success', icon: 'i-lucide-rocket',
      title: 'Project started',
      body: `${project?.code ?? `Project ${projectId}`} — ${invoice ? 'deposit paid' : 'signed, no deposit'}, delivery plan seeded.`,
      link: `/projects/${projectId}`
    }, actorUserId)
  } catch (err) {
    console.error(`Project-started notification failed for ${projectId}:`, err.message)
  }
  return { created: true, projectId, project }
}

/** A signed contract that can't become a project needs a human, not a log line. */
async function report(contract, what) {
  try {
    await notify({
      category: 'contract', tone: 'error', icon: 'i-lucide-triangle-alert',
      title: 'Signed contract has no project',
      body: `${contract.title} ${what}.`,
      link: `/contracts/${contract.id}`
    })
  } catch (err) {
    console.error(`Reporting failed project birth for contract ${contract.id}:`, err.message)
  }
}
