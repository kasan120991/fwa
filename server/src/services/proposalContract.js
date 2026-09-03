import {
  generateContractFromProposal, getContractByProposalId, updateContract
} from '../repositories/contracts.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getProjectType } from '../repositories/projectTypes.repo.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocumentWhenReady } from './pandadoc.js'
import { buildTokens, resolveContractTemplate } from './projectContract.js'
import { emitContractChanged, emitClientAgreementChanged } from '../realtime/io.js'
import { notify } from './notifications.service.js'

// An accepted proposal becomes a contract. This is the live path — the SOW is
// on the proposal, so the proposal is what fills the agreement's tokens.
//
// It replaces an inline version that lived in webhooks.routes.js and was
// quietly broken in two ways: it pushed a pricing table into a template with no
// data-merge pricing block (a PandaDoc 400, swallowed by a catch, leaving a
// draft contract with no document), and it passed NO tokens at all, so every
// bracketed placeholder in the agreement body rendered empty.

/**
 * Ensure the contract for an accepted proposal exists, and send it for
 * signature. Idempotent: `getContractByProposalId` short-circuits a second call,
 * which is what makes a re-delivered webhook or a double-clicked Accept safe.
 *
 * Never throws — the proposal is already accepted by the time we get here, and
 * a PandaDoc outage must not undo that. Failures are reported rather than
 * raised, because an accepted proposal with no contract is a state a human has
 * to know about; it used to be a swallowed console line.
 */
export async function ensureContractForProposal(proposal) {
  const existing = await getContractByProposalId(proposal.id)
  if (existing) return { contract: existing, created: false }

  const contract = await generateContractFromProposal(proposal, { type: 'project' })
  emitContractChanged(contract.id)
  emitClientAgreementChanged(proposal.client_id, contract.id)

  if (!pandadocEnabled()) return { contract, created: true, document: false }

  try {
    const client = await getClient(proposal.client_id)
    if (!client) throw new Error(`client ${proposal.client_id} not found`)

    // Honour the project type's pinned template. The old inline version asked
    // only for the generic active one, so a proposal scoped as a type with its
    // own agreement silently got the wrong paper.
    const type = proposal.project_type_id ? await getProjectType(proposal.project_type_id) : null
    const template = await resolveContractTemplate(type?.contract_template_id)
    if (!template) throw new Error('no active project_contract template')

    // No countersigner. The project path takes one from the generate-contract
    // modal, but acceptance is unattended — there's nobody to ask, and
    // createDocumentFromTemplate only appends an owner when it has an email.
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: contract.title,
      client,
      tokens: buildTokens(proposal, client),
      // No pricing table: this template conveys money through tokens and its
      // own static payment schedule, and pushing `items` at it is a 400.
      items: [],
      metadata: {
        fwa_client_id: String(client.id),
        fwa_proposal_id: String(proposal.id),
        fwa_contract_id: String(contract.id),
        type: 'contract'
      }
    })
    if (!doc) return { contract, created: true, document: false }

    let updated = await updateContract(contract.id, {
      pandadoc_document_id: doc.id,
      pandadoc_template_id: template.template_uuid,
      pandadoc_status: doc.status
    })
    try {
      // Waits out PandaDoc's async processing — a send fired the instant the
      // document is created 409s, which used to leave every auto-generated
      // contract sitting in draft with nothing to tell the client.
      const sent = await sendDocumentWhenReady(doc.id, { message: 'Your agreement is ready to sign.' })
      updated = await updateContract(contract.id, {
        status: 'sent', sent_at: new Date(), pandadoc_status: sent?.status ?? 'document.sent'
      })
    } catch (err) {
      // The document exists but didn't go out — recoverable by hand from the
      // contract page, so don't fail the acceptance over it.
      console.error(`PandaDoc send failed for contract ${contract.id}:`, err.message)
    }
    emitContractChanged(contract.id)
    return { contract: updated, created: true, document: true }
  } catch (err) {
    console.error(`Contract document creation failed for proposal ${proposal.id}:`, err.message)
    // Loud on purpose. The client has accepted and is waiting to sign something
    // that does not exist; a console line alone would let that sit for days.
    await notify({
      category: 'contract',
      tone: 'error',
      icon: 'i-lucide-triangle-alert',
      title: 'Contract document failed',
      body: `${proposal.title} was accepted but its agreement couldn't be created — ${err.message}`,
      link: `/contracts/${contract.id}`
    }).catch(() => {})
    return { contract, created: true, document: false, error: err.message }
  }
}
