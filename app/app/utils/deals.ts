// A deal is one row on the Sales page: the proposal with the contract it
// produced folded in as a stage, or a care-plan contract on its own. The
// server hands over the flat join (GET /api/agreements/deals); the stage — the
// deal's position on one spine — is derived here so both the page and its
// counts agree.
import type { ChipStatus } from '~/utils/clientDetail'

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'voided'
export type ContractStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'voided'

export interface ApiDeal {
  kind: 'deal' | 'care_plan'
  proposal_id: number | null
  code: string | null
  title: string
  client_id: number
  client: string
  proposal_status: ProposalStatus | null
  total: number | null
  deposit_pct: number | null
  expires_at: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  declined_at: string | null
  accept_source: 'client' | 'admin' | null
  created_at: string
  updated_at: string
  contract_id: number | null
  contract_status: ContractStatus | null
  contract_sent_at: string | null
  contract_viewed_at: string | null
  signed_at: string | null
  contract_updated_at: string | null
  recurring: boolean
  project_id: number | null
  project_code: string | null
  project_status: string | null
}

// The spine. Closed is the terminal bucket for anything that didn't go through.
export type Stage = 'draft' | 'sent' | 'accepted' | 'contract' | 'signed' | 'closed'
export const STAGES: Stage[] = ['draft', 'sent', 'accepted', 'contract', 'signed', 'closed']
export const IN_FLIGHT: Stage[] = ['draft', 'sent', 'accepted', 'contract']

export const STAGE_META: Record<Stage, { label: string, chip: ChipStatus, icon: string }> = {
  draft: { label: 'Draft', chip: 'neutral', icon: 'i-lucide-file-text' },
  sent: { label: 'Sent', chip: 'info', icon: 'i-lucide-send' },
  accepted: { label: 'Accepted', chip: 'success', icon: 'i-lucide-handshake' },
  contract: { label: 'Contract Out', chip: 'warning', icon: 'i-lucide-file-signature' },
  signed: { label: 'Signed', chip: 'success', icon: 'i-lucide-check' },
  closed: { label: 'Closed', chip: 'error', icon: 'i-lucide-layers' }
}

const DEAD = new Set(['declined', 'expired', 'voided'])

/** Where the deal sits on the spine. */
export function stageOf(d: ApiDeal): Stage {
  if (d.kind === 'care_plan') {
    const s = d.contract_status
    if (s === 'signed') return 'signed'
    if (s === 'sent' || s === 'viewed') return 'contract'
    if (s == null || s === 'draft') return 'draft'
    return 'closed'
  }
  const p = d.proposal_status
  if (p == null || p === 'draft') return 'draft'
  if (p === 'sent' || p === 'viewed') return 'sent'
  if (DEAD.has(p)) return 'closed'
  // accepted: the contract decides from here
  const c = d.contract_status
  if (c === 'signed') return 'signed'
  if (c === 'sent' || c === 'viewed') return 'contract'
  if (c && DEAD.has(c)) return 'closed'
  return 'accepted'
}

/** What the closed chip should actually say. */
export function closedLabel(d: ApiDeal): string {
  const s = d.kind === 'care_plan' ? d.contract_status : (DEAD.has(d.proposal_status ?? '') ? d.proposal_status : d.contract_status)
  return s === 'declined' ? 'Declined' : s === 'expired' ? 'Expired' : s === 'voided' ? 'Voided' : 'Closed'
}

/** Who moves the deal next, and the timestamp that anchors "since when". */
export function nextFor(d: ApiDeal, stage: Stage): { text: string, since: string | null } {
  switch (stage) {
    case 'draft': return { text: d.kind === 'care_plan' ? 'Send the contract' : 'Send the link', since: d.created_at }
    case 'sent': return { text: 'Client to respond', since: d.sent_at }
    case 'accepted': return { text: d.contract_id ? 'Contract ready to send' : 'Agreement generating', since: d.accepted_at }
    case 'contract': return { text: 'Client to sign', since: d.contract_sent_at }
    case 'signed': return { text: d.project_code ? `${d.project_code} in progress` : 'Signed', since: d.signed_at }
    default: return { text: closedLabel(d), since: d.declined_at || d.contract_updated_at || d.updated_at }
  }
}

/** The deal's line in the list: "Sent 3d ago", "Signed Aug 13". */
export function whenFor(d: ApiDeal, stage: Stage): string {
  const n = nextFor(d, stage)
  const verb = stage === 'draft' ? 'Created' : stage === 'sent' ? 'Sent' : stage === 'accepted' ? 'Accepted' : stage === 'contract' ? 'Contract sent' : stage === 'signed' ? 'Signed' : closedLabel(d)
  if (!n.since) return verb
  const days = Math.floor((Date.now() - Date.parse(String(n.since).replace(' ', 'T') + (String(n.since).endsWith('Z') ? '' : 'Z'))) / 86_400_000)
  return days >= 7 ? `${verb} ${shortDate(n.since)}` : `${verb} ${timeAgo(n.since)}`
}

/** Days a deal has been waiting on the client (sent or contract out), else null. */
export function waitingDays(d: ApiDeal, stage: Stage): number | null {
  const since = stage === 'sent' ? d.sent_at : stage === 'contract' ? d.contract_sent_at : null
  if (!since) return null
  const ms = Date.parse(String(since).replace(' ', 'T') + (String(since).endsWith('Z') ? '' : 'Z'))
  return Number.isFinite(ms) ? Math.floor((Date.now() - ms) / 86_400_000) : null
}
