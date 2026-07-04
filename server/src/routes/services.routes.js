import { Router } from 'express'
import {
  listServices, getService, createService, updateService, deleteService,
  CATEGORIES, BILLING_INTERVALS
} from '../repositories/services.repo.js'

export const servicesRouter = Router()

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

/** Validate a service payload. `partial` allows omitting required fields (PATCH). */
function validateService(body, { partial } = {}) {
  const data = {}
  const fields = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) fields.name = 'must be a non-empty string'
    else data.name = body.name.trim()
  } else if (!partial) fields.name = 'required'

  if (body.category !== undefined) {
    if (!CATEGORIES.has(body.category)) fields.category = `must be one of ${[...CATEGORIES].join(', ')}`
    else data.category = body.category
  } else if (!partial) fields.category = 'required'

  if (body.price !== undefined) {
    const n = Number(body.price)
    if (!Number.isFinite(n) || n < 0) fields.price = 'must be a number >= 0'
    else data.price = n
  } else if (!partial) fields.price = 'required'

  if (body.billing_interval !== undefined) {
    if (!BILLING_INTERVALS.has(body.billing_interval)) fields.billing_interval = `must be one of ${[...BILLING_INTERVALS].join(', ')}`
    else data.billing_interval = body.billing_interval
  }

  if (body.description !== undefined) data.description = body.description == null ? null : String(body.description)
  if (body.pandadoc_sku !== undefined) data.pandadoc_sku = body.pandadoc_sku == null ? null : String(body.pandadoc_sku)
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') fields.is_active = 'must be a boolean'
    else data.is_active = body.is_active
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order)
    if (!Number.isInteger(n)) fields.sort_order = 'must be an integer'
    else data.sort_order = n
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

// GET /api/services  ?category=  ?active=1
servicesRouter.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  if (category && !CATEGORIES.has(category)) throw badRequest(`Unknown category: ${category}`)
  const rows = await listServices({ category, activeOnly: req.query.active === '1' || req.query.active === 'true', sort: req.query.sort })
  res.json({ data: rows })
})

servicesRouter.get('/:id', async (req, res) => {
  const service = await getService(parseId(req))
  if (!service) return res.status(404).json({ error: { message: 'Service not found' } })
  res.json({ data: service })
})

servicesRouter.post('/', async (req, res) => {
  const data = validateService(req.body ?? {}, { partial: false })
  res.status(201).json({ data: await createService(data) })
})

servicesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getService(id)) return res.status(404).json({ error: { message: 'Service not found' } })
  const data = validateService(req.body ?? {}, { partial: true })
  res.json({ data: await updateService(id, data) })
})

servicesRouter.delete('/:id', async (req, res) => {
  const ok = await deleteService(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Service not found' } })
  res.json({ ok: true })
})
