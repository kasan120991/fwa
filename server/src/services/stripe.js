// Stripe integration. A Stripe customer is created the first time a client
// becomes an active client. If STRIPE_SECRET_KEY is unset the client is null
// and every call no-ops, so the app runs fine without Stripe configured.
import Stripe from 'stripe'
import { config } from '../config/env.js'
import { getCachedSettings } from './settings.service.js'

// Build a one-line invoice footer from the agency's own details (Settings →
// Agency & Branding). The invoice's logo/business-name header is Stripe account
// branding (a dashboard setting) — the API only lets us set this footer + fields.
function agencyFooter(s) {
  if (!s) return undefined
  const name = s.agency_display_name || s.agency_legal_name
  const cityRegion = [s.agency_city, s.agency_region].filter(Boolean).join(', ')
  const addr = [s.agency_address_line1, s.agency_address_line2, cityRegion, s.agency_postal_code]
    .filter(Boolean).join(', ')
  const parts = [name, addr, s.agency_support_email].filter(Boolean)
  return parts.length ? parts.join('  ·  ') : undefined
}

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null

export const stripeEnabled = () => stripe !== null

/** Publishable key (pk_…) — safe to hand to the browser for embedded Checkout. */
export const publishableKey = () => config.stripe.publishableKey

// Stripe wants ISO 3166-1 alpha-2 for address.country; map the countries the
// client form offers, and omit anything we can't map cleanly.
const COUNTRY_ISO = {
  'United States': 'US',
  Canada: 'CA',
  'United Kingdom': 'GB',
  Australia: 'AU'
}

function toAddress(c) {
  if (!c.address_line1 && !c.city && !c.postal_code) return undefined
  return {
    line1: c.address_line1 || undefined,
    line2: c.address_line2 || undefined,
    city: c.city || undefined,
    state: c.region || undefined,
    postal_code: c.postal_code || undefined,
    country: COUNTRY_ISO[c.country] || undefined
  }
}

/**
 * Create a Stripe customer for a client. Returns the customer id, or null when
 * Stripe is disabled. Throws on Stripe API errors (the caller decides whether
 * to swallow them). The idempotency key keeps a retry from creating a duplicate
 * customer if a prior attempt reached Stripe but failed to persist locally.
 */
export async function createStripeCustomer(client) {
  if (!stripe) return null
  const customer = await stripe.customers.create({
    name: client.company || client.name || undefined,
    email: client.billing_email || client.email || undefined,
    phone: client.phone || undefined,
    address: toAddress(client),
    metadata: { fwa_client_id: String(client.id) }
  }, { idempotencyKey: `fwa-client-${client.id}` })
  return customer.id
}

/**
 * Push a client's current details to its existing Stripe customer. No-ops when
 * Stripe is disabled or the client has no customer. metadata is left untouched
 * so the fwa_client_id link is preserved.
 */
export async function updateStripeCustomer(client) {
  if (!stripe || !client.stripe_customer_id) return
  await stripe.customers.update(client.stripe_customer_id, {
    name: client.company || client.name || undefined,
    email: client.billing_email || client.email || undefined,
    phone: client.phone || undefined,
    address: toAddress(client)
  })
}

// Map a Stripe invoice object to the fields we persist locally.
export function mapStripeInvoice(inv) {
  return {
    id: inv.id,
    number: inv.number ?? null,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    status: inv.status,
    amount_due: (inv.amount_due ?? 0) / 100,
    amount_paid: (inv.amount_paid ?? 0) / 100,
    due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString().slice(0, 10) : null
  }
}

/**
 * Create and send an invoice to a client's Stripe customer. Adds one invoice
 * item per line, opens an invoice with collection_method 'send_invoice', then
 * finalizes + emails the hosted link. Returns the mapped invoice (id, number,
 * urls, status, amounts, due_date) or null when Stripe is disabled. The caller
 * must ensure `client.stripe_customer_id` is set.
 */
export async function createAndSendInvoice(client, { items, description, metadata = {}, daysUntilDue }) {
  if (!stripe) return null
  const customer = client.stripe_customer_id
  // Agency-wide billing defaults + branding (Settings → Agency & Branding / Preferences).
  const settings = await getCachedSettings()
  const currency = (settings?.invoice_currency || 'USD').toLowerCase()
  const dueDays = daysUntilDue ?? settings?.invoice_due_days ?? 7
  const footer = agencyFooter(settings)

  for (const li of items) {
    await stripe.invoiceItems.create({ customer, amount: li.amountCents, currency, description: li.description })
  }
  const invoice = await stripe.invoices.create({
    customer,
    collection_method: 'send_invoice',
    days_until_due: dueDays,
    currency,
    description,
    metadata,
    pending_invoice_items_behavior: 'include',
    ...(footer ? { footer } : {})
  })
  const sent = await stripe.invoices.sendInvoice(invoice.id)
  return mapStripeInvoice(sent)
}

/** Convenience wrapper for a single-line invoice (e.g. a project deposit). */
export async function sendDepositInvoice(client, { amountCents, description, metadata = {}, daysUntilDue }) {
  return createAndSendInvoice(client, { items: [{ amountCents, description }], description, metadata, daysUntilDue })
}

/** Void an open/draft invoice in Stripe. No-ops when disabled. */
export async function voidStripeInvoice(stripeInvoiceId) {
  if (!stripe) return null
  return stripe.invoices.voidInvoice(stripeInvoiceId)
}

/** Mark a Stripe invoice paid out of band (records an offline payment without
 *  charging a card). No-ops when disabled. */
export async function payStripeInvoiceOutOfBand(stripeInvoiceId) {
  if (!stripe) return null
  return stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true })
}

/**
 * Resolve the PaymentIntent id that paid an invoice. Recent Stripe API versions
 * (2025+) dropped the top-level `invoice.payment_intent` in favour of an
 * `invoice.payments` list (to support partial payments), and that list isn't in
 * the webhook payload — so we retrieve the invoice with it expanded. Returns the
 * PI id of the most recent payment, or null.
 */
export async function getInvoicePaymentIntentId(stripeInvoiceId) {
  if (!stripe) return null
  const inv = await stripe.invoices.retrieve(stripeInvoiceId, { expand: ['payments'] })
  // Only the payment that actually settled the invoice. An out-of-band pay (admin
  // "mark paid") settles via type 'out_of_band' with NO payment_intent, so this
  // returns null there — the invoice's own (unpaid) PI is ignored and we don't
  // record a phantom payment on top of the one that path writes itself.
  const paid = inv.payments?.data?.find(x => x.status === 'paid')
  return paid?.payment?.payment_intent || null
}

/**
 * Get the client secret of an invoice's own PaymentIntent, for paying it with
 * the Payment Element. Expanding `confirmation_secret` on a finalized invoice
 * exposes the PI client secret; confirming it client-side pays the invoice
 * directly (so invoice.paid fires — no out-of-band reconciliation needed).
 * Returns the client secret, or null when Stripe is disabled / not available.
 */
export async function getInvoicePaymentSecret(stripeInvoiceId) {
  if (!stripe) return null
  const inv = await stripe.invoices.retrieve(stripeInvoiceId, { expand: ['confirmation_secret'] })
  return inv.confirmation_secret?.client_secret || null
}

/**
 * Verify + parse an incoming Stripe webhook. Throws if Stripe or the webhook
 * secret isn't configured, or if the signature doesn't validate.
 */
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured')
  if (!config.stripe.webhookSecret) throw new Error('Stripe webhook secret is not configured')
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret)
}
