import { Router } from 'express'
import { listProjects, getProject } from '../repositories/projects.repo.js'
import { listMilestones } from '../repositories/milestones.repo.js'
import { listInvoices, getInvoice } from '../repositories/invoices.repo.js'
import { listAgreements } from '../repositories/agreements.repo.js'
import { getProposal } from '../repositories/proposals.repo.js'
import { getContract } from '../repositories/contracts.repo.js'
import { listFiles, createFile } from '../repositories/files.repo.js'
import {
  listTickets, getTicket, listMessages, listAttachments, getMessage, ticketCode, TICKET_TYPES
} from '../repositories/tickets.repo.js'
import { createTicket, addMessage, addAttachment } from '../services/tickets.service.js'
import {
  listWebsites, getWebsite, websiteSummary, websiteMetricsSeries, websiteChecksSeries
} from '../repositories/websites.repo.js'
import { getClient, updateClient } from '../repositories/clients.repo.js'
import {
  listOwnNotifications, setOwnRead, markAllOwnRead, clearOwnNotifications
} from '../repositories/notifications.repo.js'
import {
  updateStripeCustomer, stripeEnabled, publishableKey, getInvoicePaymentSecret
} from '../services/stripe.js'
import { notify } from '../services/notifications.service.js'
import { pandadocEnabled, getDocumentStatus, createDocumentSession } from '../services/pandadoc.js'
import { portalUpload } from '../storage/local.js'
import { emitClientTicketUpdated } from '../realtime/io.js'

// PandaDoc statuses for which an embedded signing session can be minted.
const EMBEDDABLE_STATUSES = new Set([
  'document.sent', 'document.viewed', 'document.completed', 'document.paid'
])

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

// ---- invoices (draft + voided stay internal) ----

const HIDDEN_INVOICE_STATUSES = new Set(['draft', 'void'])

// GET /api/portal/invoices
portalRouter.get('/invoices', async (req, res) => {
  const result = await listInvoices({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows.filter(i => !HIDDEN_INVOICE_STATUSES.has(i.status)) })
})

// GET /api/portal/invoices/:id — detail with line items + payments.
portalRouter.get('/invoices/:id', async (req, res) => {
  const invoice = await getInvoice(parseId(req))
  if (!invoice || Number(invoice.client_id) !== req.clientId || HIDDEN_INVOICE_STATUSES.has(invoice.status)) {
    return res.status(404).json({ error: { message: 'Invoice not found' } })
  }
  res.json({ data: invoice })
})

// POST /api/portal/invoices/:id/payment-intent — return this invoice's own
// PaymentIntent client secret so the client can pay it in-portal with the Stripe
// Payment Element. Confirming it client-side pays the invoice directly.
portalRouter.post('/invoices/:id/payment-intent', async (req, res) => {
  const invoice = await getInvoice(parseId(req))
  if (!invoice || Number(invoice.client_id) !== req.clientId || HIDDEN_INVOICE_STATUSES.has(invoice.status)) {
    return res.status(404).json({ error: { message: 'Invoice not found' } })
  }
  if (invoice.status !== 'open') {
    return res.status(409).json({ error: { message: 'This invoice is not open for payment.' } })
  }
  if (!stripeEnabled() || !publishableKey()) {
    return res.status(409).json({ error: { message: 'Online payments are not available right now.' } })
  }
  if (!invoice.stripe_invoice_id) {
    return res.status(409).json({ error: { message: 'This invoice can’t be paid online yet.' } })
  }
  const clientSecret = await getInvoicePaymentSecret(invoice.stripe_invoice_id)
  if (!clientSecret) {
    return res.status(409).json({ error: { message: 'Online payments are not available right now.' } })
  }
  res.json({ data: { clientSecret, publishableKey: publishableKey() } })
})

// ---- agreements (proposals + contracts union; read-only this phase) ----

// GET /api/portal/agreements
portalRouter.get('/agreements', async (req, res) => {
  const result = await listAgreements({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows })
})

// ---- files (curated admin-shared + the client's own uploads) ----

// GET /api/portal/files — brand/contract/deliverable that we shared, plus
// anything the client uploaded themselves (any category).
portalRouter.get('/files', async (req, res) => {
  const rows = await listFiles({ client_id: req.clientId, limit: 500 })
  res.json({ data: (rows.rows ?? rows).filter(f => f.category !== 'other' || f.uploaded_by === 'client') })
})

// POST /api/portal/uploads — store a file (allowlisted type), return its path.
portalRouter.post(
  '/uploads',
  (req, res, next) => {
    portalUpload.single('file')(req, res, (err) => {
      if (err) {
        const e = new Error(err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : (err.message || 'Upload failed'))
        e.status = 400
        return next(e)
      }
      next()
    })
  },
  (req, res, next) => {
    if (!req.file) return next(badRequest('No file provided (expected field "file")'))
    res.status(201).json({
      data: { path: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype }
    })
  }
)

// POST /api/portal/files — record a client upload (scoped, tagged client-provided).
portalRouter.post('/files', async (req, res) => {
  const b = req.body ?? {}
  const filePath = String(b.path ?? '').trim()
  const name = String(b.name ?? '').trim()
  const fields = {}
  if (!filePath.startsWith('/uploads/')) fields.path = 'a valid uploaded path is required'
  if (!name) fields.name = 'a file name is required'
  // Optional project tag — must be the client's own project.
  let project_id = null
  if (b.project_id != null && b.project_id !== '') {
    const pid = Number(b.project_id)
    const project = Number.isInteger(pid) ? await getProject(pid) : null
    if (!project || Number(project.client_id) !== req.clientId) fields.project_id = 'not your project'
    else project_id = pid
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const size = Number(b.size)
  const file = await createFile({
    client_id: req.clientId,
    project_id,
    category: 'other',
    path: filePath,
    name,
    mime: typeof b.mime === 'string' ? b.mime : null,
    size_bytes: Number.isFinite(size) && size >= 0 ? size : null,
    uploaded_by: 'client',
    uploaded_user_id: req.user.id
  })
  res.status(201).json({ data: file })
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

// GET /api/portal/tickets/:id — ticket + full message thread + attachments.
portalRouter.get('/tickets/:id', async (req, res) => {
  const ticket = await ownTicket(req, res)
  if (!ticket) return
  const [messages, attachments] = await Promise.all([listMessages(ticket.id), listAttachments(ticket.id)])
  res.json({ data: { ticket, messages, attachments } })
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

// POST /api/portal/tickets/:id/attachments — attach an uploaded file to the
// thread (optionally to a specific reply). Bytes come from POST /portal/uploads.
portalRouter.post('/tickets/:id/attachments', async (req, res) => {
  const ticket = await ownTicket(req, res)
  if (!ticket) return
  const b = req.body ?? {}
  const filePath = String(b.path ?? '').trim()
  const name = String(b.name ?? '').trim()
  const fields = {}
  if (!filePath.startsWith('/uploads/')) fields.path = 'a valid uploaded path is required'
  if (!name) fields.name = 'a file name is required'
  let message_id = null
  if (b.message_id != null && b.message_id !== '') {
    const mid = Number(b.message_id)
    const msg = Number.isInteger(mid) ? await getMessage(mid) : null
    if (!msg || Number(msg.ticket_id) !== ticket.id) fields.message_id = 'not a message on this ticket'
    else message_id = mid
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const size = Number(b.size)
  const attachment = await addAttachment(ticket.id, {
    message_id,
    path: filePath,
    name,
    mime: typeof b.mime === 'string' ? b.mime : null,
    size_bytes: Number.isFinite(size) && size >= 0 ? size : null,
    uploaded_by: 'client',
    uploaded_user_id: req.user.id
  })
  // Live-refresh the admin ticket + let the client's own other tabs update.
  emitClientTicketUpdated(ticket.client_id, ticket.id)
  res.status(201).json({ data: attachment })
})

// ---- agreements signing (embedded PandaDoc session) ----

// GET /api/portal/agreements/:kind/:id/session — mint an embedded signing
// session for the client's own proposal/contract. Recipient = the client's
// email already on the PandaDoc doc; never a query param.
portalRouter.get('/agreements/:kind/:id/session', async (req, res) => {
  const kind = req.params.kind
  if (kind !== 'proposal' && kind !== 'contract') throw badRequest('Unknown agreement kind')
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')

  const doc = kind === 'proposal' ? await getProposal(id) : await getContract(id)
  if (!doc || Number(doc.client_id) !== req.clientId) {
    return res.status(404).json({ error: { message: 'Agreement not found' } })
  }
  if (!pandadocEnabled() || !doc.pandadoc_document_id) {
    return res.json({ data: { ready: false, reason: 'no_document' } })
  }

  let status
  try {
    status = await getDocumentStatus(doc.pandadoc_document_id)
  } catch (err) {
    return res.status(502).json({ error: { message: `PandaDoc status check failed: ${err.message}` } })
  }
  if (status === 'document.draft') return res.json({ data: { ready: false, reason: 'draft', status } })
  if (!EMBEDDABLE_STATUSES.has(status)) return res.json({ data: { ready: false, reason: 'processing', status } })

  const client = await getClient(req.clientId)
  const recipient = client?.billing_email || client?.email
  if (!recipient) return res.json({ data: { ready: false, reason: 'no_recipient', status } })
  try {
    const session = await createDocumentSession(doc.pandadoc_document_id, { recipient })
    if (!session) return res.json({ data: { ready: false, reason: 'no_document' } })
    return res.json({ data: { ready: true, embedUrl: `https://app.pandadoc.com/s/${session.id}/`, expiresAt: session.expiresAt, status } })
  } catch (err) {
    console.error(`Portal PandaDoc session failed for ${kind} ${id} (recipient ${recipient}):`, err.message)
    return res.json({ data: { ready: false, reason: 'session_error', status, message: err.message } })
  }
})

// ---- notifications (the client's own bell; strict per-user scope) ----

// GET /api/portal/notifications
portalRouter.get('/notifications', async (req, res) => {
  const result = await listOwnNotifications(req.user.id, { limit: req.query.limit })
  res.json({ data: result.rows, unread: result.unread })
})

// POST /api/portal/notifications/mark-all-read
portalRouter.post('/notifications/mark-all-read', async (req, res) => {
  res.json({ data: await markAllOwnRead(req.user.id) })
})

// DELETE /api/portal/notifications — clear the client's own notifications.
portalRouter.delete('/notifications', async (req, res) => {
  res.json({ data: await clearOwnNotifications(req.user.id) })
})

// PATCH /api/portal/notifications/:id  { read }
portalRouter.patch('/notifications/:id', async (req, res) => {
  const notification = await setOwnRead(req.user.id, parseId(req), req.body?.read !== false)
  if (!notification) return res.status(404).json({ error: { message: 'Notification not found' } })
  res.json({ data: notification })
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
