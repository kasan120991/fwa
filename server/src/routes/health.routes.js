import { Router } from 'express'
import { pingDb } from '../db/pool.js'

export const healthRouter = Router()

healthRouter.get('/', async (req, res) => {
  let db = 'down'
  try {
    await pingDb()
    db = 'up'
  } catch {
    db = 'down'
  }

  res.json({
    status: 'ok',
    db,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
})
