import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)

// Resource routers mount here next (step 2 of the build order):
//   apiRouter.use('/contacts', contactsRouter)  // Leads + Clients
//   apiRouter.use('/calls', callsRouter)         // AI Receptionist
