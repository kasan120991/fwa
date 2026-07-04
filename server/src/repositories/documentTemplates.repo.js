import { query } from '../db/pool.js'

// Maps a PandaDoc template UUID to a purpose, so templates can change without a
// redeploy. The routes look up the active template for a purpose when creating
// a document.
export const PURPOSES = new Set(['proposal', 'project_contract', 'care_plan'])

export async function listTemplates() {
  return query('SELECT * FROM document_templates ORDER BY purpose ASC, id ASC')
}

/** The active template UUID for a purpose, or null if none is configured. */
export async function getActiveTemplate(purpose) {
  const rows = await query(
    'SELECT * FROM document_templates WHERE purpose = :purpose AND is_active = 1 ORDER BY id DESC LIMIT 1',
    { purpose }
  )
  return rows[0] ?? null
}

export async function createTemplate(data) {
  const cols = ['purpose', 'template_uuid', 'name', 'is_active'].filter(c => data[c] !== undefined)
  const result = await query(
    `INSERT INTO document_templates (${cols.join(', ')}) VALUES (${cols.map(c => `:${c}`).join(', ')})`,
    data
  )
  const rows = await query('SELECT * FROM document_templates WHERE id = :id', { id: result.insertId })
  return rows[0] ?? null
}
