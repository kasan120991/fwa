import { JWT } from 'google-auth-library'
import { config } from '../config/env.js'

// GA4 Data API client (service-account JWT + plain REST, no gRPC client lib).
// Empty GA4_CLIENT_EMAIL/GA4_PRIVATE_KEY_BASE64 = disabled (no-op), matching
// the Plausible pattern. Docs: POST /v1beta/properties/{id}:runReport.
export const isConfigured = () => !!(config.ga4.clientEmail && config.ga4.privateKey)

// Lazy singleton — google-auth-library caches the OAuth token and refreshes it.
let jwtClient = null
function getClient() {
  if (!jwtClient) {
    jwtClient = new JWT({
      email: config.ga4.clientEmail,
      key: config.ga4.privateKey,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    })
  }
  return jwtClient
}

async function runReport(propertyId, body) {
  const { token } = await getClient().getAccessToken()
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GA4 ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  return json.rows ?? [] // `rows` is absent (not []) when a report is empty
}

const dim = (r, i) => r.dimensionValues?.[i]?.value ?? ''
const met = (r, i) => Number(r.metricValues?.[i]?.value ?? 0)
const gaDate = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` // YYYYMMDD → YYYY-MM-DD

// GA4 reports "(direct)" / "(not set)" — align with Plausible's display style.
const sourceName = s => (s === '(direct)' || s === '' ? 'Direct' : s === '(not set)' ? 'Unknown' : s)

/**
 * Same contract as plausible.fetchSiteAnalytics: last `days` of daily traffic
 * (+ optional conversion-event counts) and current top pages/sources. `site` =
 * { analytics_site_id, conversion_goal } where analytics_site_id is the GA4
 * numeric property ID (no domain fallback — GA4 has no domain lookup).
 * Visitors = activeUsers, the "Users" figure GA4's own UI reports.
 */
export async function fetchSiteAnalytics(site, days = 30) {
  const propertyId = String(site.analytics_site_id ?? '').trim()
  if (!/^\d+$/.test(propertyId)) {
    throw new Error('GA4 needs the numeric property ID in analytics_site_id')
  }
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }]

  const ts = (await runReport(propertyId, {
    dateRanges,
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }]
  })).map(r => ({ date: gaDate(dim(r, 0)), visitors: met(r, 0), pageviews: met(r, 1) }))

  const convByDate = new Map()
  if (site.conversion_goal) {
    const conv = await runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: site.conversion_goal }
        }
      },
      orderBys: [{ dimension: { dimensionName: 'date' } }]
    })
    for (const r of conv) convByDate.set(gaDate(dim(r, 0)), met(r, 0))
  }

  const daily = ts.map(r => ({ ...r, conversions: convByDate.get(r.date) ?? 0 }))

  const topPages = (await runReport(propertyId, {
    dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: '5'
  })).map(r => ({ path: dim(r, 0) || '/', views: met(r, 0) }))

  const topSources = (await runReport(propertyId, {
    dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: '5'
  })).map(r => ({ source: sourceName(dim(r, 0)), visits: met(r, 0) }))

  return { daily, topPages, topSources }
}
