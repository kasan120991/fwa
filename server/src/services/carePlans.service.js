// Care plans — the whole lifecycle in one place (sibling of contractToProject.js):
//
//   draft -> pending_signature -> awaiting_card -> active <-> past_due -> cancelled
//
// Every move is a CLAIM (carePlans.repo.claimCarePlanStatus), so a replayed
// Stripe or PandaDoc event, or a double-clicked button, moves a plan exactly
// once. The expensive work (PandaDoc document, Stripe subscription) hangs off
// the claim's winner. Notifications, activity and emails are best-effort and
// never break the step that raised them.
import { config } from '../config/env.js'
import {
  createCarePlan, updateCarePlan, claimCarePlanStatus, getCarePlan, getCarePlanByContract
} from '../repositories/carePlans.repo.js'
import { createContract, updateContract, getContract } from '../repositories/contracts.repo.js'
import { getClient, updateClient } from '../repositories/clients.repo.js'
import { getService } from '../repositories/services.repo.js'
import { getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { getCachedSettings } from './settings.service.js'
import {
  stripeEnabled, createStripeCustomer, retrieveSetupIntent, setDefaultPaymentMethod,
  createRecurringPrice, createSubscription, updateSubscriptionPaymentMethod, cancelSubscription
} from './stripe.js'
import { pandadocEnabled, createDocumentFromTemplate, sendDocumentWhenReady } from './pandadoc.js'
import { inviteClientToPortal } from './portalInvite.service.js'
import { getPortalUserForClient } from '../repositories/users.repo.js'
import { sendTemplateEmail, TEMPLATES } from './email.js'
import { notify, clientNotify } from './notifications.service.js'
import { logClientActivity } from './clientActivity.service.js'
import { emitCarePlanChanged, emitClientCarePlanChanged, emitContractChanged, emitClientAgreementChanged } from '../realtime/io.js'
import { money, date, str } from '../utils/format.js'

const portalUrl = path => `${config.portalBaseUrl.replace(/\/$/, '')}${path}`
const clientLabel = c => c?.company || c?.name || 'A client'
const toDateOnly = v => (v ? String(v).slice(0, 10) : null)

function fail(message, status = 409) {
  const err = new Error(message)
  err.status = status
  return err
}

function broadcast(plan) {
  emitCarePlanChanged(plan.id)
  emitClientCarePlanChanged(plan.client_id, plan.id)
}

/* ----------------------------------------------------------------- create */

/**
 * Assign a plan to a client. Snapshots the tier (name/price/description) so a
 * later price-book edit never re-prices a live plan. With an agreement the plan
 * waits at pending_signature (contract row + PandaDoc document, not yet sent);
 * without one it is born at awaiting_card.
 */
export async function createCarePlanForClient(client, input, { actorUserId = null, owner = null } = {}) {
  let tier = null
  if (input.service_id) {
    tier = await getService(input.service_id)
    if (!tier || tier.category !== 'care_plan') throw fail('That price-book entry is not a care plan', 400)
  }
  const name = str(input.name).trim() || tier?.name
  const price = input.price != null ? Number(input.price) : tier ? Number(tier.price) : null
  if (!name) throw fail('A plan name is required', 400)
  if (!Number.isFinite(price) || price <= 0) throw fail('A monthly price greater than zero is required', 400)
  const description = input.description !== undefined ? (str(input.description).trim() || null) : (tier?.description ?? null)
  const start_date = toDateOnly(input.start_date) || new Date().toISOString().slice(0, 10)
  const requires_agreement = !!input.requires_agreement

  if (requires_agreement && !(await getActiveTemplate('care_plan'))) {
    throw fail('No care-plan agreement template is active. Add one under Settings → Integrations, or assign the plan without an agreement.', 409)
  }

  let plan = await createCarePlan({
    client_id: client.id, service_id: tier?.id ?? null, name, description, price,
    currency: (input.currency || 'USD').toUpperCase(), start_date, requires_agreement,
    status: requires_agreement ? 'pending_signature' : 'awaiting_card'
  })

  if (requires_agreement) {
    // The agreement is a contracts row (type='care_plan') carrying the plan as its
    // one line item, so the Sales page, the portal and the contract viewer all
    // see it exactly like any other contract.
    const contract = await createContract({
      client_id: client.id, type: 'care_plan', title: `${name} — Care Plan Agreement`,
      currency: plan.currency, total: price, billing_interval: 'monthly', start_date,
      items: [{ service_id: tier?.id ?? null, name_snapshot: name, description_snapshot: description, unit_price_snapshot: price, qty: 1, billing_interval_snapshot: 'monthly' }]
    })
    plan = await updateCarePlan(plan.id, { contract_id: contract.id })
    await createCarePlanDocument(plan, contract, client, owner)
  }

  await logClientActivity(client.id, {
    category: 'agreement', icon: 'i-lucide-heart-pulse',
    title: `Care plan assigned — ${name}`,
    meta: `${money(price)} / month${requires_agreement ? ' · agreement to sign' : ''}`,
    link: '/sales'
  })
  try {
    await notify({
      category: 'contract', tone: 'info', icon: 'i-lucide-heart-pulse',
      title: 'Care plan assigned',
      body: `${clientLabel(client)} — ${name}, ${money(price)}/mo.`,
      link: `/clients/${client.id}?tab=money`
    }, actorUserId)
  } catch (err) { console.error('care plan notify failed:', err.message) }
  broadcast(plan)
  return getCarePlan(plan.id)
}

/** The agreement's tokens: the same Agency.* block the project contract uses,
 *  plus the plan itself. */
async function buildCarePlanTokens(plan, client) {
  const settings = (await getCachedSettings()) ?? {}
  const agencyAddress = [
    settings.agency_address_line1, settings.agency_address_line2,
    [settings.agency_city, settings.agency_region, settings.agency_postal_code].filter(Boolean).join(' '),
    settings.agency_country
  ].filter(Boolean).join(', ')
  const pairs = {
    'Agreement.EffectiveDate': date(new Date()),
    'Agency.LegalName': settings.agency_legal_name || settings.agency_display_name || 'Francis Web Agency',
    'Agency.Address': agencyAddress,
    'Agency.Email': settings.agency_support_email || '',
    'Agency.Phone': settings.agency_phone || '',
    'Client.Company': client.company || '',
    'Client.Name': client.name || '',
    'Client.Email': client.billing_email || client.email || '',
    'Plan.Name': plan.name,
    'Plan.Price': money(plan.price),
    'Plan.Interval': 'month',
    'Plan.StartDate': date(plan.start_date),
    'Plan.Included': plan.description || ''
  }
  return Object.entries(pairs).map(([name, value]) => ({ name, value: str(value) }))
}

// Best-effort: a missing template or a PandaDoc hiccup leaves the contract as a
// bare row; Send Agreement then reports why it can't go out. The admin who
// assigned the plan is added as the countersigner (PANDADOC_OWNER_ROLE), so
// the contract viewer's Countersign finds them on the document.
async function createCarePlanDocument(plan, contract, client, owner = null) {
  if (!pandadocEnabled()) return contract
  const template = await getActiveTemplate('care_plan')
  if (!template) return contract
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: `${contract.title} — ${clientLabel(client)}`,
      client,
      tokens: await buildCarePlanTokens(plan, client),
      // No pricing table: the template carries the fee through tokens.
      items: [],
      owner: (config.pandadoc.ownerRole && owner?.email) ? { role: config.pandadoc.ownerRole, email: owner.email, name: owner.name } : null,
      metadata: { fwa_client_id: String(client.id), fwa_contract_id: String(contract.id), fwa_care_plan_id: String(plan.id), type: 'contract' }
    })
    if (doc) return await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc care-plan document failed for plan ${plan.id}:`, err.message)
  }
  return contract
}

/* -------------------------------------------------------------- agreement */

export async function sendCarePlanAgreement(plan, { actorUserId = null } = {}) {
  if (plan.status !== 'pending_signature') throw fail(`This plan is ${plan.status.replace('_', ' ')}, not awaiting an agreement`)
  if (!plan.contract_id) throw fail('This plan has no agreement to send')
  const contract = await getContract(plan.contract_id)
  if (!contract) throw fail('This plan’s agreement is missing')
  if (contract.status !== 'draft') return contract
  if (!contract.pandadoc_document_id) throw fail('The agreement document was never created — check the care-plan template in PandaDoc')
  await sendDocumentWhenReady(contract.pandadoc_document_id)
  const sent = await updateContract(contract.id, { status: 'sent', sent_at: new Date() })
  emitContractChanged(contract.id)
  emitClientAgreementChanged(contract.client_id, contract.id)
  await logClientActivity(plan.client_id, {
    category: 'agreement', icon: 'i-lucide-send',
    title: `Care plan agreement sent — ${plan.name}`, link: '/sales'
  })
  try {
    await clientNotify(plan.client_id, {
      category: 'contract', tone: 'info', icon: 'i-lucide-file-signature',
      title: 'Agreement to sign', body: contract.title, link: '/agreements'
    })
  } catch (err) { console.error('care plan client notify failed:', err.message) }
  void actorUserId
  broadcast(plan)
  return sent
}

/** PandaDoc says the care-plan agreement is signed: the plan may now take a card. */
export async function onCarePlanContractSigned(contract) {
  const plan = await getCarePlanByContract(contract.id)
  if (!plan) return null
  const moved = await claimCarePlanStatus(plan.id, 'awaiting_card', ['pending_signature'])
  if (!moved) return getCarePlan(plan.id)
  const fresh = await getCarePlan(plan.id)
  const client = await getClient(plan.client_id)
  if (client) await inviteForCard(fresh, client, { silent: false })
  broadcast(fresh)
  return fresh
}

/* --------------------------------------------------------------- the card */

/**
 * Ask the client to add a card in the portal. Ensures they have a portal login
 * (the invite path is idempotent and never overwrites a password), then sends
 * the care-plan-card email pointing at the portal's Care Plan page.
 */
export async function inviteForCard(plan, client, { actorUserId = null, silent = false } = {}) {
  if (plan.status !== 'awaiting_card') throw fail(`This plan is ${plan.status.replace('_', ' ')}; it isn’t waiting for a card`)
  if (!client.email) throw fail('This client has no email address', 400)
  const existing = await getPortalUserForClient(client.id)
  if (!existing) await inviteClientToPortal(client, actorUserId)
  try {
    await sendTemplateEmail({
      template: TEMPLATES.carePlanCard,
      to: client.billing_email || client.email,
      variables: {
        name: client.name || client.company || 'there',
        plan_name: plan.name,
        price: `${money(plan.price)}/month`,
        start_date: date(plan.start_date),
        portal_url: portalUrl('/care-plan')
      }
    })
  } catch (err) {
    console.error(`care-plan-card email failed for plan ${plan.id}:`, err.message)
  }
  try {
    await clientNotify(client.id, {
      category: 'payment', tone: 'info', icon: 'i-lucide-credit-card',
      title: 'Add a card to start your care plan', body: plan.name, link: '/care-plan'
    })
  } catch (err) { console.error('care plan card notify failed:', err.message) }
  if (!silent) {
    await logClientActivity(client.id, {
      category: 'payment', icon: 'i-lucide-credit-card',
      title: `Card link sent — ${plan.name}`, meta: client.billing_email || client.email, link: '/sales'
    })
  }
  return plan
}

/**
 * The client confirmed a SetupIntent in the portal. Verify it is theirs and
 * succeeded, make the card the default, then create the Price + Subscription.
 * Claims awaiting_card -> active FIRST so two confirmations can't subscribe twice;
 * a Stripe failure after the claim is reported and the claim is rolled back.
 */
export async function activateCarePlan(plan, client, setupIntentId) {
  if (!stripeEnabled()) throw fail('Online billing is not available right now')
  if (plan.status !== 'awaiting_card') throw fail(`This plan is ${plan.status.replace('_', ' ')}`)
  const pm = await verifySetupIntent(client, setupIntentId)

  const moved = await claimCarePlanStatus(plan.id, 'active', ['awaiting_card'])
  if (!moved) return getCarePlan(plan.id)

  try {
    const card = await setDefaultPaymentMethod(client.stripe_customer_id, pm.id)
    const priceId = plan.stripe_price_id || await createRecurringPrice({
      name: plan.name, amountCents: Math.round(plan.price * 100), currency: plan.currency.toLowerCase(),
      metadata: { fwa_care_plan_id: String(plan.id), fwa_client_id: String(client.id) }
    })
    // Bill on the start date and its anniversaries; a start date that's today
    // or past charges now and anchors today.
    const startMs = Date.parse(`${toDateOnly(plan.start_date)}T12:00:00Z`)
    const trialEnd = startMs > Date.now() + 60_000 ? Math.floor(startMs / 1000) : null
    const sub = await createSubscription({
      customerId: client.stripe_customer_id, priceId, paymentMethodId: pm.id, trialEnd,
      metadata: { fwa_care_plan_id: String(plan.id), fwa_client_id: String(client.id) }
    })
    const fresh = await updateCarePlan(plan.id, {
      stripe_price_id: priceId,
      stripe_subscription_id: sub.id,
      pm_brand: card?.brand ?? null, pm_last4: card?.last4 ?? null,
      ...periodFields(sub)
    })
    await afterActivation(fresh, client)
    return fresh
  } catch (err) {
    // Give the client another go rather than stranding a plan that never subscribed.
    await claimCarePlanStatus(plan.id, 'awaiting_card', ['active'])
    console.error(`Care plan ${plan.id} activation failed:`, err.message)
    throw fail(`Couldn’t start the subscription: ${err.message}`, 502)
  }
}

async function verifySetupIntent(client, setupIntentId) {
  if (!setupIntentId || typeof setupIntentId !== 'string') throw fail('A setup intent is required', 400)
  if (!client.stripe_customer_id) {
    const id = await createStripeCustomer(client)
    if (id) { await updateClient(client.id, { stripe_customer_id: id }); client.stripe_customer_id = id }
  }
  const si = await retrieveSetupIntent(setupIntentId)
  if (!si || si.customer !== client.stripe_customer_id) throw fail('That card setup doesn’t belong to this account', 404)
  if (si.status !== 'succeeded') throw fail(`The card setup is ${si.status.replace('_', ' ')}`)
  const pm = typeof si.payment_method === 'string' ? { id: si.payment_method } : si.payment_method
  if (!pm?.id) throw fail('No payment method was saved')
  return pm
}

async function afterActivation(plan, client) {
  const next = plan.next_charge_at ? date(plan.next_charge_at) : date(plan.start_date)
  await logClientActivity(client.id, {
    category: 'payment', icon: 'i-lucide-heart-pulse',
    title: `Care plan active — ${plan.name}`,
    meta: `${money(plan.price)} / month · next charge ${next}`, link: '/sales'
  })
  try {
    await notify({
      category: 'payment', tone: 'success', icon: 'i-lucide-heart-pulse',
      title: 'Care plan active',
      body: `${clientLabel(client)} added a card. ${plan.name} bills ${money(plan.price)}/mo from ${next}.`,
      link: `/clients/${client.id}?tab=money`
    })
  } catch (err) { console.error('care plan active notify failed:', err.message) }
  try {
    await sendTemplateEmail({
      template: TEMPLATES.carePlanActive,
      to: client.billing_email || client.email,
      variables: {
        name: client.name || client.company || 'there',
        plan_name: plan.name, price: `${money(plan.price)}/month`, next_charge: next,
        card: plan.pm_last4 ? `${cardBrand(plan.pm_brand)} ending ${plan.pm_last4}` : 'your card',
        portal_url: portalUrl('/care-plan')
      }
    })
  } catch (err) { console.error('care-plan-active email failed:', err.message) }
  broadcast(plan)
}

/** Swap the card on a live plan (same SetupIntent dance). */
export async function updateCarePlanCard(plan, client, setupIntentId) {
  if (!['active', 'past_due'].includes(plan.status)) throw fail(`This plan is ${plan.status.replace('_', ' ')}`)
  const pm = await verifySetupIntent(client, setupIntentId)
  const card = await setDefaultPaymentMethod(client.stripe_customer_id, pm.id)
  if (plan.stripe_subscription_id) await updateSubscriptionPaymentMethod(plan.stripe_subscription_id, pm.id)
  const fresh = await updateCarePlan(plan.id, { pm_brand: card?.brand ?? null, pm_last4: card?.last4 ?? null })
  await logClientActivity(client.id, {
    category: 'payment', icon: 'i-lucide-credit-card',
    title: `Card updated — ${plan.name}`, meta: fresh.pm_last4 ? `ending ${fresh.pm_last4}` : null, link: '/sales'
  })
  broadcast(fresh)
  return fresh
}

/* ---------------------------------------------------------------- cancel */

export async function cancelCarePlan(plan, { atPeriodEnd = true, actorUserId = null } = {}) {
  if (plan.status === 'cancelled') return plan
  const client = await getClient(plan.client_id)
  if (plan.stripe_subscription_id && stripeEnabled()) {
    const sub = await cancelSubscription(plan.stripe_subscription_id, { atPeriodEnd })
    if (atPeriodEnd && sub?.status !== 'canceled') {
      // Stays live until Stripe ends it; the webhook flips it to cancelled then.
      const fresh = await updateCarePlan(plan.id, { cancel_at_period_end: true, ...periodFields(sub) })
      await logClientActivity(plan.client_id, {
        category: 'payment', icon: 'i-lucide-calendar-x',
        title: `Care plan ending — ${plan.name}`,
        meta: fresh.current_period_end ? `ends ${date(fresh.current_period_end)}` : null, link: '/sales'
      })
      broadcast(fresh)
      return fresh
    }
  }
  await claimCarePlanStatus(plan.id, 'cancelled', ['draft', 'pending_signature', 'awaiting_card', 'active', 'past_due'], { cancel_at_period_end: false, next_charge_at: null })
  const fresh = await getCarePlan(plan.id)
  await logClientActivity(plan.client_id, {
    category: 'payment', icon: 'i-lucide-calendar-x',
    title: `Care plan cancelled — ${plan.name}`, link: '/sales'
  })
  try {
    await notify({
      category: 'payment', tone: 'neutral', icon: 'i-lucide-calendar-x',
      title: 'Care plan cancelled', body: `${clientLabel(client)} — ${plan.name}.`,
      link: `/clients/${plan.client_id}?tab=money`
    }, actorUserId)
  } catch (err) { console.error('care plan cancel notify failed:', err.message) }
  broadcast(fresh)
  return fresh
}

/* --------------------------------------------------------------- webhooks */

const ts = v => (v ? new Date(v * 1000) : null)
/** The period columns from a Stripe subscription object. */
function periodFields(sub) {
  if (!sub) return {}
  const item = sub.items?.data?.[0]
  const start = ts(sub.current_period_start ?? item?.current_period_start)
  const end = ts(sub.current_period_end ?? item?.current_period_end)
  const trialEnd = ts(sub.trial_end)
  return {
    current_period_start: start,
    current_period_end: end,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    // The next charge is the period end, or the trial end before the first
    // charge — and nothing at all once the plan is ending or ended.
    next_charge_at: sub.status === 'canceled' || sub.cancel_at_period_end ? null : (sub.status === 'trialing' ? trialEnd : end)
  }
}

const STRIPE_STATUS = {
  trialing: 'active', active: 'active',
  past_due: 'past_due', unpaid: 'past_due',
  canceled: 'cancelled', incomplete_expired: 'cancelled'
}

/** customer.subscription.updated / .deleted → mirror status and period. */
export async function syncFromSubscription(plan, sub) {
  const target = STRIPE_STATUS[sub.status]
  const fields = periodFields(sub)
  if (target && target !== plan.status && ['active', 'past_due', 'cancelled'].includes(plan.status)) {
    await claimCarePlanStatus(plan.id, target, ['active', 'past_due'], fields)
  } else {
    await updateCarePlan(plan.id, fields)
  }
  const fresh = await getCarePlan(plan.id)
  if (target === 'cancelled' && plan.status !== 'cancelled') {
    await logClientActivity(plan.client_id, {
      category: 'payment', icon: 'i-lucide-calendar-x',
      title: `Care plan ended — ${plan.name}`, link: '/sales'
    })
  }
  broadcast(fresh)
  return fresh
}

/** A subscription invoice was paid: the plan is (back to) active. */
export async function onCarePlanInvoicePaid(plan, inv) {
  const end = ts(inv.lines?.data?.[0]?.period?.end)
  await claimCarePlanStatus(plan.id, 'active', ['past_due'])
  const fresh = await updateCarePlan(plan.id, end ? { current_period_end: end, next_charge_at: plan.cancel_at_period_end ? null : end } : {})
  broadcast(fresh)
  return fresh
}

/** A subscription invoice failed: the plan is past due; the client is asked to fix the card. */
export async function onCarePlanPaymentFailed(plan, client) {
  const moved = await claimCarePlanStatus(plan.id, 'past_due', ['active'])
  const fresh = await getCarePlan(plan.id)
  if (moved && client) {
    try {
      await sendTemplateEmail({
        template: TEMPLATES.carePlanPaymentFailed,
        to: client.billing_email || client.email,
        variables: {
          name: client.name || client.company || 'there',
          plan_name: plan.name, price: `${money(plan.price)}/month`,
          portal_url: portalUrl('/care-plan')
        }
      })
    } catch (err) { console.error('care-plan-payment-failed email failed:', err.message) }
    try {
      await clientNotify(client.id, {
        category: 'payment', tone: 'warning', icon: 'i-lucide-triangle-alert',
        title: 'Care plan payment failed', body: 'Update your card to keep your plan active.', link: '/care-plan'
      })
    } catch (err) { console.error('care plan failed notify failed:', err.message) }
  }
  broadcast(fresh)
  return fresh
}

/** "Care Plan — Basic · Sep 14 – Oct 14, 2026" for the local invoice row. */
export function carePlanInvoiceDescription(plan, inv) {
  const line = inv.lines?.data?.[0]
  const period = line?.period ? `${date(ts(line.period.start))} – ${date(ts(line.period.end))}` : null
  return `Care Plan — ${plan.name}${period ? ` · ${period}` : ''}`
}

export function cardBrand(brand) {
  const map = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', link: 'Link' }
  return map[String(brand || '').toLowerCase()] || (brand ? String(brand) : 'Card')
}
