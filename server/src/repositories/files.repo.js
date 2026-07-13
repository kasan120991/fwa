import { query } from '../db/pool.js'

// The file categories files are grouped by on the Files page (mirror the
// Client-detail Files tab groups). Kept in sync with the `category` ENUM in
// schema.sql and the frontend select.
export const FILE_CATEGORIES = new Set(['brand', 'contract', 'deliverable', 'other'])

// Join the optional client, project and uploader for display. All three are
// LEFT joins because every link is nullable (a file may be unattached, and its
// uploader may have been removed).
const BASE_SELECT = `SELECT f.*,
    c.name AS client_name, c.company AS client_company,
    p.name AS project_name,
    u.name AS uploaded_by_name
  FROM files f
  LEFT JOIN clients c ON c.id = f.client_id
  LEFT JOIN projects p ON p.id = f.project_id
  LEFT JOIN users u ON u.id = f.uploaded_user_id`

export async function getFile(id) {
  const rows = await query(`${BASE_SELECT} WHERE f.id = :id LIMIT 1`, { id })
  return rows[0] ?? null
}

export async function listFiles(opts = {}) {
  const where = []
  const params = {}
  if (opts.client_id) { where.push('f.client_id = :client_id'); params.client_id = opts.client_id }
  if (opts.project_id) { where.push('f.project_id = :project_id'); params.project_id = opts.project_id }
  if (opts.category) { where.push('f.category = :category'); params.category = opts.category }
  if (opts.q) {
    where.push('(f.name LIKE :q OR c.name LIKE :q OR c.company LIKE :q)')
    params.q = `%${opts.q}%`
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  return query(`${BASE_SELECT}${whereSql} ORDER BY f.created_at DESC, f.id DESC`, params)
}

export async function createFile(data) {
  const res = await query(
    `INSERT INTO files (client_id, project_id, category, path, name, mime, size_bytes, uploaded_by, uploaded_user_id)
     VALUES (:client_id, :project_id, :category, :path, :name, :mime, :size_bytes, :uploaded_by, :uploaded_user_id)`,
    {
      client_id: data.client_id ?? null,
      project_id: data.project_id ?? null,
      category: data.category ?? 'other',
      path: data.path,
      name: data.name,
      mime: data.mime ?? null,
      size_bytes: data.size_bytes ?? null,
      uploaded_by: data.uploaded_by ?? 'admin',
      uploaded_user_id: data.uploaded_user_id ?? null
    }
  )
  return getFile(res.insertId)
}

// Partial update — rename and/or reassign client/project/category. Only the
// keys present in `fields` are written.
const UPDATABLE = ['client_id', 'project_id', 'category', 'name']

export async function updateFile(id, fields) {
  const cols = UPDATABLE.filter(c => fields[c] !== undefined)
  if (!cols.length) return getFile(id)
  const params = { id }
  for (const c of cols) params[c] = fields[c]
  await query(`UPDATE files SET ${cols.map(c => `${c} = :${c}`).join(', ')} WHERE id = :id`, params)
  return getFile(id)
}

export async function deleteFile(id) {
  const res = await query('DELETE FROM files WHERE id = :id', { id })
  return res.affectedRows > 0
}
