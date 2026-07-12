import { config } from '../config/env.js'
import { isConfigured, listDroplets, getDropletMetrics } from './digitalocean.js'
import { listSiteHealth, listHostedDropletIds, siteIdForDroplet } from '../repositories/websites.repo.js'
import { openAlert, resolveAlert } from '../repositories/infraAlerts.repo.js'
import { notify } from './notifications.service.js'

export const alertsConfigured = () => isConfigured() && config.digitalocean.alertsEnabled

// Display metadata per alert kind (problem + recovery).
const KIND = {
  site_down: { icon: 'i-lucide-server-crash', tone: 'error', word: 'down' },
  high_cpu: { icon: 'i-lucide-cpu', tone: 'warning', word: 'high CPU' },
  disk_full: { icon: 'i-lucide-hard-drive', tone: 'warning', word: 'low disk' }
}

async function notifyOpen(kind, label, body, link) {
  await notify({ category: 'website', tone: KIND[kind].tone, icon: KIND[kind].icon, title: `${label} — ${KIND[kind].word}`, body, link })
}
async function notifyRecovery(label, body, link) {
  await notify({ category: 'website', tone: 'success', icon: 'i-lucide-server', title: `${label} — recovered`, body, link })
}

// Evaluate one condition: open+notify on a fresh problem, resolve+notify on recovery.
async function evaluate({ subject_type, subject_id, kind, bad, label, detail, link }) {
  if (bad) {
    const { opened } = await openAlert({ subject_type, subject_id, kind, label, detail, link, tone: KIND[kind].tone })
    if (opened) await notifyOpen(kind, label, detail, link)
  } else {
    const { wasActive } = await resolveAlert(subject_type, subject_id, kind)
    if (wasActive) await notifyRecovery(label, `${KIND[kind].word} cleared`, link)
  }
}

/**
 * Poll monitored resources and raise/clear infra alerts. Never throws (per-subject
 * try/catch). Conditions: site down (health_state), droplet high CPU, droplet disk full.
 */
export async function pollInfraAlerts() {
  if (!alertsConfigured()) return { skipped: true }

  // --- Site down (from the health snapshot the uptime/local checks maintain) ---
  for (const s of await listSiteHealth()) {
    try {
      await evaluate({
        subject_type: 'website', subject_id: s.id, kind: 'site_down',
        bad: s.health_state === 'down',
        label: s.name, detail: `${s.domain} is not responding`, link: `/websites/${s.id}`
      })
    } catch (err) { console.error(`[infraAlerts] site ${s.id}:`, err.message) }
  }

  // --- Droplet CPU / disk (live metrics; skip when the agent reports nothing) ---
  const dropletIds = await listHostedDropletIds()
  if (dropletIds.length) {
    const names = new Map((await listDroplets()).map(d => [Number(d.id), d.name]))
    for (const id of dropletIds) {
      try {
        const label = names.get(Number(id)) || `Droplet ${id}`
        const link = await siteIdForDroplet(id)
        const to = link ? `/websites/${link}` : '/websites'
        const m = await getDropletMetrics(id)
        if (m.cpuPct != null) {
          await evaluate({ subject_type: 'droplet', subject_id: id, kind: 'high_cpu', bad: m.cpuPct >= config.digitalocean.alertCpuPct, label, detail: `CPU at ${Math.round(m.cpuPct)}%`, link: to })
        }
        if (m.diskUsedPct != null) {
          await evaluate({ subject_type: 'droplet', subject_id: id, kind: 'disk_full', bad: m.diskUsedPct >= config.digitalocean.alertDiskPct, label, detail: `Disk at ${Math.round(m.diskUsedPct)}%`, link: to })
        }
      } catch (err) { console.error(`[infraAlerts] droplet ${id}:`, err.message) }
    }
  }
  return { polled: true }
}
