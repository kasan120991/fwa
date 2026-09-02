import crypto from 'node:crypto'
import { query } from '../db/pool.js'
import { hashToken } from '../auth/session.js'

// Capability links for the public accept/decline page. Only the SHA-256 hash is
// stored — the raw token exists in the emailed URL and nowhere else, so a
// database dump can't be used to accept anyone's proposal.
//
// Modelled on portal_invites but deliberately a separate table: that one's
// user_id is NOT NULL, and a prospect has no user row. Minting one would create
// a portal login for someone who hasn't bought anything, and would put
// set-password tokens and proposal tokens in a single lookup path where one
// mis-scoped call turns a pricing link into an account takeover.

// 30 days, not the invite's 3. A set-password link is used within minutes; a
// proposal sits in an inbox over a weekend, and one that expires unread is a
// lost deal that support "fixes" by minting more live links.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Mint a link for a proposal, superseding any still outstanding.
 *
 * Re-sending has to invalidate the old ones: otherwise a forwarded copy of the
 * first email can accept a proposal that has since been re-priced.
 */
export async function issueProposalToken(proposalId, { ttlMs = TOKEN_TTL_MS } = {}) {
  await consumeProposalTokens(proposalId)
  const token = crypto.randomBytes(32).toString('base64url')
  await query(
    `INSERT INTO proposal_access_tokens (proposal_id, token_hash, expires_at)
     VALUES (:proposalId, :tokenHash, :expiresAt)`,
    { proposalId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) }
  )
  return token
}

/**
 * The proposal behind a live token, or null.
 *
 * Read-only by design — this never stamps `used_at`. Corporate mail scanners
 * (Safe Links, Proofpoint) GET every link in an inbound email, so consuming on
 * read would kill the page before the client ever clicked it. Only a decision
 * consumes.
 */
export async function findProposalByToken(token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null
  const rows = await query(
    `SELECT p.* FROM proposal_access_tokens t
       JOIN proposals p ON p.id = t.proposal_id
      WHERE t.token_hash = :tokenHash AND t.used_at IS NULL AND t.expires_at > NOW()
      LIMIT 1`,
    { tokenHash: hashToken(token) }
  )
  return rows[0] ?? null
}

/** Burn every outstanding link for a proposal (decision made, or re-sent). */
export async function consumeProposalTokens(proposalId) {
  const res = await query(
    'UPDATE proposal_access_tokens SET used_at = NOW() WHERE proposal_id = :proposalId AND used_at IS NULL',
    { proposalId }
  )
  return res.affectedRows ?? 0
}
