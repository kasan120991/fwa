import { Router } from 'express'
import { findProposalByToken } from '../repositories/proposalTokens.repo.js'
import { getProposalItems } from '../repositories/proposals.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getCachedSettings } from '../services/settings.service.js'
import { acceptProposal, declineProposal } from '../services/proposalAcceptance.js'
import { rateLimit } from '../middleware/rateLimit.js'

// The only UNAUTHENTICATED, state-mutating surface in the app: the page a
// prospect uses to accept or decline a proposal. Mounted beside /webhooks in
// routes/index.js rather than below the guarded block, so it can't be mistaken
// for one of them and quietly "tidied" behind requireAdmin.
//
// The token arrives in the X-Proposal-Token HEADER, never the path. morgan logs
// every request URL, so a token in the path would be written to the application
// log in plaintext and anyone with log access could accept any live proposal.
export const publicRouter = Router()

publicRouter.use(rateLimit({ max: 60, name: 'public' }))

// Nothing here should be cached or indexed: the response is a priced quote at a
// URL that gets forwarded around, and a CDN or corporate proxy holding onto it
// is a real leak. Referrer-Policy stops the token leaving via a third-party
// asset on the page.
publicRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.set('X-Robots-Tag', 'noindex, nofollow')
  res.set('Referrer-Policy', 'no-referrer')
  next()
})

// One message for missing, expired, used and malformed. Distinct wording would
// let someone probe which tokens are real.
const DEAD_LINK = { error: { message: 'This link is no longer valid.' } }

async function resolve(req, res) {
  const proposal = await findProposalByToken(req.get('x-proposal-token'))
  if (!proposal) { res.status(404).json(DEAD_LINK); return null }
  return proposal
}

/**
 * What the page renders. A strict allow-list, not the row: this is public, so
 * everything internal — ids, PandaDoc references, the hourly rate, third-party
 * cost notes, the client's contact details — stays out of it.
 */
async function publicView(proposal) {
  const [items, client, settings] = await Promise.all([
    getProposalItems(proposal.id),
    getClient(proposal.client_id),
    getCachedSettings()
  ])
  // findProposalByToken returns the raw row (it joins through the token table
  // rather than going via the repo's mapper), so the DECIMALs are still strings.
  const num = v => (v == null ? null : Number(v))
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
    agency: {
      name: settings?.agency_display_name || settings?.agency_legal_name || 'Francis Web Agency',
      email: settings?.agency_support_email || null,
      logo_url: settings?.agency_logo_url || null
    }
  }
}

// GET — read only. It must NEVER consume the token: mail scanners fetch every
// link in an inbound email, and consuming here would kill the page before the
// client ever opened it.
publicRouter.get('/proposals/self', async (req, res) => {
  const proposal = await resolve(req, res)
  if (!proposal) return
  // A decided proposal stops being a live pricing page. This also matters for
  // the backfilled historical ones, which would otherwise each have a public URL.
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') {
    return res.json({ data: { decided: true, status: proposal.status, title: proposal.title, code: proposal.code } })
  }
  res.json({ data: { decided: false, ...(await publicView(proposal)) } })
})

// The decision endpoints are the expensive ones — they generate a contract,
// call PandaDoc and send mail — so they're limited harder than reads.
const decide = rateLimit({ max: 10, name: 'public-decide' })

publicRouter.post('/proposals/self/accept', decide, async (req, res) => {
  const proposal = await resolve(req, res)
  if (!proposal) return
  const result = await acceptProposal(proposal, {
    acceptedBy: req.body?.name ?? null,
    source: 'client'
  })
  // A lost claim is a double-click or a replay, not an error — report the
  // outcome that actually stands.
  if (!result.ok) return res.status(409).json({ error: { message: `This proposal is already ${result.status}.` } })
  res.json({ data: { status: 'accepted' } })
})

publicRouter.post('/proposals/self/decline', decide, async (req, res) => {
  const proposal = await resolve(req, res)
  if (!proposal) return
  const result = await declineProposal(proposal, { reason: req.body?.reason ?? null, source: 'client' })
  // Declining after acceptance is the dangerous direction — a contract exists
  // and a document has gone out — so it's refused here rather than reconciled
  // from a public endpoint.
  if (!result.ok) return res.status(409).json({ error: { message: `This proposal is already ${result.status}.` } })
  res.json({ data: { status: 'declined' } })
})
