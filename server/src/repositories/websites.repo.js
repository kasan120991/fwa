import { query } from '../db/pool.js'

export const ENVIRONMENTS = new Set(['live', 'staging', 'dev'])
export const PROVIDERS = new Set(['none', 'plausible', 'ga4', 'fathom', 'umami'])

// Columns a client can set on create/update. Traffic (website_metrics) + health +
// top_pages/top_sources are populated by seeding / a future analytics sync, not here.
const WRITABLE = [
  'client_id', 'project_id', 'name', 'domain', 'url', 'environment', 'status',
  'analytics_provider', 'analytics_site_id', 'conversion_goal', 'launched_at', 'notes'
]

const num = v => (v == null ? null : Number(v))

function mapWebsite(row) {
  if (!row) return row
  return {
    ...row,
    connected: row.analytics_provider !== 'none',
    uptime_pct: num(row.uptime_pct),
    // JSON columns are parsed by mysql2 on read; default to [] when null.
    top_pages: row.top_pages ?? [],
    top_sources: row.top_sources ?? [],
    client: row.client_company || row.client_name || 'Unknown'
  }
}

// Build a zero-filled daily series over the last `span` days (keys as 'YYYY-MM-DD'
// via DATE_FORMAT so there's no Date/timezone ambiguity), matching the JS calendar.
function fillDays(rows, span) {
  const by = new Map(rows.map(r => [r.date, r]))
  const now = new Date()
  const out = []
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const r = by.get(ymd)
    out.push({
      date: ymd,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      visitors: num(r?.visitors) ?? 0,
      pageviews: num(r?.pageviews) ?? 0,
      conversions: num(r?.conversions) ?? 0
    })
  }
  return out
}

// Correlated 30-day rollup subqueries (per website `w.id`).
const SUM_30 = col => `(SELECT COALESCE(SUM(${col}), 0) FROM website_metrics WHERE website_id = w.id AND date >= (CURDATE() - INTERVAL 29 DAY))`
const SUM_PREV = col => `(SELECT COALESCE(SUM(${col}), 0) FROM website_metrics WHERE website_id = w.id AND date >= (CURDATE() - INTERVAL 59 DAY) AND date < (CURDATE() - INTERVAL 29 DAY))`

/** Cross-client list: every site + client + 30-day rollups (visitors/pageviews/
 *  conversions), a visitors delta vs the prior 30 days, and a 14-day visitor spark. */
export async function listWebsites(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const where = []
  const params = {}
  if (opts.client_id) { where.push('w.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.environment) { where.push('w.environment = :environment'); params.environment = opts.environment }
  if (opts.connected === true) where.push("w.analytics_provider <> 'none'")
  if (opts.connected === false) where.push("w.analytics_provider = 'none'")
  if (opts.q) { where.push('(w.name LIKE :q OR w.domain LIKE :q OR c.company LIKE :q OR c.name LIKE :q)'); params.q = `%${opts.q}%` }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT w.*, c.company AS client_company, c.name AS client_name,
            ${SUM_30('visitors')} AS visitors_30d, ${SUM_PREV('visitors')} AS visitors_prev,
            ${SUM_30('pageviews')} AS pageviews_30d, ${SUM_30('conversions')} AS conversions_30d
       FROM websites w JOIN clients c ON c.id = w.client_id${whereSql}
      ORDER BY visitors_30d DESC, w.name ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM websites w JOIN clients c ON c.id = w.client_id${whereSql}`, params)

  // Sparklines: last 14 days of visitors for the listed sites, in one query.
  const ids = rows.map(r => r.id)
  const sparks = new Map()
  if (ids.length) {
    const sp = await query(
      `SELECT website_id, visitors FROM website_metrics
        WHERE website_id IN (${ids.map((_, i) => `:s${i}`).join(', ')}) AND date >= (CURDATE() - INTERVAL 13 DAY)
        ORDER BY date ASC`,
      Object.fromEntries(ids.map((id, i) => [`s${i}`, id]))
    )
    for (const r of sp) {
      if (!sparks.has(r.website_id)) sparks.set(r.website_id, [])
      sparks.get(r.website_id).push(Number(r.visitors))
    }
  }

  return {
    rows: rows.map((r) => {
      const visitors_30d = num(r.visitors_30d)
      const prev = num(r.visitors_prev)
      return {
        ...mapWebsite(r),
        visitors_30d,
        pageviews_30d: num(r.pageviews_30d),
        conversions_30d: num(r.conversions_30d),
        delta_pct: prev > 0 ? Math.round(((visitors_30d - prev) / prev) * 100) : null,
        spark: sparks.get(r.id) ?? []
      }
    }),
    total, limit, offset
  }
}

export async function getWebsite(id) {
  const rows = await query(
    `SELECT w.*, c.company AS client_company, c.name AS client_name,
            p.name AS project_name, p.code AS project_code
       FROM websites w
       JOIN clients c ON c.id = w.client_id
       LEFT JOIN projects p ON p.id = w.project_id
      WHERE w.id = :id LIMIT 1`,
    { id }
  )
  return mapWebsite(rows[0] ?? null)
}

/** Cross-client KPI tiles for the /websites dashboard. */
export async function websiteStats() {
  const [k] = await query(
    `SELECT COUNT(*) AS total_sites,
            COALESCE(SUM(environment = 'live' AND status = 'active'), 0) AS live_count,
            COALESCE(SUM(analytics_provider <> 'none'), 0) AS connected_count
       FROM websites`
  )
  const [{ visitors_30d }] = await query("SELECT COALESCE(SUM(visitors), 0) AS visitors_30d FROM website_metrics WHERE date >= (CURDATE() - INTERVAL 29 DAY)")
  const [{ visitors_prev }] = await query("SELECT COALESCE(SUM(visitors), 0) AS visitors_prev FROM website_metrics WHERE date >= (CURDATE() - INTERVAL 59 DAY) AND date < (CURDATE() - INTERVAL 29 DAY)")
  const v = num(visitors_30d)
  const prev = num(visitors_prev)
  return {
    total_sites: Number(k.total_sites),
    live_count: Number(k.live_count),
    connected_count: Number(k.connected_count),
    visitors_30d: v,
    visitors_delta_pct: prev > 0 ? Math.round(((v - prev) / prev) * 100) : null
  }
}

/** Aggregate daily traffic across all sites (dashboard trend chart). */
export async function websiteTrafficSeries(days = 30) {
  const span = Number(days) === 90 ? 90 : 30
  const rows = await query(
    `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, SUM(visitors) AS visitors, SUM(pageviews) AS pageviews
       FROM website_metrics WHERE date >= (CURDATE() - INTERVAL ${span - 1} DAY)
      GROUP BY date ORDER BY date ASC`
  )
  return fillDays(rows, span)
}

/** Daily series for one site (detail trend chart). */
export async function websiteMetricsSeries(id, days = 30) {
  const span = [7, 30, 90].includes(Number(days)) ? Number(days) : 30
  const rows = await query(
    `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, visitors, pageviews, conversions
       FROM website_metrics WHERE website_id = :id AND date >= (CURDATE() - INTERVAL ${span - 1} DAY)
      ORDER BY date ASC`,
    { id }
  )
  return fillDays(rows, span)
}

/** 30-day aggregates + conversion rate + visitors delta for the detail KPIs. */
export async function websiteSummary(id) {
  const [cur] = await query(
    `SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(pageviews), 0) AS pageviews,
            COALESCE(SUM(conversions), 0) AS conversions
       FROM website_metrics WHERE website_id = :id AND date >= (CURDATE() - INTERVAL 29 DAY)`,
    { id }
  )
  const [prev] = await query(
    `SELECT COALESCE(SUM(visitors), 0) AS visitors FROM website_metrics
      WHERE website_id = :id AND date >= (CURDATE() - INTERVAL 59 DAY) AND date < (CURDATE() - INTERVAL 29 DAY)`,
    { id }
  )
  const visitors = num(cur.visitors)
  const conversions = num(cur.conversions)
  const pv = num(prev.visitors)
  return {
    visitors_30d: visitors,
    pageviews_30d: num(cur.pageviews),
    conversions_30d: conversions,
    conv_rate: visitors > 0 ? Math.round((conversions / visitors) * 1000) / 10 : 0,
    visitors_delta_pct: pv > 0 ? Math.round(((visitors - pv) / pv) * 100) : null
  }
}

export async function createWebsite(data) {
  const cols = WRITABLE.filter(c => data[c] !== undefined)
  const params = {}
  for (const c of cols) params[c] = data[c]
  const res = await query(
    `INSERT INTO websites (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    params
  )
  return getWebsite(res.insertId)
}

export async function updateWebsite(id, data) {
  const cols = WRITABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getWebsite(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  const params = { id }
  for (const c of cols) params[c] = data[c]
  await query(`UPDATE websites SET ${set} WHERE id = :id`, params)
  return getWebsite(id)
}

export async function deleteWebsite(id) {
  const res = await query('DELETE FROM websites WHERE id = :id', { id })
  return res.affectedRows > 0
}

// ---- analytics sync writers (used by the Plausible sync service) ----

/** Upsert one day of metrics (idempotent on the uq_wm_site_date key). */
export async function upsertMetric(website_id, date, { visitors = 0, pageviews = 0, conversions = 0 } = {}) {
  await query(
    `INSERT INTO website_metrics (website_id, date, visitors, pageviews, conversions)
       VALUES (:website_id, :date, :visitors, :pageviews, :conversions)
     ON DUPLICATE KEY UPDATE
       visitors = VALUES(visitors), pageviews = VALUES(pageviews), conversions = VALUES(conversions)`,
    { website_id, date, visitors, pageviews, conversions }
  )
}

/** Record the current top pages/sources snapshot + stamp last_synced_at. */
export async function setSynced(id, { top_pages, top_sources } = {}) {
  await query(
    'UPDATE websites SET top_pages = :tp, top_sources = :ts, last_synced_at = NOW() WHERE id = :id',
    { id, tp: JSON.stringify(top_pages ?? []), ts: JSON.stringify(top_sources ?? []) }
  )
}

/** Connected Plausible sites, for the scheduled/bulk sync. */
export async function listSyncableWebsites() {
  return query("SELECT id, domain, analytics_site_id, conversion_goal FROM websites WHERE analytics_provider = 'plausible'")
}

// ---- uptime checks (health history) ----

/** Record one uptime check. */
export async function insertCheck(website_id, { up, status_code = null, response_ms = null } = {}) {
  await query(
    `INSERT INTO website_checks (website_id, checked_at, up, status_code, response_ms)
       VALUES (:website_id, NOW(), :up, :status_code, :response_ms)`,
    { website_id, up: up ? 1 : 0, status_code, response_ms }
  )
}

/** Refresh the site's current health snapshot (state + rolling uptime %) from
 *  recent checks. `days` is inlined (mysql2 can't bind INTERVAL). */
export async function recomputeHealth(website_id, days = 30) {
  const d = Math.max(1, Math.floor(Number(days) || 30))
  const [agg] = await query(
    `SELECT COUNT(*) AS n, COALESCE(AVG(up) * 100, 0) AS uptime_pct
       FROM website_checks WHERE website_id = :id AND checked_at >= (NOW() - INTERVAL ${d} DAY)`,
    { id: website_id }
  )
  const last = await query('SELECT up, response_ms FROM website_checks WHERE website_id = :id ORDER BY checked_at DESC LIMIT 1', { id: website_id })
  const latest = last[0]
  let state = 'unknown'
  if (latest) state = !latest.up ? 'down' : (latest.response_ms != null && latest.response_ms > 1500 ? 'degraded' : 'up')
  const uptime = Number(agg.n) ? Math.round(Number(agg.uptime_pct) * 100) / 100 : null
  await query(
    'UPDATE websites SET health_state = :state, uptime_pct = :uptime, last_checked_at = NOW() WHERE id = :id',
    { id: website_id, state, uptime }
  )
  return { state, uptime_pct: uptime }
}

/** Daily uptime % + avg response time for the detail history chart (zero-filled,
 *  null on days with no checks). */
export async function websiteChecksSeries(id, days = 30) {
  const span = [7, 30, 90].includes(Number(days)) ? Number(days) : 30
  const rows = await query(
    `SELECT DATE_FORMAT(checked_at, '%Y-%m-%d') AS date,
            ROUND(AVG(up) * 100, 2) AS uptime, ROUND(AVG(response_ms)) AS response_ms
       FROM website_checks
      WHERE website_id = :id AND checked_at >= (CURDATE() - INTERVAL ${span - 1} DAY)
      GROUP BY date ORDER BY date ASC`,
    { id }
  )
  const by = new Map(rows.map(r => [r.date, r]))
  const now = new Date()
  const out = []
  for (let i = span - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const r = by.get(ymd)
    out.push({
      date: ymd,
      label: `${dt.getMonth() + 1}/${dt.getDate()}`,
      uptime: r ? Number(r.uptime) : null,
      response_ms: r ? Number(r.response_ms) : null
    })
  }
  return out
}
