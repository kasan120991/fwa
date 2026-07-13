import { Server } from 'socket.io'
import { config } from '../config/env.js'
import { SESSION_COOKIE, getSessionUser } from '../auth/session.js'

let io = null

// Minimal cookie-header parser — we only need one value and don't want to pull
// the request through Express's cookie-parser here.
function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

/**
 * Attach Socket.IO to the existing HTTP server. Connections are authenticated
 * with the same httpOnly session cookie the REST API uses (it rides along on
 * the handshake when the client connects with withCredentials). Each socket
 * joins a per-user room and a per-role room so we can target emits precisely.
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    // Same origin allow-list + credentials as the REST CORS, so the cookie flows.
    cors: { origin: config.corsOrigin, credentials: true }
  })

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie)
      const user = await getSessionUser(cookies[SESSION_COOKIE])
      if (!user) return next(new Error('unauthorized'))
      socket.data.user = user
      next()
    } catch (err) {
      next(err)
    }
  })

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user
    socket.join(`user:${id}`)
    socket.join(`role:${role}`)
  })

  return io
}

export function getIo() {
  return io
}

// --- notification emitters ------------------------------------------------
// Broadcast notifications (user_id NULL) fan out to every admin; targeted ones
// go to that single user's room. Read events sync the acting user's own tabs.

function newRoom(userId) {
  return userId ? `user:${userId}` : 'role:admin'
}

export function emitNotificationNew(notification, actorUserId = null) {
  // `actor_user_id` is transient (not stored) — it lets the acting user's own
  // tabs skip the live toast for an action they already toasted locally.
  io?.to(newRoom(notification.user_id)).emit('notification:new', { ...notification, actor_user_id: actorUserId })
}

export function emitNotificationRead(userId, id) {
  io?.to(`user:${userId}`).emit('notification:read', { id })
}

export function emitNotificationReadAll(userId) {
  io?.to(`user:${userId}`).emit('notification:read-all')
}

export function emitNotificationCleared(userId) {
  io?.to(`user:${userId}`).emit('notification:cleared')
}

// --- project + task emitters ----------------------------------------------
// Single-admin app today, so these broadcast to every admin. Payloads are the
// full mapped row (or { id } for deletes) so listeners can upsert/remove in place.

export function emitProjectCreated(project) {
  io?.to('role:admin').emit('project:created', project)
}
export function emitProjectUpdated(project) {
  io?.to('role:admin').emit('project:updated', project)
}
export function emitProjectDeleted(id) {
  io?.to('role:admin').emit('project:deleted', { id })
}

export function emitTaskCreated(task) {
  io?.to('role:admin').emit('task:created', task)
}
export function emitTaskUpdated(task) {
  io?.to('role:admin').emit('task:updated', task)
}
export function emitTaskDeleted(id, project_id = null) {
  io?.to('role:admin').emit('task:deleted', { id, project_id })
}

// --- milestone emitters ----------------------------------------------------
// Delivery milestones over tasks. Broadcast to admins so a project's task board
// re-renders live. Payload is the full mapped milestone (or { id, project_id }).

export function emitMilestoneCreated(milestone) {
  io?.to('role:admin').emit('milestone:created', milestone)
}
export function emitMilestoneUpdated(milestone) {
  io?.to('role:admin').emit('milestone:updated', milestone)
}
export function emitMilestoneDeleted(id, project_id = null) {
  io?.to('role:admin').emit('milestone:deleted', { id, project_id })
}

// --- support ticket emitters ----------------------------------------------
// Broadcast to admins so the /support list, a ticket detail, and the client
// Support tab refresh live. Payload is the full mapped ticket (or { id } for
// deletes); message/attachment changes ride on ticket:updated.

export function emitTicketCreated(ticket) {
  io?.to('role:admin').emit('ticket:created', ticket)
}
export function emitTicketUpdated(ticket) {
  io?.to('role:admin').emit('ticket:updated', ticket)
}
export function emitTicketDeleted(id, client_id = null) {
  io?.to('role:admin').emit('ticket:deleted', { id, client_id })
}

// --- billing emitters -----------------------------------------------------
// Broadcast so the Invoices/Payments pages refresh live. Payload is minimal;
// listeners refetch (list pages) rather than upsert in place.

export function emitInvoiceChanged(id) {
  io?.to('role:admin').emit('invoice:changed', { id })
}

// Fired when a contract's status changes (generated, sent, or a PandaDoc webhook
// state change) so the Agreements list and a contract viewer refresh live.
export function emitContractChanged(id) {
  io?.to('role:admin').emit('contract:changed', { id })
}
export function emitPaymentCreated(id) {
  io?.to('role:admin').emit('payment:created', { id })
}
// Fired on any expense create/update/delete/cancel so the Expenses page and the
// dashboard's Needs Attention card refresh live.
export function emitExpenseChanged(id = null) {
  io?.to('role:admin').emit('expense:changed', { id })
}

// --- calls -----------------------------------------------------------------
// Fired when a call's reviewed state or classification changes, so the AI
// Receptionist nav badge (new-call count) refreshes live.
export function emitCallChanged() {
  io?.to('role:admin').emit('call:changed')
}

// Fired when a brand-new call is ingested from Vapi. Payload is the full mapped
// row so the receptionist inbox can prepend it in place; the sidebar badge and
// dashboard "Needs Attention" listen too (refetch their counts).
export function emitCallCreated(call) {
  io?.to('role:admin').emit('call:new', call)
}

// --- websites --------------------------------------------------------------
// Fired when a site, its analytics sync, or an uptime check changes, so the
// Websites dashboard / detail / client tab refresh live.
export function emitWebsiteChanged(id = null) {
  io?.to('role:admin').emit('website:changed', { id })
}

// --- files -----------------------------------------------------------------
// Fired on any file upload/rename/delete so the Workspace › Files page (and,
// later, the client/project Files tabs) refresh live.
export function emitFileChanged(id = null) {
  io?.to('role:admin').emit('file:changed', { id })
}
