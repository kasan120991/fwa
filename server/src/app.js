import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { config } from './config/env.js'
import { apiRouter } from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

/** Build the Express app (kept separate from `listen` for testability). */
export function createApp() {
  const app = express()

  app.use(express.json())
  app.use(cors({ origin: config.corsOrigin }))
  if (config.nodeEnv !== 'test') app.use(morgan('dev'))

  app.use('/api', apiRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
