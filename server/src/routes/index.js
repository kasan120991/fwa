import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { contactsRouter } from './contacts.routes.js'
import { callsRouter } from './calls.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)

// Admin-only resource routers.
apiRouter.use('/contacts', requireAuth, contactsRouter) // Leads + Clients
apiRouter.use('/calls', requireAuth, callsRouter) // AI Receptionist
apiRouter.use('/uploads', requireAuth, uploadsRouter) // file storage (logos, files)
