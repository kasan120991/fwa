import { createProjectForContract, getProject } from '../repositories/projects.repo.js'
import { getContract } from '../repositories/contracts.repo.js'
import { getProposal, updateProposal } from '../repositories/proposals.repo.js'
import { updateInvoice } from '../repositories/invoices.repo.js'
import { emitProjectCreated } from '../realtime/io.js'
import { notify } from './notifications.service.js'
import { logClientActivity } from './clientActivity.service.js'
import { provisionLater } from './projectProvision.js'

// The paid deposit becomes a project.
//
// This is the last link in the chain: proposal -> accepted -> contract ->
// signed -> deposit invoice -> PAID -> project. Work only exists once it's been
// bought, and the scope it delivers is the one on the proposal the client
// accepted.
//
// Reached from the Stripe `invoice.paid` webhook AND from the manual mark-paid
// route, because a deposit settled by cash or bank transfer has to start a
// project just the same.

/**
 * Ensure the project for a paid contract exists.
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
    meta: 'Deposit paid',
    link: `/projects/${projectId}`
  })
  try {
    await notify({
      category: 'project', tone: 'success', icon: 'i-lucide-rocket',
      title: 'Project started',
      body: `${project?.code ?? `Project ${projectId}`} — deposit paid, delivery plan seeded.`,
      link: `/projects/${projectId}`
    }, actorUserId)
  } catch (err) {
    console.error(`Project-started notification failed for ${projectId}:`, err.message)
  }
  return { created: true, projectId, project }
}

/** A paid contract that can't become a project needs a human, not a log line. */
async function report(contract, what) {
  try {
    await notify({
      category: 'contract', tone: 'error', icon: 'i-lucide-triangle-alert',
      title: 'Paid contract has no project',
      body: `${contract.title} ${what}.`,
      link: `/contracts/${contract.id}`
    })
  } catch (err) {
    console.error(`Reporting failed project birth for contract ${contract.id}:`, err.message)
  }
}
