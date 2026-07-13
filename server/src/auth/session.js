import crypto from 'node:crypto'
import { query } from '../db/pool.js'
import { isProd } from '../config/env.js'

export const SESSION_COOKIE = 'fwa_session'
const SESSION_TTL_DAYS = 7
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

/** SHA-256 hex of a token. Only the hash is stored server-side. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Cookie options shared by set/clear so they always match. */
export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(maxAgeMs != null ? { maxAge: maxAgeMs } : {})
  }
}

/** Create a session row for a user, returning the raw token for the cookie. */
export async function createSession(userId, { userAgent, ip } = {}) {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES (:userId, :tokenHash, :userAgent, :ip, :expiresAt)`,
    {
      userId,
      tokenHash,
      userAgent: userAgent?.slice(0, 255) ?? null,
      ip: ip ?? null,
      expiresAt
    }
  )

  return { token, maxAgeMs: SESSION_TTL_MS }
}

/** Resolve a raw token to its active user, or null. */
export async function getSessionUser(token) {
  if (!token) return null
  const rows = await query(
    `SELECT u.id, u.email, u.name, u.role, u.client_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = :tokenHash
        AND s.expires_at > NOW()
        AND u.is_active = 1
      LIMIT 1`,
    { tokenHash: hashToken(token) }
  )
  return rows[0] ?? null
}

/** Revoke a single session by its raw token. */
export async function destroySession(token) {
  if (!token) return
  await query('DELETE FROM sessions WHERE token_hash = :tokenHash', {
    tokenHash: hashToken(token)
  })
}
