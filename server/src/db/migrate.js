// Applies schema.sql to the configured database, creating it if needed.
// Usage: npm run migrate
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { config } from '../config/env.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const schema = await readFile(path.join(dir, 'schema.sql'), 'utf8')

// Additive columns for tables that already exist. CREATE TABLE IF NOT EXISTS
// won't alter an existing table, and MySQL has no ADD COLUMN IF NOT EXISTS, so
// we check information_schema and add only what's missing. Keep in sync with
// schema.sql (schema.sql is the source of truth for fresh installs).
const ADDITIVE_COLUMNS = {
  contacts: [
    ['title', 'VARCHAR(120) NULL AFTER company'],
    ['website', 'VARCHAR(255) NULL AFTER title'],
    ['logo_url', 'MEDIUMTEXT NULL AFTER website'],
    ['notes', 'TEXT NULL AFTER message'],
    ['tags', 'JSON NULL AFTER notes'],
    ['address_line1', 'VARCHAR(255) NULL'],
    ['address_line2', 'VARCHAR(255) NULL'],
    ['city', 'VARCHAR(120) NULL'],
    ['region', 'VARCHAR(120) NULL'],
    ['postal_code', 'VARCHAR(20) NULL'],
    ['country', 'VARCHAR(120) NULL'],
    ['billing_email', 'VARCHAR(254) NULL AFTER country'],
    ['client_since', 'DATE NULL'],
    ['stripe_customer_id', 'VARCHAR(255) NULL AFTER client_since']
  ],
  calls: [
    ['reviewed_at', 'DATETIME NULL AFTER extracted']
  ]
}

async function ensureColumns(conn, database) {
  for (const [table, columns] of Object.entries(ADDITIVE_COLUMNS)) {
    const [rows] = await conn.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [database, table]
    )
    const existing = new Set(rows.map(r => r.COLUMN_NAME))
    for (const [name, ddl] of columns) {
      if (!existing.has(name)) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`)
        console.log(`  + ${table}.${name}`)
      }
    }
  }
}

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
  await ensureColumns(conn, config.db.database)
  console.log(`✔ Schema applied to \`${config.db.database}\` at ${config.db.host}:${config.db.port}`)
} finally {
  await conn.end()
}
