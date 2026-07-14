import { createClientActivity, ACTIVITY_CATEGORIES } from '../repositories/clientActivity.repo.js'
import { emitClientActivityNew } from '../realtime/io.js'

/**
 * Append an event to a client's timeline and push it live. Mirrors notify():
 * any client-scoped feature (invoice paid, contract signed, ticket opened, …)
 * calls this beside its notify() so the client detail page's Activity feed
 * stays complete.
 *
 * Best-effort by design — it never throws. A failed timeline write must not
 * break the business action (webhook, invoice create, …) that triggered it.
 */
export async function logClientActivity(clientId, data) {
  if (!clientId || !data?.category || !data?.title) return null
  if (!ACTIVITY_CATEGORIES.has(data.category)) return null
  try {
    const activity = await createClientActivity({ ...data, client_id: clientId })
    emitClientActivityNew(activity)
    return activity
  } catch (err) {
    console.error(`client_activity write failed for client ${clientId}:`, err.message)
    return null
  }
}
