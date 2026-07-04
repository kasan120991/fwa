import { Router } from 'express'
import {
  listContacts, getContact, createContact, updateContact, deleteContact
} from '../repositories/contacts.repo.js'
import { createStripeCustomer } from '../services/stripe.js'

export const contactsRouter = Router()

/**
 * Ensure an active client has a Stripe customer. Runs after a contact write:
 * the first time a contact is active without a customer id, create one and
 * persist it. Best-effort — a Stripe failure is logged, not thrown, so it never
 * blocks the contact write (the customer can be created on a later edit).
 */
async function ensureStripeCustomer(contact) {
  if (contact.stage !== 'active' || contact.stripe_customer_id) return contact
  try {
    const customerId = await createStripeCustomer(contact)
    if (customerId) return await updateContact(contact.id, { stripe_customer_id: customerId })
  } catch (err) {
    console.error(`Stripe customer creation failed for contact ${contact.id}:`, err.message)
  }
  return contact
}

const SOURCES = ['website', 'call', 'manual', 'referral']
const STAGES = ['new', 'qualifying', 'to_contact', 'contacted', 'engaged', 'qualified', 'proposal', 'active', 'past', 'lost']
// CLAUDE.md view groups: leads = pre-client pipeline, clients = active/past.
const LEAD_STAGES = ['new', 'qualifying', 'to_contact', 'contacted', 'engaged', 'qualified', 'proposal']
const CLIENT_STAGES = ['active', 'past']

const STRING_FIELDS = ['name', 'email', 'phone', 'company', 'title', 'website', 'logo_url', 'message', 'notes', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country', 'billing_email']
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATE_FIELDS = ['client_since', 'last_contacted_at', 'next_action_at']

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}

/** Validate + normalize a contacts payload. `partial` allows omitting required fields (PATCH). */
function validateContact(body, { partial } = {}) {
  const data = {}
  const fields = {}

  if (body.source !== undefined) {
    if (!SOURCES.includes(body.source)) fields.source = `must be one of ${SOURCES.join(', ')}`
    else data.source = body.source
  } else if (!partial) {
    fields.source = 'required'
  }

  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) fields.stage = `must be one of ${STAGES.join(', ')}`
    else data.stage = body.stage
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') fields.name = 'must be a non-empty string'
    else data.name = body.name.trim()
  } else if (!partial) {
    fields.name = 'required'
  }

  for (const f of STRING_FIELDS) {
    if (f === 'name' || body[f] === undefined) continue
    if (body[f] === null) { data[f] = null; continue }
    if (typeof body[f] !== 'string') { fields[f] = 'must be a string'; continue }
    data[f] = body[f].trim() || null
  }

  if (body.email != null && data.email && !EMAIL_RE.test(data.email)) {
    fields.email = 'must be a valid email'
  }

  if (body.billing_email != null && data.billing_email && !EMAIL_RE.test(data.billing_email)) {
    fields.billing_email = 'must be a valid email'
  }

  if (body.tags !== undefined) {
    if (body.tags === null) data.tags = null
    else if (Array.isArray(body.tags) && body.tags.every(t => typeof t === 'string')) data.tags = body.tags
    else fields.tags = 'must be an array of strings'
  }

  for (const f of DATE_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] === null) { data[f] = null; continue }
    if (typeof body[f] !== 'string' || Number.isNaN(Date.parse(body[f]))) fields[f] = 'must be a valid date string'
    else data[f] = body[f]
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}

// GET /api/contacts — list with filters.
//   ?group=leads|clients  (stage-set convenience per CLAUDE.md)
//   ?stage=a,b  ?source=a,b  ?q=  ?sort=  ?dir=  ?limit=  ?offset=
contactsRouter.get('/', async (req, res) => {
  const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)

  let stages = csv(req.query.stage)
  if (!stages) {
    if (req.query.group === 'leads') stages = LEAD_STAGES
    else if (req.query.group === 'clients') stages = CLIENT_STAGES
  }
  const sources = csv(req.query.source)

  // Reject unknown enum values early with a clear error.
  const badStage = stages?.find(s => !STAGES.includes(s))
  if (badStage) throw badRequest(`Unknown stage: ${badStage}`)
  const badSource = sources?.find(s => !SOURCES.includes(s))
  if (badSource) throw badRequest(`Unknown source: ${badSource}`)

  const result = await listContacts({
    stages,
    sources,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    sort: req.query.sort,
    dir: req.query.dir,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/contacts/:id
contactsRouter.get('/:id', async (req, res) => {
  const contact = await getContact(parseId(req))
  if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } })
  res.json({ data: contact })
})

// POST /api/contacts
contactsRouter.post('/', async (req, res) => {
  const data = validateContact(req.body ?? {}, { partial: false })
  const contact = await ensureStripeCustomer(await createContact(data))
  res.status(201).json({ data: contact })
})

// PATCH /api/contacts/:id
contactsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getContact(id)) return res.status(404).json({ error: { message: 'Contact not found' } })
  const data = validateContact(req.body ?? {}, { partial: true })
  const contact = await ensureStripeCustomer(await updateContact(id, data))
  res.json({ data: contact })
})

// DELETE /api/contacts/:id
contactsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteContact(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Contact not found' } })
  res.json({ ok: true })
})
