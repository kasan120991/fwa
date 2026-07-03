import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { contactsRouter } from './contacts.routes.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)

// Contacts (Leads + Clients) — admin only.
apiRouter.use('/contacts', requireAuth, contactsRouter)

// Calls (AI Receptionist) router mounts here next.
//   apiRouter.use('/calls', requireAuth, callsRouter)
