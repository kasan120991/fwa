import { Router } from 'express'
import { Readable } from 'node:stream'
import { config } from '../config/env.js'
import { listCalls, getCall, updateCall, unreviewedCount, callStats, CLASSIFICATIONS } from '../repositories/calls.repo.js'
import { createLead } from '../repositories/leads.repo.js'
import { emitCallChanged } from '../realtime/io.js'

export const callsRouter = Router()

// Receptionist tab "Other" groups the non-lead/non-client classifications.
const OTHER = ['spam', 'wrong_number', 'other']

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

// GET /api/calls — list. ?group=inquiry|client|other  ?classification=a,b  ?q=
callsRouter.get('/', async (req, res) => {
  const csv = v => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)
  let classifications = csv(req.query.classification)
  if (!classifications && typeof req.query.group === 'string' && req.query.group !== 'all') {
    classifications = req.query.group === 'other' ? OTHER : [req.query.group]
  }
  const bad = classifications?.find(c => !CLASSIFICATIONS.has(c))
  if (bad) throw badRequest(`Unknown classification: ${bad}`)

  let client_id
  if (req.query.client_id !== undefined) {
    client_id = Number(req.query.client_id)
    if (!Number.isInteger(client_id) || client_id <= 0) throw badRequest('Invalid client_id')
  }

  const result = await listCalls({
    classifications,
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    client_id,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/calls/unreviewed-count — count of new (unreviewed) calls for the nav badge.
callsRouter.get('/unreviewed-count', async (req, res) => {
  res.json({ data: { count: await unreviewedCount() } })
})

// GET /api/calls/stats — receptionist header + stat strip (7-day metrics + line status).
callsRouter.get('/stats', async (req, res) => {
  const stats = await callStats()
  res.json({
    data: {
      ...stats,
      phone_number: config.vapi.phoneNumber || null,
      online: !!config.vapi.webhookSecret
    }
  })
})

// GET /api/calls/:id/recording — play/download a call recording. Vapi
// recordings are access-controlled (no public URLs): exchange the Vapi call id
// for a short-lived signed URL using the private API key, then redirect the
// player to it. The signed URL expires quickly, so nothing is cached — every
// playback re-resolves through here.
callsRouter.get('/:id/recording', async (req, res) => {
  const call = await getCall(parseId(req))
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } })
  if (!call.vapi_call_id || !call.recording_url) {
    return res.status(404).json({ error: { message: 'No recording for this call' } })
  }
  if (!config.vapi.apiKey) {
    return res.status(503).json({ error: { message: 'Recording playback is not configured (VAPI_API_KEY)' } })
  }

  const upstream = await fetch(`https://api.vapi.ai/call/${call.vapi_call_id}/mono-recording`, {
    headers: { Authorization: `Bearer ${config.vapi.apiKey}` },
    redirect: 'manual'
  })
  const signedUrl = upstream.headers.get('location')
  if (upstream.status >= 300 && upstream.status < 400 && signedUrl) {
    return res.redirect(302, signedUrl)
  }
  // Some responses stream the audio directly instead of redirecting.
  if (upstream.ok && upstream.body) {
    res.status(200)
    res.set('Content-Type', upstream.headers.get('content-type') || 'audio/wav')
    const len = upstream.headers.get('content-length')
    if (len) res.set('Content-Length', len)
    return Readable.fromWeb(upstream.body).pipe(res)
  }
  console.error(`Vapi recording fetch failed for call ${call.id}: HTTP ${upstream.status}`)
  res.status(502).json({ error: { message: 'Could not retrieve the recording from Vapi' } })
})

// GET /api/calls/:id
callsRouter.get('/:id', async (req, res) => {
  const call = await getCall(parseId(req))
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } })
  res.json({ data: call })
})

// PATCH /api/calls/:id — reclassify and/or mark reviewed.
callsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  if (!await getCall(id)) return res.status(404).json({ error: { message: 'Call not found' } })

  const data = {}
  if (req.body?.classification !== undefined) {
    if (!CLASSIFICATIONS.has(req.body.classification)) throw badRequest('Validation failed', { classification: `must be one of ${[...CLASSIFICATIONS].join(', ')}` })
    data.classification = req.body.classification
  }
  if (req.body?.reviewed !== undefined) {
    if (typeof req.body.reviewed !== 'boolean') throw badRequest('Validation failed', { reviewed: 'must be a boolean' })
    data.reviewed = req.body.reviewed
  }
  const call = await updateCall(id, data)
  emitCallChanged()
  res.json({ data: call })
})

// POST /api/calls/:id/convert — create a lead from an inquiry call and link it.
// Calls are no longer a lead source; the created lead is source=manual, stage=new.
callsRouter.post('/:id/convert', async (req, res) => {
  const id = parseId(req)
  const call = await getCall(id)
  if (!call) return res.status(404).json({ error: { message: 'Call not found' } })
  if (call.lead_id || call.client_id) return res.status(409).json({ error: { message: 'Call is already linked' } })
  if (call.classification !== 'inquiry') {
    return res.status(400).json({ error: { message: 'Only inquiry calls can be converted to a lead' } })
  }

  const business = call.extracted?.business ?? null
  const lead = await createLead({
    source: 'manual',
    stage: 'new',
    name: call.caller_name || call.caller_number,
    phone: call.caller_number,
    company: business,
    message: call.summary
  })
  const updated = await updateCall(id, { lead_id: lead.id })
  emitCallChanged()
  res.status(201).json({ data: { lead, call: updated } })
})
