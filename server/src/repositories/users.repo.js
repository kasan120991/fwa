import crypto from 'node:crypto'
import { query } from '../db/pool.js'
import { hashToken } from '../auth/session.js'

const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000 // set-password links live 3 days

const norm = e => String(e).trim().toLowerCase()

export async function findUserByEmail(email) {
  const rows = await query(
    'SELECT id, email, name, role, client_id, is_active FROM users WHERE email = :email LIMIT 1',
    { email: norm(email) }
  )
  return rows[0] ?? null
}

export async function getUserById(id) {
  const rows = await query(
    'SELECT id, email, name, role, client_id FROM users WHERE id = :id LIMIT 1',
    { id }
  )
  return rows[0] ?? null
}

/** The active client-portal login linked to a client (for the admin status chip). */
export async function getPortalUserForClient(clientId) {
  const rows = await query(
    `SELECT id, email, name, last_login_at
       FROM users
      WHERE client_id = :clientId AND role = 'client' AND is_active = 1
      ORDER BY id LIMIT 1`,
    { clientId }
  )
  return rows[0] ?? null
}

/**
 * Create or re-link a client-portal user. Idempotent by email. Never overwrites
 * an existing password (so re-inviting an already-active client doesn't lock
 * them out) — the placeholder hash only applies to a brand-new row.
 */
export async function upsertClientUser({ email, name, clientId, placeholderHash }) {
  const e = norm(email)
  await query(
    `INSERT INTO users (email, name, password_hash, role, client_id)
     VALUES (:email, :name, :placeholderHash, 'client', :clientId)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), role = 'client', client_id = VALUES(client_id), is_active = 1`,
    { email: e, name, placeholderHash, clientId }
  )
  return findUserByEmail(e)
}

export async function setUserPassword(userId, passwordHash) {
  await query('UPDATE users SET password_hash = :passwordHash WHERE id = :id', { id: userId, passwordHash })
}

// ---- portal invites (one-time set-password tokens; mirrors sessions) ----

export async function createInvite(userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await query(
    'INSERT INTO portal_invites (user_id, token_hash, expires_at) VALUES (:userId, :tokenHash, :expiresAt)',
    { userId, tokenHash: hashToken(token), expiresAt }
  )
  return { token, expiresAt }
}

/** Resolve a raw token to a live (unexpired, unused) invite, or null. */
export async function findLiveInvite(token) {
  if (!token) return null
  const rows = await query(
    `SELECT id, user_id FROM portal_invites
      WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1`,
    { tokenHash: hashToken(token) }
  )
  return rows[0] ?? null
}

export async function markInviteUsed(id) {
  await query('UPDATE portal_invites SET used_at = NOW() WHERE id = :id', { id })
}
