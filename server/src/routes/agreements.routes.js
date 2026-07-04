import { Router } from 'express'
import { listAgreements, agreementsSummary } from '../repositories/agreements.repo.js'

export const agreementsRouter = Router()

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}
const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)

const KINDS = new Set(['proposal', 'contract'])
// Union of proposal + contract statuses (accepted lives on proposals, signed on contracts).
const STATUSES = new Set(['draft', 'sent', 'viewed', 'accepted', 'signed', 'declined', 'expired', 'voided'])

// GET /api/agreements — merged proposals + contracts for the Agreements page.
//   ?kind=proposal|contract  ?status=a,b  ?q=  ?contact_id=  ?limit=  ?offset=
agreementsRouter.get('/', async (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined
  if (kind && !KINDS.has(kind)) throw badRequest(`Unknown kind: ${kind}`)
  const statuses = csv(req.query.status)
  const bad = statuses?.find(s => !STATUSES.has(s))
  if (bad) throw badRequest(`Unknown status: ${bad}`)

  const result = await listAgreements({
    kind,
    statuses,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/agreements/summary — tile numbers for the Agreements page.
agreementsRouter.get('/summary', async (req, res) => {
  res.json({ data: await agreementsSummary() })
})
