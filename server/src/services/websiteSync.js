import { isConfigured, fetchSiteAnalytics } from './plausible.js'
import { getWebsite, upsertMetric, setSynced, listSyncableWebsites } from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'

export const syncConfigured = isConfigured

/** Sync one website's analytics from Plausible into website_metrics + snapshots. */
export async function syncWebsite(id, { days = 30 } = {}) {
  const site = await getWebsite(id)
  if (!site) return { synced: false, notFound: true }
  if (site.analytics_provider !== 'plausible') return { synced: false, reason: 'not a Plausible site' }
  if (!isConfigured()) return { synced: false, configured: false }

  const { daily, topPages, topSources } = await fetchSiteAnalytics(site, days)
  for (const d of daily) await upsertMetric(id, d.date, d)
  await setSynced(id, { top_pages: topPages, top_sources: topSources })
  emitWebsiteChanged(id)
  return { synced: true, days: daily.length }
}

/** Sync every connected Plausible site (scheduled + POST /websites/sync). */
export async function syncAllWebsites() {
  if (!isConfigured()) return { synced: 0, configured: false }
  const sites = await listSyncableWebsites()
  let synced = 0
  for (const s of sites) {
    try {
      await syncWebsite(s.id)
      synced++
    } catch (err) {
      console.error(`[websiteSync] ${s.domain} failed:`, err.message)
    }
  }
  return { synced, total: sites.length }
}
