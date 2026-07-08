import { Router } from 'express'
import { getTask, listTasks, listChecklist, TASK_STATUSES, TASK_PRIORITIES } from '../repositories/tasks.repo.js'
import { createTask, updateTask, deleteTask, addChecklistItem, updateChecklistItem, deleteChecklistItem } from '../services/tasks.service.js'
import { getProject } from '../repositories/projects.repo.js'

export const tasksRouter = Router()

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

function validateTask(body, { partial = false } = {}) {
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
  if (body.status !== undefined) {
    if (!TASK_STATUSES.has(body.status)) fields.status = `must be one of ${[...TASK_STATUSES].join(', ')}`
    else data.status = body.status
  }
  if (body.priority !== undefined) {
    if (!TASK_PRIORITIES.has(body.priority)) fields.priority = `must be one of ${[...TASK_PRIORITIES].join(', ')}`
    else data.priority = body.priority
  }
  if (body.due_date !== undefined) {
    if (body.due_date === null || body.due_date === '') data.due_date = null
    else if (typeof body.due_date !== 'string' || Number.isNaN(Date.parse(body.due_date))) fields.due_date = 'must be a valid date'
    else data.due_date = body.due_date.slice(0, 10)
  }
  if (body.position !== undefined) {
    const n = Number(body.position)
    if (!Number.isInteger(n) || n < 0) fields.position = 'must be a non-negative integer'
    else data.position = n
  }
  if (body.project_id !== undefined) {
    if (body.project_id === null) data.project_id = null
    else {
      const n = Number(body.project_id)
      if (!Number.isInteger(n) || n <= 0) fields.project_id = 'must be a valid project id or null'
      else data.project_id = n
    }
  }

  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)
  return data
}

// GET /api/tasks  ?project_id= ?no_project=1 ?status= ?overdue=1 ?due=today
tasksRouter.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !TASK_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listTasks({
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    noProject: req.query.no_project === '1' || req.query.no_project === 'true',
    status,
    overdue: req.query.overdue === '1' || req.query.overdue === 'true',
    dueToday: req.query.due === 'today',
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/tasks/:id
tasksRouter.get('/:id', async (req, res) => {
  const task = await getTask(parseId(req))
  if (!task) return res.status(404).json({ error: { message: 'Task not found' } })
  res.json({ data: task })
})

// POST /api/tasks — project_id optional (null = standalone).
tasksRouter.post('/', async (req, res) => {
  const data = validateTask(req.body ?? {}, { partial: false })
  if (data.project_id) {
    const project = await getProject(data.project_id)
    if (!project) throw badRequest('Validation failed', { project_id: 'project not found' })
  }
  const task = await createTask(data)
  res.status(201).json({ data: task })
})

// PATCH /api/tasks/:id
tasksRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getTask(id)
  if (!existing) return res.status(404).json({ error: { message: 'Task not found' } })
  const data = validateTask(req.body ?? {}, { partial: true })
  if (data.project_id) {
    const project = await getProject(data.project_id)
    if (!project) throw badRequest('Validation failed', { project_id: 'project not found' })
  }
  const task = await updateTask(id, data)
  res.json({ data: task })
})

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', async (req, res) => {
  const ok = await deleteTask(parseId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Task not found' } })
  res.json({ ok: true })
})

// ---- checklist items (a flat checklist under a task) ----
function parseItemId(req) {
  const id = Number(req.params.itemId)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid item id')
  return id
}

// GET /api/tasks/:id/checklist
tasksRouter.get('/:id/checklist', async (req, res) => {
  const task = await getTask(parseId(req))
  if (!task) return res.status(404).json({ error: { message: 'Task not found' } })
  res.json({ data: await listChecklist(task.id) })
})

// POST /api/tasks/:id/checklist  { title }
tasksRouter.post('/:id/checklist', async (req, res) => {
  const id = parseId(req)
  const task = await getTask(id)
  if (!task) return res.status(404).json({ error: { message: 'Task not found' } })
  const title = String(req.body?.title ?? '').trim()
  if (!title) throw badRequest('Validation failed', { title: 'title is required' })
  res.status(201).json({ data: await addChecklistItem(id, title) })
})

// PATCH /api/tasks/:id/checklist/:itemId  { done?, title? }
tasksRouter.patch('/:id/checklist/:itemId', async (req, res) => {
  const data = {}
  if (req.body?.done !== undefined) data.done = !!req.body.done
  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim()
    if (!title) throw badRequest('Validation failed', { title: 'title is required' })
    data.title = title
  }
  const item = await updateChecklistItem(parseItemId(req), data)
  if (!item) return res.status(404).json({ error: { message: 'Checklist item not found' } })
  res.json({ data: item })
})

// DELETE /api/tasks/:id/checklist/:itemId
tasksRouter.delete('/:id/checklist/:itemId', async (req, res) => {
  const ok = await deleteChecklistItem(parseItemId(req))
  if (!ok) return res.status(404).json({ error: { message: 'Checklist item not found' } })
  res.json({ ok: true })
})
