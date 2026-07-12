import { config } from '../config/env.js'
import { isConfigured, createUptimeCheck, getUptimeCheckState, deleteUptimeCheck } from './digitalocean.js'
import {
  getWebsite, setUptimeCheckId, setUptimeHealth, recomputeHealth, listUptimeSyncableWebsites
} from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'

export const uptimeConfigured = isConfigured

// Map a DO uptime check's per-region state to our health snapshot. DO reports
// per-region UP/DOWN + a 30-day uptime %; we collapse regions into one verdict:
// all up → up, some up → degraded, none up → down, no regions → unknown.
function mapState(state) {
  const regions = Object.values(state?.regions ?? {})
  if (!regions.length) return { health_state: 'unknown', uptime_pct: null }
  const up = regions.filter(r => r.status === 'UP').length
  const health_state = up === 0 ? 'down' : up < regions.length ? 'degraded' : 'up'
  const pcts = regions.map(r => Number(r.thirty_day_uptime_percentage)).filter(Number.isFinite)
  const uptime_pct = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100 : null
  return { health_state, uptime_pct }
}

/** Provision a DO uptime check for a site and adopt its verdict as the health source. */
export async function enableUptime(id) {
  const site = await getWebsite(id)
  if (!site) return { enabled: false, notFound: true }
  if (!isConfigured()) return { enabled: false, configured: false }
  if (site.do_uptime_check_id) return { enabled: true, alreadyMonitored: true }

  const target = site.url || `https://${site.domain}`
  const check = await createUptimeCheck({
    name: `${site.name} uptime`.slice(0, 100),
    target,
    regions: config.digitalocean.uptimeRegions
  })
  await setUptimeCheckId(id, check.id)
  await syncUptime(id)
  emitWebsiteChanged(id)
  return { enabled: true, check_id: check.id }
}

/** Tear down the managed check and hand health back to the local pinger. */
export async function disableUptime(id) {
  const site = await getWebsite(id)
  if (!site) return { disabled: false, notFound: true }
  if (site.do_uptime_check_id) {
    try {
      await deleteUptimeCheck(site.do_uptime_check_id)
    } catch (err) {
      // Stale/already-deleted check shouldn't block unlinking.
      console.error(`[websiteUptime] delete ${site.do_uptime_check_id} failed:`, err.message)
    }
  }
  await setUptimeCheckId(id, null)
  await recomputeHealth(id) // fall back to local check history
  emitWebsiteChanged(id)
  return { disabled: true }
}

/** Pull one monitored site's current DO state into its health snapshot. */
export async function syncUptime(id) {
  const site = await getWebsite(id)
  if (!site?.do_uptime_check_id) return { synced: false }
  const state = await getUptimeCheckState(site.do_uptime_check_id)
  await setUptimeHealth(id, mapState(state))
  emitWebsiteChanged(id)
  return { synced: true }
}

/** Refresh every DO-monitored site (scheduled). */
export async function syncAllUptime() {
  if (!isConfigured()) return { synced: 0, configured: false }
  const sites = await listUptimeSyncableWebsites()
  let synced = 0
  for (const s of sites) {
    try {
      await syncUptime(s.id)
      synced++
    } catch (err) {
      console.error(`[websiteUptime] sync ${s.id} failed:`, err.message)
    }
  }
  return { synced, total: sites.length }
}
