import { Router } from 'express'
import {
  getProject, listProjects, PROJECT_STATUSES, CONTENT_BY
} from '../repositories/projects.repo.js'
import { createProject, updateProject, deleteProject, advanceProject } from '../services/projects.service.js'
import { listTasks } from '../repositories/tasks.repo.js'
import { getClient, updateClient } from '../repositories/clients.repo.js'
import { getProjectType, getProjectTypeByKey } from '../repositories/projectTypes.repo.js'
import { generateProjectContract } from '../services/projectContract.js'
import { issueDeposit } from '../services/projectBilling.js'
import { listContracts } from '../repositories/contracts.repo.js'
import { pandadocEnabled } from '../services/pandadoc.js'
import { stripeEnabled, createStripeCustomer, sendDepositInvoice } from '../services/stripe.js'
import { createInvoice, updateInvoice } from '../repositories/invoices.repo.js'
import { notify } from '../services/notifications.service.js'
import { emitInvoiceChanged, emitContractChanged } from '../realtime/io.js'

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

// Validate + normalize a project body. On create, name is required; client_id
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

// GET /api/projects  ?client_id= ?project_type_id= ?status= ?search= ?overdue=1
projectsRouter.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !PROJECT_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listProjects({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
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

// POST /api/projects — create a project (the SOW). client_id + name required;
// project_type_id optional (defaults to the 'website' type).
projectsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const clientId = Number(body.client_id)
  if (!Number.isInteger(clientId) || clientId <= 0) throw badRequest('Validation failed', { client_id: 'a valid client_id is required' })
  const client = await getClient(clientId)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })

  let type
  if (body.project_type_id != null) {
    type = await getProjectType(Number(body.project_type_id))
    if (!type) throw badRequest('Validation failed', { project_type_id: 'project type not found' })
  } else {
    type = await getProjectTypeByKey('website')
    if (!type) throw badRequest('No default project type configured; run the seed or pass project_type_id')
  }

  const data = validateProject(body, { partial: false })
  const project = await createProject({ ...data, client_id: clientId, project_type_id: type.id })
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
// Body (all optional — the confirm-contract modal supplies them): title,
// billing_interval, start_date, deposit_pct, special_terms, items[], recipient_email.
projectsRouter.post('/:id/contract', async (req, res) => {
  const id = parseId(req)
  const body = req.body ?? {}
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  if (!project.name || project.project_fee == null) {
    throw badRequest('Validation failed', { project_fee: 'a project name and fee are required before generating a contract' })
  }
  const client = await getClient(project.client_id)
  if (!client) return res.status(404).json({ error: { message: 'Project client not found' } })

  // Don't silently create a duplicate: if a live (non-voided) contract already
  // exists for this project, tell the caller to open it instead.
  const existing = (await listContracts({ project_id: id })).rows.find(c => c.status !== 'voided')
  if (existing) {
    return res.status(409).json({ error: { message: `This project already has a ${existing.status} contract.`, contract_id: existing.id } })
  }

  const fields = {}
  const overrides = {}
  if (body.title !== undefined) overrides.title = String(body.title)
  if (body.special_terms !== undefined) overrides.special_terms = body.special_terms == null ? null : String(body.special_terms)
  if (body.billing_interval !== undefined) {
    if (body.billing_interval !== 'one_time' && body.billing_interval !== 'monthly') fields.billing_interval = 'must be one_time or monthly'
    else overrides.billing_interval = body.billing_interval
  }
  if (body.start_date != null && body.start_date !== '') {
    if (typeof body.start_date !== 'string' || Number.isNaN(Date.parse(body.start_date))) fields.start_date = 'must be a valid date'
    else overrides.start_date = body.start_date.slice(0, 10)
  }
  if (body.deposit_pct !== undefined) {
    const n = Number(body.deposit_pct)
    if (!Number.isFinite(n) || n <= 0 || n > 100) fields.deposit_pct = 'must be a number in (0, 100]'
    else overrides.deposit_pct = n
  }
  if (Array.isArray(body.items) && body.items.length) overrides.items = body.items

  // Recipient (PandaDoc signer) — required only when PandaDoc is configured, so
  // local-only creation still works for a client without an email on file.
  const recipientEmail = (typeof body.recipient_email === 'string' && body.recipient_email.trim())
    || client.billing_email || client.email
  if (pandadocEnabled() && !recipientEmail) fields.recipient_email = 'a recipient email is required (add one to the client or provide it here)'
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  if (body.recipient_email) overrides.recipient_email = String(body.recipient_email).trim()

  overrides.ownerEmail = req.user.email
  overrides.ownerName = req.user.name

  const contract = await generateProjectContract(project, client, overrides)
  emitContractChanged(contract.id)
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

  let client = await getClient(project.client_id)
  if (!client) return res.status(404).json({ error: { message: 'Project client not found' } })
  // Provision a Stripe customer on demand (project can belong to any client).
  if (!client.stripe_customer_id) {
    const customerId = await createStripeCustomer(client)
    if (customerId) client = await updateClient(client.id, { stripe_customer_id: customerId })
  }
  if (!client.stripe_customer_id) return res.status(409).json({ error: { message: 'Could not create a Stripe customer for this client' } })

  const { invoice, amount } = await issueDeposit(project, client, { actorUserId: req.user.id })
  res.json({ data: { id: invoice.id, hosted_invoice_url: invoice.hosted_invoice_url, status: invoice.status, amount } })
})

// POST /api/projects/:id/final-invoice — Stripe-send the client the final
// (balance) invoice for the remaining fee after the deposit. Mirror of the
// deposit route; kind = 'balance'.
projectsRouter.post('/:id/final-invoice', async (req, res) => {
  const id = parseId(req)
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  if (project.project_fee == null || project.project_fee <= 0) {
    throw badRequest('Validation failed', { project_fee: 'set a project fee before sending the final invoice' })
  }
  if (!stripeEnabled()) return res.status(409).json({ error: { message: 'Stripe is not configured' } })

  let client = await getClient(project.client_id)
  if (!client) return res.status(404).json({ error: { message: 'Project client not found' } })
  if (!client.stripe_customer_id) {
    const customerId = await createStripeCustomer(client)
    if (customerId) client = await updateClient(client.id, { stripe_customer_id: customerId })
  }
  if (!client.stripe_customer_id) return res.status(409).json({ error: { message: 'Could not create a Stripe customer for this client' } })

  const pct = project.deposit_pct ?? 50
  const deposit = Math.round((project.project_fee * pct / 100) * 100) / 100
  const balance = Math.round((project.project_fee - deposit) * 100) / 100
  const finalPct = Math.round((100 - pct) * 100) / 100
  const clientName = client.company || client.name
  const description = `Final payment (${finalPct}%) — ${project.name}`

  let localInvoice = await createInvoice({
    client_id: client.id, project_id: project.id, kind: 'balance', description,
    amount_due: balance, status: 'draft',
    items: [{ service_id: null, name_snapshot: description, description_snapshot: null, unit_price_snapshot: balance, qty: 1, billing_interval_snapshot: 'one_time', sort_order: 0 }]
  })

  const stripeInvoice = await sendDepositInvoice(client, {
    amountCents: Math.round(balance * 100),
    description,
    metadata: { fwa_project_id: String(project.id), fwa_client_id: String(client.id), fwa_invoice_id: String(localInvoice.id), kind: 'balance' }
  })
  if (stripeInvoice) {
    localInvoice = await updateInvoice(localInvoice.id, {
      stripe_invoice_id: stripeInvoice.id, number: stripeInvoice.number,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url, invoice_pdf: stripeInvoice.invoice_pdf,
      status: 'open', finalized_at: new Date(), due_date: stripeInvoice.due_date
    })
  }
  emitInvoiceChanged(localInvoice.id)

  try {
    await notify({
      category: 'invoice', tone: 'info', icon: 'i-lucide-receipt-text',
      title: 'Final invoice sent',
      body: `$${balance.toLocaleString('en-US')} final invoice sent to ${clientName}.`,
      link: `/projects/${project.id}`
    }, req.user.id)
  } catch (err) {
    console.error(`Final-invoice notification failed for project ${project.id}:`, err.message)
  }

  // Sending the final invoice moves the project to "awaiting final payment".
  await advanceProject(project.id, 'awaiting_final')

  res.json({ data: { id: localInvoice.id, hosted_invoice_url: localInvoice.hosted_invoice_url, status: localInvoice.status, amount: balance } })
})

// DELETE /api/projects/:id
projectsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteProject(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Project not found' } })
  res.json({ ok: true })
})
