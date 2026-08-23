import { Router } from 'express'
import { config } from '../config/env.js'
import {
  isConfigured, syncAllClickup, reconcileClient, ensureClientSpace, ensureProjectTask, pushProjectTasks
} from '../services/clickupSync.js'
import { ensureMilestoneField, missingMilestoneOptions } from '../services/clickupProvision.js'
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
  const field = await ensureMilestoneField()
  const [linked, unlinked] = await Promise.all([listSyncableClients(), listUnlinkedClients(100)])
  const [[{ unlinkedProjects }]] = [await query(
    "SELECT COUNT(*) AS unlinkedProjects FROM projects WHERE clickup_task_id IS NULL AND status <> 'completed'"
  )]
  res.json({
    data: {
      configured: true,
      spaceId: config.clickup.spaceId,
      teamId: config.clickup.teamId,
      webhook: Boolean(config.clickup.webhookSecret),
      remoteDeletes: config.clickup.allowRemoteDeletes,
      milestoneField: {
        name: config.clickup.milestoneFieldName,
        found: Boolean(field.field_id),
        options: field.options.map(o => o.name),
        // Custom fields can be created via the API but not updated (PUT is a
        // hard 405), so a milestone added after the field was created has to
        // be added to the dropdown by hand in ClickUp.
        missing: await missingMilestoneOptions()
      },
      linkedClients: linked.length,
      unlinkedClients: unlinked.length,
      unlinkedProjects: Number(unlinkedProjects)
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
  const link = await ensureProjectTask(project)
  if (!link.linked) return res.json({ data: link })
  res.json({ data: { ...link, ...(await pushProjectTasks(id)) } })
})

// POST /api/clickup/backfill — push every active client and its projects up.
// Sequential on purpose: ClickUp allows ~100 requests/minute per token, and
// parallel creates also produce a nondeterministic subtask order.
clickupRouter.post('/backfill', async (req, res) => {
  if (!isConfigured()) return res.json({ data: { configured: false } })
  const clients = await query(
    "SELECT id, name, company FROM clients WHERE status = 'active' ORDER BY id"
  )
  const out = { clients: 0, projects: 0, tasks: 0, errors: [] }
  for (const c of clients) {
    const space = await ensureClientSpace(c.id)
    if (!space.linked) { out.errors.push(`${c.company || c.name}: ${space.error ?? space.reason ?? 'not linked'}`); continue }
    out.clients++
    const projects = await query('SELECT id FROM projects WHERE client_id = :id ORDER BY id', { id: c.id })
    for (const p of projects) {
      const link = await ensureProjectTask(p.id)
      if (!link.linked) { out.errors.push(`Project ${p.id}: ${link.error ?? link.reason}`); continue }
      out.projects++
      out.tasks += (await pushProjectTasks(p.id)).pushed
    }
  }
  res.json({ data: out })
})
