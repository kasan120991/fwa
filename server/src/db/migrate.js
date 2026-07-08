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
// NB: only lists tables that may already exist and need a missing column added
// (checked against information_schema first). Fresh installs get everything from
// schema.sql's CREATE TABLEs, so entries here are no-ops on a clean DB — but an
// entry for a table that does NOT exist would try to ALTER a missing table, so
// never list a table that isn't in schema.sql.
const ADDITIVE_COLUMNS = {
  calls: [
    ['reviewed_at', 'DATETIME NULL AFTER extracted'],
    ['vapi_call_id', 'VARCHAR(64) NULL AFTER client_id']
  ],
  // Soft project back-links (no FK — projects is created after these tables in
  // schema.sql, and a trailing ADD CONSTRAINT wouldn't be idempotent).
  proposals: [
    ['project_id', 'BIGINT UNSIGNED NULL AFTER client_id']
  ],
  contracts: [
    ['project_id', 'BIGINT UNSIGNED NULL AFTER proposal_id']
  ],
  projects: [
    ['deposit_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 50.00 AFTER project_fee']
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

// Indexes that must be added to already-existing tables. Like ADDITIVE_COLUMNS,
// CREATE TABLE IF NOT EXISTS won't add these to a live table and MySQL has no
// ADD INDEX IF NOT EXISTS, so we check information_schema.STATISTICS and add only
// what's missing. Runs AFTER ensureColumns so a new index's column already exists.
const ADDITIVE_INDEXES = {
  calls: [
    ['uq_calls_vapi', 'ADD UNIQUE KEY uq_calls_vapi (vapi_call_id)']
  ]
}

async function ensureIndexes(conn, database) {
  for (const [table, indexes] of Object.entries(ADDITIVE_INDEXES)) {
    const [rows] = await conn.query(
      'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [database, table]
    )
    const existing = new Set(rows.map(r => r.INDEX_NAME))
    for (const [name, ddl] of indexes) {
      if (!existing.has(name)) {
        await conn.query(`ALTER TABLE \`${table}\` ${ddl}`)
        console.log(`  + ${table} index ${name}`)
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
  await ensureIndexes(conn, config.db.database)
  console.log(`✔ Schema applied to \`${config.db.database}\` at ${config.db.host}:${config.db.port}`)
} finally {
  await conn.end()
}
