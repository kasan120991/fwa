// Care plans — shared shape + labels for the client card, the assignment form
// and the Sales rows. The lifecycle is server-owned (services/carePlans.service.js);
// this only renders it.
import type { ChipStatus } from '~/utils/clientDetail'

export type CarePlanStatus = 'draft' | 'pending_signature' | 'awaiting_card' | 'active' | 'past_due' | 'cancelled'

export interface CarePlan {
  id: number
  client_id: number
  client_company: string | null
  client_name: string | null
  client_email: string | null
  service_id: number | null
  contract_id: number | null
  contract_status: string | null
  contract_document_id: string | null
  name: string
  description: string | null
  price: number
  currency: string
  billing_interval: 'monthly'
  status: CarePlanStatus
  requires_agreement: boolean
  start_date: string
  cancel_at_period_end: boolean
  activated_at: string | null
  cancelled_at: string | null
  stripe_subscription_id: string | null
  pm_brand: string | null
  pm_last4: string | null
  current_period_end: string | null
  next_charge_at: string | null
  created_at: string
  updated_at: string
}

export const CARE_PLAN_META: Record<CarePlanStatus, { label: string, chip: ChipStatus, hint: string }> = {
  draft: { label: 'Draft', chip: 'neutral', hint: 'Not started' },
  pending_signature: { label: 'Agreement Out', chip: 'info', hint: 'Waiting for the client to sign' },
  awaiting_card: { label: 'Awaiting Card', chip: 'warning', hint: 'Waiting for the client to add a card in the portal' },
  active: { label: 'Active', chip: 'success', hint: 'Billing monthly' },
  past_due: { label: 'Past Due', chip: 'error', hint: 'The last charge failed; the client has been asked to update their card' },
  cancelled: { label: 'Cancelled', chip: 'neutral', hint: 'No further charges' }
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', link: 'Link' }
export function cardLabel(p: Pick<CarePlan, 'pm_brand' | 'pm_last4'>): string | null {
  const brand = BRANDS[String(p.pm_brand || '').toLowerCase()] || (p.pm_brand ? String(p.pm_brand) : null)
  if (p.pm_last4) return `${brand || 'Card'} ending ${p.pm_last4}`
  return brand
}

export const isLive = (p: Pick<CarePlan, 'status'>) => p.status === 'active' || p.status === 'past_due'
