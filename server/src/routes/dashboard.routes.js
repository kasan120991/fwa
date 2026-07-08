import { Router } from 'express'
import { dashboardSummary, revenueCollected, dashboardAttention } from '../repositories/dashboard.repo.js'

export const dashboardRouter = Router()

// GET /api/dashboard/summary — KPI numbers for the dashboard stat cards.
dashboardRouter.get('/summary', async (req, res) => {
  res.json({ data: await dashboardSummary() })
})

// GET /api/dashboard/revenue?months=6|12 — monthly collected-revenue series.
dashboardRouter.get('/revenue', async (req, res) => {
  const months = Number(req.query.months) === 12 ? 12 : 6
  res.json({ data: await revenueCollected(months) })
})

// GET /api/dashboard/attention — prioritized cross-source action feed.
dashboardRouter.get('/attention', async (req, res) => {
  res.json({ data: await dashboardAttention() })
})
