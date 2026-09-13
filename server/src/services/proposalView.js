// The proposal as a client sees it — the public accept page and the portal's
// proposal view render the same shape. A strict allow-list, not the row:
// ids, PandaDoc references, the hourly rate, third-party cost notes and the
// client's contact details stay out of it.
import { getProposalItems } from '../repositories/proposals.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getCachedSettings } from './settings.service.js'

const num = v => (v == null ? null : Number(v))

function agencyBlock(settings) {
  return {
    name: settings?.agency_display_name || settings?.agency_legal_name || 'Francis Web Agency',
    email: settings?.agency_support_email || null,
    logo_url: settings?.agency_logo_url || null
  }
}

/** The decided (already accepted/declined) payload: no scope, no money, still branded. */
export async function decidedProposalView(proposal, { contract_id = null } = {}) {
  const settings = await getCachedSettings()
  return { decided: true, status: proposal.status, title: proposal.title, code: proposal.code, contract_id, agency: agencyBlock(settings) }
}

/**
 * What the page renders. A strict allow-list, not the row: this is public, so
 * everything internal — ids, PandaDoc references, the hourly rate, third-party
 * cost notes, the client's contact details — stays out of it.
 */
export async function proposalView(proposal) {
  const [items, client, settings] = await Promise.all([
    getProposalItems(proposal.id),
    getClient(proposal.client_id),
    getCachedSettings()
  ])
  // Callers may hand over the raw row (DECIMALs as strings) or the mapped one.
  return {
    code: proposal.code,
    title: proposal.title,
    status: proposal.status,
    currency: proposal.currency,
    total: num(proposal.total),
    goals: proposal.goals,
    pages_included: proposal.pages_included,
    key_features: proposal.key_features,
    design_deliverables: proposal.design_deliverables,
    content_provided_by: proposal.content_provided_by,
    revision_rounds: proposal.revision_rounds,
    project_fee: num(proposal.project_fee),
    deposit_pct: num(proposal.deposit_pct),
    start_date: proposal.start_date,
    target_launch_date: proposal.target_launch_date,
    special_terms: proposal.special_terms,
    expires_at: proposal.expires_at,
    items: items.map(i => ({
      name: i.name_snapshot,
      description: i.description_snapshot,
      unit_price: num(i.unit_price_snapshot),
      qty: num(i.qty),
      line_total: num(i.line_total)
    })),
    client: { name: client?.company || client?.name || '' },
    agency: agencyBlock(settings)
  }
}
