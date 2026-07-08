import * as repo from '../repositories/tickets.repo.js'
import { emitTicketCreated, emitTicketUpdated, emitTicketDeleted } from '../realtime/io.js'

// Write-path wrapper: persist via the repo, then push the change to admins live.
// Reads go straight to the repo.

export async function createTicket(data) {
  const ticket = await repo.createTicket(data)
  emitTicketCreated(ticket)
  return ticket
}

export async function updateTicket(id, data) {
  const ticket = await repo.updateTicket(id, data)
  if (ticket) emitTicketUpdated(ticket)
  return ticket
}

export async function deleteTicket(id) {
  const existing = await repo.getTicket(id)
  const ok = await repo.deleteTicket(id)
  if (ok) emitTicketDeleted(id, existing?.client_id ?? null)
  return ok
}

// ---- replies + attachments: mutate, bump the ticket's activity clock, then
// push the parent ticket so both list surfaces + the detail refresh live. ----
async function touchTicket(ticketId) {
  await repo.touchTicket(ticketId)
  const ticket = await repo.getTicket(ticketId)
  if (ticket) emitTicketUpdated(ticket)
  return ticket
}

export async function addMessage(ticketId, data) {
  const message = await repo.createMessage(ticketId, data)
  await touchTicket(ticketId)
  return message
}

export async function addAttachment(ticketId, data) {
  const attachment = await repo.createAttachment(ticketId, data)
  await touchTicket(ticketId)
  return attachment
}

export async function removeAttachment(id) {
  const attachment = await repo.getAttachment(id)
  if (!attachment) return false
  const ok = await repo.deleteAttachment(id)
  if (ok) await touchTicket(attachment.ticket_id)
  return ok
}
