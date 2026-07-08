import { config } from '../config/env.js'

// Plausible Stats API v2 client. Empty PLAUSIBLE_API_KEY = disabled (no-op),
// matching the Stripe/PandaDoc pattern. Docs: POST /api/v2/query with a Bearer
// key; results come back as { dimensions: [...], metrics: [...] } rows.
export const isConfigured = () => !!config.plausible.apiKey

async function queryPlausible(body) {
  const res = await fetch(`${config.plausible.baseUrl}/api/v2/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.plausible.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Plausible ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  return json.results ?? []
}

// Map v2 result rows to plain objects. Handles the array shape
// ({ dimensions, metrics }) and tolerates a named-field shape as a fallback.
function mapRows(results, dims, metrics) {
  return results.map((r) => {
    const d = Array.isArray(r.dimensions) ? r.dimensions : []
    const m = Array.isArray(r.metrics) ? r.metrics : []
    const o = {}
    dims.forEach((name, i) => { o[name] = d[i] ?? r[name] ?? null })
    metrics.forEach((name, i) => { o[name] = Number(m[i] ?? r[name] ?? 0) })
    return o
  })
}

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Pull the last `days` of daily traffic (+ optional goal conversions) and the
 * current top pages/sources for one site. `site` = { domain, analytics_site_id,
 * conversion_goal }. Returns the pieces; the caller persists them.
 */
export async function fetchSiteAnalytics(site, days = 30) {
  const site_id = site.analytics_site_id || site.domain
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1))
  const date_range = [ymd(start), ymd(end)]

  const ts = mapRows(
    await queryPlausible({ site_id, metrics: ['visitors', 'pageviews'], date_range, dimensions: ['time:day'] }),
    ['date'], ['visitors', 'pageviews']
  )

  const convByDate = new Map()
  if (site.conversion_goal) {
    const conv = mapRows(
      await queryPlausible({ site_id, metrics: ['events'], date_range, dimensions: ['time:day'], filters: [['is', 'event:goal', [site.conversion_goal]]] }),
      ['date'], ['events']
    )
    for (const r of conv) convByDate.set(r.date, r.events)
  }

  const daily = ts.map(r => ({
    date: r.date, visitors: r.visitors, pageviews: r.pageviews, conversions: convByDate.get(r.date) ?? 0
  }))

  const topPages = mapRows(
    await queryPlausible({ site_id, metrics: ['pageviews'], date_range: '30d', dimensions: ['event:page'], limit: 5 }),
    ['page'], ['pageviews']
  ).map(r => ({ path: r.page || '/', views: r.pageviews }))

  const topSources = mapRows(
    await queryPlausible({ site_id, metrics: ['visitors'], date_range: '30d', dimensions: ['visit:source'], limit: 5 }),
    ['source'], ['visitors']
  ).map(r => ({ source: r.source || 'Direct', visits: r.visitors }))

  return { daily, topPages, topSources }
}
