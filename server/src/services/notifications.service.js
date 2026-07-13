import { createNotification } from '../repositories/notifications.repo.js'
import { getPortalUserForClient } from '../repositories/users.repo.js'
import { emitNotificationNew } from '../realtime/io.js'
import { titleCase } from '../utils/text.js'
import { notificationEnabled } from './settings.service.js'

/**
 * Create a notification and push it to its recipients in real time. Any feature
 * that should raise an alert (new lead, paid invoice, call logged, …) calls
 * this instead of the repo directly, so the bell updates live everywhere.
 */
// `actorUserId` (optional) is the admin who triggered this notification via a
// foreground action they already got a local toast for. It's passed through to
// the live emit (not persisted) so that user's own browser can skip re-toasting
// it. Omit it for background events (webhooks, jobs) so they always toast.
export async function notify(data, actorUserId = null) {
  // Admin alerts (no user_id = broadcast) respect the per-category notification
  // preferences in Settings. Client-targeted notifications (user_id set, e.g.
  // clientNotify) are never gated by the admin's prefs.
  if (data.user_id == null && data.category && !(await notificationEnabled(data.category))) {
    return null
  }
  const notification = await createNotification(
    data.title ? { ...data, title: titleCase(data.title) } : data
  )
  emitNotificationNew(notification, actorUserId)
  return notification
}

/**
 * Notify a client's portal user (if one exists). Resolves the client to its
 * portal login and targets the notification to that user_id, so it lands only in
 * that client's portal bell (`links` should be portal-relative). No-op when the
 * client has no portal account. Best-effort — callers wrap in try/catch.
 */
export async function clientNotify(clientId, data) {
  if (!clientId) return null
  const user = await getPortalUserForClient(clientId)
  if (!user) return null
  return notify({ ...data, user_id: user.id })
}
