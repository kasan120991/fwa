import { query } from '../db/pool.js'

export const MILESTONE_STATES = new Set(['upcoming', 'in_progress', 'complete'])

const UPDATABLE = ['title', 'description', 'state', 'position', 'target_date']

const int = v => (v == null ? 0 : Number(v))

function mapMilestone(row) {
  if (!row) return row
  return { ...row, task_total: int(row.task_total), task_done: int(row.task_done) }
}

// Per-milestone task rollup so each milestone carries its own progress (no N+1),
// mirroring projects.repo's TASK_ROLLUP but grouped by milestone_id.
const TASK_ROLLUP = `LEFT JOIN (
    SELECT milestone_id, COUNT(*) AS task_total, COALESCE(SUM(status = 'done'), 0) AS task_done
    FROM tasks WHERE milestone_id IS NOT NULL GROUP BY milestone_id
  ) tr ON tr.milestone_id = m.id`

const BASE_SELECT = `SELECT m.*,
    COALESCE(tr.task_total, 0) AS task_total, COALESCE(tr.task_done, 0) AS task_done
  FROM project_milestones m
  ${TASK_ROLLUP}`

export async function listMilestones(project_id) {
  const rows = await query(
    `${BASE_SELECT} WHERE m.project_id = :project_id ORDER BY m.position ASC, m.id ASC`,
    { project_id }
  )
  return rows.map(mapMilestone)
}

export async function getMilestone(id) {
  const rows = await query(`${BASE_SELECT} WHERE m.id = :id LIMIT 1`, { id })
  return mapMilestone(rows[0] ?? null)
}

export async function createMilestone(data) {
  const { project_id, title } = data
  // Append to the end of the project's list unless a position is given.
  let position = data.position
  if (position === undefined || position === null) {
    const [{ maxPos }] = await query(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM project_milestones WHERE project_id = :project_id',
      { project_id }
    )
    position = Number(maxPos) + 1
  }
  const cols = ['project_id', 'title', 'position']
  const params = { project_id, title, position }
  for (const c of ['description', 'state', 'target_date']) {
    if (data[c] !== undefined) { cols.push(c); params[c] = data[c] }
  }
  // Stamp completion if created already complete.
  const doneNow = data.state === 'complete'
  const insertCols = [...cols, ...(doneNow ? ['completed_at'] : [])]
  const values = [...cols.map(c => `:${c}`), ...(doneNow ? ['NOW()'] : [])]
  const res = await query(
    `INSERT INTO project_milestones (${insertCols.join(', ')}) VALUES (${values.join(', ')})`,
    params
  )
  return getMilestone(res.insertId)
}

export async function updateMilestone(id, data) {
  const cols = UPDATABLE.filter(c => data[c] !== undefined)
  if (cols.length === 0) return getMilestone(id)
  const set = cols.map(c => `${c} = :${c}`)
  const params = { id }
  for (const c of cols) params[c] = data[c]
  // Cross the complete boundary: stamp/clear completed_at when state changes.
  if (data.state !== undefined) {
    set.push(data.state === 'complete' ? 'completed_at = NOW()' : 'completed_at = NULL')
  }
  await query(`UPDATE project_milestones SET ${set.join(', ')} WHERE id = :id`, params)
  return getMilestone(id)
}

export async function deleteMilestone(id) {
  // Soft link (no FK to cascade): detach tasks before removing the milestone,
  // so their work falls back into the project's "General" bucket.
  await query('UPDATE tasks SET milestone_id = NULL WHERE milestone_id = :id', { id })
  const res = await query('DELETE FROM project_milestones WHERE id = :id', { id })
  return res.affectedRows > 0
}

// Reorder within a project: assign positions from an ordered list of ids.
export async function setPositions(project_id, orderedIds) {
  let pos = 0
  for (const mid of orderedIds) {
    await query(
      'UPDATE project_milestones SET position = :pos WHERE id = :id AND project_id = :project_id',
      { pos, id: mid, project_id }
    )
    pos += 1
  }
  return listMilestones(project_id)
}

// ---- templates (read only; managed via seed/SQL until a Settings UI exists) ----

export async function listTemplates(project_type_id) {
  const rows = await query(
    `SELECT id, project_type_id, title, position, is_active
       FROM milestone_templates
      WHERE project_type_id = :project_type_id AND is_active = 1
      ORDER BY position ASC, id ASC`,
    { project_type_id }
  )
  return rows.map(r => ({ ...r, is_active: !!r.is_active }))
}
