import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { leadsRouter } from './leads.routes.js'
import { clientsRouter } from './clients.routes.js'
import { callsRouter } from './calls.routes.js'
import { servicesRouter } from './services.routes.js'
import { proposalsRouter } from './proposals.routes.js'
import { contractsRouter } from './contracts.routes.js'
import { agreementsRouter } from './agreements.routes.js'
import { projectsRouter } from './projects.routes.js'
import { tasksRouter } from './tasks.routes.js'
import { milestonesRouter } from './milestones.routes.js'
import { projectTypesRouter } from './projectTypes.routes.js'
import { invoicesRouter } from './invoices.routes.js'
import { paymentsRouter } from './payments.routes.js'
import { expensesRouter } from './expenses.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { searchRouter } from './search.routes.js'
import { websitesRouter } from './websites.routes.js'
import { ticketsRouter } from './tickets.routes.js'
import { notificationsRouter } from './notifications.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { filesRouter } from './files.routes.js'
import { portalRouter } from './portal.routes.js'
import { webhooksRouter } from './webhooks.routes.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requirePortal } from '../middleware/requirePortal.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
// Stripe webhooks — verified by signature, not the session cookie (ungated).
apiRouter.use('/webhooks', webhooksRouter)

// Admin-only resource routers.
apiRouter.use('/leads', requireAdmin, leadsRouter) // Leads (top of funnel)
apiRouter.use('/clients', requireAdmin, clientsRouter) // Clients (converted parties)
apiRouter.use('/calls', requireAdmin, callsRouter) // AI Receptionist
apiRouter.use('/services', requireAdmin, servicesRouter) // price book / catalog
apiRouter.use('/proposals', requireAdmin, proposalsRouter) // Sales — proposals
apiRouter.use('/contracts', requireAdmin, contractsRouter) // Sales — contracts
apiRouter.use('/agreements', requireAdmin, agreementsRouter) // Agreements (merged view)
apiRouter.use('/projects', requireAdmin, projectsRouter) // Projects (SOW hub)
apiRouter.use('/tasks', requireAdmin, tasksRouter) // Tasks
apiRouter.use('/milestones', requireAdmin, milestonesRouter) // Delivery milestones (over tasks)
apiRouter.use('/project-types', requireAdmin, projectTypesRouter) // Project type catalog
apiRouter.use('/invoices', requireAdmin, invoicesRouter) // Billing — invoices
apiRouter.use('/payments', requireAdmin, paymentsRouter) // Billing — payments
apiRouter.use('/expenses', requireAdmin, expensesRouter) // Billing — expenses (money out)
apiRouter.use('/dashboard', requireAdmin, dashboardRouter) // Dashboard KPIs
apiRouter.use('/search', requireAdmin, searchRouter) // Global command-palette search
apiRouter.use('/websites', requireAdmin, websitesRouter) // Websites (cross-client analytics)
apiRouter.use('/tickets', requireAdmin, ticketsRouter) // Support tickets
apiRouter.use('/notifications', requireAdmin, notificationsRouter) // top-bar alert feed
apiRouter.use('/uploads', requireAdmin, uploadsRouter) // file storage (logos, files)
apiRouter.use('/files', requireAdmin, filesRouter) // Workspace — Files library

// Client-portal API — gated by requirePortal (role='client' + linked client_id),
// every query hard-scoped to req.clientId. Isolated from the admin routers above.
apiRouter.use('/portal', requirePortal, portalRouter)
