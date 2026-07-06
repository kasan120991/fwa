import { createNotification } from '../repositories/notifications.repo.js'
import { emitNotificationNew } from '../realtime/io.js'

/**
 * Create a notification and push it to its recipients in real time. Any feature
 * that should raise an alert (new lead, paid invoice, call logged, …) calls
 * this instead of the repo directly, so the bell updates live everywhere.
 */
export async function notify(data) {
  const notification = await createNotification(data)
  emitNotificationNew(notification)
  return notification
}
