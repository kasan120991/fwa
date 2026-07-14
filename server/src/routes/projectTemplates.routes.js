import { Router } from 'express'
import { listTemplates, getTemplate } from '../repositories/projectTemplates.repo.js'
import { saveTemplate, deleteTemplate } from '../services/projectTemplates.service.js'

export const projectTemplatesRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}

// Normalize + validate the full nested template payload (create + replace-all).
function validateTemplate(body) {
  const fields = {}
  const name = String(body.name ?? '').trim()
  if (!name) fields.name = 'name is required'

  let project_type_id = null
  if (body.project_type_id != null && body.project_type_id !== '') {
    const n = Number(body.project_type_id)
    if (!Number.isInteger(n) || n <= 0) fields.project_type_id = 'must be a valid project type'
    else project_type_id = n
  }

  const cleanTasks = arr => (Array.isArray(arr) ? arr : [])
    .map(t => ({ title: String(t?.title ?? '').trim() }))
    .filter(t => t.title)

  const milestones = (Array.isArray(body.milestones) ? body.milestones : [])
    .map(m => ({ title: String(m?.title ?? '').trim(), tasks: cleanTasks(m?.tasks) }))
    .filter(m => m.title)
  const general = cleanTasks(body.general)

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  return {
    name,
    description: body.description ? String(body.description).trim() : null,
    project_type_id,
    is_default: !!body.is_default,
    is_active: body.is_active === false ? false : true,
    sort_order: Number(body.sort_order) || 0,
    milestones,
    general
  }
}

// GET /api/project-templates?active=1&project_type_id=
projectTemplatesRouter.get('/', async (req, res) => {
  const opts = {}
  if (req.query.active === '1' || req.query.active === 'true') opts.activeOnly = true
  if (req.query.project_type_id) {
    const n = Number(req.query.project_type_id)
    if (Number.isInteger(n) && n > 0) opts.project_type_id = n
  }
  res.json({ data: await listTemplates(opts) })
})

// GET /api/project-templates/:id  — nested (milestones + tasks + general)
projectTemplatesRouter.get('/:id', async (req, res) => {
  const template = await getTemplate(parseId(req))
  if (!template) return res.status(404).json({ error: { message: 'Template not found' } })
  res.json({ data: template })
})

// POST /api/project-templates  — create with nested structure
projectTemplatesRouter.post('/', async (req, res) => {
  const data = validateTemplate(req.body ?? {})
  res.status(201).json({ data: await saveTemplate(null, data) })
})

// PUT /api/project-templates/:id  — replace-all
projectTemplatesRouter.put('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getTemplate(id)
  if (!existing) return res.status(404).json({ error: { message: 'Template not found' } })
  const data = validateTemplate(req.body ?? {})
  res.json({ data: await saveTemplate(id, data) })
})

// DELETE /api/project-templates/:id
projectTemplatesRouter.delete('/:id', async (req, res) => {
  const ok = await deleteTemplate(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Template not found' } })
  res.json({ ok: true })
})
