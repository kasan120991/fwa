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

// Allowlist for UNTRUSTED (client-portal) uploads. Admin uploads stay unrestricted
// via `upload`; portal uploads must match both an allowed extension and MIME family
// — no executables/scripts/HTML/SVG (SVG can carry script and is served inline).
const ALLOWED_EXT = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip'
])
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/csv',
  'application/zip', 'application/x-zip-compressed'
])

export function isAllowedUpload(originalname, mime) {
  const ext = path.extname(originalname || '').toLowerCase()
  return ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(mime)
}

export const portalUpload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (req, file, cb) => {
    if (isAllowedUpload(file.originalname, file.mimetype)) return cb(null, true)
    const err = new Error('That file type isn\'t allowed. Use a PDF, image, document, or zip.')
    err.status = 400
    cb(err)
  }
})
