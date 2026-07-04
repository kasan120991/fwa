import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { config } from './config/env.js'
import { apiRouter } from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

/** Build the Express app (kept separate from `listen` for testability). */
export function createApp() {
  const app = express()

  // Behind a proxy in prod, so req.ip / secure cookies resolve correctly.
  app.set('trust proxy', 1)

  // Stripe webhooks need the raw body for signature verification, so parse it as
  // a Buffer for that one path before the JSON parser claims it.
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
  app.use(express.json())
  app.use(cookieParser())
  // credentials:true so the session cookie flows on cross-origin XHR from the frontend.
  app.use(cors({ origin: config.corsOrigin, credentials: true }))
  if (config.nodeEnv !== 'test') app.use(morgan('dev'))

  // Uploaded files, served publicly by their unguessable random name. Kept
  // outside the auth-gated /api tree so <img>/downloads work cross-origin
  // without the session cookie. Writes still go through POST /api/uploads.
  app.use('/uploads', express.static(config.uploads.dir, {
    index: false,
    maxAge: '1y',
    immutable: true
  }))

  app.use('/api', apiRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
