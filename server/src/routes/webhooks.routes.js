import { Router } from 'express'
import { constructWebhookEvent, createStripeCustomer } from '../services/stripe.js'
import { verifyWebhookSignature, pandadocEnabled, createDocumentFromTemplate, sendDocument } from '../services/pandadoc.js'
import { getContact, getContactByStripeCustomerId, updateContact } from '../repositories/contacts.repo.js'
import { getProposalByDocumentId, updateProposal } from '../repositories/proposals.repo.js'
import {
  getContractByDocumentId, getContractByProposalId, generateContractFromProposal, updateContract
} from '../repositories/contracts.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'

export const webhooksRouter = Router()

// POST /api/webhooks/stripe — receives Stripe events. Authenticated by signature
// (not the session cookie), so it's mounted outside requireAuth. Needs the raw
// request body, which app.js parses as a Buffer for this path before JSON.
webhooksRouter.post('/stripe', async (req, res) => {
  let event
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature'])
  } catch (err) {
    return res.status(400).json({ error: { message: `Webhook signature verification failed: ${err.message}` } })
  }

  try {
    switch (event.type) {
      case 'customer.deleted': {
        // A customer removed in Stripe should no longer be referenced here; clear
        // the link so a future active-transition creates a fresh one.
        const customerId = event.data.object.id
        const contact = await getContactByStripeCustomerId(customerId)
        if (contact) {
          await updateContact(contact.id, { stripe_customer_id: null })
          console.log(`Stripe customer ${customerId} deleted — unlinked from contact ${contact.id}`)
        }
        break
      }
      default:
        // Acknowledge everything else; handlers get added as billing lands.
        break
    }
  } catch (err) {
    // 500 so Stripe retries a transient failure (e.g. DB blip).
    console.error(`Error handling Stripe webhook ${event.type}:`, err.message)
    return res.status(500).json({ error: { message: 'Webhook handler error' } })
  }

  res.json({ received: true })
})

// ---------------------------------------------------------------------------
// PandaDoc — document lifecycle. Drives the sales-paperwork state machine:
// proposal accepted -> generate the project contract; project contract signed
// -> the contact is "won" (stage active) and a project is created.
// ---------------------------------------------------------------------------

// Raw PandaDoc status -> internal status, by record kind.
const STATUS_MAP = {
  'document.sent': { proposal: 'sent', contract: 'sent' },
  'document.viewed': { proposal: 'viewed', contract: 'viewed' },
  'document.completed': { proposal: 'accepted', contract: 'signed' },
  'document.declined': { proposal: 'declined', contract: 'declined' },
  'document.expired': { proposal: 'expired', contract: 'expired' },
  'document.voided': { proposal: 'voided', contract: 'voided' }
}
// Which lifecycle timestamp a given internal status stamps.
const STATUS_STAMP = {
  sent: 'sent_at', viewed: 'viewed_at', accepted: 'accepted_at', signed: 'signed_at', declined: 'declined_at'
}

// Generate the project contract from an accepted proposal (Model B). Idempotent:
// if a contract already exists for the proposal, returns it untouched. The
// PandaDoc document creation/send is best-effort and never blocks the DB write.
async function generateProjectContract(proposal) {
  const existing = await getContractByProposalId(proposal.id)
  if (existing) return existing
  let contract = await generateContractFromProposal(proposal, { type: 'project' })
  console.log(`Proposal ${proposal.id} accepted -> generated project contract ${contract.id}`)

  if (pandadocEnabled()) {
    try {
      const contact = await getContact(proposal.contact_id)
      const template = await getActiveTemplate('project_contract')
      if (contact && template) {
        const doc = await createDocumentFromTemplate({
          templateUuid: template.template_uuid,
          name: `${contract.title} — ${contact.company || contact.name}`,
          contact,
          items: contract.items,
          metadata: { fwa_contact_id: String(contact.id), fwa_contract_id: String(contract.id), type: 'contract' }
        })
        if (doc) {
          contract = await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
          await sendDocument(doc.id)
          contract = await updateContract(contract.id, { status: 'sent', sent_at: new Date() })
        }
      }
    } catch (err) {
      console.error(`PandaDoc contract dispatch failed for proposal ${proposal.id}:`, err.message)
    }
  }
  return contract
}

// A signed project contract is the "won" event: flip the contact to active and
// create the project. Idempotent — a contact already active is left as-is.
async function markContactWon(contract) {
  const contact = await getContact(contract.contact_id)
  if (!contact || contact.stage === 'active') return
  const patch = { stage: 'active' }
  if (!contact.client_since) patch.client_since = new Date().toISOString().slice(0, 10)
  let updated = await updateContact(contact.id, patch)
  console.log(`Contract ${contract.id} signed -> contact ${contact.id} won (stage=active)`)

  // Becoming an active client provisions a Stripe customer (best-effort, mirrors
  // the contacts route). Skipped if one already exists or Stripe is disabled.
  if (!updated.stripe_customer_id) {
    try {
      const customerId = await createStripeCustomer(updated)
      if (customerId) updated = await updateContact(updated.id, { stripe_customer_id: customerId })
    } catch (err) {
      console.error(`Stripe customer creation failed for contact ${updated.id}:`, err.message)
    }
  }

  // Project-creation trigger — the projects layer keys off this. Built later.
  console.log(`TODO: create project for contact ${updated.id} from contract ${contract.id}`)
}

// Apply a single document event to its proposal or contract.
async function handleDocumentEvent(doc) {
  const raw = doc.status
  const mapped = STATUS_MAP[raw]

  const proposal = await getProposalByDocumentId(doc.id)
  if (proposal) {
    const internal = mapped?.proposal
    const patch = { pandadoc_status: raw, last_webhook_at: new Date() }
    if (internal) {
      patch.status = internal
      if (STATUS_STAMP[internal]) patch[STATUS_STAMP[internal]] = new Date()
    }
    await updateProposal(proposal.id, patch)
    if (internal === 'accepted') await generateProjectContract(proposal)
    return
  }

  const contract = await getContractByDocumentId(doc.id)
  if (contract) {
    const internal = mapped?.contract
    const patch = { pandadoc_status: raw, last_webhook_at: new Date() }
    if (internal) {
      patch.status = internal
      if (STATUS_STAMP[internal]) patch[STATUS_STAMP[internal]] = new Date()
    }
    await updateContract(contract.id, patch)
    if (internal === 'signed' && contract.type === 'project') await markContactWon(contract)
    return
  }

  console.warn(`PandaDoc webhook: no proposal/contract for document ${doc.id}`)
}

// POST /api/webhooks/pandadoc — document lifecycle events. Authenticated by an
// HMAC signature over the raw body (?signature=), not the session cookie, so
// it's mounted outside requireAuth. app.js parses the raw body for this path.
webhooksRouter.post('/pandadoc', async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.query.signature)) {
    return res.status(400).json({ error: { message: 'PandaDoc webhook signature verification failed' } })
  }

  let events
  try {
    events = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body)
  } catch {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } })
  }
  if (!Array.isArray(events)) events = [events]

  try {
    for (const evt of events) {
      // PandaDoc sends document_state_changed for status transitions.
      if (evt?.event && evt.event !== 'document_state_changed' && evt.event !== 'document_updated') continue
      const doc = evt?.data
      if (doc?.id && doc?.status) await handleDocumentEvent(doc)
    }
  } catch (err) {
    // 500 so PandaDoc retries a transient failure. Handlers are idempotent.
    console.error('Error handling PandaDoc webhook:', err.message)
    return res.status(500).json({ error: { message: 'Webhook handler error' } })
  }

  res.json({ received: true })
})
