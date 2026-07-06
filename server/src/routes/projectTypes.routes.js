import { Router } from 'express'
import { listProjectTypes } from '../repositories/projectTypes.repo.js'

export const projectTypesRouter = Router()

// GET /api/project-types — active project kinds, to populate the project form's
// type select. Read-only for now (managed via seed/SQL).
projectTypesRouter.get('/', async (req, res) => {
  const includeInactive = req.query.all === '1' || req.query.all === 'true'
  const rows = await listProjectTypes({ activeOnly: !includeInactive })
  res.json({ data: rows })
})
