// The Statement of Work's shape, shared by the proposal editor and the
// blank-state defaults it starts from. Lives in utils rather than in the
// component because `<script setup>` can't export, and the defaults need to
// agree with what the schema declares.
export interface SowState {
  goals: string
  pages_included: string
  key_features: string
  design_deliverables: string
  third_party_costs: string
  content_provided_by: string | undefined
  revision_rounds: number
  project_fee: number | null
  deposit_pct: number
  hourly_rate: number | null
  content_deadline: string
  start_date: string
  target_launch_date: string
  special_terms: string
  inactivity_days: number
  feedback_days: number
  late_fee_days: number
  bugfix_days: number
}

/** A blank SOW, carrying the same defaults the `proposals` table declares. */
export function blankSow(): SowState {
  return {
    goals: '',
    pages_included: '',
    key_features: '',
    design_deliverables: '',
    third_party_costs: '',
    content_provided_by: undefined,
    revision_rounds: 2,
    project_fee: null,
    deposit_pct: 50,
    hourly_rate: null,
    content_deadline: '',
    start_date: '',
    target_launch_date: '',
    special_terms: '',
    inactivity_days: 30,
    feedback_days: 5,
    late_fee_days: 7,
    bugfix_days: 30
  }
}
