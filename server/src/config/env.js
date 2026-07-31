import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Default uploads dir: server/uploads (this file is server/src/config/env.js).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Central config, read once from the environment with dev-safe defaults.
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  // Allowed browser origin(s) for credentialed XHR. Comma-separated to permit
  // both the admin app and the client portal (each on its own subdomain/port).
  // In production they proxy /api same-origin, so this is mainly a dev + fallback.
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Public base URL of the client portal app — used to build set-password links
  // in invite emails. Dev default is the portal's local dev port.
  portalBaseUrl: process.env.PORTAL_BASE_URL || 'http://localhost:3090',
  // Public base URL of the admin app — used to deep-link alert emails at the
  // record they're about. Dev default is the admin app's local dev port.
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  uploads: {
    // Where uploaded files live on disk, and the cap on a single upload.
    dir: process.env.UPLOADS_DIR || path.join(serverRoot, 'uploads'),
    maxBytes: Number(process.env.UPLOADS_MAX_BYTES) || 10 * 1024 * 1024
  },
  stripe: {
    // Secret key (sk_test_… / sk_live_…). Empty = Stripe disabled (no-ops).
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    // Webhook signing secret (whsec_…) for verifying incoming Stripe events.
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Publishable key (pk_test_… / pk_live_…) — safe to expose to the browser.
    // Returned to the portal so it can mount embedded Checkout for invoice pay.
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  },
  pandadoc: {
    // API key for PandaDoc (document generation, sending, e-sign). Empty =
    // integration disabled: proposals/contracts still persist locally, but no
    // document is created/sent until a key is configured.
    apiKey: process.env.PANDADOC_API_KEY || '',
    // Shared key used to verify incoming webhook signatures (HMAC-SHA256 of the
    // raw body, delivered in the ?signature query param).
    webhookKey: process.env.PANDADOC_WEBHOOK_KEY || '',
    // Signer role name for the agency/owner on the contract template, enabling
    // in-app countersign via an embedded session. Empty = owner is NOT added as a
    // recipient (document creation unchanged); set this to match the template's
    // agency signer role (the FWA template's role is "Francis Web Agency").
    ownerRole: process.env.PANDADOC_OWNER_ROLE || '',
    // Signer role name for the client recipient — must match the template's role
    // exactly (PandaDoc matches recipients to roles by name). The FWA template
    // names it "Client".
    clientRole: process.env.PANDADOC_CLIENT_ROLE || 'Client'
  },
  contactForm: {
    // Shared secret the marketing site sends (Authorization: Bearer …) with each
    // contact-form submission. Empty = the webhook is disabled (fails closed).
    webhookSecret: process.env.CONTACT_FORM_WEBHOOK_SECRET || ''
  },
  resend: {
    // Resend API key for outgoing alert emails (new web inquiry, new phone
    // inquiry). Empty = email disabled (sends no-op), matching the Stripe/
    // PandaDoc/Plausible key-gating.
    apiKey: process.env.RESEND_API_KEY || '',
    // Default From identity — must be on a Resend-verified domain. The published
    // templates carry their own From, so this is only a fallback.
    from: process.env.RESEND_FROM || 'Francis Web Agency <info@franciswebagency.com>',
    // Where internal alert emails are delivered.
    alertsTo: process.env.ALERTS_EMAIL || 'info@franciswebagency.com'
  },
  vapi: {
    // Shared secret Vapi sends as `X-Vapi-Secret` on every server message
    // (assistant-request, end-of-call-report). Empty = the webhook is disabled
    // (fails closed, returns 503).
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET || '',
    // The receptionist assistant's id — returned in assistant-request responses so
    // an inbound call is answered by it with per-caller context injected.
    assistantId: process.env.VAPI_ASSISTANT_ID || '',
    // The receptionist's public phone number — display only (header/stat strip).
    phoneNumber: process.env.VAPI_PHONE_NUMBER || '',
    // The public demo assistant (marketing-site "Call It Right Now" line). Its
    // end-of-call-reports land in the same webhook; matching this id tags the
    // call line = 'demo' so demo callers surface as follow-up prospects.
    demoAssistantId: process.env.VAPI_DEMO_ASSISTANT_ID || ''
  },
  plausible: {
    // Plausible Stats API key (Bearer token). Empty = analytics sync disabled:
    // website_metrics keeps its seeded/last-synced values, no live pull.
    apiKey: process.env.PLAUSIBLE_API_KEY || '',
    baseUrl: process.env.PLAUSIBLE_BASE_URL || 'https://plausible.io'
  },
  ga4: {
    // GA4 Data API via a Google service account (Viewer on the property).
    // Both empty = GA4 sync disabled (no-op), same gating as Plausible above.
    clientEmail: process.env.GA4_CLIENT_EMAIL || '',
    // Base64 of the service-account `private_key` (PEM) — the raw key's
    // newlines don't survive .env files / compose interpolation.
    privateKey: process.env.GA4_PRIVATE_KEY_BASE64
      ? Buffer.from(process.env.GA4_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
      : ''
  },
  digitalocean: {
    // DigitalOcean API token for the website Infrastructure panel (live Droplet
    // health). A read-only token is sufficient — scopes `droplet:read` and
    // `monitoring:read`. Empty = infra panel disabled (endpoints no-op, the UI
    // shows a "not connected" state).
    apiToken: process.env.DIGITALOCEAN_API_TOKEN || '',
    baseUrl: process.env.DIGITALOCEAN_BASE_URL || 'https://api.digitalocean.com',
    // Regions DO probes each managed uptime check from (multi-region verdict).
    // Valid: us_east, us_west, eu_west, se_asia.
    uptimeRegions: (process.env.DIGITALOCEAN_UPTIME_REGIONS || 'us_east,eu_west')
      .split(',').map(r => r.trim()).filter(Boolean),
    // Defaults for one-click droplet provisioning (the modal can override region/size).
    provisionRegion: process.env.DIGITALOCEAN_PROVISION_REGION || 'nyc3',
    provisionSize: process.env.DIGITALOCEAN_PROVISION_SIZE || 's-1vcpu-2gb',
    provisionImage: process.env.DIGITALOCEAN_PROVISION_IMAGE || 'ubuntu-24-04-x64',
    // Infra alerting thresholds (poll job → notifications + Needs Attention).
    // Set DIGITALOCEAN_ALERTS_ENABLED=false to silence the poll (still gated on the token).
    alertsEnabled: process.env.DIGITALOCEAN_ALERTS_ENABLED !== 'false',
    alertCpuPct: Number(process.env.DIGITALOCEAN_ALERT_CPU_PCT) || 90,
    alertDiskPct: Number(process.env.DIGITALOCEAN_ALERT_DISK_PCT) || 90
  },
  websites: {
    // Live uptime checks hit each site's real URL, so they're off by default
    // (seeded domains are placeholders). Enable in production. Interval in ms.
    checksEnabled: process.env.WEBSITE_CHECKS_ENABLED === 'true',
    checkIntervalMs: Number(process.env.WEBSITE_CHECK_INTERVAL_MS) || 10 * 60_000,
    // How often to pull analytics from the provider (when a key is set).
    syncIntervalMs: Number(process.env.WEBSITE_SYNC_INTERVAL_MS) || 60 * 60_000
  },
  expenses: {
    // Subscription renewal reminders: notify this many days before a renewal,
    // rechecked on this interval. On by default; set the flag to 'false' to
    // silence in dev. Interval in ms (default daily).
    remindersEnabled: process.env.EXPENSE_REMINDERS_ENABLED !== 'false',
    reminderDays: Number(process.env.EXPENSE_REMINDER_DAYS) || 7,
    reminderIntervalMs: Number(process.env.EXPENSE_REMINDER_INTERVAL_MS) || 24 * 60 * 60_000
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fwa_ops',
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10
  }
}

export const isProd = config.nodeEnv === 'production'
