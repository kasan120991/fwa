// A deal as the client sees it: the proposal with the agreement it produced
// (and the project the signature created), or a care plan with its optional
// agreement. GET /portal/deals hands over the flat row; the stage — what the
// deal needs from the client, if anything — is derived here so the Agreements
// page and Home agree.

export interface PortalDeal {
  kind: 'deal' | 'care_plan'
  code: string | null
  title: string
  total: number | null
  recurring: boolean
  proposal_id: number | null
  proposal_status: 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'voided' | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  declined_at: string | null
  expires_at: string | null
  contract_id: number | null
  contract_status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'voided' | null
  contract_sent_at: string | null
  signed_at: string | null
  project_id: number | null
  project_code: string | null
  project_status: string | null
  care_plan_id: number | null
  care_plan_status: 'pending_signature' | 'awaiting_card' | 'active' | 'past_due' | 'cancelled' | null
  next_charge_at: string | null
  cancel_at_period_end: boolean | null
  created_at: string
  updated_at: string
}

// What the client needs to do, in the order it matters.
export type Stage = 'sign' | 'review' | 'card' | 'preparing' | 'active' | 'past_due' | 'done' | 'closed'
const DEAD = new Set(['declined', 'expired', 'voided'])

export function stageOf(d: PortalDeal): Stage {
  if (d.kind === 'care_plan') {
    switch (d.care_plan_status) {
      case 'pending_signature': return d.contract_status === 'sent' || d.contract_status === 'viewed' ? 'sign' : 'preparing'
      case 'awaiting_card': return 'card'
      case 'active': return 'active'
      case 'past_due': return 'past_due'
      case 'cancelled': return 'closed'
      default: return 'preparing'
    }
  }
  const p = d.proposal_status
  if (p === 'sent' || p === 'viewed') return 'review'
  if (!p || DEAD.has(p)) return 'closed'
  // accepted: the agreement decides from here
  const c = d.contract_status
  if (c === 'sent' || c === 'viewed') return 'sign'
  if (c === 'signed') return d.project_status === 'completed' ? 'done' : 'active'
  if (c && DEAD.has(c)) return 'closed'
  return 'preparing'
}

// The three stages that ask something of the client, most urgent first.
export const ACTION_PRIORITY: Stage[] = ['sign', 'review', 'card']
export const isActionable = (s: Stage) => ACTION_PRIORITY.includes(s)

export function chip(d: PortalDeal, s = stageOf(d)): { label: string, class: string } {
  switch (s) {
    case 'sign': return { label: 'Sign', class: 'bg-warning/10 text-warning' }
    case 'review': return { label: 'Review', class: 'bg-warning/10 text-warning' }
    case 'card': return { label: 'Add A Card', class: 'bg-warning/10 text-warning' }
    case 'preparing': return { label: d.kind === 'care_plan' ? 'Preparing' : 'Preparing Agreement', class: 'bg-info/10 text-info' }
    case 'active': return { label: d.kind === 'care_plan' ? (d.cancel_at_period_end ? 'Ending' : 'Active') : (d.project_code ? 'In Progress' : 'Signed'), class: 'bg-success/10 text-success' }
    case 'past_due': return { label: 'Payment Failed', class: 'bg-error/10 text-error' }
    case 'done': return { label: 'Completed', class: 'bg-success/10 text-success' }
    default: {
      const why = d.kind === 'care_plan' ? 'cancelled' : (DEAD.has(d.proposal_status ?? '') ? d.proposal_status : d.contract_status)
      return { label: why === 'declined' ? 'Declined' : why === 'expired' ? 'Expired' : why === 'voided' ? 'Withdrawn' : why === 'cancelled' ? 'Cancelled' : 'Closed', class: 'bg-mist text-muted' }
    }
  }
}

/** What it is, for the eyebrow: "Proposal", "Project Agreement", "Care Plan Agreement", "Care Plan". */
export function kindLabel(d: PortalDeal, s = stageOf(d)): string {
  if (d.kind === 'care_plan') return s === 'sign' || s === 'preparing' ? 'Care Plan Agreement' : 'Care Plan'
  if (s === 'review' || (s === 'closed' && DEAD.has(d.proposal_status ?? ''))) return 'Proposal'
  return 'Project Agreement'
}

/** The story so far, as one line. */
export function stageLine(d: PortalDeal, s = stageOf(d)): string {
  const parts: string[] = []
  if (d.kind === 'care_plan') {
    if (d.contract_id && d.signed_at) parts.push(`Agreement signed ${shortDate(d.signed_at)}`)
    else if (d.contract_id && d.contract_sent_at) parts.push(`Agreement sent ${shortDate(d.contract_sent_at)}`)
    if (s === 'card' && !parts.length) parts.push(`Assigned ${shortDate(d.created_at)}`)
    if (s === 'active') parts.push(d.cancel_at_period_end ? `Ends ${shortDate(d.next_charge_at)}` : `Next charge ${shortDate(d.next_charge_at)}`)
    if (s === 'past_due') parts.push('Update your card to keep the plan active')
    if (s === 'closed') parts.push('Cancelled')
    return parts.join(' · ') || 'Preparing'
  }
  if (s === 'review') {
    if (d.sent_at) parts.push(`Sent ${shortDate(d.sent_at)}`)
    if (d.expires_at) parts.push(`Expires ${shortDate(d.expires_at)}`)
    return parts.join(' · ') || 'Ready to review'
  }
  if (d.accepted_at) parts.push(`Accepted ${shortDate(d.accepted_at)}`)
  if (s === 'preparing') parts.push('Agreement on its way')
  if (s === 'sign' && d.contract_sent_at) parts.push(`Agreement sent ${shortDate(d.contract_sent_at)}`)
  if ((s === 'active' || s === 'done') && d.signed_at) parts.push(`Signed ${shortDate(d.signed_at)}`)
  if (d.project_code) parts.push(s === 'done' ? `${d.project_code} completed` : `${d.project_code} in progress`)
  if (s === 'closed') {
    if (d.proposal_status === 'declined' && d.declined_at) parts.push(`Declined ${shortDate(d.declined_at)}`)
    else if (d.proposal_status === 'expired' && d.expires_at) parts.push(`Expired ${shortDate(d.expires_at)}`)
  }
  return parts.join(' · ') || shortDate(d.created_at)
}

/** The one thing the client can do next, if anything. */
export function nextAction(d: PortalDeal, s = stageOf(d)): { label: string, to: string } | null {
  switch (s) {
    case 'sign': return { label: 'Sign Agreement', to: `/agreements/contract-${d.contract_id}` }
    case 'review': return { label: 'Review Proposal', to: `/agreements/proposal-${d.proposal_id}` }
    case 'card': return { label: 'Add Your Card', to: '/care-plan' }
    case 'past_due': return { label: 'Update Card', to: '/care-plan' }
    default: return null
  }
}

/** Where a row goes when it's simply opened. */
export function viewTo(d: PortalDeal, s = stageOf(d)): string {
  if (d.kind === 'care_plan') return d.contract_id && (s === 'sign' || s === 'preparing') ? `/agreements/contract-${d.contract_id}` : '/care-plan'
  if (s === 'review' || (s === 'closed' && !d.contract_id)) return `/agreements/proposal-${d.proposal_id}`
  return d.contract_id ? `/agreements/contract-${d.contract_id}` : `/agreements/proposal-${d.proposal_id}`
}

/** Pick the deal that most needs the client right now. */
export function mostUrgent(deals: PortalDeal[]): { deal: PortalDeal, stage: Stage } | null {
  for (const stage of ACTION_PRIORITY) {
    const hit = deals.find(d => stageOf(d) === stage)
    if (hit) return { deal: hit, stage }
  }
  return null
}
