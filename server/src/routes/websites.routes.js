import { Router } from 'express'
import {
  listWebsites, getWebsite, websiteStats, websiteTrafficSeries,
  websiteMetricsSeries, websiteSummary, websiteChecksSeries,
  createWebsite, updateWebsite, deleteWebsite
} from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'
import { syncWebsite, syncAllWebsites } from '../services/websiteSync.js'

export const websitesRouter = Router()

// Literal routes must precede '/:id' so they aren't captured as an id.

// GET /api/websites/stats — cross-client KPI tiles.
websitesRouter.get('/stats', async (req, res) => {
  res.json({ data: await websiteStats() })
})

// GET /api/websites/traffic?days=30|90 — aggregate daily traffic across all sites.
websitesRouter.get('/traffic', async (req, res) => {
  res.json({ data: await websiteTrafficSeries(Number(req.query.days) || 30) })
})

// GET /api/websites — cross-client list with 30-day rollups + sparklines.
websitesRouter.get('/', async (req, res) => {
  const { client_id, environment, connected, q, limit, offset } = req.query
  const { rows } = await listWebsites({
    client_id: client_id ? Number(client_id) : undefined,
    environment: environment || undefined,
    connected: connected === undefined ? undefined : (connected === 'true' || connected === '1'),
    q: q || undefined,
    limit, offset
  })
  res.json({ data: rows })
})

// GET /api/websites/:id/metrics?days=7|30|90 — one site's daily series.
websitesRouter.get('/:id/metrics', async (req, res) => {
  res.json({ data: await websiteMetricsSeries(Number(req.params.id), Number(req.query.days) || 30) })
})

// GET /api/websites/:id/checks?days=7|30|90 — uptime/response-time history.
websitesRouter.get('/:id/checks', async (req, res) => {
  res.json({ data: await websiteChecksSeries(Number(req.params.id), Number(req.query.days) || 30) })
})

// POST /api/websites/sync — pull analytics for every connected Plausible site.
websitesRouter.post('/sync', async (req, res) => {
  res.json({ data: await syncAllWebsites() })
})

// POST /api/websites/:id/sync — "Sync now" for one site.
websitesRouter.post('/:id/sync', async (req, res) => {
  res.json({ data: await syncWebsite(Number(req.params.id)) })
})

// GET /api/websites/:id — site + client/project + 30-day summary.
websitesRouter.get('/:id', async (req, res) => {
  const site = await getWebsite(Number(req.params.id))
  if (!site) return res.status(404).json({ error: { message: 'Website not found' } })
  const summary = await websiteSummary(site.id)
  res.json({ data: { ...site, ...summary } })
})

websitesRouter.post('/', async (req, res) => {
  const site = await createWebsite(req.body)
  emitWebsiteChanged(site.id)
  res.status(201).json({ data: site })
})

websitesRouter.patch('/:id', async (req, res) => {
  const site = await updateWebsite(Number(req.params.id), req.body)
  if (!site) return res.status(404).json({ error: { message: 'Website not found' } })
  emitWebsiteChanged(site.id)
  res.json({ data: site })
})

websitesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteWebsite(Number(req.params.id))
  emitWebsiteChanged(Number(req.params.id))
  res.json({ data: { deleted } })
})
