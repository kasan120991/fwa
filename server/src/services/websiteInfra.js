import { isConfigured, getDroplet, getDropletMetrics } from './digitalocean.js'
import { getWebsite } from '../repositories/websites.repo.js'

export const infraConfigured = isConfigured

/**
 * Live infrastructure health for one website's linked DigitalOcean Droplet.
 * Read-through — hits DO on every call, persists nothing. Never 500s: the shape
 * carries the state (not linked / not configured / error) so the panel can render
 * it. `droplet` + `metrics` come from getDroplet/getDropletMetrics.
 */
export async function getWebsiteInfra(id) {
  const site = await getWebsite(id)
  if (!site) return { notFound: true }
  if (!site.do_droplet_id) return { linked: false }
  if (!isConfigured()) return { linked: true, configured: false }

  try {
    const [droplet, metrics] = await Promise.all([
      getDroplet(site.do_droplet_id),
      getDropletMetrics(site.do_droplet_id)
    ])
    if (!droplet) return { linked: true, configured: true, error: 'Droplet not found' }
    return { linked: true, configured: true, droplet, metrics }
  } catch (err) {
    console.error(`[websiteInfra] droplet ${site.do_droplet_id} failed:`, err.message)
    return { linked: true, configured: true, error: err.message }
  }
}
