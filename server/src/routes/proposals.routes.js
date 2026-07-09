import { Router } from 'express'
import {
  createProposal, getProposal, listProposals, updateProposal, deleteProposal,
  PROPOSAL_STATUSES
} from '../repositories/proposals.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocument } from '../services/pandadoc.js'

export const proposalsRouter = Router()

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
async function createProposalDocument(proposal, client) {
  if (!pandadocEnabled()) return proposal
  const template = await getActiveTemplate('proposal')
  if (!template) return proposal
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: `${proposal.title} — ${client.company || client.name}`,
      client,
      tokens: [
        { name: 'Client.Company', value: client.company || '' },
        { name: 'Client.Name', value: client.name || '' },
        { name: 'Proposal.Total', value: String(proposal.total) }
      ],
      items: proposal.items,
      metadata: { fwa_client_id: String(client.id), fwa_proposal_id: String(proposal.id), type: 'proposal' }
    })
    if (doc) return await updateProposal(proposal.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc proposal document creation failed for proposal ${proposal.id}:`, err.message)
  }
  return proposal
}

// GET /api/proposals  ?client_id=  ?project_id=  ?status=a,b  ?limit=  ?offset=
proposalsRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !PROPOSAL_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const result = await listProposals({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
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
// and (best-effort) build the PandaDoc doc. Proposals are client-only, so a
// valid client must already exist (convert the lead first).
proposalsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const clientId = Number(body.client_id)
  if (!Number.isInteger(clientId) || clientId <= 0) throw badRequest('Validation failed', { client_id: 'a valid client_id is required' })
  const client = await getClient(clientId)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) throw badRequest('Validation failed', { title: 'a title is required' })

  const { rows, total } = await resolveLineItems(body.items)
  let proposal = await createProposal({ client_id: clientId, title, currency: body.currency, total, items: rows })

  proposal = await createProposalDocument(proposal, client)
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
