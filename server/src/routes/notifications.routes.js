import { Router } from 'express'
import { listNotifications, getNotification, setRead, markAllRead, clearNotifications } from '../repositories/notifications.repo.js'
import { emitNotificationRead, emitNotificationReadAll, emitNotificationCleared } from '../realtime/io.js'
import { notify } from '../services/notifications.service.js'
import { config } from '../config/env.js'

export const notificationsRouter = Router()

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

// GET /api/notifications — feed for the signed-in user. ?filter=unread
notificationsRouter.get('/', async (req, res) => {
  const result = await listNotifications(req.user.id, {
    unreadOnly: req.query.filter === 'unread',
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, unread: result.unread, limit: result.limit, offset: result.offset })
})

// POST /api/notifications/mark-all-read — clear the unread state in one shot.
notificationsRouter.post('/mark-all-read', async (req, res) => {
  const result = await markAllRead(req.user.id)
  emitNotificationReadAll(req.user.id) // sync the user's other tabs
  res.json({ data: result })
})

// DELETE /api/notifications — clear the user's feed entirely.
notificationsRouter.delete('/', async (req, res) => {
  const result = await clearNotifications(req.user.id)
  emitNotificationCleared(req.user.id) // sync the user's other tabs
  res.json({ data: result })
})

// POST /api/notifications/test — dev-only: raise a live notification so the
// realtime push can be exercised without a real producer. Disabled in prod.
notificationsRouter.post('/test', async (req, res) => {
  if (config.nodeEnv === 'production') {
    return res.status(404).json({ error: { message: 'Not found' } })
  }
  const notification = await notify({
    user_id: null, // broadcast to admins
    category: 'system',
    tone: 'brand',
    icon: 'i-lucide-bell',
    title: req.body?.title || 'Live notification',
    body: req.body?.body || 'Pushed over Socket.IO in real time.',
    link: req.body?.link || null
  })
  res.status(201).json({ data: notification })
})

// PATCH /api/notifications/:id — toggle read state. Body: { read: boolean }
notificationsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getNotification(req.user.id, id)) {
    return res.status(404).json({ error: { message: 'Notification not found' } })
  }
  if (typeof req.body?.read !== 'boolean') {
    throw badRequest('Validation failed', { read: 'must be a boolean' })
  }
  const notification = await setRead(req.user.id, id, req.body.read)
  if (req.body.read) emitNotificationRead(req.user.id, id) // sync the user's other tabs
  res.json({ data: notification })
})
