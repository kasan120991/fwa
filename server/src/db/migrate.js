// Applies schema.sql to the configured database, creating it if needed.
// Usage: npm run migrate
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { config } from '../config/env.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const schema = await readFile(path.join(dir, 'schema.sql'), 'utf8')

// Connect without selecting a database so we can create it first.
const conn = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  multipleStatements: true
})

try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await conn.query(`USE \`${config.db.database}\``)
  await conn.query(schema)
  console.log(`✔ Schema applied to \`${config.db.database}\` at ${config.db.host}:${config.db.port}`)
} finally {
  await conn.end()
}
