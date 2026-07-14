import { query, withTransaction } from '../db/pool.js'

// Named, reusable delivery blueprints: a template holds an ordered set of
// milestones, each with an ordered set of tasks (plus a milestone-less "General"
// bucket). Picked in the New Project form (or a type's default is applied when
// none is chosen) and copied into project_milestones + tasks at creation.

function bool(v) { return !!v }

function mapTemplate(row) {
  if (!row) return row
  return {
    ...row,
    is_default: bool(row.is_default),
    is_active: bool(row.is_active),
    milestone_count: Number(row.milestone_count || 0),
    task_count: Number(row.task_count || 0)
  }
}

// Milestone/task counts joined in so the editor list needs no N+1.
const COUNT_ROLLUP = `LEFT JOIN (
    SELECT template_id, COUNT(*) AS milestone_count FROM project_template_milestones GROUP BY template_id
  ) mc ON mc.template_id = t.id
  LEFT JOIN (
    SELECT template_id, COUNT(*) AS task_count FROM project_template_tasks GROUP BY template_id
  ) tc ON tc.template_id = t.id`

const BASE_SELECT = `SELECT t.*,
    pt.name AS type_name, pt.\`key\` AS type_key,
    COALESCE(mc.milestone_count, 0) AS milestone_count,
    COALESCE(tc.task_count, 0) AS task_count
  FROM project_templates t
  LEFT JOIN project_types pt ON pt.id = t.project_type_id
  ${COUNT_ROLLUP}`

export async function listTemplates(opts = {}) {
  const where = []
  const params = {}
  if (opts.activeOnly) where.push('t.is_active = 1')
  if (opts.project_type_id) { where.push('t.project_type_id = :project_type_id'); params.project_type_id = opts.project_type_id }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const rows = await query(
    `${BASE_SELECT}${whereSql} ORDER BY t.sort_order ASC, t.name ASC`,
    params
  )
  return rows.map(mapTemplate)
}

// A template with its milestones (each carrying its tasks) plus a `general`
// bucket of milestone-less tasks.
export async function getTemplate(id) {
  const rows = await query(`${BASE_SELECT} WHERE t.id = :id LIMIT 1`, { id })
  const template = mapTemplate(rows[0] ?? null)
  if (!template) return null

  const milestones = await query(
    `SELECT id, title, position FROM project_template_milestones
      WHERE template_id = :id ORDER BY position ASC, id ASC`,
    { id }
  )
  const tasks = await query(
    `SELECT id, template_milestone_id, title, position FROM project_template_tasks
      WHERE template_id = :id ORDER BY position ASC, id ASC`,
    { id }
  )
  const byMilestone = new Map(milestones.map(m => [m.id, { ...m, tasks: [] }]))
  const general = []
  for (const task of tasks) {
    const bucket = task.template_milestone_id != null ? byMilestone.get(task.template_milestone_id) : null
    if (bucket) bucket.tasks.push({ id: task.id, title: task.title, position: task.position })
    else general.push({ id: task.id, title: task.title, position: task.position })
  }
  template.milestones = [...byMilestone.values()]
  template.general = general
  return template
}

export async function getDefaultTemplateId(project_type_id) {
  if (!project_type_id) return null
  const rows = await query(
    `SELECT id FROM project_templates
      WHERE project_type_id = :tid AND is_default = 1 AND is_active = 1
      ORDER BY sort_order ASC, id ASC LIMIT 1`,
    { tid: project_type_id }
  )
  return rows[0]?.id ?? null
}

// Insert the milestones + tasks of a template into a template (used by save).
// Runs on the provided transaction runner `q`.
async function insertStructure(q, templateId, payload) {
  const milestones = Array.isArray(payload.milestones) ? payload.milestones : []
  let mPos = 0
  for (const m of milestones) {
    const title = String(m.title ?? '').trim()
    if (!title) continue
    const res = await q(
      'INSERT INTO project_template_milestones (template_id, title, position) VALUES (:tid, :title, :pos)',
      { tid: templateId, title, pos: mPos }
    )
    const milestoneId = res.insertId
    mPos += 1
    let tPos = 0
    for (const t of (Array.isArray(m.tasks) ? m.tasks : [])) {
      const tt = String(t.title ?? '').trim()
      if (!tt) continue
      await q(
        'INSERT INTO project_template_tasks (template_id, template_milestone_id, title, position) VALUES (:tid, :mid, :title, :pos)',
        { tid: templateId, mid: milestoneId, title: tt, pos: tPos }
      )
      tPos += 1
    }
  }
  // Milestone-less "General" tasks.
  let gPos = 0
  for (const t of (Array.isArray(payload.general) ? payload.general : [])) {
    const tt = String(t.title ?? '').trim()
    if (!tt) continue
    await q(
      'INSERT INTO project_template_tasks (template_id, template_milestone_id, title, position) VALUES (:tid, NULL, :title, :pos)',
      { tid: templateId, title: tt, pos: gPos }
    )
    gPos += 1
  }
}

// Create (id=null) or replace-all (id set) a template + its nested structure in
// one transaction. When is_default is set, clears the flag on other templates
// of the same type first.
export async function saveTemplate(id, payload) {
  const fields = {
    name: String(payload.name ?? '').trim(),
    description: payload.description ? String(payload.description).trim() : null,
    project_type_id: payload.project_type_id ?? null,
    is_default: payload.is_default ? 1 : 0,
    is_active: payload.is_active === false ? 0 : 1,
    sort_order: Number(payload.sort_order) || 0
  }

  const savedId = await withTransaction(async (q) => {
    let templateId = id
    if (templateId) {
      await q(
        `UPDATE project_templates SET name = :name, description = :description,
           project_type_id = :project_type_id, is_default = :is_default,
           is_active = :is_active, sort_order = :sort_order WHERE id = :id`,
        { ...fields, id: templateId }
      )
      // Replace-all: drop children (tasks cascade from milestones, but general
      // tasks have no milestone parent, so clear the task table for this template).
      await q('DELETE FROM project_template_tasks WHERE template_id = :id', { id: templateId })
      await q('DELETE FROM project_template_milestones WHERE template_id = :id', { id: templateId })
    } else {
      const res = await q(
        `INSERT INTO project_templates (name, description, project_type_id, is_default, is_active, sort_order)
         VALUES (:name, :description, :project_type_id, :is_default, :is_active, :sort_order)`,
        fields
      )
      templateId = res.insertId
    }
    // Only one default per type.
    if (fields.is_default && fields.project_type_id) {
      await q(
        'UPDATE project_templates SET is_default = 0 WHERE project_type_id = :tid AND id <> :id',
        { tid: fields.project_type_id, id: templateId }
      )
    }
    await insertStructure(q, templateId, payload)
    return templateId
  })
  return getTemplate(savedId)
}

export async function deleteTemplate(id) {
  const res = await query('DELETE FROM project_templates WHERE id = :id', { id })
  return res.affectedRows > 0
}

/**
 * Seed a project's delivery plan from a template. Runs on the caller's
 * transaction runner `q` (so it shares createProject's transaction): copies the
 * template milestones into project_milestones (capturing a template→new id map),
 * then copies template tasks into tasks under the mapped milestone (NULL-milestone
 * tasks land as milestone-less "General" tasks). Seeded tasks take task defaults.
 */
export async function applyTemplateToProject(q, templateId, projectId) {
  const milestones = await q(
    `SELECT id, title, position FROM project_template_milestones
      WHERE template_id = :tid ORDER BY position ASC, id ASC`,
    { tid: templateId }
  )
  const idMap = new Map()
  for (const m of milestones) {
    const res = await q(
      'INSERT INTO project_milestones (project_id, title, position) VALUES (:pid, :title, :position)',
      { pid: projectId, title: m.title, position: m.position }
    )
    idMap.set(m.id, res.insertId)
  }
  const tasks = await q(
    `SELECT template_milestone_id, title, position FROM project_template_tasks
      WHERE template_id = :tid ORDER BY position ASC, id ASC`,
    { tid: templateId }
  )
  for (const t of tasks) {
    const milestoneId = t.template_milestone_id != null ? (idMap.get(t.template_milestone_id) ?? null) : null
    await q(
      'INSERT INTO tasks (project_id, milestone_id, title, position) VALUES (:pid, :mid, :title, :position)',
      { pid: projectId, mid: milestoneId, title: t.title, position: t.position }
    )
  }
}
