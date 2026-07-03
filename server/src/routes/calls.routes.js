import { Router } from 'express'
import { listCalls, getCall, updateCall, CLASSIFICATIONS } from '../repositories/calls.repo.js'
import { createContact } from '../repositories/contacts.repo.js'

export const callsRouter = Router()

// Receptionist tab "Other" groups the non-lead/non-client classifications.
const OTHER = ['spam', 'wrong_number', 'other']

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

// GET /api/calls — list. ?group=inquiry|client|other  ?classification=a,b  ?q=
callsRouter.get('/', async (req, res) => {
  const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)
  let classifications = csv(req.query.classification)
  if (!classifications && typeof req.query.group === 'string' && req.query.group !== 'all') {
    classifications = req.query.group === 'other' ? OTHER : [req.query.group]
  }
  const bad = classifications?.find(c => !CLASSIFICATIONS.has(c))
  if (bad) throw badRequest(`Unknown classification: ${bad}`)

  const result = await listCalls({
    classifications,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/calls/:id
callsRouter.get('/:id', async (req, res) => {
  const call = await getCall(parseId(req))
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } })
  res.json({ data: call })
})

// PATCH /api/calls/:id — reclassify and/or mark reviewed.
callsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getCall(id)) return res.status(404).json({ error: { message: 'Call not found' } })

  const data = {}
  if (req.body?.classification !== undefined) {
    if (!CLASSIFICATIONS.has(req.body.classification)) throw badRequest('Validation failed', { classification: `must be one of ${[...CLASSIFICATIONS].join(', ')}` })
    data.classification = req.body.classification
  }
  if (req.body?.reviewed !== undefined) {
    if (typeof req.body.reviewed !== 'boolean') throw badRequest('Validation failed', { reviewed: 'must be a boolean' })
    data.reviewed = req.body.reviewed
  }
  const call = await updateCall(id, data)
  res.json({ data: call })
})

// POST /api/calls/:id/convert — create a lead contact from an inquiry call and link it.
// Per CLAUDE.md: source=call, stage=new; appears in Leads → Inbound.
callsRouter.post('/:id/convert', async (req, res) => {
  const id = parseId(req)
  const call = await getCall(id)
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } })
  if (call.contact_id) return res.status(409).json({ error: { message: 'Call is already linked to a contact' } })
  if (call.classification !== 'inquiry') {
    return res.status(400).json({ error: { message: 'Only inquiry calls can be converted to a lead' } })
  }

  const business = call.extracted?.business ?? null
  const contact = await createContact({
    source: 'call',
    stage: 'new',
    name: call.caller_name || call.caller_number,
    phone: call.caller_number,
    company: business,
    message: call.summary
  })
  const updated = await updateCall(id, { contact_id: contact.id })
  res.status(201).json({ data: { contact, call: updated } })
})
