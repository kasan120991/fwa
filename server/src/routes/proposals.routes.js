import { Router } from 'express'
import {
  createProposal, getProposal, listProposals, updateProposal, deleteProposal,
  PROPOSAL_STATUSES, SOW_FIELDS
} from '../repositories/proposals.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getContractByProposalId } from '../repositories/contracts.repo.js'
import { getProjectType, getProjectTypeByKey } from '../repositories/projectTypes.repo.js'
import { issueProposalToken } from '../repositories/proposalTokens.repo.js'
import { resolveLineItems } from '../services/lineItems.js'
import { acceptProposal, declineProposal } from '../services/proposalAcceptance.js'
import { sendTemplateEmail, TEMPLATES } from '../services/email.js'
import { logClientActivity } from '../services/clientActivity.service.js'
import { emitProposalChanged } from '../realtime/io.js'
import { config } from '../config/env.js'

// Proposals own the Statement of Work. A proposal is the sales artefact: it
// carries the scope and the money, it's what the client accepts, and its
// acceptance is what generates the contract. The project comes much later —
// only once the deposit is actually paid.
export const proposalsRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}
const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)

/* ------------------------------------------------- Statement of Work fields */

const TEXT_FIELDS = ['goals', 'pages_included', 'key_features', 'design_deliverables', 'third_party_costs', 'special_terms']
const DATE_FIELDS = ['content_deadline', 'start_date', 'target_launch_date']
const INT_FIELDS = ['revision_rounds', 'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days']
const MONEY_FIELDS = ['project_fee', 'hourly_rate']
const CONTENT_BY = new Set(['client', 'developer', 'mix'])

/** Coerce and validate the SOW half of a body. Mirrors the project validator it
 *  replaced — same fields, same rules, now on the sales side. */
function validateSow(body, fields) {
  const sow = {}
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) sow[f] = body[f] == null || body[f] === '' ? null : String(body[f])
  }
  for (const f of DATE_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] === null || body[f] === '') { sow[f] = null; continue }
    if (typeof body[f] !== 'string' || Number.isNaN(Date.parse(body[f]))) fields[f] = 'must be a valid date'
    else sow[f] = body[f].slice(0, 10)
  }
  for (const f of INT_FIELDS) {
    if (body[f] === undefined) continue
    const n = Number(body[f])
    if (!Number.isInteger(n) || n < 0) fields[f] = 'must be a non-negative integer'
    else sow[f] = n
  }
  for (const f of MONEY_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] === null || body[f] === '') { sow[f] = null; continue }
    const n = Number(body[f])
    if (!Number.isFinite(n) || n < 0) fields[f] = 'must be a non-negative amount'
    else sow[f] = n
  }
  if (body.deposit_pct !== undefined) {
    const n = Number(body.deposit_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) fields.deposit_pct = 'must be between 0 and 100'
    else sow.deposit_pct = n
  }
  if (body.content_provided_by !== undefined) {
    if (body.content_provided_by === null || body.content_provided_by === '') sow.content_provided_by = null
    else if (!CONTENT_BY.has(body.content_provided_by)) fields.content_provided_by = `must be one of ${[...CONTENT_BY].join(', ')}`
    else sow.content_provided_by = body.content_provided_by
  }
  return sow
}

/* ------------------------------------------------------------------ routes */

// GET /api/proposals  ?client_id=  ?project_id=  ?status=a,b  ?limit=  ?offset=
proposalsRouter.get('/', async (req, res) => {
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !PROPOSAL_STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)
  const result = await listProposals({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    statuses,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/proposals/:id — includes line items.
proposalsRouter.get('/:id', async (req, res) => {
  const proposal = await getProposal(parseId(req))
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  res.json({ data: proposal })
})

// POST /api/proposals — the SOW plus snapshotted line items. Proposals are
// client-only, so a client must already exist (convert the lead first).
proposalsRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const fields = {}
  const clientId = Number(body.client_id)
  if (!Number.isInteger(clientId) || clientId <= 0) throw badRequest('Validation failed', { client_id: 'a valid client_id is required' })
  const client = await getClient(clientId)
  if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) fields.title = 'a title is required'

  // The type pins which agreement template the contract generates from, and is
  // the type the eventual project is created with. Default to website, as the
  // project create route does.
  let typeId = body.project_type_id ? Number(body.project_type_id) : null
  if (typeId && !(await getProjectType(typeId))) fields.project_type_id = 'project type not found'
  if (!typeId) typeId = (await getProjectTypeByKey('website'))?.id ?? null

  const sow = validateSow(body, fields)
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  // Line items are OPTIONAL. The project fee in the SOW is what drives the
  // deposit and the contract, so a proposal is complete without an itemised
  // breakdown — resolveLineItems rejects an empty list, so only call it when
  // there's something to resolve.
  const hasItems = Array.isArray(body.items) && body.items.length > 0
  const { rows, total } = hasItems ? await resolveLineItems(body.items) : { rows: [], total: 0 }
  // Whichever side was filled in wins: itemise it and the lines are the total,
  // otherwise the fee is.
  if (sow.project_fee == null && total) sow.project_fee = total

  const proposal = await createProposal({
    client_id: clientId, project_type_id: typeId, title,
    currency: body.currency, total: total || sow.project_fee || 0, items: rows, sow
  })
  res.status(201).json({ data: proposal })
  emitProposalChanged(proposal.id)
})

// PATCH /api/proposals/:id — edit the SOW while the proposal is still in flight.
proposalsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getProposal(id)
  if (!existing) return res.status(404).json({ error: { message: 'Proposal not found' } })
  // Once decided, the scope is what the client agreed to. Editing it would
  // silently change what a generated contract points at.
  if (existing.status === 'accepted' || existing.status === 'declined') {
    return res.status(409).json({ error: { message: `A ${existing.status} proposal can't be edited` } })
  }
  const body = req.body ?? {}
  const fields = {}
  const data = validateSow(body, fields)
  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (!t) fields.title = 'a title is required'
    else data.title = t
  }
  if (body.project_type_id !== undefined) {
    const n = Number(body.project_type_id)
    if (!Number.isInteger(n) || !(await getProjectType(n))) fields.project_type_id = 'project type not found'
    else data.project_type_id = n
  }
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  if (Array.isArray(body.items) && body.items.length > 0) {
    const { total } = await resolveLineItems(body.items)
    data.total = total
  } else if (data.project_fee !== undefined) {
    // No itemisation, so the headline stays in step with the fee.
    data.total = data.project_fee ?? 0
  }
  const updated = await updateProposal(id, data)
  res.json({ data: updated })
  emitProposalChanged(id)
})

// POST /api/proposals/:id/send — mint a public link and email it.
//
// Sending is OPTIONAL: nothing downstream depends on it, so a proposal agreed
// on a call can go straight to Mark Accepted without ever being emailed.
proposalsRouter.post('/:id/send', async (req, res) => {
  const id = parseId(req)
  const proposal = await getProposal(id)
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  if (proposal.status === 'accepted' || proposal.status === 'declined') {
    return res.status(409).json({ error: { message: `Proposal is already ${proposal.status}` } })
  }
  const client = await getClient(proposal.client_id)
  if (!client?.email && !client?.billing_email) {
    return res.status(400).json({ error: { message: 'This client has no email address' } })
  }

  // Supersedes any earlier link, so a forwarded copy of an older email can't
  // accept a proposal that has since been re-priced.
  const token = await issueProposalToken(id)
  const url = `${config.portalBaseUrl.replace(/\/$/, '')}/p/${token}`

  // Best-effort, and the URL comes back either way so it can be pasted into a
  // chat or read down the phone when Resend isn't configured.
  let emailed = false
  try {
    await sendTemplateEmail({
      template: TEMPLATES.proposalSent,
      to: client.billing_email || client.email,
      variables: {
        name: client.name || client.company || 'there',
        proposal_title: proposal.title,
        proposal_code: proposal.code || '',
        total: `$${Number(proposal.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        proposal_url: url
      }
    })
    emailed = true
  } catch (err) {
    console.error(`Proposal email failed for proposal ${id}:`, err.message)
  }

  const updated = proposal.status === 'draft'
    ? await updateProposal(id, { status: 'sent', sent_at: new Date() })
    : proposal
  res.json({ data: updated, url, emailed })

  emitProposalChanged(id)
  await logClientActivity(proposal.client_id, {
    category: 'agreement',
    icon: 'i-lucide-send',
    title: `Proposal sent — ${proposal.title}`,
    meta: emailed ? (client.billing_email || client.email) : 'Link generated (no email sent)',
    link: '/agreements'
  })
})

// POST /api/proposals/:id/accept — you recording a yes given on a call.
// Deliberately the SAME service the public page calls, so the two can't drift.
proposalsRouter.post('/:id/accept', async (req, res) => {
  const proposal = await getProposal(parseId(req))
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  if (proposal.status === 'draft') {
    return res.status(409).json({ error: { message: 'Send the proposal (or generate its link) before accepting it' } })
  }
  const result = await acceptProposal(proposal, {
    acceptedBy: req.body?.accepted_by ?? req.user?.name ?? null,
    actorUserId: req.user?.id ?? null,
    source: 'admin'
  })
  if (!result.ok) return res.status(409).json({ error: { message: `Proposal is already ${result.status}` } })
  res.json({ data: result.proposal, contract: result.contract ?? null })
})

// POST /api/proposals/:id/decline
proposalsRouter.post('/:id/decline', async (req, res) => {
  const proposal = await getProposal(parseId(req))
  if (!proposal) return res.status(404).json({ error: { message: 'Proposal not found' } })
  const result = await declineProposal(proposal, {
    reason: req.body?.reason ?? null,
    actorUserId: req.user?.id ?? null,
    source: 'admin'
  })
  if (!result.ok) return res.status(409).json({ error: { message: `Proposal is already ${result.status}` } })
  res.json({ data: result.proposal })
})

// DELETE /api/proposals/:id
proposalsRouter.delete('/:id', async (req, res) => {
  const id = parseId(req)
  // The SOW lives only here now, and contracts.proposal_id is ON DELETE SET
  // NULL — so deleting a proposal that produced a contract would silently
  // sever a signed agreement from the only record of what was agreed.
  const contract = await getContractByProposalId(id)
  if (contract) {
    return res.status(409).json({
      error: { message: 'This proposal has a contract — the scope it was signed against. Void the contract first.' }
    })
  }
  const ok = await deleteProposal(id)
  if (!ok) return res.status(404).json({ error: { message: 'Proposal not found' } })
  res.json({ ok: true })
})

export { SOW_FIELDS }
