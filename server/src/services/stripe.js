// Stripe integration. A Stripe customer is created the first time a contact
// becomes an active client. If STRIPE_SECRET_KEY is unset the client is null
// and every call no-ops, so the app runs fine without Stripe configured.
import Stripe from 'stripe'
import { config } from '../config/env.js'

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null

export const stripeEnabled = () => stripe !== null

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
 * Create a Stripe customer for a contact. Returns the customer id, or null when
 * Stripe is disabled. Throws on Stripe API errors (the caller decides whether
 * to swallow them). The idempotency key keeps a retry from creating a duplicate
 * customer if a prior attempt reached Stripe but failed to persist locally.
 */
export async function createStripeCustomer(contact) {
  if (!stripe) return null
  const customer = await stripe.customers.create({
    name: contact.company || contact.name || undefined,
    email: contact.billing_email || contact.email || undefined,
    phone: contact.phone || undefined,
    address: toAddress(contact),
    metadata: { fwa_contact_id: String(contact.id) }
  }, { idempotencyKey: `fwa-contact-${contact.id}` })
  return customer.id
}

/**
 * Push a contact's current details to its existing Stripe customer. No-ops when
 * Stripe is disabled or the contact has no customer. metadata is left untouched
 * so the fwa_contact_id link is preserved.
 */
export async function updateStripeCustomer(contact) {
  if (!stripe || !contact.stripe_customer_id) return
  await stripe.customers.update(contact.stripe_customer_id, {
    name: contact.company || contact.name || undefined,
    email: contact.billing_email || contact.email || undefined,
    phone: contact.phone || undefined,
    address: toAddress(contact)
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
 * Create and send an invoice to a contact's Stripe customer. Adds one invoice
 * item per line, opens an invoice with collection_method 'send_invoice', then
 * finalizes + emails the hosted link. Returns the mapped invoice (id, number,
 * urls, status, amounts, due_date) or null when Stripe is disabled. The caller
 * must ensure `contact.stripe_customer_id` is set.
 */
export async function createAndSendInvoice(contact, { items, description, metadata = {}, daysUntilDue = 7 }) {
  if (!stripe) return null
  const customer = contact.stripe_customer_id
  for (const li of items) {
    await stripe.invoiceItems.create({ customer, amount: li.amountCents, currency: 'usd', description: li.description })
  }
  const invoice = await stripe.invoices.create({
    customer,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    description,
    metadata,
    pending_invoice_items_behavior: 'include'
  })
  const sent = await stripe.invoices.sendInvoice(invoice.id)
  return mapStripeInvoice(sent)
}

/** Convenience wrapper for a single-line invoice (e.g. a project deposit). */
export async function sendDepositInvoice(contact, { amountCents, description, metadata = {}, daysUntilDue = 7 }) {
  return createAndSendInvoice(contact, { items: [{ amountCents, description }], description, metadata, daysUntilDue })
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
 * Verify + parse an incoming Stripe webhook. Throws if Stripe or the webhook
 * secret isn't configured, or if the signature doesn't validate.
 */
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured')
  if (!config.stripe.webhookSecret) throw new Error('Stripe webhook secret is not configured')
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret)
}
