import { Router } from 'express'
import { globalSearch } from '../repositories/search.repo.js'

export const searchRouter = Router()

// GET /api/search?q=&limit= — cross-entity global search for the command palette.
searchRouter.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  const data = await globalSearch(q, limit)
  res.json({ data })
})
