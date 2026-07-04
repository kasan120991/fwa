import { Router } from 'express'
import {
  createProposal, getProposal, listProposals, updateProposal, deleteProposal,
  PROPOSAL_STATUSES
} from '../repositories/proposals.repo.js'
import { getContact, updateContact } from '../repositories/contacts.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocument } from '../services/pandadoc.js'

export const proposalsRouter = Router()

// Lead stages a contact can be bumped up from when a proposal is created. We
// never downgrade a client (active/past) or move someone already at proposal.
const PRE_PROPOSAL_STAGES = new Set(['new', 'qualifying', 'to_contact', 'contacted', 'engaged', 'qualified'])

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}
const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)

// Best-effort: create the PandaDoc document for a proposal and persist its ids.
// Never throws — a PandaDoc hiccup must not fail the local write (mirrors the
// Stripe sync pattern). No-ops when PandaDoc is disabled or no template exists.
async function createProposalDocument(proposal, contact) {
  if (!pandadocEnabled()) return proposal
  const template = await getActiveTemplate('proposal')
  if (!template) return proposal
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: `${proposal.title} — ${contact.company || contact.name}`,
      contact,
      tokens: [
        { name: 'Client.Company', value: contact.company || '' },
        { name: 'Client.Name', value: contact.name || '' },
        { name: 'Proposal.Total', value: String(proposal.total) }
      ],
      items: proposal.items,
      metadata: { fwa_contact_id: String(contact.id), fwa_proposal_id: String(proposal.id), type: 'proposal' }
    })
    if (doc) return await updateProposal(proposal.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc proposal document creation failed for proposal ${proposal.id}:`, err.message)
  }
  return proposal
}

// GET /api/proposals  ?contact_id=  ?status=a,b  ?limit=  ?offset=
proposalsRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !PROPOSAL_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const result = await listProposals({
    contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
    statuses,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/proposals/:id — includes line items.
proposalsRouter.get('/:id', async (req, res) => {
  const proposal = await getProposal(parseId(req))
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  res.json({ data: proposal })
})

// POST /api/proposals — snapshot line items, compute total, create the proposal,
// bump the contact into the proposal stage, and (best-effort) build the PandaDoc doc.
proposalsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const contactId = Number(body.contact_id)
  if (!Number.isInteger(contactId) || contactId <= 0) throw badRequest('Validation failed', { contact_id: 'a valid contact_id is required' })
  const contact = await getContact(contactId)
  if (!contact) throw badRequest('Validation failed', { contact_id: 'contact not found' })
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) throw badRequest('Validation failed', { title: 'a title is required' })

  const { rows, total } = await resolveLineItems(body.items)
  let proposal = await createProposal({ contact_id: contactId, title, currency: body.currency, total, items: rows })

  // A proposal existing means the contact is in the proposal stage.
  if (PRE_PROPOSAL_STAGES.has(contact.stage)) await updateContact(contactId, { stage: 'proposal' })

  proposal = await createProposalDocument(proposal, contact)
  res.status(201).json({ data: proposal })
})

// POST /api/proposals/:id/send — mark sent (and dispatch via PandaDoc if configured).
proposalsRouter.post('/:id/send', async (req, res) => {
  const id = parseId(req)
  const proposal = await getProposal(id)
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  if (proposal.status !== 'draft') return res.status(409).json({ error: { message: `Proposal is already ${proposal.status}` } })

  if (pandadocEnabled() && proposal.pandadoc_document_id) {
    try {
      await sendDocument(proposal.pandadoc_document_id, { message: req.body?.message })
    } catch (err) {
      return res.status(502).json({ error: { message: `PandaDoc send failed: ${err.message}` } })
    }
  }
  const updated = await updateProposal(id, { status: 'sent', sent_at: new Date() })
  res.json({ data: updated })
})

// DELETE /api/proposals/:id
proposalsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteProposal(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Proposal not found' } })
  res.json({ ok: true })
})
