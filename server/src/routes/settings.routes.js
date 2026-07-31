import { Router } from 'express'
import { config } from '../config/env.js'
import { getCachedSettings, saveSettings } from '../services/settings.service.js'
import { stripeEnabled } from '../services/stripe.js'
import { pandadocEnabled } from '../services/pandadoc.js'
import { isConfigured as plausibleConfigured } from '../services/plausible.js'
import { isConfigured as ga4Configured } from '../services/ga4.js'
import { isConfigured as digitaloceanConfigured } from '../services/digitalocean.js'
import { isConfigured as emailConfigured } from '../services/email.js'
import { listClientsWithPortalStatus } from '../repositories/clients.repo.js'

export const settingsRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}

const str = v => (typeof v === 'string' ? v.trim() : v)
const AGENCY_FIELDS = [
  'agency_legal_name', 'agency_display_name', 'agency_support_email', 'agency_phone', 'agency_logo_url',
  'agency_address_line1', 'agency_address_line2', 'agency_city', 'agency_region', 'agency_postal_code',
  'agency_country'
]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/settings — the app-wide settings row (agency, billing defaults, notification prefs).
settingsRouter.get('/', async (req, res) => {
  res.json({ data: await getCachedSettings() })
})

// GET /api/settings/integrations — read-only connection status per integration.
// Derived from the same env-key checks each service uses; no keys are exposed.
settingsRouter.get('/integrations', (req, res) => {
  const sk = config.stripe.secretKey
  const stripeMode = sk.startsWith('sk_live') ? 'live' : (sk.startsWith('sk_test') ? 'test' : null)
  res.json({
    data: [
      {
        id: 'stripe', name: 'Stripe', description: 'Payments & invoicing', connected: stripeEnabled(),
        detail: stripeMode === 'live' ? 'Live mode' : stripeMode === 'test' ? 'Test mode' : null,
        tone: stripeMode === 'test' ? 'warning' : 'success'
      },
      { id: 'pandadoc', name: 'PandaDoc', description: 'Proposals & contracts', connected: pandadocEnabled() },
      { id: 'plausible', name: 'Plausible', description: 'Website analytics', connected: plausibleConfigured() },
      { id: 'ga4', name: 'Google Analytics 4', description: 'Website analytics', connected: ga4Configured() },
      { id: 'resend', name: 'Resend', description: 'Transactional email', connected: emailConfigured() },
      {
        id: 'vapi', name: 'Vapi', description: 'AI receptionist', connected: Boolean(config.vapi.webhookSecret),
        detail: config.vapi.phoneNumber || null
      },
      { id: 'digitalocean', name: 'DigitalOcean', description: 'Uptime monitoring', connected: digitaloceanConfigured() }
    ]
  })
})

// GET /api/settings/portal-access — every client with its portal-login status.
settingsRouter.get('/portal-access', async (req, res) => {
  const rows = await listClientsWithPortalStatus()
  const data = rows.map((r) => {
    let status = 'none'
    if (r.portal_email && r.portal_active) status = r.portal_last_login ? 'active' : 'invited'
    else if (r.portal_email && !r.portal_active) status = 'revoked'
    return {
      id: r.id,
      name: r.company || r.name,
      email: r.email,
      portal_email: r.portal_email,
      status,
      last_login_at: r.portal_last_login
    }
  })
  res.json({ data })
})

// PATCH /api/settings — update agency identity, billing defaults, and/or notification prefs.
settingsRouter.patch('/', async (req, res) => {
  const body = req.body ?? {}
  const patch = {}

  // Agency string fields — trim; empty string clears to null.
  for (const f of AGENCY_FIELDS) {
    if (body[f] === undefined) continue
    const v = str(body[f])
    patch[f] = v === '' || v == null ? null : v
  }
  if (patch.agency_support_email && !EMAIL_RE.test(patch.agency_support_email)) {
    throw badRequest('Validation failed', { agency_support_email: 'must be a valid email' })
  }

  // Billing defaults.
  if (body.invoice_due_days !== undefined) {
    const n = Number(body.invoice_due_days)
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      throw badRequest('Validation failed', { invoice_due_days: 'must be between 1 and 365 days' })
    }
    patch.invoice_due_days = n
  }
  if (body.invoice_currency !== undefined) {
    const cur = String(body.invoice_currency).trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(cur)) throw badRequest('Validation failed', { invoice_currency: 'must be a 3-letter code' })
    patch.invoice_currency = cur
  }

  // Notification prefs — a { category: boolean } opt-out map.
  if (body.notification_prefs !== undefined) {
    const p = body.notification_prefs
    if (p == null || typeof p !== 'object' || Array.isArray(p)) {
      throw badRequest('Validation failed', { notification_prefs: 'must be an object' })
    }
    const clean = {}
    for (const [k, v] of Object.entries(p)) clean[k] = Boolean(v)
    patch.notification_prefs = clean
  }

  const updated = await saveSettings(patch)
  res.json({ data: updated })
})
