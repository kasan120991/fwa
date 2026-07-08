import { createNotification } from '../repositories/notifications.repo.js'
import { emitNotificationNew } from '../realtime/io.js'

// Minor words kept lowercase mid-title (standard title case).
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

/**
 * Normalize a notification title to Title Case so every alert reads uniformly
 * (producers can write plain sentence case). Words that already carry an
 * uppercase letter or a digit are left untouched, so codes/acronyms survive
 * (e.g. `SR-001`, `PDF`, `In Progress`).
 */
function titleCase(str) {
  return String(str).split(/\s+/).map((w, i) => {
    if (!w) return w
    if (/[A-Z0-9]/.test(w)) return w
    if (i > 0 && MINOR_WORDS.has(w)) return w
    return w[0].toUpperCase() + w.slice(1)
  }).join(' ')
}

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
  const notification = await createNotification(
    data.title ? { ...data, title: titleCase(data.title) } : data
  )
  emitNotificationNew(notification, actorUserId)
  return notification
}
