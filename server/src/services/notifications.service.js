import { createNotification } from '../repositories/notifications.repo.js'
import { emitNotificationNew } from '../realtime/io.js'

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
  const notification = await createNotification(data)
  emitNotificationNew(notification, actorUserId)
  return notification
}
