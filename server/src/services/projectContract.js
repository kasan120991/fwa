import { createContract, updateContract } from '../repositories/contracts.repo.js'
import { getTemplate, getActiveTemplate } from '../repositories/documentTemplates.repo.js'
import { pandadocEnabled, createDocumentFromTemplate } from './pandadoc.js'

// Generate a project's contract from its Statement of Work. The project is the
// hub (see project-is-sow-hub): its SOW fields map to the agreement's PandaDoc
// tokens — filling both Exhibit A and every bracketed placeholder in the body.
// The local contract row is always created; the PandaDoc document is best-effort
// (no-ops when disabled, never throws to the caller).

const str = v => (v == null ? '' : String(v))
const money = v => (v == null ? '' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

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
    'Project.ContentDeadline': project.content_deadline,
    'Project.StartDate': project.start_date,
    'Project.TargetLaunch': project.target_launch_date,
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
 * getContact() row. Returns the created contract.
 */
export async function generateProjectContract(project, client) {
  const title = `Website Design & Development Agreement — ${client.company || client.name}`
  const items = [{
    service_id: null,
    name_snapshot: `Website Design & Development — ${project.name}`,
    description_snapshot: project.goals || null,
    unit_price_snapshot: project.project_fee ?? 0,
    qty: 1,
    billing_interval_snapshot: 'one_time',
    sort_order: 0
  }]

  let contract = await createContract({
    client_id: client.id,
    project_id: project.id,
    type: 'project',
    title,
    total: project.project_fee ?? 0,
    billing_interval: 'one_time',
    items
  })

  if (!pandadocEnabled()) return contract
  const template = await resolveTemplate(project)
  if (!template) return contract
  try {
    const doc = await createDocumentFromTemplate({
      templateUuid: template.template_uuid,
      name: title,
      client,
      tokens: buildTokens(project, client),
      items: contract.items,
      metadata: { fwa_client_id: String(client.id), fwa_project_id: String(project.id), fwa_contract_id: String(contract.id), type: 'contract' }
    })
    if (doc) contract = await updateContract(contract.id, { pandadoc_document_id: doc.id, pandadoc_template_id: template.template_uuid, pandadoc_status: doc.status })
  } catch (err) {
    console.error(`PandaDoc project-contract creation failed for project ${project.id}:`, err.message)
  }
  return contract
}
