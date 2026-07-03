import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Default uploads dir: server/uploads (this file is server/src/config/env.js).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Central config, read once from the environment with dev-safe defaults.
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  uploads: {
    // Where uploaded files live on disk, and the cap on a single upload.
    dir: process.env.UPLOADS_DIR || path.join(serverRoot, 'uploads'),
    maxBytes: Number(process.env.UPLOADS_MAX_BYTES) || 10 * 1024 * 1024
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fwa_ops',
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10
  }
}

export const isProd = config.nodeEnv === 'production'
