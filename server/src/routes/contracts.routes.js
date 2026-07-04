import { Router } from 'express'
import {
  createContract, getContract, listContracts, updateContract, deleteContract,
  CONTRACT_STATUSES, CONTRACT_TYPES
} from '../repositories/contracts.repo.js'
import { getContact } from '../repositories/contacts.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocument } from '../services/pandadoc.js'

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
async function createContractDocument(contract, contact, purpose) {
  if (!pandadocEnabled()) return contract
  const template = await getActiveTemplate(purpose)
  if (!template) return contract
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: `${contract.title} — ${contact.company || contact.name}`,
      contact,
      tokens: [
        { name: 'Client.Company', value: contact.company || '' },
        { name: 'Client.Name', value: contact.name || '' }
      ],
      items: contract.items,
      metadata: { fwa_contact_id: String(contact.id), fwa_contract_id: String(contract.id), type: 'contract' }
    })
    if (doc) return await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc contract document creation failed for contract ${contract.id}:`, err.message)
  }
  return contract
}

// GET /api/contracts  ?contact_id=  ?type=  ?status=a,b
contractsRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !CONTRACT_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  if (type && !CONTRACT_TYPES.has(type)) throw badRequest(`Unknown type: ${type}`)
  const result = await listContracts({
    contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
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

// POST /api/contracts — create a standalone contract (e.g. a Website Care Plan).
// Project contracts are NOT created here; they're generated from an accepted
// proposal by the PandaDoc webhook (Model B).
contractsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const contactId = Number(body.contact_id)
  if (!Number.isInteger(contactId) || contactId <= 0) throw badRequest('Validation failed', { contact_id: 'a valid contact_id is required' })
  const contact = await getContact(contactId)
  if (!contact) throw badRequest('Validation failed', { contact_id: 'contact not found' })

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
  let contract = await createContract({ contact_id: contactId, type, title, currency: body.currency, total, billing_interval, start_date, items: rows })
  contract = await createContractDocument(contract, contact, 'care_plan')
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
  res.json({ data: updated })
})

// DELETE /api/contracts/:id
contractsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteContract(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Contract not found' } })
  res.json({ ok: true })
})
