import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'
import { upsertClientUser, createInvite } from '../repositories/users.repo.js'
import { sendTemplateEmail, TEMPLATES } from './email.js'
import { notify } from './notifications.service.js'

/**
 * Provision (or re-link) a client-portal login for a client and issue a
 * set-password link. Returns { user, setPasswordUrl }. The email + notification
 * are best-effort — the caller still gets the link back even when Resend is
 * unconfigured, so an admin can hand it over manually.
 */
export async function inviteClientToPortal(client, actorUserId = null) {
  const name = client.name || client.company || 'there'
  // A brand-new user row needs a password_hash (NOT NULL); a random one is
  // unusable until the client sets their own via the link. upsert does NOT
  // overwrite an existing password, so re-inviting is safe.
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12)
  const user = await upsertClientUser({ email: client.email, name, clientId: client.id, placeholderHash })

  const { token } = await createInvite(user.id)
  const setPasswordUrl = `${config.portalBaseUrl.replace(/\/$/, '')}/set-password?token=${token}`

  try {
    await sendTemplateEmail({
      template: TEMPLATES.portalInvite,
      to: client.email,
      variables: { name, set_password_url: setPasswordUrl }
    })
  } catch (err) {
    console.error(`Portal invite email failed for client ${client.id}:`, err.message)
  }

  try {
    await notify({
      category: 'system',
      tone: 'success',
      icon: 'i-lucide-user-plus',
      title: 'Portal invite sent',
      body: `${name} was invited to the client portal.`,
      link: `/clients/${client.id}`
    }, actorUserId)
  } catch (err) {
    console.error(`Portal invite notification failed for client ${client.id}:`, err.message)
  }

  return { user, setPasswordUrl }
}
