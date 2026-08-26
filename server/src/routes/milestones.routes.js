import { Router } from 'express'
import { config } from '../config/env.js'
import { listMilestones, getMilestone, MILESTONE_STATES } from '../repositories/milestones.repo.js'
import { createMilestone, updateMilestone, deleteMilestone, reorderMilestones } from '../services/milestones.service.js'
import { getProject } from '../repositories/projects.repo.js'
import { pushMilestone } from '../services/clickupProvision.js'
import * as clickupApi from '../services/clickup.js'
import { setProjectSyncError } from '../repositories/clickup.repo.js'

export const milestonesRouter = Router()

// Push a milestone up to ClickUp after the response is shaped. Fire-and-forget
// for the same reason task pushes are (routes/tasks.routes.js): a ClickUp
// outage must never fail the business action, and a 15s HTTP timeout must never
// be added to a save. Failures land in project_milestones.clickup_sync_error
// and the sweep's drift check re-converges.
//
// Deliberately here in the route layer, not in milestones.service: that service
// is also reached from the pull path via deliveryChanged, and pushing from
// there would be a write on every sync pass.
function pushLater(milestoneId) {
  pushMilestone(milestoneId).catch(err => console.error(`[clickup] push milestone ${milestoneId}:`, err.message))
}

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
  // Setting `state` pins the milestone (the repo flips state_manual). Pass
  // state_manual: false explicitly to hand it back to auto-pilot, which
  // recomputes it from the task rollup on the next task change.
  if (body.state_manual !== undefined) {
    data.state_manual = body.state_manual ? 1 : 0
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
  const milestone = await createMilestone(data)
  res.status(201).json({ data: milestone })
  pushLater(milestone.id)
})

// PATCH /api/milestones/reorder  { project_id, order: [id, ...] }
// Registered before /:id so the literal path wins.
//
// ClickUp cannot be reordered: `orderindex` is server-assigned from creation
// time and the API accepts then silently ignores it (their FAQ: tasks "no
// longer use the order_index"), and subtasks can't be dragged inside a task
// card either. A phase's position is therefore carried in its NAME — "1.
// Discovery", "2. Design" — so a reorder has to rename the phases whose rank
// moved. Only those: swapping two adjacent phases is two renames, not N.
milestonesRouter.patch('/reorder', async (req, res) => {
  const body = req.body ?? {}
  const project_id = parseProjectId(body.project_id)
  if (!project_id) throw badRequest('Validation failed', { project_id: 'project_id is required' })
  const order = Array.isArray(body.order) ? body.order.map(Number) : null
  if (!order || !order.length || order.some(n => !Number.isInteger(n) || n <= 0)) {
    throw badRequest('Validation failed', { order: 'order must be a non-empty array of milestone ids' })
  }
  const before = (await listMilestones(project_id)).map(m => m.id)
  const after = await reorderMilestones(project_id, order)
  res.json({ data: after })
  after.forEach((m, i) => { if (before[i] !== m.id) pushLater(m.id) })
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
  // position alone never reaches ClickUp (see the reorder route above).
  if (['title', 'description', 'target_date', 'state', 'state_manual'].some(f => f in data)) pushLater(id)
})

// DELETE /api/milestones/:id  — its tasks fall back to the project's General bucket.
milestonesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req)
  // Read the link ids BEFORE the delete: the service nulls tasks.milestone_id
  // and drops the row (same shape as the task and project deletes).
  const existing = await getMilestone(id)
  const msTaskId = existing?.clickup_task_id ?? null
  const projectTaskId = msTaskId ? (await getProject(existing.project_id))?.clickup_task_id ?? null : null

  const ok = await deleteMilestone(id)
  if (!ok) return res.status(404).json({ error: { message: 'Milestone not found' } })

  // Awaited, not fire-and-forget, and for the same reason the task delete is:
  // a surviving remote task gets mirrored straight back on the next sweep.
  // Costs one call per child plus two (~3s for a full phase) — acceptable
  // behind a destructive action.
  if (msTaskId && projectTaskId && config.clickup.allowRemoteDeletes) {
    try {
      // Re-parent the children UP to the project task first. Deleting a task in
      // ClickUp cascades, but Ops semantics are "its tasks fall back to
      // General" — and a direct child of the project task is exactly what the
      // classifier reads as a milestone-less work item. The two line up with no
      // special casing.
      const remote = await clickupApi.getTask(msTaskId)
      for (const s of (remote.subtasks ?? []).filter(s => String(s.parent) === String(msTaskId))) {
        await clickupApi.updateTask(s.id, { parent: projectTaskId })
      }
      await clickupApi.deleteTask(msTaskId)
    } catch (err) {
      // Never delete after a partial re-parent: an orphaned milestone task in
      // ClickUp is recoverable (the sweep adopts it as a General task and
      // reports its children), destroyed work items are not.
      console.error(`[clickup] delete milestone task ${msTaskId}:`, err.message)
      await setProjectSyncError(existing.project_id,
        `Milestone task ${msTaskId} left in ClickUp — re-parent failed`)
    }
  }
  res.json({ ok: true })
})
