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
