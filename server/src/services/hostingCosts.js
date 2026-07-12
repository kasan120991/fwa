import { isConfigured, listDroplets } from './digitalocean.js'
import { listClientDropletIds, listHostedDropletIds } from '../repositories/websites.repo.js'
import { careplanMrr } from '../repositories/contracts.repo.js'

export const hostingConfigured = isConfigured

// One account-wide call → { dropletId → price_monthly }. The single price source
// for both the per-client and account-wide rollups.
async function dropletPriceMap() {
  const droplets = await listDroplets()
  return new Map(droplets.map(d => [Number(d.id), Number(d.price_monthly) || 0]))
}

// Sum monthly price over a set of droplet ids (already distinct). Ids missing from
// the map (e.g. a deleted droplet) contribute 0.
function sumPrices(ids, priceMap) {
  return ids.reduce((total, id) => total + (priceMap.get(id) ?? 0), 0)
}

/**
 * One client's monthly hosting cost (distinct linked droplets) vs recurring
 * revenue (signed monthly care plans). Never throws — the shape carries its state.
 */
export async function clientHosting(clientId) {
  if (!isConfigured()) return { configured: false }
  try {
    const [priceMap, dropletIds, mrr] = await Promise.all([
      dropletPriceMap(),
      listClientDropletIds(clientId),
      careplanMrr(clientId)
    ])
    const monthly_cost = Math.round(sumPrices(dropletIds, priceMap) * 100) / 100
    const margin = Math.round((mrr - monthly_cost) * 100) / 100
    const margin_pct = mrr > 0 ? Math.round((margin / mrr) * 100) : null
    return { configured: true, monthly_cost, droplet_count: dropletIds.length, mrr, margin, margin_pct }
  } catch (err) {
    console.error(`[hostingCosts] client ${clientId} failed:`, err.message)
    return { configured: true, error: err.message }
  }
}

/** Account-wide monthly hosting cost across all distinct hosted droplets. */
export async function hostingSummary() {
  if (!isConfigured()) return { configured: false }
  try {
    const [priceMap, dropletIds] = await Promise.all([dropletPriceMap(), listHostedDropletIds()])
    const monthly_cost = Math.round(sumPrices(dropletIds, priceMap) * 100) / 100
    return { configured: true, monthly_cost, droplet_count: dropletIds.length }
  } catch (err) {
    console.error('[hostingCosts] summary failed:', err.message)
    return { configured: true, error: err.message }
  }
}
