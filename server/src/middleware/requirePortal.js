import { SESSION_COOKIE, getSessionUser } from '../auth/session.js'

/** Gate a client-portal route: requires a client login linked to a client row.
 *  Attaches req.user and req.clientId (the scope for every portal query), or
 *  401 (unauthenticated) / 403 (authenticated but not a linked client). */
export async function requirePortal(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  const user = await getSessionUser(token)
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated' } })
  }
  if (user.role !== 'client' || user.client_id == null) {
    return res.status(403).json({ error: { message: 'Client portal access required' } })
  }
  req.user = user
  req.clientId = Number(user.client_id)
  next()
}
