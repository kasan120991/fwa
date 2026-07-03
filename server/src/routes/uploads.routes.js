import { Router } from 'express'
import { upload } from '../storage/local.js'

export const uploadsRouter = Router()

// POST /api/uploads — store a single file (field name "file"), return its
// public path + metadata. The path is relative (/uploads/<name>); the client
// resolves it against the API origin when rendering.
uploadsRouter.post(
  '/',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const e = new Error(err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : (err.message || 'Upload failed'))
        e.status = 400
        return next(e)
      }
      next()
    })
  },
  (req, res, next) => {
    if (!req.file) {
      const err = new Error('No file provided (expected field "file")')
      err.status = 400
      return next(err)
    }
    res.status(201).json({
      data: {
        path: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype
      }
    })
  }
)
