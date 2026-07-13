import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  cookieOptions
} from '../auth/session.js'
import { findLiveInvite, markInviteUsed, setUserPassword, getUserById } from '../repositories/users.repo.js'

export const authRouter = Router()

// POST /api/auth/login — verify credentials, start a session.
authRouter.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!email || !password) {
    return res.status(400).json({ error: { message: 'Email and password are required' } })
  }

  const rows = await query(
    `SELECT id, email, name, role, client_id, password_hash
       FROM users WHERE email = :email AND is_active = 1 LIMIT 1`,
    { email }
  )
  const user = rows[0]

  // Generic message either way — don't reveal which part failed.
  const ok = user && (await bcrypt.compare(password, user.password_hash))
  if (!ok) {
    return res.status(401).json({ error: { message: 'Invalid email or password' } })
  }

  const { token, maxAgeMs } = await createSession(user.id, {
    userAgent: req.get('user-agent'),
    ip: req.ip
  })
  await query('UPDATE users SET last_login_at = NOW() WHERE id = :id', { id: user.id })

  res.cookie(SESSION_COOKIE, token, cookieOptions(maxAgeMs))
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: user.client_id } })
})

// POST /api/auth/set-password — consume a one-time invite token, set the
// password, and start a session (auto-login). Backs the portal invite flow.
authRouter.post('/set-password', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!token || password.length < 8) {
    return res.status(400).json({ error: { message: 'A valid link and a password of at least 8 characters are required.' } })
  }

  const invite = await findLiveInvite(token)
  if (!invite) {
    return res.status(400).json({ error: { message: 'This link is invalid or has expired.' } })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await setUserPassword(invite.user_id, passwordHash)
  await markInviteUsed(invite.id)

  const { token: sessionToken, maxAgeMs } = await createSession(invite.user_id, {
    userAgent: req.get('user-agent'),
    ip: req.ip
  })
  await query('UPDATE users SET last_login_at = NOW() WHERE id = :id', { id: invite.user_id })

  res.cookie(SESSION_COOKIE, sessionToken, cookieOptions(maxAgeMs))
  res.json({ user: await getUserById(invite.user_id) })
})

// POST /api/auth/logout — revoke the current session.
authRouter.post('/logout', async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE])
  res.clearCookie(SESSION_COOKIE, cookieOptions())
  res.json({ ok: true })
})

// GET /api/auth/me — the current user (401 if not authenticated).
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
