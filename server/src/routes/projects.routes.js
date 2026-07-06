import { Router } from 'express'
import {
  getProject, listProjects, PROJECT_STATUSES, CONTENT_BY
} from '../repositories/projects.repo.js'
import { createProject, updateProject, deleteProject } from '../services/projects.service.js'
import { listTasks } from '../repositories/tasks.repo.js'
import { getContact, updateContact } from '../repositories/contacts.repo.js'
import { getProjectType, getProjectTypeByKey } from '../repositories/projectTypes.repo.js'
import { generateProjectContract } from '../services/projectContract.js'
import { stripeEnabled, createStripeCustomer, sendDepositInvoice } from '../services/stripe.js'
import { createInvoice, updateInvoice } from '../repositories/invoices.repo.js'
import { notify } from '../services/notifications.service.js'
import { emitInvoiceChanged } from '../realtime/io.js'

export const projectsRouter = Router()

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

const TEXT_FIELDS = ['goals', 'pages_included', 'key_features', 'design_deliverables', 'third_party_costs', 'special_terms']
const DATE_FIELDS = ['content_deadline', 'start_date', 'target_launch_date']
const INT_FIELDS = ['revision_rounds', 'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days']
const MONEY_FIELDS = ['project_fee', 'hourly_rate']

// Validate + normalize a project body. On create, name is required; contact_id
// and project_type_id are resolved in the handler. partial=true for PATCH.
function validateProject(body, { partial = false } = {}) {
  const data = {}
  const fields = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) fields.name = 'name is required'
    else data.name = name
  } else if (!partial) {
    fields.name = 'name is required'
  }

  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.has(body.status)) fields.status = `must be one of ${[...PROJECT_STATUSES].join(', ')}`
    else data.status = body.status
  }
  if (body.content_provided_by !== undefined && body.content_provided_by !== null) {
    if (!CONTENT_BY.has(body.content_provided_by)) fields.content_provided_by = `must be one of ${[...CONTENT_BY].join(', ')}`
    else data.content_provided_by = body.content_provided_by
  } else if (body.content_provided_by === null) {
    data.content_provided_by = null
  }

  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] == null ? null : String(body[f])
  }
  for (const f of INT_FIELDS) {
    if (body[f] === undefined) continue
    const n = Number(body[f])
    if (!Number.isInteger(n) || n < 0) fields[f] = 'must be a non-negative integer'
    else data[f] = n
  }
  for (const f of MONEY_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] === null) { data[f] = null; continue }
    const n = Number(body[f])
    if (!Number.isFinite(n) || n < 0) fields[f] = 'must be a number >= 0'
    else data[f] = n
  }
  if (body.deposit_pct !== undefined) {
    const n = Number(body.deposit_pct)
    if (!Number.isFinite(n) || n <= 0 || n > 100) fields.deposit_pct = 'must be a number in (0, 100]'
    else data.deposit_pct = n
  }
  for (const f of DATE_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] === null || body[f] === '') { data[f] = null; continue }
    if (typeof body[f] !== 'string' || Number.isNaN(Date.parse(body[f]))) fields[f] = 'must be a valid date'
    else data[f] = body[f].slice(0, 10)
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

// GET /api/projects  ?contact_id= ?project_type_id= ?status= ?search= ?overdue=1
projectsRouter.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !PROJECT_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listProjects({
    contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
    project_type_id: req.query.project_type_id ? Number(req.query.project_type_id) : undefined,
    status,
    search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined,
    overdue: req.query.overdue === '1' || req.query.overdue === 'true',
    active: req.query.active === '1' || req.query.active === 'true',
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/projects/:id
projectsRouter.get('/:id', async (req, res) => {
  const project = await getProject(parseId(req))
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  res.json({ data: project })
})

// GET /api/projects/:id/tasks
projectsRouter.get('/:id/tasks', async (req, res) => {
  const id = parseId(req)
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  const result = await listTasks({ project_id: id })
  res.json({ data: result.rows, total: result.total })
})

// POST /api/projects — create a project (the SOW). contact_id + name required;
// project_type_id optional (defaults to the 'website' type).
projectsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const contactId = Number(body.contact_id)
  if (!Number.isInteger(contactId) || contactId <= 0) throw badRequest('Validation failed', { contact_id: 'a valid contact_id is required' })
  const contact = await getContact(contactId)
  if (!contact) throw badRequest('Validation failed', { contact_id: 'contact not found' })

  let type
  if (body.project_type_id != null) {
    type = await getProjectType(Number(body.project_type_id))
    if (!type) throw badRequest('Validation failed', { project_type_id: 'project type not found' })
  } else {
    type = await getProjectTypeByKey('website')
    if (!type) throw badRequest('No default project type configured; run the seed or pass project_type_id')
  }

  const data = validateProject(body, { partial: false })
  const project = await createProject({ ...data, contact_id: contactId, project_type_id: type.id })
  res.status(201).json({ data: project })
})

// PATCH /api/projects/:id
projectsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getProject(id)
  if (!existing) return res.status(404).json({ error: { message: 'Project not found' } })
  const data = validateProject(req.body ?? {}, { partial: true })
  const project = await updateProject(id, data)
  res.json({ data: project })
})

// POST /api/projects/:id/contract — generate the project's contract from its SOW.
projectsRouter.post('/:id/contract', async (req, res) => {
  const id = parseId(req)
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  if (!project.name || project.project_fee == null) {
    throw badRequest('Validation failed', { project_fee: 'a project name and fee are required before generating a contract' })
  }
  const contact = await getContact(project.contact_id)
  if (!contact) return res.status(404).json({ error: { message: 'Project contact not found' } })
  const contract = await generateProjectContract(project, contact)
  res.status(201).json({ data: contract })
})

// POST /api/projects/:id/deposit-invoice — Stripe-send the client a deposit
// invoice for deposit_pct% of the project fee. Requires pricing + Stripe.
projectsRouter.post('/:id/deposit-invoice', async (req, res) => {
  const id = parseId(req)
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  if (project.project_fee == null || project.project_fee <= 0) {
    throw badRequest('Validation failed', { project_fee: 'set a project fee before requesting a deposit' })
  }
  if (!stripeEnabled()) return res.status(409).json({ error: { message: 'Stripe is not configured' } })

  let contact = await getContact(project.contact_id)
  if (!contact) return res.status(404).json({ error: { message: 'Project contact not found' } })
  // Provision a Stripe customer on demand (project can belong to any contact).
  if (!contact.stripe_customer_id) {
    const customerId = await createStripeCustomer(contact)
    if (customerId) contact = await updateContact(contact.id, { stripe_customer_id: customerId })
  }
  if (!contact.stripe_customer_id) return res.status(409).json({ error: { message: 'Could not create a Stripe customer for this client' } })

  const pct = project.deposit_pct ?? 50
  const deposit = Math.round((project.project_fee * pct / 100) * 100) / 100
  const clientName = contact.company || contact.name
  const description = `Deposit (${pct}%) — ${project.name}`

  // Local invoice first (draft), so the deposit shows on the Invoices page and
  // its id can ride along in Stripe metadata (dodges the webhook create race).
  let localInvoice = await createInvoice({
    contact_id: contact.id, project_id: project.id, kind: 'deposit', description,
    amount_due: deposit, status: 'draft',
    items: [{ service_id: null, name_snapshot: description, description_snapshot: null, unit_price_snapshot: deposit, qty: 1, billing_interval_snapshot: 'one_time', sort_order: 0 }]
  })

  const stripeInvoice = await sendDepositInvoice(contact, {
    amountCents: Math.round(deposit * 100),
    description,
    metadata: { fwa_project_id: String(project.id), fwa_contact_id: String(contact.id), fwa_invoice_id: String(localInvoice.id), kind: 'deposit' }
  })
  if (stripeInvoice) {
    localInvoice = await updateInvoice(localInvoice.id, {
      stripe_invoice_id: stripeInvoice.id, number: stripeInvoice.number,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url, invoice_pdf: stripeInvoice.invoice_pdf,
      status: 'open', finalized_at: new Date(), due_date: stripeInvoice.due_date
    })
  }
  emitInvoiceChanged(localInvoice.id)

  // Raise a live bell alert (best-effort — never fail the send over a notify hiccup).
  try {
    await notify({
      category: 'invoice', tone: 'info', icon: 'i-lucide-receipt-text',
      title: 'Deposit invoice sent',
      body: `$${deposit.toLocaleString('en-US')} deposit sent to ${clientName}.`,
      link: `/projects/${project.id}`
    })
  } catch (err) {
    console.error(`Deposit-invoice notification failed for project ${project.id}:`, err.message)
  }

  res.json({ data: { id: localInvoice.id, hosted_invoice_url: localInvoice.hosted_invoice_url, status: localInvoice.status, amount: deposit } })
})

// DELETE /api/projects/:id
projectsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteProject(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Project not found' } })
  res.json({ ok: true })
})
