import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config/env.js'
import {
  listFiles, getFile, createFile, updateFile, deleteFile, FILE_CATEGORIES
} from '../repositories/files.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { getProject } from '../repositories/projects.repo.js'
import { emitFileChanged } from '../realtime/io.js'

export const filesRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}

function parseId(req, key = 'id') {
  const n = Number(req.params[key])
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id')
  return n
}

// Resolve an optional foreign-key field (client_id / project_id) from the body:
// blank/absent → null; otherwise must be a valid id pointing at an existing row.
async function resolveLink(value, { exists, label }, fields, key) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) { fields[key] = `must be a valid ${label} id`; return null }
  if (!await exists(n)) { fields[key] = `${label} not found`; return null }
  return n
}

function normCategory(value, fields) {
  if (value == null || value === '') return 'other'
  const v = String(value)
  if (!FILE_CATEGORIES.has(v)) { fields.category = 'must be a valid category'; return 'other' }
  return v
}

// GET /api/files?client_id=&project_id=&category=&q=
filesRouter.get('/', async (req, res) => {
  const files = await listFiles({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    category: req.query.category || undefined,
    q: req.query.q ? String(req.query.q).trim() : undefined
  })
  res.json({ data: files })
})

// POST /api/files  { path, name, mime?, size?, client_id?, project_id?, category? }
// Records metadata for a file already uploaded via POST /api/uploads.
filesRouter.post('/', async (req, res) => {
  const b = req.body ?? {}
  const fields = {}
  const filePath = String(b.path ?? '').trim()
  const name = String(b.name ?? '').trim()
  if (!filePath.startsWith('/uploads/')) fields.path = 'a valid uploaded path is required'
  if (!name) fields.name = 'a file name is required'

  const client_id = await resolveLink(b.client_id, { exists: async id => !!await getClient(id), label: 'client' }, fields, 'client_id')
  const project_id = await resolveLink(b.project_id, { exists: async id => !!await getProject(id), label: 'project' }, fields, 'project_id')
  const category = normCategory(b.category, fields)
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const size = Number(b.size)
  const file = await createFile({
    client_id,
    project_id,
    category,
    path: filePath,
    name,
    mime: typeof b.mime === 'string' ? b.mime : null,
    size_bytes: Number.isFinite(size) && size >= 0 ? size : null,
    uploaded_user_id: req.user.id
  })
  emitFileChanged(file.id)
  res.status(201).json({ data: file })
})

// PATCH /api/files/:id  { name?, client_id?, project_id?, category? }
filesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getFile(id)
  if (!existing) return res.status(404).json({ error: { message: 'File not found' } })

  const b = req.body ?? {}
  const fields = {}
  const patch = {}
  if (b.name !== undefined) {
    const name = String(b.name).trim()
    if (!name) fields.name = 'a file name is required'
    else patch.name = name
  }
  if (b.client_id !== undefined) {
    patch.client_id = await resolveLink(b.client_id, { exists: async cid => !!await getClient(cid), label: 'client' }, fields, 'client_id')
  }
  if (b.project_id !== undefined) {
    patch.project_id = await resolveLink(b.project_id, { exists: async pid => !!await getProject(pid), label: 'project' }, fields, 'project_id')
  }
  if (b.category !== undefined) patch.category = normCategory(b.category, fields)
  if (Object.keys(fields).length) throw badRequest('Validation failed', fields)

  const file = await updateFile(id, patch)
  emitFileChanged(id)
  res.json({ data: file })
})

// DELETE /api/files/:id — removes the metadata row AND the bytes on disk.
filesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req)
  const file = await getFile(id)
  if (!file) return res.status(404).json({ error: { message: 'File not found' } })

  await deleteFile(id)

  // Unlink the physical file. Use basename only so a crafted `path` can never
  // escape the uploads dir; a missing file (already gone) is not an error.
  try {
    await fs.unlink(path.join(config.uploads.dir, path.basename(file.path)))
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Failed to unlink file ${file.path}:`, err.message)
  }

  emitFileChanged(id)
  res.json({ ok: true })
})
