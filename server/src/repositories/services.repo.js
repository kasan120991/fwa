import { query } from '../db/pool.js'

// The price book / catalog — source of truth for pricing. Line items snapshot
// off these at document-build time (see proposals/contracts repos).
export const CATEGORIES = new Set(['website_package', 'care_plan', 'addon'])
export const BILLING_INTERVALS = new Set(['one_time', 'monthly'])

// id/created_at/updated_at are DB-managed.
const WRITABLE = ['name', 'description', 'category', 'price', 'billing_interval', 'pandadoc_sku', 'is_active', 'sort_order']
const SORTABLE = new Set(['sort_order', 'name', 'price', 'created_at'])

// mysql2 returns DECIMAL as a string and BOOLEAN as 0/1 — normalize for the API.
function mapRow(row) {
  if (!row) return row
  return { ...row, price: row.price == null ? null : Number(row.price), is_active: Boolean(row.is_active) }
}
function toParams(data) {
  const out = {}
  for (const col of WRITABLE) if (data[col] !== undefined) out[col] = data[col]
  return out
}

export async function listServices(opts = {}) {
  const where = []
  const params = {}
  if (opts.category) { where.push('category = :category'); params.category = opts.category }
  if (opts.activeOnly) where.push('is_active = 1')
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const sort = SORTABLE.has(opts.sort) ? opts.sort : 'sort_order'
  const rows = await query(`SELECT * FROM services${whereSql} ORDER BY ${sort} ASC, id ASC`, params)
  return rows.map(mapRow)
}

export async function getService(id) {
  const rows = await query('SELECT * FROM services WHERE id = :id LIMIT 1', { id })
  return mapRow(rows[0] ?? null)
}

export async function createService(data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  const result = await query(
    `INSERT INTO services (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    params
  )
  return getService(result.insertId)
}

export async function updateService(id, data) {
  const params = toParams(data)
  const cols = Object.keys(params)
  if (cols.length === 0) return getService(id)
  const set = cols.map(c => `${c} = :${c}`).join(', ')
  await query(`UPDATE services SET ${set} WHERE id = :id`, { ...params, id })
  return getService(id)
}

export async function deleteService(id) {
  const result = await query('DELETE FROM services WHERE id = :id', { id })
  return result.affectedRows > 0
}
