import { Router } from 'express'
import {
  listWebsites, getWebsite, websiteStats, websiteTrafficSeries,
  websiteMetricsSeries, websiteSummary, websiteChecksSeries,
  createWebsite, updateWebsite, deleteWebsite
} from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'
import { logClientActivity } from '../services/clientActivity.service.js'
import { syncWebsite, syncAllWebsites } from '../services/websiteSync.js'
import { isConfigured as doConfigured, listDroplets } from '../services/digitalocean.js'
import { getWebsiteInfra } from '../services/websiteInfra.js'
import { enableUptime, disableUptime } from '../services/websiteUptime.js'
import { hostingSummary } from '../services/hostingCosts.js'
import { provisionOptions } from '../services/websiteProvision.js'

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

// GET /api/websites/droplets — DigitalOcean Droplets for the link picker.
// Empty list + configured:false when no DO token is set (form disables the field).
websitesRouter.get('/droplets', async (req, res) => {
  if (!doConfigured()) return res.json({ data: [], configured: false })
  try {
    res.json({ data: await listDroplets(), configured: true })
  } catch (err) {
    res.json({ data: [], configured: true, error: err.message })
  }
})

// GET /api/websites/costs — account-wide monthly DigitalOcean hosting cost.
websitesRouter.get('/costs', async (req, res) => {
  res.json({ data: await hostingSummary() })
})

// GET /api/websites/provision-options — droplet sizes/regions for the provision modal.
websitesRouter.get('/provision-options', async (req, res) => {
  res.json({ data: await provisionOptions() })
})

// GET /api/websites/:id/infra — live DigitalOcean Droplet health (read-through).
websitesRouter.get('/:id/infra', async (req, res) => {
  const infra = await getWebsiteInfra(Number(req.params.id))
  if (infra.notFound) return res.status(404).json({ error: { message: 'Website not found' } })
  res.json({ data: infra })
})

// POST /api/websites/:id/uptime — provision a DO uptime check + adopt its verdict.
websitesRouter.post('/:id/uptime', async (req, res) => {
  const result = await enableUptime(Number(req.params.id))
  if (result.notFound) return res.status(404).json({ error: { message: 'Website not found' } })
  res.json({ data: result })
})

// DELETE /api/websites/:id/uptime — tear down the DO check, hand health back to local.
websitesRouter.delete('/:id/uptime', async (req, res) => {
  const result = await disableUptime(Number(req.params.id))
  if (result.notFound) return res.status(404).json({ error: { message: 'Website not found' } })
  res.json({ data: result })
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
  await logClientActivity(site.client_id, {
    category: 'website', icon: 'i-lucide-globe',
    title: `Website “${site.name}” added`,
    meta: site.domain,
    link: `/websites/${site.id}`
  })
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
