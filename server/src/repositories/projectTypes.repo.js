import { query } from '../db/pool.js'

// Extensible catalog of project kinds. Each type sets a code prefix and,
// optionally, which document template its contract generates from. Read-only
// surface for now (managed via seed/SQL; a Settings UI comes later).

export async function listProjectTypes({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : ''
  return query(`SELECT * FROM project_types ${where} ORDER BY sort_order ASC, name ASC`)
}

export async function getProjectType(id) {
  const rows = await query('SELECT * FROM project_types WHERE id = :id LIMIT 1', { id })
  return rows[0] ?? null
}

export async function getProjectTypeByKey(key) {
  const rows = await query('SELECT * FROM project_types WHERE `key` = :key LIMIT 1', { key })
  return rows[0] ?? null
}
