import { Router } from 'express'
import {
  listClients, getClient, createClient, updateClient, deleteClient
} from '../repositories/clients.repo.js'
import { createStripeCustomer, updateStripeCustomer } from '../services/stripe.js'

export const clientsRouter = Router()

// Client fields mirrored onto the Stripe customer — only these changing is
// worth a sync call.
const STRIPE_SYNC_FIELDS = ['company', 'name', 'email', 'billing_email', 'phone', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country']
function stripeFieldsChanged(a, b) {
  return STRIPE_SYNC_FIELDS.some(f => (a?.[f] ?? null) !== (b?.[f] ?? null))
}

/**
 * Keep Stripe in step with a client after a write. Best-effort — failures are
 * logged, never thrown, so Stripe never blocks a client write.
 *   - active client without a customer  → create the customer
 *   - already has a customer and a mirrored field changed → update it
 */
async function syncStripeCustomer(client, previous = null) {
  if (!client) return client
  if (client.status === 'active' && !client.stripe_customer_id) {
    try {
      const customerId = await createStripeCustomer(client)
      if (customerId) return await updateClient(client.id, { stripe_customer_id: customerId })
    } catch (err) {
      console.error(`Stripe customer creation failed for client ${client.id}:`, err.message)
    }
    return client
  }
  if (client.stripe_customer_id && previous && stripeFieldsChanged(previous, client)) {
    try {
      await updateStripeCustomer(client)
    } catch (err) {
      console.error(`Stripe customer update failed for client ${client.id}:`, err.message)
    }
  }
  return client
}

const STATUSES = ['active', 'past', 'lost']
const SOURCES = ['website', 'manual', 'call', 'direct']

const STRING_FIELDS = ['name', 'email', 'phone', 'company', 'title', 'website', 'logo_url', 'notes', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country', 'billing_email']
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATE_FIELDS = ['client_since']

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}

/** Validate + normalize a clients payload. `partial` allows omitting required fields (PATCH). */
function validateClient(body, { partial } = {}) {
  const data = {}
  const fields = {}

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) fields.status = `must be one of ${STATUSES.join(', ')}`
    else data.status = body.status
  }

  if (body.source !== undefined) {
    if (!SOURCES.includes(body.source)) fields.source = `must be one of ${SOURCES.join(', ')}`
    else data.source = body.source
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

  // Store phone numbers as raw digits only; the frontend owns all formatting.
  if (data.phone) data.phone = data.phone.replace(/\D/g, '') || null

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

// GET /api/clients — list with filters.  ?status=a,b  ?q=  ?sort=  ?dir=  ?limit=  ?offset=
clientsRouter.get('/', async (req, res) => {
  const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)
  const statuses = csv(req.query.status)
  const badStatus = statuses?.find(s => !STATUSES.includes(s))
  if (badStatus) throw badRequest(`Unknown status: ${badStatus}`)

  const result = await listClients({
    statuses,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    sort: req.query.sort,
    dir: req.query.dir,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/clients/:id
clientsRouter.get('/:id', async (req, res) => {
  const client = await getClient(parseId(req))
  if (!client) return res.status(404).json({ error: { message: 'Client not found' } })
  res.json({ data: client })
})

// POST /api/clients
clientsRouter.post('/', async (req, res) => {
  const data = validateClient(req.body ?? {}, { partial: false })
  const client = await syncStripeCustomer(await createClient(data))
  res.status(201).json({ data: client })
})

// PATCH /api/clients/:id
clientsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getClient(id)
  if (!existing) return res.status(404).json({ error: { message: 'Client not found' } })
  const data = validateClient(req.body ?? {}, { partial: true })
  const client = await syncStripeCustomer(await updateClient(id, data), existing)
  res.json({ data: client })
})

// DELETE /api/clients/:id
clientsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteClient(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Client not found' } })
  res.json({ ok: true })
})
