import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { contactsRouter } from './contacts.routes.js'
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
import { notificationsRouter } from './notifications.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { webhooksRouter } from './webhooks.routes.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
// Stripe webhooks — verified by signature, not the session cookie (ungated).
apiRouter.use('/webhooks', webhooksRouter)

// Admin-only resource routers.
apiRouter.use('/contacts', requireAuth, contactsRouter) // Leads + Clients
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
apiRouter.use('/notifications', requireAuth, notificationsRouter) // top-bar alert feed
apiRouter.use('/uploads', requireAuth, uploadsRouter) // file storage (logos, files)
