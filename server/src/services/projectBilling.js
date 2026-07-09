import { createInvoice, updateInvoice, listInvoices } from '../repositories/invoices.repo.js'
import { stripeEnabled, sendDepositInvoice } from './stripe.js'
import { emitInvoiceChanged } from '../realtime/io.js'
import { notify } from './notifications.service.js'

/**
 * Issue the project's deposit invoice: a local `deposit` invoice, sent via Stripe.
 * Shared by the manual "Request Deposit" route and the auto-send on contract
 * signature. Idempotent — if a non-void deposit invoice already exists for the
 * project it's returned unchanged (no duplicate). The Stripe send happens only
 * when Stripe is enabled and `client.stripe_customer_id` is set; otherwise a local
 * draft is left for later. `actorUserId` scopes the bell notification (null =
 * broadcast to all admins, e.g. the webhook path). Returns { invoice, created, amount }.
 */
export async function issueDeposit(project, client, { actorUserId = null } = {}) {
  const existing = (await listInvoices({ project_id: project.id })).rows
    .find(inv => inv.kind === 'deposit' && inv.status !== 'void')
  if (existing) return { invoice: existing, created: false, amount: Number(existing.amount_due) }

  const pct = project.deposit_pct ?? 50
  const deposit = Math.round((project.project_fee * pct / 100) * 100) / 100
  const clientName = client.company || client.name
  const description = `Deposit (${pct}%) — ${project.name}`

  // Local invoice first (draft), so the deposit shows on the Invoices page and its
  // id can ride along in Stripe metadata (dodges the webhook create race).
  let invoice = await createInvoice({
    client_id: client.id, project_id: project.id, kind: 'deposit', description,
    amount_due: deposit, status: 'draft',
    items: [{ service_id: null, name_snapshot: description, description_snapshot: null, unit_price_snapshot: deposit, qty: 1, billing_interval_snapshot: 'one_time', sort_order: 0 }]
  })

  if (stripeEnabled() && client.stripe_customer_id) {
    const stripeInvoice = await sendDepositInvoice(client, {
      amountCents: Math.round(deposit * 100),
      description,
      metadata: { fwa_project_id: String(project.id), fwa_client_id: String(client.id), fwa_invoice_id: String(invoice.id), kind: 'deposit' }
    })
    if (stripeInvoice) {
      invoice = await updateInvoice(invoice.id, {
        stripe_invoice_id: stripeInvoice.id, number: stripeInvoice.number,
        hosted_invoice_url: stripeInvoice.hosted_invoice_url, invoice_pdf: stripeInvoice.invoice_pdf,
        status: 'open', finalized_at: new Date(), due_date: stripeInvoice.due_date
      })
    }
  }
  emitInvoiceChanged(invoice.id)

  // Best-effort bell alert — never fail the issue over a notify hiccup.
  try {
    await notify({
      category: 'invoice', tone: 'info', icon: 'i-lucide-receipt-text',
      title: 'Deposit invoice sent',
      body: `$${deposit.toLocaleString('en-US')} deposit sent to ${clientName}.`,
      link: `/projects/${project.id}`
    }, actorUserId)
  } catch (err) {
    console.error(`Deposit-invoice notification failed for project ${project.id}:`, err.message)
  }

  return { invoice, created: true, amount: deposit }
}
