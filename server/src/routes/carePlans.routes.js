import { Router } from 'express'
import { listCarePlans, getCarePlan, updateCarePlan, deleteCarePlan, CARE_PLAN_STATUSES } from '../repositories/carePlans.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import {
  createCarePlanForClient, sendCarePlanAgreement, inviteForCard, cancelCarePlan
} from '../services/carePlans.service.js'
import { emitCarePlanChanged } from '../realtime/io.js'

// Care plans — assign, send the agreement, ask for a card, cancel. The client
// side (saving the card, which is what creates the subscription) lives in
// portal.routes.js. Status never changes through PATCH; every move is a claim
// inside services/carePlans.service.js.
export const carePlansRouter = Router()

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

async function load(req, res) {
  const plan = await getCarePlan(parseId(req))
  if (!plan) { res.status(404).json({ error: { message: 'Care plan not found' } }); return null }
  return plan
}

// GET /api/care-plans  ?client_id=  ?status=a,b
carePlansRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !CARE_PLAN_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const client_id = req.query.client_id ? Number(req.query.client_id) : undefined
  res.json({ data: await listCarePlans({ client_id, statuses, limit: req.query.limit }) })
})

// GET /api/care-plans/readiness — what the assignment form needs to know.
carePlansRouter.get('/readiness', async (_req, res) => {
  const template = await getActiveTemplate('care_plan')
  res.json({ data: { agreement_template: !!template } })
})

carePlansRouter.get('/:id', async (req, res) => {
  const plan = await load(req, res)
  if (plan) res.json({ data: plan })
})

// POST /api/care-plans — assign a plan to a client.
// { client_id, service_id?, name?, price?, description?, start_date?, requires_agreement? }
carePlansRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const clientId = Number(body.client_id)
  if (!Number.isInteger(clientId) || clientId <= 0) throw badRequest('Validation failed', { client_id: 'a valid client_id is required' })
  const client = await getClient(clientId)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  if (body.start_date != null && (typeof body.start_date !== 'string' || Number.isNaN(Date.parse(body.start_date)))) {
    throw badRequest('Validation failed', { start_date: 'must be a valid date' })
  }
  const plan = await createCarePlanForClient(client, body, {
    actorUserId: req.user?.id ?? null,
    owner: req.user?.email ? { email: req.user.email, name: req.user.name } : null
  })
  res.status(201).json({ data: plan })
})

// PATCH /api/care-plans/:id — name/price/description/start date, only before it's live.
carePlansRouter.patch('/:id', async (req, res) => {
  const plan = await load(req, res)
  if (!plan) return
  if (['active', 'past_due', 'cancelled'].includes(plan.status)) {
    return res.status(409).json({ error: { message: `A ${plan.status.replace('_', ' ')} plan can’t be edited — cancel it and assign a new one` } })
  }
  const body = req.body ?? {}
  const patch = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw badRequest('Validation failed', { name: 'is required' })
    patch.name = name
  }
  if (body.price !== undefined) {
    const price = Number(body.price)
    if (!Number.isFinite(price) || price <= 0) throw badRequest('Validation failed', { price: 'must be greater than zero' })
    patch.price = price
  }
  if (body.description !== undefined) patch.description = String(body.description ?? '').trim() || null
  if (body.start_date !== undefined) {
    if (typeof body.start_date !== 'string' || Number.isNaN(Date.parse(body.start_date))) throw badRequest('Validation failed', { start_date: 'must be a valid date' })
    patch.start_date = body.start_date.slice(0, 10)
  }
  const updated = await updateCarePlan(plan.id, patch)
  emitCarePlanChanged(plan.id)
  res.json({ data: updated })
})

// POST /api/care-plans/:id/send-agreement
carePlansRouter.post('/:id/send-agreement', async (req, res) => {
  const plan = await load(req, res)
  if (!plan) return
  await sendCarePlanAgreement(plan, { actorUserId: req.user?.id ?? null })
  res.json({ data: await getCarePlan(plan.id) })
})

// POST /api/care-plans/:id/invite — (re)send the add-a-card email.
carePlansRouter.post('/:id/invite', async (req, res) => {
  const plan = await load(req, res)
  if (!plan) return
  const client = await getClient(plan.client_id)
  await inviteForCard(plan, client, { actorUserId: req.user?.id ?? null })
  res.json({ data: await getCarePlan(plan.id) })
})

// POST /api/care-plans/:id/cancel  { at_period_end?: boolean }
carePlansRouter.post('/:id/cancel', async (req, res) => {
  const plan = await load(req, res)
  if (!plan) return
  const atPeriodEnd = req.body?.at_period_end !== false
  res.json({ data: await cancelCarePlan(plan, { atPeriodEnd, actorUserId: req.user?.id ?? null }) })
})

// DELETE /api/care-plans/:id — only a plan that never went live.
carePlansRouter.delete('/:id', async (req, res) => {
  const plan = await load(req, res)
  if (!plan) return
  if (!['draft', 'pending_signature', 'awaiting_card'].includes(plan.status)) {
    return res.status(409).json({ error: { message: 'Only a plan that hasn’t started can be deleted — cancel it instead' } })
  }
  await deleteCarePlan(plan.id)
  emitCarePlanChanged(plan.id)
  res.status(204).end()
})
