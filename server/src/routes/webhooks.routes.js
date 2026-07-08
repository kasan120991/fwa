import crypto from 'node:crypto'
import { Router } from 'express'
import { config } from '../config/env.js'
import { constructWebhookEvent, createStripeCustomer, mapStripeInvoice } from '../services/stripe.js'
import { verifyWebhookSignature, pandadocEnabled, createDocumentFromTemplate, sendDocument } from '../services/pandadoc.js'
import { getClient, getClientByStripeCustomerId, updateClient } from '../repositories/clients.repo.js'
import { createLead, getRecentWebsiteLeadByEmail } from '../repositories/leads.repo.js'
import { getInvoice, getInvoiceByStripeId, updateInvoice, upsertFromStripe } from '../repositories/invoices.repo.js'
import { createPayment, getPaymentByIntentId } from '../repositories/payments.repo.js'
import { emitInvoiceChanged, emitPaymentCreated } from '../realtime/io.js'
import { getProposalByDocumentId, updateProposal } from '../repositories/proposals.repo.js'
import {
  getContractByDocumentId, getContractByProposalId, generateContractFromProposal, updateContract
} from '../repositories/contracts.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { notify } from '../services/notifications.service.js'

export const webhooksRouter = Router()

// ---------------------------------------------------------------------------
// Website contact form — the marketing site's server posts submissions here and
// they land as inbound website leads. Authenticated by a shared secret (not the
// session cookie), so it's mounted outside requireAuth.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = v => (v == null ? '' : String(v).trim())

// Constant-time compare of the provided token against the configured secret.
function tokenValid(header) {
  const secret = config.contactForm.webhookSecret
  if (!secret) return false
  const raw = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : header
  const a = Buffer.from(String(raw || ''))
  const b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// POST /api/webhooks/contact-form
webhooksRouter.post('/contact-form', async (req, res) => {
  if (!config.contactForm.webhookSecret) {
    return res.status(503).json({ error: { message: 'Contact webhook is not configured' } })
  }
  if (!tokenValid(req.headers.authorization || req.headers['x-fwa-webhook-secret'])) {
    return res.status(401).json({ error: { message: 'Invalid webhook token' } })
  }

  const body = req.body ?? {}
  // Honeypot — real users leave it empty; bots fill it. Accept silently, no lead.
  if (str(body.hp)) return res.json({ ok: true })

  const name = str(body.name)
  const email = str(body.email)
  const phone = str(body.phone).replace(/\D/g, '') // leads store raw digits
  const interested = str(body.interested_in)
  const details = str(body.details)
  const budget = str(body.budget)
  const heard = str(body.heard_about)
  const company = str(body.company)

  if (!name && !email) return res.status(400).json({ error: { message: 'A name or email is required' } })
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: { message: 'Invalid email address' } })

  // Dedupe double-submits of the same email within a short window.
  if (email) {
    const existing = await getRecentWebsiteLeadByEmail(email)
    if (existing) return res.json({ ok: true, id: existing.id, deduped: true })
  }

  // Inquiry = project details + a labeled block for the extra fields.
  const extras = [
    interested && `Interested in: ${interested}`,
    budget && `Budget: ${budget}`,
    heard && `Heard about us: ${heard}`
  ].filter(Boolean).join('\n')
  const message = [details, extras].filter(Boolean).join('\n\n') || null

  const lead = await createLead({
    source: 'website',
    stage: 'new',
    name: name || email,
    email: email || null,
    phone: phone || null,
    company: company || null,
    message,
    tags: interested ? [interested] : null
  })

  // Live bell alert (best-effort) — mirrors the seeded "New inbound lead".
  try {
    await notify({
      category: 'lead', tone: 'brand', icon: 'i-lucide-user-plus',
      title: 'New inbound lead',
      body: `${lead.name} submitted the contact form${interested ? ` — ${interested}` : ''}.`,
      link: '/leads'
    })
  } catch (err) {
    console.error('Contact-form lead notification failed:', err.message)
  }

  res.status(201).json({ ok: true, id: lead.id })
})

// POST /api/webhooks/stripe — receives Stripe events. Authenticated by signature
// (not the session cookie), so it's mounted outside requireAuth. Needs the raw
// request body, which app.js parses as a Buffer for this path before JSON.
webhooksRouter.post('/stripe', async (req, res) => {
  let event
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature'])
  } catch (err) {
    return res.status(400).json({ error: { message: `Webhook signature verification failed: ${err.message}` } })
  }

  try {
    switch (event.type) {
      case 'customer.deleted': {
        // A customer removed in Stripe should no longer be referenced here; clear
        // the link so a future active-transition creates a fresh one.
        const customerId = event.data.object.id
        const client = await getClientByStripeCustomerId(customerId)
        if (client) {
          await updateClient(client.id, { stripe_customer_id: null })
          console.log(`Stripe customer ${customerId} deleted — unlinked from client ${client.id}`)
        }
        break
      }
      case 'invoice.finalized': {
        // Invoice opened for payment — sync number/urls/status/due_date locally.
        const inv = event.data.object
        const m = mapStripeInvoice(inv)
        const client = inv.customer ? await getClientByStripeCustomerId(inv.customer) : null
        const hint = inv.metadata?.fwa_invoice_id ? Number(inv.metadata.fwa_invoice_id) : null
        const local = await upsertFromStripe(inv.id, client?.id, {
          number: m.number, hosted_invoice_url: m.hosted_invoice_url, invoice_pdf: m.invoice_pdf,
          status: 'open', finalized_at: new Date(), due_date: m.due_date, amount_due: m.amount_due
        }, hint)
        if (local) emitInvoiceChanged(local.id)
        break
      }
      case 'invoice.paid': {
        // Mark the local invoice paid, record a payment row, raise a live alert.
        const inv = event.data.object
        const m = mapStripeInvoice(inv)
        const client = inv.customer ? await getClientByStripeCustomerId(inv.customer) : null
        const hint = inv.metadata?.fwa_invoice_id ? Number(inv.metadata.fwa_invoice_id) : null
        const local = await getInvoiceByStripeId(inv.id) ?? (hint ? await getInvoice(hint) : null)
        if (local) {
          await updateInvoice(local.id, { status: 'paid', amount_paid: m.amount_paid, paid_at: new Date() })
          emitInvoiceChanged(local.id)
        }
        // Record the payment (dedup on the PaymentIntent).
        const pi = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id
        if (client && !(pi && await getPaymentByIntentId(pi))) {
          const payment = await createPayment({
            client_id: client.id, invoice_id: local?.id ?? null, stripe_payment_intent_id: pi ?? null,
            amount: m.amount_paid, method: 'card', paid_at: new Date()
          })
          emitPaymentCreated(payment.id)
        }
        const who = client?.company || client?.name || 'A client'
        try {
          await notify({
            category: 'payment', tone: 'success', icon: 'i-lucide-check-circle-2',
            title: 'Invoice paid',
            body: `${who} paid a $${m.amount_paid.toLocaleString('en-US')} invoice.`,
            link: '/payments'
          })
        } catch (err) {
          console.error('invoice.paid notification failed:', err.message)
        }
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object
        const client = inv.customer ? await getClientByStripeCustomerId(inv.customer) : null
        const who = client?.company || client?.name || 'A client'
        try {
          await notify({
            category: 'invoice', tone: 'warning', icon: 'i-lucide-triangle-alert',
            title: 'Invoice payment failed',
            body: `A payment from ${who} failed.`,
            link: '/invoices'
          })
        } catch (err) {
          console.error('invoice.payment_failed notification failed:', err.message)
        }
        break
      }
      case 'invoice.voided': {
        const inv = event.data.object
        const hint = inv.metadata?.fwa_invoice_id ? Number(inv.metadata.fwa_invoice_id) : null
        const local = await getInvoiceByStripeId(inv.id) ?? (hint ? await getInvoice(hint) : null)
        if (local) {
          await updateInvoice(local.id, { status: 'void', voided_at: new Date() })
          emitInvoiceChanged(local.id)
        }
        break
      }
      case 'invoice.marked_uncollectible': {
        const inv = event.data.object
        const hint = inv.metadata?.fwa_invoice_id ? Number(inv.metadata.fwa_invoice_id) : null
        const local = await getInvoiceByStripeId(inv.id) ?? (hint ? await getInvoice(hint) : null)
        if (local) {
          await updateInvoice(local.id, { status: 'uncollectible' })
          emitInvoiceChanged(local.id)
        }
        break
      }
      default:
        // Acknowledge everything else; handlers get added as billing lands.
        break
    }
  } catch (err) {
    // 500 so Stripe retries a transient failure (e.g. DB blip).
    console.error(`Error handling Stripe webhook ${event.type}:`, err.message)
    return res.status(500).json({ error: { message: 'Webhook handler error' } })
  }

  res.json({ received: true })
})

// ---------------------------------------------------------------------------
// PandaDoc — document lifecycle. Drives the sales-paperwork state machine:
// proposal accepted -> generate the project contract; project contract signed
// -> the client is "won" (status active).
// ---------------------------------------------------------------------------

// Raw PandaDoc status -> internal status, by record kind.
const STATUS_MAP = {
  'document.sent': { proposal: 'sent', contract: 'sent' },
  'document.viewed': { proposal: 'viewed', contract: 'viewed' },
  'document.completed': { proposal: 'accepted', contract: 'signed' },
  'document.declined': { proposal: 'declined', contract: 'declined' },
  'document.expired': { proposal: 'expired', contract: 'expired' },
  'document.voided': { proposal: 'voided', contract: 'voided' }
}
// Which lifecycle timestamp a given internal status stamps.
const STATUS_STAMP = {
  sent: 'sent_at', viewed: 'viewed_at', accepted: 'accepted_at', signed: 'signed_at', declined: 'declined_at'
}

// Generate the project contract from an accepted proposal (Model B). Idempotent:
// if a contract already exists for the proposal, returns it untouched. The
// PandaDoc document creation/send is best-effort and never blocks the DB write.
async function generateProjectContract(proposal) {
  const existing = await getContractByProposalId(proposal.id)
  if (existing) return existing
  let contract = await generateContractFromProposal(proposal, { type: 'project' })
  console.log(`Proposal ${proposal.id} accepted -> generated project contract ${contract.id}`)

  if (pandadocEnabled()) {
    try {
      const client = await getClient(proposal.client_id)
      const template = await getActiveTemplate('project_contract')
      if (client && template) {
        const doc = await createDocumentFromTemplate({
          templateUuid: template.template_uuid,
          name: `${contract.title} — ${client.company || client.name}`,
          client,
          items: contract.items,
          metadata: { fwa_client_id: String(client.id), fwa_contract_id: String(contract.id), type: 'contract' }
        })
        if (doc) {
          contract = await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
          await sendDocument(doc.id)
          contract = await updateContract(contract.id, { status: 'sent', sent_at: new Date() })
        }
      }
    } catch (err) {
      console.error(`PandaDoc contract dispatch failed for proposal ${proposal.id}:`, err.message)
    }
  }
  return contract
}

// A signed project contract is the "won" event: confirm the client active and
// stamp client_since. Idempotent — an already-active client is left as-is.
// (The project already exists — it's the SOW hub that originated this contract.)
async function markClientWon(contract) {
  const client = await getClient(contract.client_id)
  if (!client || client.status === 'active') return
  const patch = { status: 'active' }
  if (!client.client_since) patch.client_since = new Date().toISOString().slice(0, 10)
  let updated = await updateClient(client.id, patch)
  console.log(`Contract ${contract.id} signed -> client ${client.id} won (status=active)`)

  // An active client provisions a Stripe customer (best-effort). Skipped if one
  // already exists or Stripe is disabled.
  if (!updated.stripe_customer_id) {
    try {
      const customerId = await createStripeCustomer(updated)
      if (customerId) updated = await updateClient(updated.id, { stripe_customer_id: customerId })
    } catch (err) {
      console.error(`Stripe customer creation failed for client ${updated.id}:`, err.message)
    }
  }
}

// Apply a single document event to its proposal or contract.
async function handleDocumentEvent(doc) {
  const raw = doc.status
  const mapped = STATUS_MAP[raw]

  const proposal = await getProposalByDocumentId(doc.id)
  if (proposal) {
    const internal = mapped?.proposal
    const patch = { pandadoc_status: raw, last_webhook_at: new Date() }
    if (internal) {
      patch.status = internal
      if (STATUS_STAMP[internal]) patch[STATUS_STAMP[internal]] = new Date()
    }
    await updateProposal(proposal.id, patch)
    if (internal === 'accepted') await generateProjectContract(proposal)
    return
  }

  const contract = await getContractByDocumentId(doc.id)
  if (contract) {
    const internal = mapped?.contract
    const patch = { pandadoc_status: raw, last_webhook_at: new Date() }
    if (internal) {
      patch.status = internal
      if (STATUS_STAMP[internal]) patch[STATUS_STAMP[internal]] = new Date()
    }
    await updateContract(contract.id, patch)
    if (internal === 'signed' && contract.type === 'project') await markClientWon(contract)
    return
  }

  console.warn(`PandaDoc webhook: no proposal/contract for document ${doc.id}`)
}

// POST /api/webhooks/pandadoc — document lifecycle events. Authenticated by an
// HMAC signature over the raw body (?signature=), not the session cookie, so
// it's mounted outside requireAuth. app.js parses the raw body for this path.
webhooksRouter.post('/pandadoc', async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.query.signature)) {
    return res.status(400).json({ error: { message: 'PandaDoc webhook signature verification failed' } })
  }

  let events
  try {
    events = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body)
  } catch {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } })
  }
  if (!Array.isArray(events)) events = [events]

  try {
    for (const evt of events) {
      // PandaDoc sends document_state_changed for status transitions.
      if (evt?.event && evt.event !== 'document_state_changed' && evt.event !== 'document_updated') continue
      const doc = evt?.data
      if (doc?.id && doc?.status) await handleDocumentEvent(doc)
    }
  } catch (err) {
    // 500 so PandaDoc retries a transient failure. Handlers are idempotent.
    console.error('Error handling PandaDoc webhook:', err.message)
    return res.status(500).json({ error: { message: 'Webhook handler error' } })
  }

  res.json({ received: true })
})
