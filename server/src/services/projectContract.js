import { createContract, updateContract } from '../repositories/contracts.repo.js'
import { getTemplate, getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { pandadocEnabled, createDocumentFromTemplate } from './pandadoc.js'
import { resolveLineItems } from './lineItems.js'
import { config } from '../config/env.js'

// Generate a project's contract from its Statement of Work. The project is the
// hub (see project-is-sow-hub): its SOW fields map to the agreement's PandaDoc
// tokens — filling both Exhibit A and every bracketed placeholder in the body.
// The local contract row is always created; the PandaDoc document is best-effort
// (no-ops when disabled, never throws to the caller).

const str = v => (v == null ? '' : String(v))
const money = v => (v == null ? '' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
// Format a DATE (YYYY-MM-DD or Date) as "June 17, 2026", timezone-safe (no off-by-one).
const date = (v) => {
  if (v == null || v === '') return ''
  const s = (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return str(v)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function clientAddress(c) {
  return [c.address_line1, c.address_line2, [c.city, c.region, c.postal_code].filter(Boolean).join(', '), c.country]
    .filter(Boolean).join(', ')
}

// The token contract the project_contract template must expose. Keep names in
// sync with the plan (§5) and whatever fields the PandaDoc template declares.
function buildTokens(project, client) {
  const fee = project.project_fee
  const pct = project.deposit_pct ?? 50
  const deposit = fee == null ? null : Math.round((fee * pct / 100) * 100) / 100
  const balance = fee == null ? null : Math.round((fee - deposit) * 100) / 100
  const pairs = {
    // The agreement's "as of [Effective Date]" — the date the contract is generated.
    'Agreement.EffectiveDate': date(new Date()),
    'Client.Company': client.company || client.name || '',
    'Client.Name': client.name || '',
    'Client.Address': clientAddress(client),
    'Client.Email': client.billing_email || client.email || '',
    'Client.Title': client.title || '',
    'Project.Name': project.name,
    'Project.Goals': project.goals,
    'Project.Pages': project.pages_included,
    'Project.Features': project.key_features,
    'Project.Deliverables': project.design_deliverables,
    'Project.ContentBy': project.content_provided_by,
    'Project.Revisions': project.revision_rounds,
    'Project.ThirdPartyCosts': project.third_party_costs,
    'Project.Fee': money(fee),
    'Project.Deposit': money(deposit),
    'Project.Balance': money(balance),
    'Project.DepositPct': pct,
    'Project.FinalPct': Math.round((100 - pct) * 100) / 100,
    'Project.HourlyRate': money(project.hourly_rate),
    'Project.ContentDeadline': date(project.content_deadline),
    'Project.StartDate': date(project.start_date),
    'Project.TargetLaunch': date(project.target_launch_date),
    'Project.SpecialTerms': project.special_terms,
    'Policy.InactivityDays': project.inactivity_days,
    'Policy.FeedbackDays': project.feedback_days,
    'Policy.LateDays': project.late_fee_days,
    'Policy.BugfixDays': project.bugfix_days
  }
  return Object.entries(pairs).map(([name, value]) => ({ name, value: str(value) }))
}

/** Resolve the template for a project: its type's pinned template, else the
 *  generic active project_contract template. Returns a document_templates row or null. */
async function resolveTemplate(project) {
  if (project.type_contract_template_id) {
    const t = await getTemplate(project.type_contract_template_id)
    if (t) return t
  }
  return getActiveTemplate('project_contract')
}

/**
 * Create the project's contract row (+ PandaDoc document when configured).
 * `project` is a getProject() row (flat SOW fields + type_*); `client` is a
 * getClient() row.
 *
 * `overrides` (all optional — the confirm-contract modal supplies them; empty =
 * today's project-derived behavior) may include: `title`, `billing_interval`,
 * `start_date`, `deposit_pct`, `special_terms`, `items` (resolveLineItems input),
 * `recipient_email` (PandaDoc signer email, defaults to the client's), and
 * `ownerEmail`/`ownerName` (agency countersigner — only added when
 * PANDADOC_OWNER_ROLE is set and the template declares that role).
 * Returns the created contract.
 */
export async function generateProjectContract(project, client, overrides = {}) {
  const title = (overrides.title && String(overrides.title).trim())
    || `Website Design & Development Agreement — ${client.company || client.name}`
  const billing_interval = overrides.billing_interval || 'one_time'
  const start_date = overrides.start_date ?? project.start_date ?? null

  // Line items: explicit override snapshotted via the shared resolver, else a
  // single item derived from the project fee (unchanged default).
  let items
  let total
  if (Array.isArray(overrides.items) && overrides.items.length) {
    const resolved = await resolveLineItems(overrides.items)
    items = resolved.rows
    total = resolved.total
  } else {
    items = [{
      service_id: null,
      name_snapshot: `Website Design & Development — ${project.name}`,
      description_snapshot: project.goals || null,
      unit_price_snapshot: project.project_fee ?? 0,
      qty: 1,
      billing_interval_snapshot: 'one_time',
      sort_order: 0
    }]
    total = project.project_fee ?? 0
  }

  let contract = await createContract({
    client_id: client.id,
    project_id: project.id,
    type: 'project',
    title,
    total,
    billing_interval,
    start_date,
    items
  })

  if (!pandadocEnabled()) return contract
  const template = await resolveTemplate(project)
  if (!template) return contract

  // Merge overrides into the project so tokens reflect any modal edits.
  const tokenProject = {
    ...project,
    deposit_pct: overrides.deposit_pct ?? project.deposit_pct,
    special_terms: overrides.special_terms ?? project.special_terms,
    start_date
  }
  // Recipient override rides on a client-shaped object (createDocumentFromTemplate
  // reads billing_email || email).
  const recipientClient = overrides.recipient_email
    ? { ...client, billing_email: overrides.recipient_email, email: overrides.recipient_email }
    : client
  const owner = (config.pandadoc.ownerRole && overrides.ownerEmail)
    ? { role: config.pandadoc.ownerRole, email: overrides.ownerEmail, name: overrides.ownerName }
    : null

  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: title,
      client: recipientClient,
      tokens: buildTokens(tokenProject, recipientClient),
      // Fee/deposit/balance are conveyed via tokens + the template's static payment
      // table — the project-contract template has no data-merge pricing block, so we
      // don't push a pricing table (avoids a PandaDoc 400). Local contract still
      // snapshots line items for records.
      items: [],
      owner,
      metadata: { fwa_client_id: String(client.id), fwa_project_id: String(project.id), fwa_contract_id: String(contract.id), type: 'contract' }
    })
    if (doc) contract = await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc project-contract creation failed for project ${project.id}:`, err.message)
  }
  return contract
}
