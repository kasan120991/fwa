import { config } from '../config/env.js'
import { query } from '../db/pool.js'
import { insertCheck, recomputeHealth } from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'

export const checksEnabled = () => config.websites.checksEnabled

/** Ping one site's URL, record the check, and refresh its health snapshot. */
export async function checkWebsite(site) {
  const url = site.url || `https://${site.domain}`
  const t0 = Date.now()
  let up = false
  let status_code = null
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) })
    status_code = res.status
    up = res.status < 400
  } catch {
    up = false
  }
  const response_ms = Date.now() - t0
  await insertCheck(site.id, { up, status_code, response_ms })
  // Keep the latency history for every site, but let DO own the health verdict for
  // sites it monitors — don't clobber the DO-sourced snapshot with a local average.
  if (!site.do_uptime_check_id) await recomputeHealth(site.id)
  emitWebsiteChanged(site.id)
  return { up, status_code, response_ms }
}

/** Check every active site (scheduled). Gated: live checks hit real URLs. */
export async function checkAllWebsites() {
  if (!config.websites.checksEnabled) return { checked: 0, enabled: false }
  const sites = await query("SELECT id, domain, url, do_uptime_check_id FROM websites WHERE status = 'active'")
  let checked = 0
  for (const s of sites) {
    try {
      await checkWebsite(s)
      checked++
    } catch (err) {
      console.error(`[websiteChecks] ${s.domain} failed:`, err.message)
    }
  }
  return { checked }
}
