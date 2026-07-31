import { config } from '../config/env.js'
import { syncConfigured, syncAllWebsites } from '../services/websiteSync.js'
import { checkAllWebsites } from '../services/websiteChecks.js'
import { uptimeConfigured, syncAllUptime } from '../services/websiteUptime.js'
import { alertsConfigured, pollInfraAlerts } from '../services/infraAlerts.js'
import { checkSubscriptionRenewals } from '../services/expenseReminders.js'

let started = false

// Background jobs for the Websites feature. Both are gated so dev/demo (no
// analytics keys, checks off) runs nothing; production opts in via env. Plain
// setInterval — no new dependency; intervals are unref'd so they don't hold the
// process open, and restart cleanly under `node --watch`.
export function startScheduler() {
  if (started) return
  started = true

  if (syncConfigured()) {
    const ms = config.websites.syncIntervalMs
    setInterval(() => { syncAllWebsites().catch(e => console.error('[scheduler] sync:', e.message)) }, ms).unref()
    console.log(`[scheduler] analytics sync every ${Math.round(ms / 60000)}m`)
  }

  if (config.websites.checksEnabled) {
    const ms = config.websites.checkIntervalMs
    setInterval(() => { checkAllWebsites().catch(e => console.error('[scheduler] checks:', e.message)) }, ms).unref()
    console.log(`[scheduler] uptime checks every ${Math.round(ms / 60000)}m`)
  }

  // DO-managed uptime sync — independent of checksEnabled (DO probes the sites, not
  // our box), so it runs whenever a token is set. Only touches sites with a check.
  if (uptimeConfigured()) {
    const ms = config.websites.checkIntervalMs
    setInterval(() => { syncAllUptime().catch(e => console.error('[scheduler] do-uptime:', e.message)) }, ms).unref()
    console.log(`[scheduler] DigitalOcean uptime sync every ${Math.round(ms / 60000)}m`)
  }

  // Infra alerting — poll site health + droplet metrics, raise/clear notifications
  // and Needs Attention items. Run once at boot so a live problem surfaces promptly.
  if (alertsConfigured()) {
    const ms = config.websites.checkIntervalMs
    const run = () => pollInfraAlerts().catch(e => console.error('[scheduler] infra-alerts:', e.message))
    run()
    setInterval(run, ms).unref()
    console.log(`[scheduler] infra alerts every ${Math.round(ms / 60000)}m`)
  }

  if (config.expenses.remindersEnabled) {
    const ms = config.expenses.reminderIntervalMs
    const run = () => checkSubscriptionRenewals().catch(e => console.error('[scheduler] renewals:', e.message))
    run() // once at boot so a due renewal doesn't wait a full interval
    setInterval(run, ms).unref()
    console.log(`[scheduler] subscription renewal reminders every ${Math.round(ms / 3_600_000)}h`)
  }
}
