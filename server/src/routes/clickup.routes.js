import { Router } from 'express'
import { config } from '../config/env.js'
import {
  isConfigured, syncAllClickup, reconcileClient, ensureClientSpace,
  pushProjectTasks, pushProjectMilestones, pushProject
} from '../services/clickupSync.js'

import { getClient } from '../repositories/clients.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import { listSyncableClients, listUnlinkedClients } from '../repositories/clickup.repo.js'
import { query } from '../db/pool.js'

export const clickupRouter = Router()

function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Invalid id'); err.status = 400; throw err
  }
  return id
}

// GET /api/clickup/status — connection + drift, for the Settings panel.
clickupRouter.get('/status', async (req, res) => {
  if (!isConfigured()) return res.json({ data: { configured: false } })
  const [linked, unlinked] = await Promise.all([listSyncableClients(), listUnlinkedClients(100)])
  const [[{ unlinkedProjects }]] = [await query(
    "SELECT COUNT(*) AS unlinkedProjects FROM projects WHERE clickup_task_id IS NULL AND status <> 'completed'"
  )]
  const [[milestones]] = [await query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(m.clickup_task_id IS NULL), 0) AS unlinked
       FROM project_milestones m JOIN projects p ON p.id = m.project_id
      WHERE p.status <> 'completed'`
  )]
  res.json({
    data: {
      configured: true,
      spaceId: config.clickup.spaceId,
      teamId: config.clickup.teamId,
      webhook: Boolean(config.clickup.webhookSecret),
      remoteDeletes: config.clickup.allowRemoteDeletes,
      linkedClients: linked.length,
      unlinkedClients: unlinked.length,
      unlinkedProjects: Number(unlinkedProjects),
      // Milestones are ClickUp tasks now — a subtask of the project's task and
      // the parent of that phase's work items — so an unlinked one means a
      // phase whose work has nowhere to hang.
      milestones: Number(milestones.total),
      unlinkedMilestones: Number(milestones.unlinked)
    }
  })
})

// POST /api/clickup/sync — run the reconcile sweep now. No try/catch: Express 5
// forwards a rejection to errorHandler, and the real message is what the toast
// needs to show.
clickupRouter.post('/sync', async (req, res) => {
  res.json({ data: await syncAllClickup() })
})

// POST /api/clickup/clients/:id/sync — sweep one client's list.
clickupRouter.post('/clients/:id/sync', async (req, res) => {
  const client = await getClient(parseId(req))
  if (!client) return res.status(404).json({ error: { message: 'Client not found' } })
  res.json({ data: await reconcileClient(client) })
})

// POST /api/clickup/clients/:id/link — provision (or retry) the folder + lists.
clickupRouter.post('/clients/:id/link', async (req, res) => {
  const client = await getClient(parseId(req))
  if (!client) return res.status(404).json({ error: { message: 'Client not found' } })
  res.json({ data: await ensureClientSpace(client) })
})

// POST /api/clickup/projects/:id/link — provision the project task, then push
// any of its tasks that aren't linked yet (template seed, or created offline).
clickupRouter.post('/projects/:id/link', async (req, res) => {
  const id = parseId(req)
  const project = await getProject(id)
  if (!project) return res.status(404).json({ error: { message: 'Project not found' } })
  // pushProject ensures the task exists AND carries the current name/goals/dates
  // up — ensureProjectTask alone short-circuits on an already-linked project, so
  // an existing one would never receive its schedule.
  const link = await pushProject(id)
  if (!link.pushed) return res.json({ data: link })
  // Milestones first: a work item pushed before its phase exists would
  // provision it itself, but out of order — and a milestone with no tasks
  // would never be created at all.
  const milestones = await pushProjectMilestones(id)
  res.json({ data: { ...link, milestones: milestones.pushed, ...(await pushProjectTasks(id)) } })
})

// POST /api/clickup/backfill — push every active client and its projects up.
// Sequential on purpose: ClickUp allows ~100 requests/minute per token, and
// parallel creates also produce a nondeterministic subtask order.
clickupRouter.post('/backfill', async (req, res) => {
  if (!isConfigured()) return res.json({ data: { configured: false } })
  const clients = await query(
    "SELECT id, name, company FROM clients WHERE status = 'active' ORDER BY id"
  )
  const out = { clients: 0, projects: 0, milestones: 0, tasks: 0, errors: [] }
  for (const c of clients) {
    const space = await ensureClientSpace(c.id)
    if (!space.linked) { out.errors.push(`${c.company || c.name}: ${space.error ?? space.reason ?? 'not linked'}`); continue }
    out.clients++
    const projects = await query('SELECT id FROM projects WHERE client_id = :id ORDER BY id', { id: c.id })
    for (const p of projects) {
      const link = await pushProject(p.id)
      if (!link.pushed) { out.errors.push(`Project ${p.id}: ${link.error ?? link.reason}`); continue }
      out.projects++
      out.milestones += (await pushProjectMilestones(p.id)).pushed
      out.tasks += (await pushProjectTasks(p.id)).pushed
    }
  }
  res.json({ data: out })
})
