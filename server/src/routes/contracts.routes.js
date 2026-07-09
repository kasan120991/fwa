import { Router } from 'express'
import {
  createContract, getContract, listContracts, updateContract, deleteContract,
  CONTRACT_STATUSES, CONTRACT_TYPES
} from '../repositories/contracts.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocument, getDocumentStatus, createDocumentSession } from '../services/pandadoc.js'
import { advanceProject } from '../services/projects.service.js'
import { emitContractChanged } from '../realtime/io.js'

// PandaDoc statuses at which an embedded signing session can be created. NB:
// PandaDoc rejects sessions for `document.draft` — a document must be sent first.
const EMBEDDABLE_STATUSES = new Set([
  'document.sent', 'document.viewed', 'document.completed', 'document.paid'
])

export const contractsRouter = Router()

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

// Best-effort PandaDoc document creation for a standalone contract. Never throws.
async function createContractDocument(contract, client, purpose) {
  if (!pandadocEnabled()) return contract
  const template = await getActiveTemplate(purpose)
  if (!template) return contract
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: `${contract.title} — ${client.company || client.name}`,
      client,
      tokens: [
        { name: 'Client.Company', value: client.company || '' },
        { name: 'Client.Name', value: client.name || '' }
      ],
      items: contract.items,
      metadata: { fwa_client_id: String(client.id), fwa_contract_id: String(contract.id), type: 'contract' }
    })
    if (doc) return await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc contract document creation failed for contract ${contract.id}:`, err.message)
  }
  return contract
}

// GET /api/contracts  ?client_id=  ?project_id=  ?type=  ?status=a,b
contractsRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !CONTRACT_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  if (type && !CONTRACT_TYPES.has(type)) throw badRequest(`Unknown type: ${type}`)
  const result = await listContracts({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    type,
    statuses,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/contracts/:id — includes line items.
contractsRouter.get('/:id', async (req, res) => {
  const contract = await getContract(parseId(req))
  if (!contract) return res.status(404).json({ error: { message: 'Contract not found' } })
  res.json({ data: contract })
})

// GET /api/contracts/:id/session — mint a short-lived embedded PandaDoc session
// for in-app preview/sign. Never hard-fails the viewer: returns { ready:false, reason }
// for the degraded cases so the page can show a local summary / poll / fall back.
//   reason: no_document (PandaDoc off or not created) | processing (not yet draft)
//           | session_error (recipient not on doc, etc. — see message)
// ?recipient= overrides the signer email (defaults to the owner, for countersign;
// the future client portal will pass the client's email).
contractsRouter.get('/:id/session', async (req, res) => {
  const contract = await getContract(parseId(req))
  if (!contract) return res.status(404).json({ error: { message: 'Contract not found' } })
  if (!pandadocEnabled() || !contract.pandadoc_document_id) {
    return res.json({ data: { ready: false, reason: 'no_document' } })
  }

  let status
  try {
    status = await getDocumentStatus(contract.pandadoc_document_id)
  } catch (err) {
    return res.status(502).json({ error: { message: `PandaDoc status check failed: ${err.message}` } })
  }
  // A draft can't be embedded (PandaDoc requires a sent document) — the owner
  // sends it (or previews in PandaDoc) first. Distinguish that from a doc that's
  // still being generated (uploaded), which the page polls on.
  if (status === 'document.draft') {
    return res.json({ data: { ready: false, reason: 'draft', status } })
  }
  if (!EMBEDDABLE_STATUSES.has(status)) {
    return res.json({ data: { ready: false, reason: 'processing', status } })
  }

  const recipient = (typeof req.query.recipient === 'string' && req.query.recipient) || req.user.email
  try {
    const session = await createDocumentSession(contract.pandadoc_document_id, { recipient })
    if (!session) return res.json({ data: { ready: false, reason: 'no_document' } })
    return res.json({
      data: { ready: true, embedUrl: `https://app.pandadoc.com/s/${session.id}/`, expiresAt: session.expiresAt, status }
    })
  } catch (err) {
    // Most commonly the recipient isn't on the document (owner signer role not on
    // the template). Degrade to preview rather than break the page.
    console.error(`PandaDoc session failed for contract ${contract.id} (recipient ${recipient}):`, err.message)
    return res.json({ data: { ready: false, reason: 'session_error', status, message: err.message } })
  }
})

// POST /api/contracts — create a standalone contract (e.g. a Website Care Plan).
// Project contracts are NOT created here; they're generated from an accepted
// proposal by the PandaDoc webhook (Model B).
contractsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const clientId = Number(body.client_id)
  if (!Number.isInteger(clientId) || clientId <= 0) throw badRequest('Validation failed', { client_id: 'a valid client_id is required' })
  const client = await getClient(clientId)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })

  const type = body.type ?? 'care_plan'
  if (type !== 'care_plan') throw badRequest('Validation failed', { type: 'only care_plan contracts can be created directly; project contracts come from an accepted proposal' })
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Website Care Plan'
  const billing_interval = body.billing_interval ?? 'monthly'
  if (billing_interval !== 'one_time' && billing_interval !== 'monthly') throw badRequest('Validation failed', { billing_interval: 'must be one_time or monthly' })

  let start_date = null
  if (body.start_date != null) {
    if (typeof body.start_date !== 'string' || Number.isNaN(Date.parse(body.start_date))) throw badRequest('Validation failed', { start_date: 'must be a valid date string' })
    start_date = body.start_date
  }

  const { rows, total } = await resolveLineItems(body.items)
  let contract = await createContract({ client_id: clientId, type, title, currency: body.currency, total, billing_interval, start_date, items: rows })
  contract = await createContractDocument(contract, client, 'care_plan')
  res.status(201).json({ data: contract })
})

// POST /api/contracts/:id/send — mark sent (and dispatch via PandaDoc if configured).
contractsRouter.post('/:id/send', async (req, res) => {
  const id = parseId(req)
  const contract = await getContract(id)
  if (!contract) return res.status(404).json({ error: { message: 'Contract not found' } })
  if (contract.status !== 'draft') return res.status(409).json({ error: { message: `Contract is already ${contract.status}` } })

  if (pandadocEnabled() && contract.pandadoc_document_id) {
    try {
      await sendDocument(contract.pandadoc_document_id, { message: req.body?.message })
    } catch (err) {
      return res.status(502).json({ error: { message: `PandaDoc send failed: ${err.message}` } })
    }
  }
  const updated = await updateContract(id, { status: 'sent', sent_at: new Date() })
  emitContractChanged(id)
  // Sending a project contract moves its project to "awaiting signature".
  if (contract.type === 'project' && contract.project_id) await advanceProject(contract.project_id, 'awaiting_signature')
  res.json({ data: updated })
})

// POST /api/contracts/:id/void — mark a contract voided (best-effort PandaDoc void).
contractsRouter.post('/:id/void', async (req, res) => {
  const id = parseId(req)
  const contract = await getContract(id)
  if (!contract) return res.status(404).json({ error: { message: 'Contract not found' } })
  if (contract.status === 'signed') return res.status(409).json({ error: { message: 'A signed contract cannot be voided' } })
  const updated = await updateContract(id, { status: 'voided' })
  emitContractChanged(id)
  res.json({ data: updated })
})

// DELETE /api/contracts/:id
contractsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteContract(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Contract not found' } })
  res.json({ ok: true })
})
