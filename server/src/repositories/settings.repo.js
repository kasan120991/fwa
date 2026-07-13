import { query } from '../db/pool.js'

// Writable columns of the singleton settings row (id is pinned to 1).
export const SETTINGS_COLUMNS = [
  'agency_legal_name', 'agency_display_name', 'agency_support_email', 'agency_phone', 'agency_logo_url',
  'agency_address_line1', 'agency_address_line2', 'agency_city', 'agency_region', 'agency_postal_code',
  'agency_country', 'invoice_due_days', 'invoice_currency', 'notification_prefs'
]

function mapRow(r) {
  if (!r) return null
  return {
    ...r,
    invoice_due_days: Number(r.invoice_due_days),
    // JSON column: mysql2 may hand back a parsed object or a string depending on version.
    notification_prefs: typeof r.notification_prefs === 'string'
      ? JSON.parse(r.notification_prefs || 'null')
      : (r.notification_prefs ?? null)
  }
}

/** The single app-wide settings row (id = 1). */
export async function getSettings() {
  const rows = await query('SELECT * FROM settings WHERE id = 1 LIMIT 1')
  return mapRow(rows[0] ?? null)
}

/** Update only the provided writable columns on the singleton row; returns the fresh row. */
export async function updateSettings(patch) {
  const sets = []
  const params = {}
  for (const col of SETTINGS_COLUMNS) {
    if (patch[col] === undefined) continue
    sets.push(`${col} = :${col}`)
    params[col] = col === 'notification_prefs' && patch[col] != null && typeof patch[col] !== 'string'
      ? JSON.stringify(patch[col])
      : patch[col]
  }
  if (sets.length) await query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, params)
  return getSettings()
}
