import { claimProposalStatus, getProposal } from '../repositories/proposals.repo.js'
import { consumeProposalTokens } from '../repositories/proposalTokens.repo.js'
import { ensureContractForProposal } from './proposalContract.js'
import { notify, clientNotify } from './notifications.service.js'
import { logClientActivity } from './clientActivity.service.js'
import { emitProposalChanged, emitClientAgreementChanged } from '../realtime/io.js'

// Accepting or declining a proposal, from wherever it comes: the client on the
// public link, or you pressing Mark Accepted because they said yes on a call.
//
// ONE path on purpose. Acceptance generates a contract, sends a document and
// starts the money — three separate implementations of that would drift within
// a month, and the phone case is the one most likely to be bolted on badly.
// `source` records which it was, because "they said yes on the phone" is
// legally and operationally different from a click, and should be auditable
// rather than inferred.

// A decision can only be made from a live state. Anything else is a replay.
const DECIDABLE = ['sent', 'viewed']

/**
 * Accept a proposal and generate its contract.
 *
 * The status claim comes FIRST and everything expensive hangs off it. A hundred
 * concurrent POSTs on one valid link all read status='sent'; the conditional
 * UPDATE inside claimProposalStatus serializes them to exactly one winner. Doing
 * the PandaDoc work first — or guarding with a read-then-write — would let two
 * callers past and produce two contracts.
 *
 * Returns { ok: false, status } when the claim loses, which callers should
 * report as the already-decided outcome rather than an error.
 */
export async function acceptProposal(proposal, { acceptedBy = null, actorUserId = null, source = 'client' } = {}) {
  const claimed = await claimProposalStatus(proposal.id, 'accepted', DECIDABLE, {
    accept_source: source,
    accepted_by: acceptedBy ? String(acceptedBy).trim().slice(0, 200) : null
  })
  if (!claimed) {
    const current = await getProposal(proposal.id)
    return { ok: false, status: current?.status ?? null, proposal: current }
  }

  // Burn any outstanding links: the decision is made, and the page must stop
  // rendering the pricing to anyone still holding a URL.
  await consumeProposalTokens(proposal.id).catch(err =>
    console.error(`Consuming proposal tokens for ${proposal.id} failed:`, err.message))

  const fresh = await getProposal(proposal.id)
  emitProposalChanged(fresh.id)
  emitClientAgreementChanged(fresh.client_id, fresh.id)

  await logClientActivity(fresh.client_id, {
    category: 'agreement',
    icon: 'i-lucide-file-check',
    title: `Proposal accepted — ${fresh.title}`,
    meta: source === 'admin' ? 'Accepted on their behalf' : null,
    link: '/agreements'
  })
  try {
    await notify({
      category: 'proposal',
      tone: 'success',
      icon: 'i-lucide-file-check',
      title: 'Proposal accepted',
      body: `${fresh.title} was accepted${source === 'admin' ? ' (recorded by you)' : ''}. Generating the agreement.`,
      link: `/proposals/${fresh.id}`
    }, actorUserId)
  } catch (err) {
    console.error(`Proposal accepted notification failed for ${fresh.id}:`, err.message)
  }
  try {
    await clientNotify(fresh.client_id, {
      category: 'proposal',
      tone: 'success',
      icon: 'i-lucide-file-check',
      title: 'Proposal accepted',
      body: `Thanks — we're preparing your agreement to sign.`,
      link: '/agreements'
    })
  } catch (err) {
    console.error(`Proposal accepted client notification failed for ${fresh.id}:`, err.message)
  }

  const result = await ensureContractForProposal(fresh)
  return { ok: true, proposal: fresh, ...result }
}

/** Decline a proposal. Same claim, same bundle, no contract. */
export async function declineProposal(proposal, { reason = null, actorUserId = null, source = 'client' } = {}) {
  const claimed = await claimProposalStatus(proposal.id, 'declined', DECIDABLE, { accept_source: source })
  if (!claimed) {
    const current = await getProposal(proposal.id)
    return { ok: false, status: current?.status ?? null, proposal: current }
  }

  await consumeProposalTokens(proposal.id).catch(err =>
    console.error(`Consuming proposal tokens for ${proposal.id} failed:`, err.message))

  const fresh = await getProposal(proposal.id)
  emitProposalChanged(fresh.id)
  emitClientAgreementChanged(fresh.client_id, fresh.id)

  const trimmed = reason ? String(reason).trim().slice(0, 500) : null
  await logClientActivity(fresh.client_id, {
    category: 'agreement',
    icon: 'i-lucide-file-x',
    title: `Proposal declined — ${fresh.title}`,
    meta: trimmed,
    link: '/agreements'
  })
  try {
    await notify({
      category: 'proposal',
      tone: 'warning',
      icon: 'i-lucide-file-x',
      title: 'Proposal declined',
      body: trimmed ? `${fresh.title} — “${trimmed}”` : `${fresh.title} was declined.`,
      link: `/proposals/${fresh.id}`
    }, actorUserId)
  } catch (err) {
    console.error(`Proposal declined notification failed for ${fresh.id}:`, err.message)
  }
  return { ok: true, proposal: fresh }
}
