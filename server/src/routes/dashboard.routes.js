import { Router } from 'express'
import { dashboardSummary } from '../repositories/dashboard.repo.js'

export const dashboardRouter = Router()

// GET /api/dashboard/summary — KPI numbers for the dashboard stat cards.
dashboardRouter.get('/summary', async (req, res) => {
  res.json({ data: await dashboardSummary() })
})
