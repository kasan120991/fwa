import { config } from '../config/env.js'

// Resend email client. Empty RESEND_API_KEY = disabled (send is a no-op),
// matching the Stripe/PandaDoc/Plausible key-gating. Emails are built from
// published Resend templates referenced by their stable alias; the caller
// supplies the per-send variable values.
//
// Template aliases (managed in the Resend dashboard). Aliases are stable across
// template recreation, so they're safer to hard-reference than UUIDs.
export const TEMPLATES = {
  websiteInquiry: 'website-inquiry',
  phoneCall: 'phone-call',
  // Client-facing: the portal invite / set-password email.
  // Variables: { name, set_password_url }.
  portalInvite: 'portal-invite',
  // Internal alert: a client opened a ticket from the portal. Variables:
  // { ticket_code, client, subject, type, priority, description, submitted_at, ticket_url }.
  supportTicket: 'support-ticket',
  // Internal alert: an invoice was paid (Stripe webhook). Variables:
  // { client, amount, invoice_number, method, paid_at, invoice_url }.
  invoicePaid: 'invoice-paid'
}

export const isConfigured = () => !!config.resend.apiKey

// Resend injects variable values into the template verbatim — {{{…}}} is its
// syntax, and it does NOT escape. Much of what we pass is untrusted (public
// contact-form fields, client-authored ticket text), so neutralise the angle
// brackets that would otherwise open a tag.
//
// Only < and > are escaped, deliberately: every template interpolates its
// variables into text content, where those two are all that can start a tag.
// Leaving quotes, apostrophes and ampersands alone keeps ordinary prose ("the
// client's site", "Smith & Sons") readable in the plain-text part, which would
// otherwise show raw &#39; / &amp;. If you ever put a variable inside an HTML
// attribute, it must be a server-built value — never user input.
const escapeAngles = value => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Send an email rendered from a published Resend template. Returns the Resend
 * response ({ id }) on success, or null when email is disabled. Throws on a
 * non-2xx Resend response so callers can log — every caller here treats sending
 * as best-effort (try/catch, never blocks the webhook).
 *
 * Variable values are escaped (see escapeAngles) before they reach Resend.
 *
 * @param {object}   opts
 * @param {string}   opts.template   Template alias (see TEMPLATES).
 * @param {string|string[]} opts.to  Recipient(s).
 * @param {object}   [opts.variables] Variable map injected into the template.
 * @param {string}   [opts.from]     Override the template/default From.
 */
export async function sendTemplateEmail({ template, to, variables = {}, from } = {}) {
  if (!isConfigured()) return null
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!template || recipients.length === 0) return null

  const safeVariables = Object.fromEntries(
    Object.entries(variables).map(([k, v]) => [k, escapeAngles(v)])
  )

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json'
    },
    // The published template already carries its own From/Subject; we only pass
    // `from` when explicitly overriding, so the template's sender name is used.
    body: JSON.stringify({
      from: from || config.resend.from,
      to: recipients,
      template: { id: template, variables: safeVariables }
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Human-friendly Eastern-time timestamp for alert emails (FWA is US/Eastern).
export function alertTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short'
  }).format(date) + ' ET'
}
