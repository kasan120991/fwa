import { Router } from 'express'
import { listProjects, getProject } from '../repositories/projects.repo.js'
import { listMilestones } from '../repositories/milestones.repo.js'
import { listInvoices } from '../repositories/invoices.repo.js'
import { listTickets } from '../repositories/tickets.repo.js'
import { getClient } from '../repositories/clients.repo.js'

// Client-portal API. Mounted behind requirePortal, so req.clientId is always the
// logged-in client's own id — every query is scoped to it, never to a param.
export const portalRouter = Router()

function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Invalid id')
    err.status = 400
    throw err
  }
  return id
}

const num = v => (v == null ? 0 : Number(v))
const OPEN_TICKET_STATES = new Set(['open', 'in_progress', 'waiting'])

// GET /api/portal/overview — the logged-in client's own at-a-glance summary.
portalRouter.get('/overview', async (req, res) => {
  const clientId = req.clientId
  const [client, projects, invoices, tickets] = await Promise.all([
    getClient(clientId),
    listProjects({ client_id: clientId, limit: 500 }),
    listInvoices({ client_id: clientId, limit: 500 }),
    listTickets({ client_id: clientId, limit: 500 })
  ])
  const activeProjects = projects.rows.filter(p => p.status !== 'completed').length
  const outstanding = invoices.rows
    .filter(i => i.status === 'open')
    .reduce((sum, i) => sum + (num(i.amount_due) - num(i.amount_paid)), 0)
  const openTickets = tickets.rows.filter(t => OPEN_TICKET_STATES.has(t.status)).length

  res.json({
    data: {
      client: client ? { id: client.id, name: client.name, company: client.company } : null,
      active_projects: activeProjects,
      outstanding_balance: outstanding,
      open_tickets: openTickets
    }
  })
})

// GET /api/portal/projects — the client's own projects.
portalRouter.get('/projects', async (req, res) => {
  const result = await listProjects({ client_id: req.clientId, limit: 200 })
  res.json({ data: result.rows })
})

// GET /api/portal/projects/:id — a project + its milestone timeline. 404 (not
// 403) for a project that isn't the caller's, so ids aren't probeable.
portalRouter.get('/projects/:id', async (req, res) => {
  const project = await getProject(parseId(req))
  if (!project || Number(project.client_id) !== req.clientId) {
    return res.status(404).json({ error: { message: 'Project not found' } })
  }
  const milestones = await listMilestones(project.id)
  res.json({ data: { project, milestones } })
})
