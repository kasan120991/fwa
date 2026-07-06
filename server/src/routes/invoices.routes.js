import { Router } from 'express'
import {
  createInvoice, getInvoice, listInvoices, updateInvoice, invoiceStats, INVOICE_STATUSES
} from '../repositories/invoices.repo.js'
import { createPayment } from '../repositories/payments.repo.js'
import { getContact, updateContact } from '../repositories/contacts.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import {
  stripeEnabled, createStripeCustomer, createAndSendInvoice, voidStripeInvoice, payStripeInvoiceOutOfBand
} from '../services/stripe.js'
import { notify } from '../services/notifications.service.js'
import { emitInvoiceChanged, emitPaymentCreated } from '../realtime/io.js'

export const invoicesRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}
const round2 = n => Math.round(n * 100) / 100

// GET /api/invoices/stats
invoicesRouter.get('/stats', async (req, res) => {
  res.json({ data: await invoiceStats() })
})

// GET /api/invoices  ?contact_id= ?project_id= ?status= ?overdue=1 ?search=
invoicesRouter.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !INVOICE_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listInvoices({
    contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    status,
    overdue: req.query.overdue === '1' || req.query.overdue === 'true',
    search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/invoices/:id — includes line items + payments.
invoicesRouter.get('/:id', async (req, res) => {
  const invoice = await getInvoice(parseId(req))
  if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } })
  res.json({ data: invoice })
})

// POST /api/invoices — create + send a Stripe invoice. Requires Stripe.
invoicesRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const contactId = Number(body.contact_id)
  if (!Number.isInteger(contactId) || contactId <= 0) throw badRequest('Validation failed', { contact_id: 'a valid contact_id is required' })
  let contact = await getContact(contactId)
  if (!contact) throw badRequest('Validation failed', { contact_id: 'contact not found' })

  const projectId = body.project_id != null ? Number(body.project_id) : null
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  let dueDate = null
  if (body.due_date != null) {
    if (typeof body.due_date !== 'string' || Number.isNaN(Date.parse(body.due_date))) throw badRequest('Validation failed', { due_date: 'must be a valid date' })
    dueDate = body.due_date.slice(0, 10)
  }

  // Validate + snapshot the line items (shared with proposals/contracts).
  const { rows, total } = await resolveLineItems(body.items)

  if (!stripeEnabled()) return res.status(409).json({ error: { message: 'Stripe is not configured' } })
  if (!contact.stripe_customer_id) {
    const customerId = await createStripeCustomer(contact)
    if (customerId) contact = await updateContact(contact.id, { stripe_customer_id: customerId })
  }
  if (!contact.stripe_customer_id) return res.status(409).json({ error: { message: 'Could not create a Stripe customer for this client' } })

  // Local draft first, then push to Stripe and record the returned ids.
  let invoice = await createInvoice({ contact_id: contactId, project_id: projectId, kind: 'custom', description, amount_due: total, due_date: dueDate, items: rows, status: 'draft' })

  const daysUntilDue = dueDate ? Math.max(1, Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400e3)) : 7
  const stripeInvoice = await createAndSendInvoice(contact, {
    items: rows.map(li => ({ amountCents: Math.round(li.unit_price_snapshot * li.qty * 100), description: li.name_snapshot })),
    description: description || `Invoice — ${contact.company || contact.name}`,
    daysUntilDue,
    metadata: { fwa_contact_id: String(contactId), fwa_invoice_id: String(invoice.id), ...(projectId ? { fwa_project_id: String(projectId) } : {}) }
  })
  if (stripeInvoice) {
    invoice = await updateInvoice(invoice.id, {
      stripe_invoice_id: stripeInvoice.id,
      number: stripeInvoice.number,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
      invoice_pdf: stripeInvoice.invoice_pdf,
      status: 'open',
      finalized_at: new Date(),
      due_date: stripeInvoice.due_date || dueDate
    })
  }
  emitInvoiceChanged(invoice.id)
  res.status(201).json({ data: invoice })
})

// POST /api/invoices/:id/void
invoicesRouter.post('/:id/void', async (req, res) => {
  const id = parseId(req)
  const invoice = await getInvoice(id)
  if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } })
  if (invoice.status === 'paid' || invoice.status === 'void') {
    return res.status(409).json({ error: { message: `Invoice is already ${invoice.status}` } })
  }
  if (invoice.stripe_invoice_id && stripeEnabled()) {
    try {
      await voidStripeInvoice(invoice.stripe_invoice_id)
    } catch (err) {
      return res.status(502).json({ error: { message: `Stripe void failed: ${err.message}` } })
    }
  }
  const updated = await updateInvoice(id, { status: 'void', voided_at: new Date() })
  emitInvoiceChanged(id)
  res.json({ data: updated })
})

// POST /api/invoices/:id/pay — record a payment (defaults to a manual/offline
// payment). Marks the Stripe invoice paid out of band when it has a stripe id.
invoicesRouter.post('/:id/pay', async (req, res) => {
  const id = parseId(req)
  const invoice = await getInvoice(id)
  if (!invoice) return res.status(404).json({ error: { message: 'Invoice not found' } })
  if (invoice.status !== 'open') return res.status(409).json({ error: { message: `Only an open invoice can be paid (this one is ${invoice.status})` } })

  const body = req.body ?? {}
  const outstanding = round2((invoice.amount_due ?? 0) - (invoice.amount_paid ?? 0))
  let amount = outstanding
  if (body.amount != null) {
    const n = Number(body.amount)
    if (!Number.isFinite(n) || n <= 0) throw badRequest('Validation failed', { amount: 'must be a number > 0' })
    amount = round2(n)
  }
  const method = ['card', 'bank', 'manual', 'other'].includes(body.method) ? body.method : 'manual'
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  if (invoice.stripe_invoice_id && stripeEnabled()) {
    try {
      await payStripeInvoiceOutOfBand(invoice.stripe_invoice_id)
    } catch (err) {
      return res.status(502).json({ error: { message: `Stripe mark-paid failed: ${err.message}` } })
    }
  }
  const updated = await updateInvoice(id, { status: 'paid', amount_paid: invoice.amount_due, paid_at: new Date() })
  const payment = await createPayment({ contact_id: invoice.contact_id, invoice_id: id, amount, method, note, paid_at: new Date() })

  const who = invoice.contact_company || invoice.contact_name
  try {
    await notify({
      category: 'payment', tone: 'success', icon: 'i-lucide-check-circle-2',
      title: 'Payment recorded',
      body: `$${amount.toLocaleString('en-US')} recorded from ${who}.`,
      link: '/payments'
    })
  } catch (err) {
    console.error(`Payment notification failed for invoice ${id}:`, err.message)
  }
  emitInvoiceChanged(id)
  emitPaymentCreated(payment.id)
  res.json({ data: updated })
})
