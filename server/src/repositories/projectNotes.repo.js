import { query } from '../db/pool.js'

// An internal scratchpad on a project — decisions, gotchas, things the client
// said. Admin-only by design: no portal route reads this table, and client
// -facing messages go through tickets instead.

export async function listNotes(projectId) {
  return query(
    `SELECT id, project_id, body, created_at, updated_at
       FROM project_notes WHERE project_id = :projectId
      ORDER BY created_at DESC, id DESC`,
    { projectId })
}

export async function getNote(id) {
  const rows = await query(
    'SELECT id, project_id, body, created_at, updated_at FROM project_notes WHERE id = :id LIMIT 1',
    { id })
  return rows[0] ?? null
}

export async function createNote(projectId, body) {
  const res = await query(
    'INSERT INTO project_notes (project_id, body) VALUES (:projectId, :body)',
    { projectId, body })
  return getNote(res.insertId)
}

export async function updateNote(id, body) {
  await query('UPDATE project_notes SET body = :body WHERE id = :id', { id, body })
  return getNote(id)
}

export async function deleteNote(id) {
  const res = await query('DELETE FROM project_notes WHERE id = :id', { id })
  return res.affectedRows > 0
}

export async function countNotes(projectId) {
  const rows = await query(
    'SELECT COUNT(*) AS n FROM project_notes WHERE project_id = :projectId', { projectId })
  return Number(rows[0]?.n ?? 0)
}
