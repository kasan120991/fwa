import { Router } from 'express'
import {
  getTicket, listTickets, listMessages, listAttachments, getMessage, getAttachment,
  ticketCode, openCount, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_TYPES
} from '../repositories/tickets.repo.js'
import { createTicket, updateTicket, deleteTicket, addMessage, addAttachment, removeAttachment } from '../services/tickets.service.js'
import { getClient } from '../repositories/clients.repo.js'
import { getWebsite } from '../repositories/websites.repo.js'
import { notify, clientNotify } from '../services/notifications.service.js'
import { logClientActivity } from '../services/clientActivity.service.js'
import { emitClientTicketUpdated } from '../realtime/io.js'

const PRIORITY_TONE = { high: 'warning', medium: 'info', low: 'info' }
const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' }

// Raise a live bell alert for a ticket event (best-effort — never fails the
// request). Tagged with the acting user so their own toast is suppressed; a
// client-driven event (portal phase) has no actor and toasts the admin.
async function raiseTicketNotification(ticket, { title, body, tone = 'info' }, actorUserId) {
  try {
    await notify({
      category: 'ticket',
      tone,
      icon: 'i-lucide-life-buoy',
      title,
      body,
      link: `/support/${ticket.id}`
    }, actorUserId)
  } catch (err) {
    console.error(`Ticket notification failed for ticket ${ticket.id}:`, err.message)
  }
}
const ticketWho = t => t.client_company || t.client_name || 'A client'

export const ticketsRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req, key = 'id') {
  const id = Number(req.params[key])
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}

function validateTicket(body, { partial = false } = {}) {
  const data = {}
  const fields = {}

  if (body.subject !== undefined) {
    const subject = String(body.subject).trim()
    if (!subject) fields.subject = 'subject is required'
    else data.subject = subject
  } else if (!partial) {
    fields.subject = 'subject is required'
  }

  if (body.client_id !== undefined) {
    const n = Number(body.client_id)
    if (!Number.isInteger(n) || n <= 0) fields.client_id = 'a valid client is required'
    else data.client_id = n
  } else if (!partial) {
    fields.client_id = 'a valid client is required'
  }

  if (body.website_id !== undefined) {
    if (body.website_id === null || body.website_id === '') data.website_id = null
    else {
      const n = Number(body.website_id)
      if (!Number.isInteger(n) || n <= 0) fields.website_id = 'must be a valid website id or null'
      else data.website_id = n
    }
  }

  if (body.description !== undefined) data.description = body.description == null ? null : String(body.description)
  if (body.type !== undefined) {
    if (!TICKET_TYPES.has(body.type)) fields.type = `must be one of ${[...TICKET_TYPES].join(', ')}`
    else data.type = body.type
  }
  if (body.status !== undefined) {
    if (!TICKET_STATUSES.has(body.status)) fields.status = `must be one of ${[...TICKET_STATUSES].join(', ')}`
    else data.status = body.status
  }
  if (body.priority !== undefined) {
    if (!TICKET_PRIORITIES.has(body.priority)) fields.priority = `must be one of ${[...TICKET_PRIORITIES].join(', ')}`
    else data.priority = body.priority
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

// A website reference must exist and belong to the ticket's client.
async function checkWebsite(website_id, client_id) {
  if (website_id == null) return
  const website = await getWebsite(website_id)
  if (!website) throw badRequest('Validation failed', { website_id: 'website not found' })
  if (client_id != null && website.client_id !== client_id) {
    throw badRequest('Validation failed', { website_id: 'website does not belong to this client' })
  }
}

// GET /api/tickets  ?client_id= ?website_id= ?status= ?open=1 ?q=
ticketsRouter.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !TICKET_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listTickets({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    website_id: req.query.website_id ? Number(req.query.website_id) : undefined,
    status,
    open: req.query.open === '1' || req.query.open === 'true',
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/tickets/open-count — count of tickets still needing work (for the
// sidebar badge). Registered before /:id so "open-count" isn't parsed as an id.
ticketsRouter.get('/open-count', async (req, res) => {
  res.json({ data: { count: await openCount() } })
})

// GET /api/tickets/:id — the ticket with its reply thread + attachments embedded.
ticketsRouter.get('/:id', async (req, res) => {
  const id = parseId(req)
  const ticket = await getTicket(id)
  if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } })
  const [messages, attachments] = await Promise.all([listMessages(id), listAttachments(id)])
  res.json({ data: { ...ticket, messages, attachments } })
})

// POST /api/tickets
ticketsRouter.post('/', async (req, res) => {
  const data = validateTicket(req.body ?? {}, { partial: false })
  const client = await getClient(data.client_id)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  await checkWebsite(data.website_id ?? null, data.client_id)
  data.opened_by = 'admin' // client-opened tickets arrive in the portal phase
  const ticket = await createTicket(data)
  await raiseTicketNotification(ticket, {
    title: `New support ticket ${ticketCode(ticket.id)}`,
    body: `${ticketWho(ticket)}: ${ticket.subject}`,
    tone: PRIORITY_TONE[ticket.priority] ?? 'info'
  }, req.user.id)
  await logClientActivity(ticket.client_id, {
    category: 'ticket', icon: 'i-lucide-life-buoy',
    title: `Ticket opened: ${ticket.subject}`,
    meta: `${ticketCode(ticket.id)} · ${ticket.priority} priority`,
    link: `/support/${ticket.id}`
  })
  res.status(201).json({ data: ticket })
})

// PATCH /api/tickets/:id
ticketsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getTicket(id)
  if (!existing) return res.status(404).json({ error: { message: 'Ticket not found' } })
  const data = validateTicket(req.body ?? {}, { partial: true })
  if (data.client_id) {
    const client = await getClient(data.client_id)
    if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  }
  if (data.website_id !== undefined) {
    await checkWebsite(data.website_id, data.client_id ?? existing.client_id)
  }
  const ticket = await updateTicket(id, data)

  // Alert on a status transition (e.g. resolved, closed, or reopened).
  if (data.status !== undefined && data.status !== existing.status) {
    const wasDone = existing.status === 'resolved' || existing.status === 'closed'
    const isDone = ticket.status === 'resolved' || ticket.status === 'closed'
    const reopened = wasDone && !isDone
    const tone = ticket.status === 'resolved' ? 'success' : reopened ? 'warning' : 'info'
    await raiseTicketNotification(ticket, {
      title: `${ticketCode(ticket.id)} ${reopened ? 'Reopened' : (STATUS_LABEL[ticket.status] ?? ticket.status)}`,
      body: `${ticketWho(ticket)}: ${ticket.subject}`,
      tone
    }, req.user.id)
    await logClientActivity(ticket.client_id, {
      category: 'ticket', icon: 'i-lucide-life-buoy',
      title: `${ticketCode(ticket.id)} ${reopened ? 'reopened' : (STATUS_LABEL[ticket.status] ?? ticket.status).toLowerCase()}: ${ticket.subject}`,
      link: `/support/${ticket.id}`
    })
  }

  res.json({ data: ticket })
})

// DELETE /api/tickets/:id
ticketsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteTicket(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Ticket not found' } })
  res.json({ ok: true })
})

// ---- reply thread ----------------------------------------------------------

// GET /api/tickets/:id/messages
ticketsRouter.get('/:id/messages', async (req, res) => {
  const id = parseId(req)
  if (!await getTicket(id)) return res.status(404).json({ error: { message: 'Ticket not found' } })
  res.json({ data: await listMessages(id) })
})

// POST /api/tickets/:id/messages  { body }
ticketsRouter.post('/:id/messages', async (req, res) => {
  const id = parseId(req)
  const ticket = await getTicket(id)
  if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } })
  const body = String(req.body?.body ?? '').trim()
  if (!body) throw badRequest('Validation failed', { body: 'a message is required' })
  const message = await addMessage(id, { body, author_type: 'admin', author_user_id: req.user.id })
  await raiseTicketNotification(ticket, {
    title: `New reply on ${ticketCode(ticket.id)}`,
    body: `${ticketWho(ticket)}: ${ticket.subject}`,
    tone: 'info'
  }, req.user.id)
  // Push the reply to the client's portal (live refresh + their own bell).
  emitClientTicketUpdated(ticket.client_id, ticket.id)
  try {
    await clientNotify(ticket.client_id, {
      category: 'ticket', tone: 'info', icon: 'i-lucide-life-buoy',
      title: `New reply on ${ticketCode(ticket.id)}`,
      body: ticket.subject,
      link: `/support/${ticket.id}`
    })
  } catch (err) { console.error('client ticket notify failed:', err.message) }
  res.status(201).json({ data: message })
})

// ---- attachments -----------------------------------------------------------
// Files are uploaded first via POST /api/uploads; this records the resulting
// metadata against the ticket (optionally against a specific reply).

// GET /api/tickets/:id/attachments
ticketsRouter.get('/:id/attachments', async (req, res) => {
  const id = parseId(req)
  if (!await getTicket(id)) return res.status(404).json({ error: { message: 'Ticket not found' } })
  res.json({ data: await listAttachments(id) })
})

// POST /api/tickets/:id/attachments  { path, name, mime?, size?, message_id? }
ticketsRouter.post('/:id/attachments', async (req, res) => {
  const id = parseId(req)
  if (!await getTicket(id)) return res.status(404).json({ error: { message: 'Ticket not found' } })
  const b = req.body ?? {}
  const fields = {}
  const path = String(b.path ?? '').trim()
  const name = String(b.name ?? '').trim()
  if (!path.startsWith('/uploads/')) fields.path = 'a valid uploaded path is required'
  if (!name) fields.name = 'a file name is required'
  let message_id = null
  if (b.message_id != null && b.message_id !== '') {
    const n = Number(b.message_id)
    if (!Number.isInteger(n) || n <= 0) fields.message_id = 'must be a valid message id'
    else {
      const msg = await getMessage(n)
      if (!msg || msg.ticket_id !== id) fields.message_id = 'message does not belong to this ticket'
      else message_id = n
    }
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const size = Number(b.size)
  const attachment = await addAttachment(id, {
    message_id,
    path,
    name,
    mime: typeof b.mime === 'string' ? b.mime : null,
    size_bytes: Number.isFinite(size) && size >= 0 ? size : null,
    uploaded_by: 'admin',
    uploaded_user_id: req.user.id
  })
  res.status(201).json({ data: attachment })
})

// DELETE /api/tickets/:id/attachments/:attId
ticketsRouter.delete('/:id/attachments/:attId', async (req, res) => {
  const id = parseId(req)
  const attId = parseId(req, 'attId')
  const attachment = await getAttachment(attId)
  if (!attachment || attachment.ticket_id !== id) {
    return res.status(404).json({ error: { message: 'Attachment not found' } })
  }
  await removeAttachment(attId)
  res.json({ ok: true })
})
