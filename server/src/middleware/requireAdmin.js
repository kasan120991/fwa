import { SESSION_COOKIE, getSessionUser } from '../auth/session.js'

/** Gate an admin-only route: attaches req.user, or 401 (unauthenticated) /
 *  403 (a valid session but not an admin — e.g. a client-portal login). */
export async function requireAdmin(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  const user = await getSessionUser(token)
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated' } })
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Admin access required' } })
  }
  req.user = user
  next()
}
