// Seeds sample websites + 90 days of daily website_metrics, linked to the seeded
// clients/projects. Idempotent by domain (skips sites that already exist), so it's
// safe to run standalone against a populated dev DB or from seed.js on a fresh one.
import { query, getPool } from './pool.js'

// base = typical daily visitors for a connected site (0 / provider 'none' = not
// connected → no metrics, shows the "Connect analytics" state).
// health = [state, uptime_pct, perf_score, avg_lcp_ms] or null when not connected.
const SITES = [
  { company: 'Northwind Co.', project: 'Marketing site rebuild', name: 'Northwind Storefront', domain: 'northwind.com', env: 'live', provider: 'plausible', goal: 'Add to cart', base: 420, launched: '2024-11-18', health: ['up', 99.95, 96, 1200] },
  { company: 'Northwind Co.', name: 'Northwind Blog', domain: 'blog.northwind.com', env: 'live', provider: 'none', goal: null, base: 0, launched: '2025-02-02', health: null },
  { company: 'Mintleaf', project: 'E-commerce storefront', name: 'Mintleaf Store', domain: 'mintleaf.com', env: 'live', provider: 'ga4', goal: 'Checkout', base: 310, launched: '2025-01-27', health: ['up', 99.8, 91, 1650] },
  { company: 'Harborview', project: 'Booking site', name: 'Harborview Booking', domain: 'harborview.co', env: 'live', provider: 'plausible', goal: 'Booking request', base: 180, launched: '2024-09-30', health: ['up', 100, 98, 900] },
  { company: 'Ridgeline', project: 'Customer dashboard', name: 'Ridgeline Dashboard', domain: 'app.ridgeline.dev', env: 'staging', provider: 'fathom', goal: 'Sign up', base: 60, launched: null, health: ['degraded', 98.5, 84, 2100] },
  { company: 'Lumen Labs', project: 'SaaS marketing site', name: 'Lumen Labs', domain: 'lumenlabs.io', env: 'live', provider: 'plausible', goal: 'Demo request', base: 240, launched: '2025-03-12', health: ['up', 99.9, 94, 1350] },
  { company: 'Bright & Salt', name: 'Bright & Salt', domain: 'brightsalt.co', env: 'live', provider: 'umami', goal: 'Contact form', base: 95, launched: '2024-12-08', health: ['up', 99.7, 89, 1500] },
  { company: 'Foundry & Co.', name: 'Foundry Studio', domain: 'foundry.studio', env: 'live', provider: 'none', goal: null, base: 0, launched: '2023-06-15', health: null }
]

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dtOffset = (mins) => { const d = new Date(Date.now() - mins * 60000); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00` }

// 90 days of daily rows: gentle upward trend + weekend dip + noise.
function genMetrics(base, days = 90) {
  const rows = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const trend = 0.8 + 0.4 * ((days - 1 - i) / (days - 1))
    const weekend = (d.getDay() === 0 || d.getDay() === 6) ? 0.68 : 1
    const noise = 0.85 + Math.random() * 0.3
    const visitors = Math.max(1, Math.round(base * trend * weekend * noise))
    const pageviews = Math.round(visitors * (2.2 + Math.random() * 0.8))
    const conversions = Math.round(visitors * (0.02 + Math.random() * 0.03))
    rows.push([ymd(d), visitors, pageviews, conversions])
  }
  return rows
}

const topPages = views => [
  { path: '/', views: Math.round(views * 0.34) },
  { path: '/pricing', views: Math.round(views * 0.18) },
  { path: '/features', views: Math.round(views * 0.12) },
  { path: '/blog', views: Math.round(views * 0.09) },
  { path: '/contact', views: Math.round(views * 0.06) }
]
const topSources = visitors => [
  { source: 'Google', visits: Math.round(visitors * 0.52) },
  { source: 'Direct', visits: Math.round(visitors * 0.24) },
  { source: 'Social', visits: Math.round(visitors * 0.13) },
  { source: 'Referral', visits: Math.round(visitors * 0.08) },
  { source: 'Email', visits: Math.round(visitors * 0.03) }
]

// Datetime 'YYYY-MM-DD HH:MM:SS' for a ms timestamp.
const dtFull = (ms) => { const d = new Date(ms); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

// ~perDay uptime checks/day over `days`: mostly up, rare downtime, occasional
// latency spikes. Returns [checked_at, up, status_code, response_ms] rows.
function genChecks(baseMs, days = 90, perDay = 4) {
  const rows = []
  const now = Date.now()
  for (let d = days - 1; d >= 0; d--) {
    for (let k = 0; k < perDay; k++) {
      const ts = now - d * 86400000 - Math.round(k * (86400000 / perDay))
      const roll = Math.random()
      let up = 1; let status = 200; let resp = Math.round(baseMs * (0.7 + Math.random() * 0.7))
      if (roll < 0.008) { up = 0; status = 503; resp = 8000 } else if (roll < 0.05) { resp = Math.round(baseMs * (1.8 + Math.random())) }
      rows.push([dtFull(ts), up, status, resp])
    }
  }
  return rows
}

export async function seedWebsites() {
  const clients = await query('SELECT id, company FROM clients')
  const projects = await query('SELECT id, name FROM projects')
  const clientByCompany = new Map(clients.map(c => [c.company, c.id]))
  const projectByName = new Map(projects.map(p => [p.name, p.id]))

  let created = 0
  let metricsInserted = 0
  for (const s of SITES) {
    const client_id = clientByCompany.get(s.company)
    if (!client_id) continue // client not in this DB — skip
    const existing = await query('SELECT id FROM websites WHERE domain = :domain LIMIT 1', { domain: s.domain })
    if (existing.length) continue // idempotent

    const connected = s.provider !== 'none'
    const rows = connected ? genMetrics(s.base) : []
    const last30 = rows.slice(-30)
    const mVisitors = last30.reduce((a, r) => a + r[1], 0)
    const mViews = last30.reduce((a, r) => a + r[2], 0)

    const res = await query(
      `INSERT INTO websites
         (client_id, project_id, name, domain, url, environment, status, analytics_provider,
          conversion_goal, health_state, uptime_pct, perf_score, avg_lcp_ms, last_checked_at,
          last_synced_at, top_pages, top_sources, launched_at)
       VALUES
         (:client_id, :project_id, :name, :domain, :url, :environment, 'active', :provider,
          :goal, :health_state, :uptime, :perf, :lcp, :last_checked_at,
          :last_synced_at, :top_pages, :top_sources, :launched_at)`,
      {
        client_id,
        project_id: s.project ? (projectByName.get(s.project) ?? null) : null,
        name: s.name,
        domain: s.domain,
        url: `https://${s.domain}`,
        environment: s.env,
        provider: s.provider,
        goal: s.goal,
        health_state: connected ? s.health[0] : 'unknown',
        uptime: connected ? s.health[1] : null,
        perf: connected ? s.health[2] : null,
        lcp: connected ? s.health[3] : null,
        last_checked_at: connected ? dtOffset(3) : null,
        last_synced_at: connected ? dtOffset(120) : null,
        top_pages: connected ? JSON.stringify(topPages(mViews)) : null,
        top_sources: connected ? JSON.stringify(topSources(mVisitors)) : null,
        launched_at: s.launched
      }
    )
    created++
    const websiteId = res.insertId
    if (rows.length) {
      await getPool().query(
        'INSERT IGNORE INTO website_metrics (website_id, date, visitors, pageviews, conversions) VALUES ?',
        [rows.map(r => [websiteId, r[0], r[1], r[2], r[3]])]
      )
      metricsInserted += rows.length
    }
  }

  // Backfill uptime-check history for connected sites that have none yet
  // (covers both freshly-created sites and ones created on an earlier run).
  let checksInserted = 0
  const connectedSites = await query("SELECT id FROM websites WHERE analytics_provider <> 'none' AND status = 'active'")
  for (const w of connectedSites) {
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM website_checks WHERE website_id = :id', { id: w.id })
    if (Number(n) > 0) continue
    const rows = genChecks(280 + Math.round(Math.random() * 500))
    await getPool().query(
      'INSERT INTO website_checks (website_id, checked_at, up, status_code, response_ms) VALUES ?',
      [rows.map(r => [w.id, r[0], r[1], r[2], r[3]])]
    )
    checksInserted += rows.length
  }

  return { created, metricsInserted, checksInserted }
}
