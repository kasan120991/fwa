import { Router } from 'express'
import { listMilestones, getMilestone, MILESTONE_STATES } from '../repositories/milestones.repo.js'
import { createMilestone, updateMilestone, deleteMilestone, reorderMilestones } from '../services/milestones.service.js'
import { getProject } from '../repositories/projects.repo.js'

export const milestonesRouter = Router()

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
function parseProjectId(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function validateMilestone(body, { partial = false } = {}) {
  const data = {}
  const fields = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) fields.title = 'title is required'
    else data.title = title
  } else if (!partial) {
    fields.title = 'title is required'
  }

  if (body.description !== undefined) data.description = body.description == null ? null : String(body.description)
  if (body.state !== undefined) {
    if (!MILESTONE_STATES.has(body.state)) fields.state = `must be one of ${[...MILESTONE_STATES].join(', ')}`
    else data.state = body.state
  }
  if (body.target_date !== undefined) {
    if (body.target_date === null || body.target_date === '') data.target_date = null
    else if (typeof body.target_date !== 'string' || Number.isNaN(Date.parse(body.target_date))) fields.target_date = 'must be a valid date'
    else data.target_date = body.target_date.slice(0, 10)
  }
  if (body.position !== undefined) {
    const n = Number(body.position)
    if (!Number.isInteger(n) || n < 0) fields.position = 'must be a non-negative integer'
    else data.position = n
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

// GET /api/milestones?project_id=  — all milestones for a project (with rollup)
milestonesRouter.get('/', async (req, res) => {
  const project_id = parseProjectId(req.query.project_id)
  if (!project_id) throw badRequest('project_id is required')
  res.json({ data: await listMilestones(project_id) })
})

// POST /api/milestones  { project_id, title, description?, state?, target_date?, position? }
milestonesRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const project_id = parseProjectId(body.project_id)
  if (!project_id) throw badRequest('Validation failed', { project_id: 'project_id is required' })
  const project = await getProject(project_id)
  if (!project) throw badRequest('Validation failed', { project_id: 'project not found' })
  const data = validateMilestone(body, { partial: false })
  data.project_id = project_id
  res.status(201).json({ data: await createMilestone(data) })
})

// PATCH /api/milestones/reorder  { project_id, order: [id, ...] }
// Registered before /:id so the literal path wins.
milestonesRouter.patch('/reorder', async (req, res) => {
  const body = req.body ?? {}
  const project_id = parseProjectId(body.project_id)
  if (!project_id) throw badRequest('Validation failed', { project_id: 'project_id is required' })
  const order = Array.isArray(body.order) ? body.order.map(Number) : null
  if (!order || !order.length || order.some(n => !Number.isInteger(n) || n <= 0)) {
    throw badRequest('Validation failed', { order: 'order must be a non-empty array of milestone ids' })
  }
  res.json({ data: await reorderMilestones(project_id, order) })
})

// GET /api/milestones/:id
milestonesRouter.get('/:id', async (req, res) => {
  const milestone = await getMilestone(parseId(req))
  if (!milestone) return res.status(404).json({ error: { message: 'Milestone not found' } })
  res.json({ data: milestone })
})

// PATCH /api/milestones/:id
milestonesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getMilestone(id)
  if (!existing) return res.status(404).json({ error: { message: 'Milestone not found' } })
  const data = validateMilestone(req.body ?? {}, { partial: true })
  res.json({ data: await updateMilestone(id, data) })
})

// DELETE /api/milestones/:id  — its tasks fall back to the project's General bucket.
milestonesRouter.delete('/:id', async (req, res) => {
  const ok = await deleteMilestone(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Milestone not found' } })
  res.json({ ok: true })
})
