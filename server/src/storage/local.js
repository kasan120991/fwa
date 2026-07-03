// Local-disk file storage. A general upload primitive (logos now; the Files
// feature will reuse it). Files are written to config.uploads.dir under a
// random, unguessable name and served publicly as static assets (see app.js).
// Writes go through POST /api/uploads (auth-gated); reads are public by URL.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { config } from '../config/env.js'

export const uploadsDir = config.uploads.dir

// Ensure the directory exists at startup (idempotent).
fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Random name + sanitized original extension. The random stem prevents
    // collisions and makes URLs unguessable (capability-style access).
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12)
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`)
  }
})

export const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes }
})
