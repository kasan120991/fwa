import { SESSION_COOKIE, getSessionUser } from '../auth/session.js'

/** Gate a route: attaches req.user or responds 401. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  const user = await getSessionUser(token)
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated' } })
  }
  req.user = user
  next()
}
