import {
  createInvoice, updateInvoice, listInvoices, getDepositInvoiceForContract
} from '../repositories/invoices.repo.js'
import { stripeEnabled, sendDepositInvoice } from './stripe.js'
import { emitInvoiceChanged } from '../realtime/io.js'
import { notify } from './notifications.service.js'

/**
 * Raise a deposit invoice as a local draft and send it through Stripe.
 *
 * Shared by both deposit paths. The local-invoice-first ordering is the
 * load-bearing part: the row exists (and its id rides in Stripe metadata)
 * before Stripe is told anything, which is what dodges the race where
 * `invoice.finalized`/`invoice.paid` arrives before we've persisted the Stripe id.
 */
async function raiseDeposit({ client, amount, description, scope, link, actorUserId, currency }) {
  let invoice = await createInvoice({
    client_id: client.id,
    ...scope,
    kind: 'deposit',
    currency,
    description,
    amount_due: amount,
    status: 'draft',
    items: [{
      service_id: null, name_snapshot: description, description_snapshot: null,
      unit_price_snapshot: amount, qty: 1, billing_interval_snapshot: 'one_time', sort_order: 0
    }]
  })

  if (stripeEnabled() && client.stripe_customer_id) {
    const stripeInvoice = await sendDepositInvoice(client, {
      amountCents: Math.round(amount * 100),
      description,
      metadata: {
        fwa_client_id: String(client.id),
        fwa_invoice_id: String(invoice.id),
        ...(scope.project_id ? { fwa_project_id: String(scope.project_id) } : {}),
        ...(scope.contract_id ? { fwa_contract_id: String(scope.contract_id) } : {}),
        kind: 'deposit'
      }
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

  try {
    await notify({
      category: 'invoice', tone: 'info', icon: 'i-lucide-receipt-text',
      title: 'Deposit invoice sent',
      body: `$${amount.toLocaleString('en-US')} deposit sent to ${client.company || client.name}.`,
      link
    }, actorUserId)
  } catch (err) {
    console.error('Deposit-invoice notification failed:', err.message)
  }
  return { invoice, created: true, amount }
}

/**
 * The deposit for a SIGNED CONTRACT — the live path.
 *
 * There is no project yet: the project is what this invoice being PAID will
 * create. So the money comes off the contract, which is the snapshot the client
 * actually signed, and idempotency scopes to the contract too.
 *
 * Both figures come from the contract rather than one from each side: reading
 * the fee here and the percentage off the proposal would let a post-signature
 * proposal edit move the goalposts on an agreement already in the client's hands.
 */
export async function issueDepositForContract(contract, client, { actorUserId = null } = {}) {
  const existing = await getDepositInvoiceForContract(contract.id)
  if (existing) return { invoice: existing, created: false, amount: Number(existing.amount_due) }

  const pct = contract.deposit_pct ?? 50
  const fee = Number(contract.total ?? 0)
  const deposit = Math.round((fee * pct / 100) * 100) / 100

  // A zero deposit is never paid, and the project is born from the payment — so
  // this would stall the whole pipeline in silence. Refuse loudly instead.
  if (!(deposit > 0)) {
    console.error(`Contract ${contract.id} has no billable total — deposit not issued`)
    await notify({
      category: 'contract', tone: 'error', icon: 'i-lucide-triangle-alert',
      title: 'Deposit could not be raised',
      body: `${contract.title} was signed but its total is $0, so there's nothing to invoice and no project will be created.`,
      link: `/contracts/${contract.id}`
    }, actorUserId).catch(() => {})
    return { invoice: null, created: false, amount: 0, reason: 'zero_total' }
  }

  return raiseDeposit({
    client,
    amount: deposit,
    // Pass the contract's currency through: createInvoice defaults to USD, and
    // the old project path never passed one at all.
    currency: contract.currency || 'USD',
    description: `Deposit (${pct}%) — ${contract.title}`,
    scope: { contract_id: contract.id },
    link: `/contracts/${contract.id}`,
    actorUserId
  })
}

/**
 * The deposit for a project that already exists — the manual "Request Deposit"
 * button, and legacy projects that predate the proposal flow and still carry
 * their own fee through the SOW join.
 */
export async function issueDeposit(project, client, { actorUserId = null } = {}) {
  const existing = (await listInvoices({ project_id: project.id })).rows
    .find(inv => inv.kind === 'deposit' && inv.status !== 'void')
  if (existing) return { invoice: existing, created: false, amount: Number(existing.amount_due) }

  const pct = project.deposit_pct ?? 50
  const deposit = Math.round((project.project_fee * pct / 100) * 100) / 100
  if (!(deposit > 0)) return { invoice: null, created: false, amount: 0, reason: 'zero_total' }

  return raiseDeposit({
    client,
    amount: deposit,
    currency: 'USD',
    description: `Deposit (${pct}%) — ${project.name}`,
    scope: { project_id: project.id },
    link: `/projects/${project.id}`,
    actorUserId
  })
}
