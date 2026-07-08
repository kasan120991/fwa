import { Router } from 'express'
import {
  listLeads, getLead, createLead, updateLead, deleteLead
} from '../repositories/leads.repo.js'
import { createClient, updateClient, deleteClient } from '../repositories/clients.repo.js'
import { createStripeCustomer } from '../services/stripe.js'
import { createProject, deleteProject } from '../services/projects.service.js'
import { getProjectTypeByKey, getProjectType } from '../repositories/projectTypes.repo.js'
import { listTouches, getTouch, createTouch, deleteTouch, TOUCH_CHANNELS } from '../repositories/leadTouches.repo.js'
import { query } from '../db/pool.js'

export const leadsRouter = Router()

// MySQL DATETIME 'YYYY-MM-DD HH:MM:SS' in local time (matches the seed + timeAgo).
function nowDatetime() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const SOURCES = ['website', 'manual']
const STAGES = ['new', 'qualifying', 'to_contact', 'contacted', 'engaged', 'qualified', 'lost']

const STRING_FIELDS = ['name', 'email', 'phone', 'company', 'title', 'website', 'message', 'notes']
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATE_FIELDS = ['last_contacted_at', 'next_action_at']

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}

/** Validate + normalize a leads payload. `partial` allows omitting required fields (PATCH). */
function validateLead(body, { partial } = {}) {
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

  // Store phone numbers as raw digits only; the frontend owns all formatting.
  if (data.phone) data.phone = data.phone.replace(/\D/g, '') || null

  if (body.email != null && data.email && !EMAIL_RE.test(data.email)) {
    fields.email = 'must be a valid email'
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

// GET /api/leads — list with filters.  ?stage=a,b  ?source=a,b  ?q=  ?sort=  ?dir=  ?limit=  ?offset=
leadsRouter.get('/', async (req, res) => {
  const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)
  const stages = csv(req.query.stage)
  const sources = csv(req.query.source)

  const badStage = stages?.find(s => !STAGES.includes(s))
  if (badStage) throw badRequest(`Unknown stage: ${badStage}`)
  const badSource = sources?.find(s => !SOURCES.includes(s))
  if (badSource) throw badRequest(`Unknown source: ${badSource}`)

  const result = await listLeads({
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

// GET /api/leads/:id
leadsRouter.get('/:id', async (req, res) => {
  const lead = await getLead(parseId(req))
  if (!lead) return res.status(404).json({ error: { message: 'Lead not found' } })
  res.json({ data: lead })
})

// POST /api/leads
leadsRouter.post('/', async (req, res) => {
  const data = validateLead(req.body ?? {}, { partial: false })
  const lead = await createLead(data)
  res.status(201).json({ data: lead })
})

// PATCH /api/leads/:id
leadsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getLead(id)) return res.status(404).json({ error: { message: 'Lead not found' } })
  const data = validateLead(req.body ?? {}, { partial: true })
  const lead = await updateLead(id, data)
  res.json({ data: lead })
})

// DELETE /api/leads/:id
leadsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteLead(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Lead not found' } })
  res.json({ ok: true })
})

// Fields copied from a lead onto the new client on conversion.
const COPY_FIELDS = ['name', 'email', 'phone', 'company', 'title', 'website', 'notes', 'tags']

// POST /api/leads/:id/convert — turn a lead into a client.
//   Copies the lead into a new `clients` row (status active, client_since today),
//   moves any linked calls to the client, optionally creates a project, deletes
//   the lead, then provisions a Stripe customer. Body: { project?: {...} }.
//
//   Failure-safe: the project request is fully validated BEFORE any write, the
//   client/calls/project/lead mutations are undone (in reverse) if any of them
//   throws, and the Stripe customer is provisioned LAST — so a failed conversion
//   never leaves an orphan client (in the app or in Stripe) behind.
leadsRouter.post('/:id/convert', async (req, res) => {
  const id = parseId(req)
  const lead = await getLead(id)
  if (!lead) return res.status(404).json({ error: { message: 'Lead not found' } })

  // Validate the (optional) project up front — before creating anything — so a
  // bad request can't leave a half-converted client behind.
  const p = req.body?.project
  const wantsProject = p != null && typeof p === 'object'
  let projectName = null
  let projectType = null
  if (wantsProject) {
    projectName = typeof p.name === 'string' ? p.name.trim() : ''
    if (!projectName) throw badRequest('Validation failed', { 'project.name': 'a project name is required' })
    if (p.project_type_id) projectType = await getProjectType(Number(p.project_type_id))
    if (!projectType) projectType = await getProjectTypeByKey('website')
    if (!projectType) throw badRequest('No default project type configured; run the seed')
  }

  const today = new Date().toISOString().slice(0, 10)
  const clientData = { status: 'active', source: lead.source || 'direct', client_since: today }
  for (const f of COPY_FIELDS) clientData[f] = lead[f] ?? null

  let client = await createClient(clientData)
  let project = null
  try {
    // Preserve call history: repoint the lead's calls to the new client before
    // the lead (and its SET NULL link) disappears.
    await query('UPDATE calls SET client_id = :cid, lead_id = NULL WHERE lead_id = :lid', { cid: client.id, lid: id })

    if (wantsProject) {
      project = await createProject({
        client_id: client.id,
        project_type_id: projectType.id,
        name: projectName,
        status: p.status || 'planning',
        goals: typeof p.goals === 'string' ? p.goals.trim() || null : null
      })
    }

    await deleteLead(id)
  } catch (err) {
    // Undo everything we just created so the failed conversion leaves no trace
    // (the lead stays put, ready to retry). Best-effort — swallow cleanup errors.
    await query('UPDATE calls SET lead_id = :lid, client_id = NULL WHERE client_id = :cid', { lid: id, cid: client.id }).catch(() => {})
    if (project) await deleteProject(project.id).catch(() => {})
    await deleteClient(client.id).catch(() => {})
    throw err
  }

  // Provision the Stripe customer LAST (best-effort — never blocks conversion,
  // and a DB failure above can't orphan a customer since we're past it).
  try {
    const customerId = await createStripeCustomer(client)
    if (customerId) client = await updateClient(client.id, { stripe_customer_id: customerId })
  } catch (err) {
    console.error(`Stripe customer creation failed for client ${client.id}:`, err.message)
  }

  res.status(201).json({ data: { client, project } })
})

// ---- outreach touch log ----------------------------------------------------

// GET /api/leads/:id/touches — the lead's touch history, newest first.
leadsRouter.get('/:id/touches', async (req, res) => {
  const id = parseId(req)
  if (!await getLead(id)) return res.status(404).json({ error: { message: 'Lead not found' } })
  res.json({ data: await listTouches(id) })
})

// POST /api/leads/:id/touches — log a touch. Bumps the lead's last_contacted_at
//   to the touch time, and optionally schedules the next follow-up.
//   Body: { channel, body?, occurred_at?, next_action_at? }
leadsRouter.post('/:id/touches', async (req, res) => {
  const id = parseId(req)
  if (!await getLead(id)) return res.status(404).json({ error: { message: 'Lead not found' } })

  const body = req.body ?? {}
  const fields = {}
  const channel = body.channel
  if (!TOUCH_CHANNELS.has(channel)) fields.channel = `must be one of ${[...TOUCH_CHANNELS].join(', ')}`
  const occurred_at = body.occurred_at || nowDatetime()
  if (body.occurred_at != null && Number.isNaN(Date.parse(occurred_at))) fields.occurred_at = 'must be a valid date string'
  const note = typeof body.body === 'string' ? body.body.trim() || null : null
  if (body.next_action_at != null && typeof body.next_action_at === 'string' && Number.isNaN(Date.parse(body.next_action_at))) {
    fields.next_action_at = 'must be a valid date string'
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const touch = await createTouch(id, { channel, body: note, occurred_at })
  const patch = { last_contacted_at: occurred_at }
  if (body.next_action_at !== undefined) patch.next_action_at = body.next_action_at || null
  const lead = await updateLead(id, patch)
  res.status(201).json({ data: { touch, lead } })
})

// DELETE /api/leads/:id/touches/:touchId
leadsRouter.delete('/:id/touches/:touchId', async (req, res) => {
  const touchId = Number(req.params.touchId)
  if (!Number.isInteger(touchId) || touchId <= 0) throw badRequest('Invalid id')
  const touch = await getTouch(touchId)
  if (!touch || touch.lead_id !== Number(req.params.id)) {
    return res.status(404).json({ error: { message: 'Touch not found' } })
  }
  await deleteTouch(touchId)
  res.json({ ok: true })
})
