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
import { webhooksRouter } from './webhooks.routes.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
// Stripe webhooks — verified by signature, not the session cookie (ungated).
apiRouter.use('/webhooks', webhooksRouter)

// Admin-only resource routers.
apiRouter.use('/leads', requireAuth, leadsRouter) // Leads (top of funnel)
apiRouter.use('/clients', requireAuth, clientsRouter) // Clients (converted parties)
apiRouter.use('/calls', requireAuth, callsRouter) // AI Receptionist
apiRouter.use('/services', requireAuth, servicesRouter) // price book / catalog
apiRouter.use('/proposals', requireAuth, proposalsRouter) // Sales — proposals
apiRouter.use('/contracts', requireAuth, contractsRouter) // Sales — contracts
apiRouter.use('/agreements', requireAuth, agreementsRouter) // Agreements (merged view)
apiRouter.use('/projects', requireAuth, projectsRouter) // Projects (SOW hub)
apiRouter.use('/tasks', requireAuth, tasksRouter) // Tasks
apiRouter.use('/project-types', requireAuth, projectTypesRouter) // Project type catalog
apiRouter.use('/invoices', requireAuth, invoicesRouter) // Billing — invoices
apiRouter.use('/payments', requireAuth, paymentsRouter) // Billing — payments
apiRouter.use('/expenses', requireAuth, expensesRouter) // Billing — expenses (money out)
apiRouter.use('/dashboard', requireAuth, dashboardRouter) // Dashboard KPIs
apiRouter.use('/search', requireAuth, searchRouter) // Global command-palette search
apiRouter.use('/websites', requireAuth, websitesRouter) // Websites (cross-client analytics)
apiRouter.use('/tickets', requireAuth, ticketsRouter) // Support tickets
apiRouter.use('/notifications', requireAuth, notificationsRouter) // top-bar alert feed
apiRouter.use('/uploads', requireAuth, uploadsRouter) // file storage (logos, files)
apiRouter.use('/files', requireAuth, filesRouter) // Workspace — Files library
