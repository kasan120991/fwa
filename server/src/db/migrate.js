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
    ['vapi_call_id', 'VARCHAR(64) NULL AFTER client_id'],
    ['line', "ENUM('main', 'demo') NOT NULL DEFAULT 'main' AFTER classification"]
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
  ],
  websites: [
    ['do_droplet_id', 'BIGINT UNSIGNED NULL AFTER notes'],
    ['do_uptime_check_id', 'VARCHAR(36) NULL AFTER do_droplet_id']
  ],
  clients: [
    ['do_project_id', 'VARCHAR(36) NULL AFTER stripe_customer_id']
  ],
  // Delivery milestones: tasks gain a soft milestone_id (no FK, like the
  // project back-links above). project_milestones/milestone_templates are new
  // tables handled by CREATE TABLE IF NOT EXISTS, so they need no entry here.
  tasks: [
    ['milestone_id', 'BIGINT UNSIGNED NULL AFTER project_id']
  ],
  // Client-portal: link a portal login to its client (soft column on existing
  // DBs; fresh installs get the FK from schema.sql). portal_invites is a new
  // table, handled by CREATE TABLE IF NOT EXISTS.
  users: [
    ['client_id', 'BIGINT UNSIGNED NULL AFTER role'],
    ['avatar_url', 'MEDIUMTEXT NULL AFTER name']
  ],
  // Distinguish client-uploaded files from admin-shared ones (mirrors
  // ticket_attachments.uploaded_by). `title` is the user-set display name;
  // NULL falls back to the original filename in `name`.
  files: [
    ['uploaded_by', "ENUM('admin', 'client') NOT NULL DEFAULT 'admin' AFTER size_bytes"],
    ['title', 'VARCHAR(255) NULL AFTER name']
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
  ],
  tasks: [
    ['idx_tasks_milestone', 'ADD KEY idx_tasks_milestone (milestone_id)']
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

// ENUM columns that gained values on an already-existing table. CREATE TABLE IF
// NOT EXISTS won't widen an ENUM, so we check information_schema.COLUMN_TYPE and
// MODIFY only when a required value is missing (keep the full DDL in sync with
// schema.sql). Each entry: [column, requiredValue, fullColumnDdl].
const ENUM_COLUMNS = {
  projects: [
    ['status', 'awaiting_signature',
      "ENUM('planning','awaiting_signature','awaiting_deposit','in_progress','in_review','awaiting_final','on_hold','completed') NOT NULL DEFAULT 'planning'"]
  ],
  notifications: [
    ['category', 'website',
      "ENUM('lead','call','proposal','contract','invoice','payment','task','ticket','expense','website','system') NOT NULL"]
  ]
}

async function ensureEnums(conn, database) {
  for (const [table, columns] of Object.entries(ENUM_COLUMNS)) {
    for (const [column, requiredValue, ddl] of columns) {
      const [rows] = await conn.query(
        'SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [database, table, column]
      )
      const type = rows[0]?.COLUMN_TYPE || ''
      if (!type.includes(`'${requiredValue}'`)) {
        await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${ddl}`)
        console.log(`  ~ ${table}.${column} enum widened`)
      }
    }
  }
}

// One-time backfill: seed the client_activity timeline from existing rows so
// client pages aren't empty on first deploy. Runs only when the table is empty
// (idempotent — later events come from logClientActivity at write time).
async function backfillClientActivity(conn) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM client_activity')
  if (n > 0) return
  const inserts = [
    // Invoices (skip drafts — they weren't client-visible events)
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'invoice', 'i-lucide-receipt-text',
            CONCAT('Invoice ', COALESCE(number, '(draft)'), ' created'),
            CONCAT('$', FORMAT(amount_due, 2)), '/invoices', created_at
     FROM invoices WHERE status <> 'draft'`,
    // Payments that succeeded
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'payment', 'i-lucide-circle-check',
            CONCAT('Payment received — $', FORMAT(amount, 2)),
            NULL, '/payments', COALESCE(paid_at, created_at)
     FROM payments WHERE status = 'succeeded'`,
    // Projects
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'project', 'i-lucide-folder-plus',
            CONCAT('Project “', name, '” created'), NULL,
            CONCAT('/projects/', id), created_at
     FROM projects`,
    // Tickets
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'ticket', 'i-lucide-life-buoy',
            CONCAT('Ticket opened: ', subject), NULL,
            CONCAT('/support/', id), created_at
     FROM tickets WHERE client_id IS NOT NULL`,
    // Calls linked to a client
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'call', 'i-lucide-phone',
            CONCAT('Call from ', COALESCE(caller_name, caller_number)),
            LEFT(summary, 500), '/receptionist', occurred_at
     FROM calls WHERE client_id IS NOT NULL`,
    // Signed contracts
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'agreement', 'i-lucide-file-check-2',
            CONCAT('Contract signed: ', title),
            CONCAT('$', FORMAT(total, 2)), '/agreements', signed_at
     FROM contracts WHERE signed_at IS NOT NULL`,
    // Accepted proposals
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'agreement', 'i-lucide-file-check-2',
            CONCAT('Proposal accepted: ', title),
            CONCAT('$', FORMAT(total, 2)), '/agreements', accepted_at
     FROM proposals WHERE accepted_at IS NOT NULL`,
    // Websites
    `INSERT INTO client_activity (client_id, category, icon, title, meta, link, occurred_at)
     SELECT client_id, 'website', 'i-lucide-globe',
            CONCAT('Website “', name, '” added'), domain,
            CONCAT('/websites/', id), created_at
     FROM websites WHERE client_id IS NOT NULL`
  ]
  let total = 0
  for (const sql of inserts) {
    const [res] = await conn.query(sql)
    total += res.affectedRows
  }
  if (total > 0) console.log(`  + client_activity backfilled (${total} events)`)
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
  await ensureEnums(conn, config.db.database)
  await backfillClientActivity(conn)
  console.log(`✔ Schema applied to \`${config.db.database}\` at ${config.db.host}:${config.db.port}`)
} finally {
  await conn.end()
}
