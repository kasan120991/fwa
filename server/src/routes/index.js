import { Router } from 'express'
import { healthRouter } from './health.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)

// Resource routers mount here next (step 2 of the build order):
//   apiRouter.use('/contacts', contactsRouter)  // Leads + Clients
//   apiRouter.use('/calls', callsRouter)         // AI Receptionist
