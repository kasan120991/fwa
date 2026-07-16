// PandaDoc integration — proposals & contracts are generated from templates,
// sent for signature, and tracked via webhooks here. Mirrors the Stripe service:
// if PANDADOC_API_KEY is unset the integration is disabled and the document
// calls no-op (return null), so proposals/contracts still persist locally and
// the app runs fine without PandaDoc configured.
import crypto from 'node:crypto'
import { config } from '../config/env.js'

const API_BASE = 'https://api.pandadoc.com/public/v1'
// The audit trail is only served from v2 (v1 returns 404 for it).
const API_BASE_V2 = 'https://api.pandadoc.com/public/v2'

export const pandadocEnabled = () => Boolean(config.pandadoc.apiKey)

async function pandadocFetch(path, { method = 'GET', body, base = API_BASE } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `API-Key ${config.pandadoc.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const detail = data?.detail || data?.message || res.statusText
    throw new Error(`PandaDoc ${method} ${path} failed (${res.status}): ${detail}`)
  }
  return data
}

// Split a client's `name` ("Dana Cole") into first/last for the recipient.
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return { first_name: parts[0] || undefined, last_name: parts.slice(1).join(' ') || undefined }
}

// Build a PandaDoc pricing table from snapshotted line items. The template must
// contain a pricing-table block (named to match `tableName`) with data-merge
// enabled so the backend can inject these rows.
function pricingTable(items, tableName = 'Pricing') {
  return {
    name: tableName,
    options: { currency: 'USD' },
    sections: [{
      title: 'Services',
      default: true,
      rows: items.map(li => ({
        options: { qty_editable: false, optional: false },
        data: {
          name: li.name_snapshot,
          description: li.description_snapshot || undefined,
          price: Number(li.unit_price_snapshot),
          qty: Number(li.qty)
        }
      }))
    }]
  }
}

/**
 * Create a document from a template. Returns { id, status } or null when the
 * integration is disabled. Throws on PandaDoc API errors (caller decides whether
 * to swallow). Creation is async on PandaDoc's side — the returned status is
 * typically `document.uploaded`; the doc must reach `document.draft` before it
 * can be sent (see sendDocument).
 */
export async function createDocumentFromTemplate({ templateUuid, name, client, tokens = [], items = [], metadata = {}, owner = null }) {
  if (!pandadocEnabled()) return null
  const recipientEmail = client.billing_email || client.email
  const recipients = []
  // Role names must match the template exactly (PandaDoc matches by name).
  if (recipientEmail) recipients.push({ role: config.pandadoc.clientRole, email: recipientEmail, ...splitName(client.name) })
  // Optional agency/owner signer for in-app countersign — only added when an
  // owner role is configured (PANDADOC_OWNER_ROLE) AND the template declares it.
  // Left off by default so document creation is unchanged without the config.
  //
  // `delivery_methods.email: false` stops PandaDoc emailing the owner their own
  // recipient link. Opening that link registers a *recipient view*, which flips the
  // document to `document.viewed` — indistinguishable from the client reading it.
  // The owner countersigns in-app instead (contracts/:id/session), so the email is
  // pure downside. See handleDocumentEvent() in routes/webhooks.routes.js.
  if (owner?.email && owner?.role) {
    recipients.push({
      role: owner.role,
      email: owner.email,
      ...splitName(owner.name),
      delivery_methods: { email: false, sms: false }
    })
  }
  const doc = await pandadocFetch('/documents', {
    method: 'POST',
    body: {
      template_uuid: templateUuid,
      name,
      recipients,
      tokens,
      pricing_tables: items.length ? [pricingTable(items)] : undefined,
      metadata,
      tags: ['fwa-ops']
    }
  })
  return { id: doc.id ?? doc.document_id, status: doc.status }
}

/** Fetch a document's current status, or null when disabled. */
export async function getDocumentStatus(documentId) {
  if (!pandadocEnabled()) return null
  const doc = await pandadocFetch(`/documents/${documentId}`)
  return doc.status
}

/** Full document details (recipients, roles, fields). Null when disabled. */
export async function getDocument(documentId) {
  if (!pandadocEnabled()) return null
  return pandadocFetch(`/documents/${documentId}/details`)
}

/**
 * Download a document as a PDF (Buffer), or null when disabled. This is an
 * API-key call, NOT a recipient session — it does not register a view against any
 * recipient, which is exactly why the admin viewer previews with it rather than
 * embedding a session (see routes/contracts.routes.js).
 */
export async function downloadDocument(documentId) {
  if (!pandadocEnabled()) return null
  const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    headers: { Authorization: `API-Key ${config.pandadoc.apiKey}` }
  })
  if (!res.ok) {
    throw new Error(`PandaDoc GET /documents/${documentId}/download failed (${res.status}): ${res.statusText}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

// Audit-trail action codes we care about. Full list:
// https://developers.pandadoc.com/reference/audit-trail-actions
const AUDIT_ACTION_VIEWED = 8

/** Audit-trail entries ({ user: { email }, action, date_created }), newest last. */
export async function getDocumentAuditTrail(documentId) {
  if (!pandadocEnabled()) return []
  const data = await pandadocFetch(`/documents/${documentId}/audit-trail`, { base: API_BASE_V2 })
  return Array.isArray(data?.results) ? data.results : []
}

/**
 * Did one of `emails` actually open the document? PandaDoc's `document.viewed`
 * status is document-level: it says *someone* looked, never who, and the payload
 * carries no per-recipient view timestamp. The audit trail is the only place that
 * attributes a view to an email, so it's the only way to tell the client reading
 * a contract from the agency previewing its own paperwork.
 */
export async function hasViewedDocument(documentId, emails = []) {
  const wanted = emails.filter(Boolean).map(e => String(e).toLowerCase())
  if (!wanted.length) return false
  const trail = await getDocumentAuditTrail(documentId)
  return trail.some(e =>
    e?.action === AUDIT_ACTION_VIEWED && wanted.includes(String(e?.user?.email || '').toLowerCase())
  )
}

/**
 * Create a short-lived signing/viewing session for one recipient of a document,
 * used to embed the document in-app (iframe src `https://app.pandadoc.com/s/{id}/`).
 * The recipient email must be a recipient on the document, and the document must
 * have reached `document.draft` (or later). Returns { id, expiresAt } or null when
 * disabled. `lifetime` is in seconds (PandaDoc default 900 / 15 min).
 */
export async function createDocumentSession(documentId, { recipient, lifetime = 900 } = {}) {
  if (!pandadocEnabled()) return null
  const data = await pandadocFetch(`/documents/${documentId}/session`, {
    method: 'POST',
    body: { recipient, lifetime }
  })
  return { id: data.id, expiresAt: data.expires_at }
}

/**
 * Send a document (moves it from draft to sent). No-ops when disabled. A doc can
 * only be sent once it has reached `document.draft`; call after polling/awaiting
 * that state.
 */
export async function sendDocument(documentId, { message, silent = false } = {}) {
  if (!pandadocEnabled()) return null
  return pandadocFetch(`/documents/${documentId}/send`, {
    method: 'POST',
    body: { message, silent }
  })
}

/**
 * Verify an incoming PandaDoc webhook. PandaDoc signs the raw request body with
 * HMAC-SHA256 (hex) using the shared key and delivers it in the `signature`
 * query param. Returns true only on a valid signature; false if unconfigured or
 * mismatched. `rawBody` must be the exact bytes received (a Buffer).
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!config.pandadoc.webhookKey || !signature) return false
  const expected = crypto
    .createHmac('sha256', config.pandadoc.webhookKey)
    .update(rawBody)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
