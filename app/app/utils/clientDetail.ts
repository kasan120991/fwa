// Shared types + status maps for the client detail page and its tab components
// (ClientOverviewTab / ClientWorkTab / ClientMoneyTab / ClientCommsTab).

export type ChipStatus = 'neutral' | 'info' | 'success' | 'error' | 'warning'

/** GET /api/clients/:id/summary — counts + rollups powering the metric strip,
 *  tab badges, and the Overview attention strips. */
export interface ClientSummary {
  projects_active: number
  projects_total: number
  tickets_open: number
  tickets_total: number
  websites_total: number
  websites_live: number
  invoices_open: number
  invoices_total: number
  outstanding: number
  total_billed: number
  calls_total: number
  agreements_total: number
  files_total: number
  activity_total: number
  overdue_invoice: {
    id: number
    number: string | null
    amount_due: number
    amount_paid: number
    due_date: string
    days_overdue: number
  } | null
  attention_ticket: {
    id: number
    subject: string
    priority: string
    status: string
    created_at: string
  } | null
}

export type PStatus = 'planning' | 'awaiting_signature' | 'awaiting_deposit' | 'in_progress' | 'in_review' | 'awaiting_final' | 'on_hold' | 'completed'

export const PROJECT_META: Record<PStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success', bar: string }> = {
  planning: { label: 'Planning', status: 'neutral', bar: 'bg-ink-400' },
  awaiting_signature: { label: 'Awaiting Signature', status: 'info', bar: 'bg-info' },
  awaiting_deposit: { label: 'Awaiting Deposit', status: 'warning', bar: 'bg-warning' },
  in_progress: { label: 'In Progress', status: 'info', bar: 'bg-info' },
  in_review: { label: 'In Review', status: 'info', bar: 'bg-primary' },
  awaiting_final: { label: 'Awaiting Final Payment', status: 'warning', bar: 'bg-warning' },
  on_hold: { label: 'On Hold', status: 'warning', bar: 'bg-warning' },
  completed: { label: 'Completed', status: 'success', bar: 'bg-success' }
}

export type InvStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'

export const INV_STATUS: Record<InvStatus, { label: string, status: ChipStatus }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}

export type AgreementStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'declined' | 'expired' | 'voided'

export const AGREEMENT_STATUS: Record<AgreementStatus, { status: 'success' | 'info' | 'error' | 'neutral', label: string }> = {
  draft: { status: 'neutral', label: 'Draft' },
  sent: { status: 'info', label: 'Sent' },
  viewed: { status: 'info', label: 'Viewed' },
  accepted: { status: 'success', label: 'Accepted' },
  signed: { status: 'success', label: 'Signed' },
  declined: { status: 'error', label: 'Declined' },
  expired: { status: 'neutral', label: 'Expired' },
  voided: { status: 'error', label: 'Voided' }
}
