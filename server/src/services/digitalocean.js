import { config } from '../config/env.js'

// DigitalOcean API v2 client. Empty DIGITALOCEAN_API_TOKEN = disabled (no-op),
// matching the Plausible/Stripe pattern. Native fetch, Bearer auth. Surfaces: the
// Droplets API (list + detail), the Monitoring API (live CPU/memory/disk/bandwidth),
// and the Uptime API (managed checks + state). No DB access here — returns plain data;
// callers (services/websiteInfra.js, services/websiteUptime.js) gate and shape it.
export const isConfigured = () => !!config.digitalocean.apiToken

async function doFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${config.digitalocean.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.digitalocean.apiToken}`,
      'Content-Type': 'application/json'
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DigitalOcean ${res.status}: ${text.slice(0, 200)}`)
  }
  // DELETE returns 204 No Content — nothing to parse.
  if (res.status === 204) return null
  return res.json()
}

// Public IPv4 of a droplet from its networks block (v4 entry with type 'public').
function publicIpv4(droplet) {
  const v4 = droplet?.networks?.v4 ?? []
  return v4.find(n => n.type === 'public')?.ip_address ?? null
}

/** All droplets on the account, trimmed to what the picker + panel need. */
export async function listDroplets() {
  const json = await doFetch('/v2/droplets?per_page=200')
  return (json.droplets ?? []).map(d => ({
    id: d.id,
    name: d.name,
    region: d.region?.slug ?? null,
    size_slug: d.size_slug ?? null,
    status: d.status ?? null,
    ipv4: publicIpv4(d),
    price_monthly: d.size?.price_monthly ?? null // base droplet cost (USD/mo)
  }))
}

/** One droplet's identity + shape (status, region, size, IPv4, created). */
export async function getDroplet(id) {
  const { droplet } = await doFetch(`/v2/droplets/${id}`)
  if (!droplet) return null
  return {
    id: droplet.id,
    name: droplet.name,
    status: droplet.status ?? null,
    region: droplet.region?.name ?? droplet.region?.slug ?? null,
    size_slug: droplet.size_slug ?? null,
    vcpus: droplet.vcpus ?? null,
    memory_mb: droplet.memory ?? null, // DO reports memory in MB
    disk_gb: droplet.disk ?? null,
    ipv4: publicIpv4(droplet),
    created_at: droplet.created_at ?? null
  }
}

// ---- Monitoring API ---------------------------------------------------------
// Prometheus-style range queries: GET /v2/monitoring/metrics/droplet/<metric>
// ?host_id=&start=&end= → { data: { result: [ { metric, values: [[ts, "v"], …] } ] } }.
// CPU/memory/disk series require the do-agent on the droplet; without it they come
// back empty (→ null here). Bandwidth is hypervisor-level and works regardless.

async function metricSeries(metric, params) {
  const qs = new URLSearchParams(params).toString()
  try {
    const json = await doFetch(`/v2/monitoring/metrics/droplet/${metric}?${qs}`)
    return json?.data?.result ?? []
  } catch (err) {
    // One flaky/empty metric shouldn't sink the whole panel — degrade to null.
    console.error(`[digitalocean] metric ${metric}:`, err.message)
    return []
  }
}

// Latest numeric sample of a single series' [ts, "value"] pairs.
function latest(values) {
  if (!values?.length) return null
  const v = Number(values[values.length - 1][1])
  return Number.isFinite(v) ? v : null
}

// Sum the latest sample across every series (multiple filesystems/devices).
function sumLatest(result) {
  let total = 0
  let seen = false
  for (const s of result) {
    const v = latest(s.values)
    if (v != null) { total += v; seen = true }
  }
  return seen ? total : null
}

// CPU% over the window: 100 · (1 − Δidle / ΣΔmode). Values are cumulative
// CPU-seconds counters split by mode; needs ≥2 samples to difference.
function cpuPercent(result) {
  if (!result.length) return null
  let idleDelta = 0
  let totalDelta = 0
  let ok = false
  for (const s of result) {
    const vals = s.values ?? []
    if (vals.length < 2) continue
    const delta = Number(vals[vals.length - 1][1]) - Number(vals[0][1])
    if (!Number.isFinite(delta) || delta < 0) continue
    totalDelta += delta
    if (s.metric?.mode === 'idle') idleDelta += delta
    ok = true
  }
  if (!ok || totalDelta <= 0) return null
  return Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)))
}

const pct = (used, total) =>
  (used == null || total == null || total <= 0) ? null : Math.max(0, Math.min(100, (used / total) * 100))

/**
 * Live resource metrics for a droplet over the last ~10 min. Never throws —
 * every field is nullable so the panel degrades gracefully (e.g. no do-agent →
 * cpu/memory/disk null, bandwidth still populated).
 */
export async function getDropletMetrics(id) {
  const end = Math.floor(Date.now() / 1000)
  const start = end - 600
  const base = { host_id: String(id), start: String(start), end: String(end) }

  const [cpu, memTotal, memAvail, fsFree, fsSize, bwIn, bwOut] = await Promise.all([
    metricSeries('cpu', base),
    metricSeries('memory_total', base),
    metricSeries('memory_available', base),
    metricSeries('filesystem_free', base),
    metricSeries('filesystem_size', base),
    metricSeries('bandwidth', { ...base, interface: 'public', direction: 'inbound' }),
    metricSeries('bandwidth', { ...base, interface: 'public', direction: 'outbound' })
  ])

  const memoryTotal = latest(memTotal[0]?.values)
  const memoryAvail = latest(memAvail[0]?.values)
  const diskFree = sumLatest(fsFree)
  const diskSize = sumLatest(fsSize)

  return {
    cpuPct: cpuPercent(cpu),
    memUsedPct: pct(memoryTotal != null && memoryAvail != null ? memoryTotal - memoryAvail : null, memoryTotal),
    diskUsedPct: pct(diskFree != null && diskSize != null ? diskSize - diskFree : null, diskSize),
    bandwidth: {
      inboundMbps: latest(bwIn[0]?.values),
      outboundMbps: latest(bwOut[0]?.values)
    }
  }
}

// ---- Uptime API ------------------------------------------------------------
// Managed multi-region uptime checks. The app provisions one per monitored site
// and reads its aggregated state; DO does the actual probing from `regions`.

/** Create an uptime check for a target URL. `type` is derived from the scheme. */
export async function createUptimeCheck({ name, target, regions }) {
  const type = target.startsWith('http://') ? 'http' : 'https'
  const { check } = await doFetch('/v2/uptime/checks', {
    method: 'POST',
    body: { name, type, target, regions, enabled: true }
  })
  return check
}

/** Current aggregated state of a check: per-region status + 30-day uptime %. */
export async function getUptimeCheckState(id) {
  const { state } = await doFetch(`/v2/uptime/checks/${id}/state`)
  return state
}

/** Delete a managed uptime check (idempotent-ish; 404s surface to the caller). */
export async function deleteUptimeCheck(id) {
  await doFetch(`/v2/uptime/checks/${id}`, { method: 'DELETE' })
}

// ---- Provisioning (droplets, sizes/regions/keys, DO Projects) --------------

/** Create a droplet. Monitoring is on so the infra panel's do-agent metrics work. */
export async function createDroplet({ name, region, size, image, ssh_keys = [], tags = [] }) {
  const { droplet } = await doFetch('/v2/droplets', {
    method: 'POST',
    body: { name, region, size, image, ssh_keys, monitoring: true, tags }
  })
  return droplet
}

/** Delete a droplet (provision rollback + verification cleanup). */
export async function deleteDroplet(id) {
  await doFetch(`/v2/droplets/${id}`, { method: 'DELETE' })
}

/** Account SSH keys — attached to a new droplet so the box is reachable. */
export async function listSshKeys() {
  const json = await doFetch('/v2/account/keys?per_page=200')
  return (json.ssh_keys ?? []).map(k => ({ id: k.id, fingerprint: k.fingerprint, name: k.name }))
}

/** Available basic (`s-*`) droplet sizes with pricing, for the provision picker. */
export async function listSizes() {
  const json = await doFetch('/v2/sizes?per_page=200')
  return (json.sizes ?? [])
    .filter(s => s.available && s.slug.startsWith('s-'))
    .map(s => ({ slug: s.slug, price_monthly: s.price_monthly, vcpus: s.vcpus, memory: s.memory, disk: s.disk, description: s.description }))
}

/** Available regions, for the provision picker. */
export async function listRegions() {
  const json = await doFetch('/v2/regions?per_page=200')
  return (json.regions ?? []).filter(r => r.available).map(r => ({ slug: r.slug, name: r.name }))
}

/** DO Projects (resource groups) — one per client for hosting organization. */
export async function listDoProjects() {
  const json = await doFetch('/v2/projects?per_page=200')
  return (json.projects ?? []).map(p => ({ id: p.id, name: p.name }))
}

export async function createDoProject({ name, purpose, environment }) {
  const { project } = await doFetch('/v2/projects', { method: 'POST', body: { name, purpose, environment } })
  return project
}

/** Move a droplet into a DO Project by resource URN. */
export async function assignDropletToProject(projectId, dropletId) {
  await doFetch(`/v2/projects/${projectId}/resources`, {
    method: 'POST',
    body: { resources: [`do:droplet:${dropletId}`] }
  })
}

/** Delete a DO Project (verification cleanup only; DO requires it be empty). */
export async function deleteDoProject(id) {
  await doFetch(`/v2/projects/${id}`, { method: 'DELETE' })
}
