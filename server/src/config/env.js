import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Default uploads dir: server/uploads (this file is server/src/config/env.js).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Central config, read once from the environment with dev-safe defaults.
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  uploads: {
    // Where uploaded files live on disk, and the cap on a single upload.
    dir: process.env.UPLOADS_DIR || path.join(serverRoot, 'uploads'),
    maxBytes: Number(process.env.UPLOADS_MAX_BYTES) || 10 * 1024 * 1024
  },
  stripe: {
    // Secret key (sk_test_… / sk_live_…). Empty = Stripe disabled (no-ops).
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    // Webhook signing secret (whsec_…) for verifying incoming Stripe events.
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
  },
  pandadoc: {
    // API key for PandaDoc (document generation, sending, e-sign). Empty =
    // integration disabled: proposals/contracts still persist locally, but no
    // document is created/sent until a key is configured.
    apiKey: process.env.PANDADOC_API_KEY || '',
    // Shared key used to verify incoming webhook signatures (HMAC-SHA256 of the
    // raw body, delivered in the ?signature query param).
    webhookKey: process.env.PANDADOC_WEBHOOK_KEY || ''
  },
  contactForm: {
    // Shared secret the marketing site sends (Authorization: Bearer …) with each
    // contact-form submission. Empty = the webhook is disabled (fails closed).
    webhookSecret: process.env.CONTACT_FORM_WEBHOOK_SECRET || ''
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
    phoneNumber: process.env.VAPI_PHONE_NUMBER || ''
  },
  plausible: {
    // Plausible Stats API key (Bearer token). Empty = analytics sync disabled:
    // website_metrics keeps its seeded/last-synced values, no live pull.
    apiKey: process.env.PLAUSIBLE_API_KEY || '',
    baseUrl: process.env.PLAUSIBLE_BASE_URL || 'https://plausible.io'
  },
  websites: {
    // Live uptime checks hit each site's real URL, so they're off by default
    // (seeded domains are placeholders). Enable in production. Interval in ms.
    checksEnabled: process.env.WEBSITE_CHECKS_ENABLED === 'true',
    checkIntervalMs: Number(process.env.WEBSITE_CHECK_INTERVAL_MS) || 10 * 60_000,
    // How often to pull analytics from the provider (when a key is set).
    syncIntervalMs: Number(process.env.WEBSITE_SYNC_INTERVAL_MS) || 60 * 60_000
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
