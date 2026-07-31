import * as plausible from './plausible.js'
import * as ga4 from './ga4.js'
import { getWebsite, upsertMetric, setSynced, listSyncableWebsites } from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'

// Analytics providers with sync support. Each exposes isConfigured() and
// fetchSiteAnalytics(site, days) → { daily, topPages, topSources }.
const providers = { plausible, ga4 }

export const syncConfigured = () => Object.values(providers).some(p => p.isConfigured())

/** Sync one website's analytics from its provider into website_metrics + snapshots. */
export async function syncWebsite(id, { days = 30 } = {}) {
  const site = await getWebsite(id)
  if (!site) return { synced: false, notFound: true }
  const provider = providers[site.analytics_provider]
  if (!provider) return { synced: false, reason: `no sync support for provider '${site.analytics_provider}'` }
  if (!provider.isConfigured()) return { synced: false, configured: false }

  const { daily, topPages, topSources } = await provider.fetchSiteAnalytics(site, days)
  for (const d of daily) await upsertMetric(id, d.date, d)
  await setSynced(id, { top_pages: topPages, top_sources: topSources })
  emitWebsiteChanged(id)
  return { synced: true, days: daily.length }
}

/** Sync every connected site whose provider is configured (scheduled + POST /websites/sync). */
export async function syncAllWebsites() {
  if (!syncConfigured()) return { synced: 0, configured: false }
  const sites = (await listSyncableWebsites())
    .filter(s => providers[s.analytics_provider]?.isConfigured())
  let synced = 0
  for (const s of sites) {
    try {
      const res = await syncWebsite(s.id)
      if (res.synced) synced++
    } catch (err) {
      console.error(`[websiteSync] ${s.domain} failed:`, err.message)
    }
  }
  return { synced, total: sites.length }
}
