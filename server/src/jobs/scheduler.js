import { config } from '../config/env.js'
import { syncConfigured, syncAllWebsites } from '../services/websiteSync.js'
import { checkAllWebsites } from '../services/websiteChecks.js'

let started = false

// Background jobs for the Websites feature. Both are gated so dev/demo (no
// Plausible key, checks off) runs nothing; production opts in via env. Plain
// setInterval — no new dependency; intervals are unref'd so they don't hold the
// process open, and restart cleanly under `node --watch`.
export function startScheduler() {
  if (started) return
  started = true

  if (syncConfigured()) {
    const ms = config.websites.syncIntervalMs
    setInterval(() => { syncAllWebsites().catch(e => console.error('[scheduler] sync:', e.message)) }, ms).unref()
    console.log(`[scheduler] Plausible sync every ${Math.round(ms / 60000)}m`)
  }

  if (config.websites.checksEnabled) {
    const ms = config.websites.checkIntervalMs
    setInterval(() => { checkAllWebsites().catch(e => console.error('[scheduler] checks:', e.message)) }, ms).unref()
    console.log(`[scheduler] uptime checks every ${Math.round(ms / 60000)}m`)
  }
}
