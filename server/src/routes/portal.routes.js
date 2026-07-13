import { Router } from 'express'
import { listProjects, getProject } from '../repositories/projects.repo.js'
import { listMilestones } from '../repositories/milestones.repo.js'
import { listInvoices, getInvoice } from '../repositories/invoices.repo.js'
import { listAgreements } from '../repositories/agreements.repo.js'
import { listFiles } from '../repositories/files.repo.js'
import {
  listTickets, getTicket, listMessages, ticketCode, TICKET_TYPES
} from '../repositories/tickets.repo.js'
import { createTicket, addMessage } from '../services/tickets.service.js'
import {
  listWebsites, getWebsite, websiteSummary, websiteMetricsSeries, websiteChecksSeries
} from '../repositories/websites.repo.js'
import { getClient, updateClient } from '../repositories/clients.repo.js'
import { updateStripeCustomer } from '../services/stripe.js'
import { notify } from '../services/notifications.service.js'

// Client-portal API. Mounted behind requirePortal, so req.clientId is always the
// logged-in client's own id — every query is scoped to it, never to a param.
export const portalRouter = Router()

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

const num = v => (v == null ? 0 : Number(v))
const OPEN_TICKET_STATES = new Set(['open', 'in_progress', 'waiting'])

// GET /api/portal/overview — the logged-in client's own at-a-glance summary.
portalRouter.get('/overview', async (req, res) => {
  const clientId = req.clientId
  const [client, projects, invoices, tickets] = await Promise.all([
    getClient(clientId),
    listProjects({ client_id: clientId, limit: 500 }),
    listInvoices({ client_id: clientId, limit: 500 }),
    listTickets({ client_id: clientId, limit: 500 })
  ])
  const activeProjects = projects.rows.filter(p => p.status !== 'completed').length
  const outstanding = invoices.rows
    .filter(i => i.status === 'open')
    .reduce((sum, i) => sum + (num(i.amount_due) - num(i.amount_paid)), 0)
  const openTickets = tickets.rows.filter(t => OPEN_TICKET_STATES.has(t.status)).length

  res.json({
    data: {
      client: client ? { id: client.id, name: client.name, company: client.company } : null,
      active_projects: activeProjects,
      outstanding_balance: outstanding,
      open_tickets: openTickets
    }
  })
})

// GET /api/portal/projects — the client's own projects.
portalRouter.get('/projects', async (req, res) => {
  const result = await listProjects({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows })
})

// GET /api/portal/projects/:id — a project + its milestone timeline. 404 (not
// 403) for a project that isn't the caller's, so ids aren't probeable.
portalRouter.get('/projects/:id', async (req, res) => {
  const project = await getProject(parseId(req))
  if (!project || Number(project.client_id) !== req.clientId) {
    return res.status(404).json({ error: { message: 'Project not found' } })
  }
  const milestones = await listMilestones(project.id)
  res.json({ data: { project, milestones } })
})

// ---- invoices (drafts stay internal) ----

// GET /api/portal/invoices
portalRouter.get('/invoices', async (req, res) => {
  const result = await listInvoices({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows.filter(i => i.status !== 'draft') })
})

// GET /api/portal/invoices/:id — detail with line items + payments.
portalRouter.get('/invoices/:id', async (req, res) => {
  const invoice = await getInvoice(parseId(req))
  if (!invoice || Number(invoice.client_id) !== req.clientId || invoice.status === 'draft') {
    return res.status(404).json({ error: { message: 'Invoice not found' } })
  }
  res.json({ data: invoice })
})

// ---- agreements (proposals + contracts union; read-only this phase) ----

// GET /api/portal/agreements
portalRouter.get('/agreements', async (req, res) => {
  const result = await listAgreements({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows })
})

// ---- files (curated: brand/contract/deliverable; 'other' stays internal) ----

// GET /api/portal/files
portalRouter.get('/files', async (req, res) => {
  const result = await listFiles({ client_id: req.clientId, limit: 500 })
  res.json({ data: (result.rows ?? result).filter(f => f.category !== 'other') })
})

// ---- support tickets (list/thread + create/reply) ----

async function ownTicket(req, res) {
  const ticket = await getTicket(parseId(req))
  if (!ticket || Number(ticket.client_id) !== req.clientId) {
    res.status(404).json({ error: { message: 'Ticket not found' } })
    return null
  }
  return ticket
}

// GET /api/portal/tickets
portalRouter.get('/tickets', async (req, res) => {
  const result = await listTickets({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows })
})

// GET /api/portal/tickets/:id — ticket + full message thread.
portalRouter.get('/tickets/:id', async (req, res) => {
  const ticket = await ownTicket(req, res)
  if (!ticket) return
  res.json({ data: { ticket, messages: await listMessages(ticket.id) } })
})

// POST /api/portal/tickets — a client opens a ticket.
portalRouter.post('/tickets', async (req, res) => {
  const body = req.body ?? {}
  const subject = String(body.subject ?? '').trim()
  if (!subject) throw badRequest('Validation failed', { subject: 'subject is required' })
  const type = body.type !== undefined ? body.type : 'question'
  if (!TICKET_TYPES.has(type)) throw badRequest('Validation failed', { type: `must be one of ${[...TICKET_TYPES].join(', ')}` })

  const ticket = await createTicket({
    client_id: req.clientId,
    subject,
    description: body.description == null ? null : String(body.description),
    type,
    opened_by: 'client'
  })
  // Alert the admin — best-effort, mirrors tickets.routes' notification shape.
  try {
    await notify({
      category: 'ticket',
      tone: 'info',
      icon: 'i-lucide-life-buoy',
      title: `New ticket from ${ticket.client_company || ticket.client_name || 'a client'}`,
      body: `${ticketCode(ticket.id)} · ${ticket.subject}`,
      link: `/support/${ticket.id}`
    })
  } catch (err) {
    console.error(`Portal ticket notification failed for ticket ${ticket.id}:`, err.message)
  }
  res.status(201).json({ data: ticket })
})

// POST /api/portal/tickets/:id/messages — a client replies on their thread.
portalRouter.post('/tickets/:id/messages', async (req, res) => {
  const ticket = await ownTicket(req, res)
  if (!ticket) return
  const messageBody = String(req.body?.body ?? '').trim()
  if (!messageBody) throw badRequest('Validation failed', { body: 'body is required' })
  const message = await addMessage(ticket.id, {
    body: messageBody,
    author_type: 'client',
    author_user_id: req.user.id
  })
  try {
    await notify({
      category: 'ticket',
      tone: 'info',
      icon: 'i-lucide-life-buoy',
      title: `Reply from ${ticket.client_company || ticket.client_name || 'a client'}`,
      body: `${ticketCode(ticket.id)} · ${ticket.subject}`,
      link: `/support/${ticket.id}`
    })
  } catch (err) {
    console.error(`Portal reply notification failed for ticket ${ticket.id}:`, err.message)
  }
  res.status(201).json({ data: message })
})

// ---- websites (their sites' analytics/uptime rollups) ----

// GET /api/portal/websites
portalRouter.get('/websites', async (req, res) => {
  const result = await listWebsites({ client_id: req.clientId, limit: 100 })
  res.json({ data: result.rows ?? result })
})

// GET /api/portal/websites/:id — site + summary + 30d traffic/uptime series.
portalRouter.get('/websites/:id', async (req, res) => {
  const site = await getWebsite(parseId(req))
  if (!site || Number(site.client_id) !== req.clientId) {
    return res.status(404).json({ error: { message: 'Website not found' } })
  }
  const [summary, series, checks] = await Promise.all([
    websiteSummary(site.id),
    websiteMetricsSeries(site.id, 30),
    websiteChecksSeries(site.id, 30)
  ])
  res.json({ data: { site, summary, series, checks } })
})

// ---- account (contact/billing profile; scoped self-service) ----

// Only contact/billing details — never status/source/stripe ids/notes/tags.
const ACCOUNT_FIELDS = [
  'name', 'phone', 'billing_email',
  'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country'
]
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function pickAccount(client) {
  const out = { company: client.company, email: client.email }
  for (const f of ACCOUNT_FIELDS) out[f] = client[f]
  return out
}

// GET /api/portal/account
portalRouter.get('/account', async (req, res) => {
  const client = await getClient(req.clientId)
  if (!client) return res.status(404).json({ error: { message: 'Account not found' } })
  res.json({ data: { ...pickAccount(client), login_email: req.user.email } })
})

// PATCH /api/portal/account — update contact/billing details, then mirror to Stripe.
portalRouter.patch('/account', async (req, res) => {
  const body = req.body ?? {}
  const data = {}
  const fields = {}
  for (const f of ACCOUNT_FIELDS) {
    if (body[f] === undefined) continue
    const v = body[f] == null ? null : String(body[f]).trim() || null
    if (f === 'name' && !v) fields.name = 'name is required'
    else if (f === 'billing_email' && v && !EMAIL_RE.test(v)) fields.billing_email = 'must be a valid email'
    else data[f] = v
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  if (!Object.keys(data).length) throw badRequest('Nothing to update')

  const client = await updateClient(req.clientId, data)
  // Best-effort Stripe mirror, same as the admin write path.
  if (client?.stripe_customer_id) {
    try {
      await updateStripeCustomer(client)
    } catch (err) {
      console.error(`Stripe customer update failed for client ${client.id}:`, err.message)
    }
  }
  res.json({ data: { ...pickAccount(client), login_email: req.user.email } })
})
