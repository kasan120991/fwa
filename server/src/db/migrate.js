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
  // The proposal owns the Statement of Work: sales owns what was sold, delivery
  // owns the work. Column names deliberately match what `projects` used to
  // carry, so the contract token builder and the lifted SOW form needed no
  // renaming and a project can read them straight back through its link.
  // Order matters — ensureColumns adds in array order, so each AFTER target
  // must already be present.
  proposals: [
    ['project_id', 'BIGINT UNSIGNED NULL AFTER client_id'],
    ['project_type_id', 'BIGINT UNSIGNED NULL AFTER project_id'],
    ['code', 'VARCHAR(50) NULL AFTER project_type_id'],
    ['goals', 'TEXT NULL AFTER total'],
    ['pages_included', 'TEXT NULL AFTER goals'],
    ['key_features', 'TEXT NULL AFTER pages_included'],
    ['design_deliverables', 'TEXT NULL AFTER key_features'],
    ['content_provided_by', "ENUM('client','developer','mix') NULL AFTER design_deliverables"],
    ['revision_rounds', 'INT NOT NULL DEFAULT 2 AFTER content_provided_by'],
    ['third_party_costs', 'TEXT NULL AFTER revision_rounds'],
    ['project_fee', 'DECIMAL(10,2) NULL AFTER third_party_costs'],
    ['deposit_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 50.00 AFTER project_fee'],
    ['hourly_rate', 'DECIMAL(10,2) NULL AFTER deposit_pct'],
    ['content_deadline', 'DATE NULL AFTER hourly_rate'],
    ['start_date', 'DATE NULL AFTER content_deadline'],
    ['target_launch_date', 'DATE NULL AFTER start_date'],
    ['special_terms', 'TEXT NULL AFTER target_launch_date'],
    ['inactivity_days', 'INT NOT NULL DEFAULT 30 AFTER special_terms'],
    ['feedback_days', 'INT NOT NULL DEFAULT 5 AFTER inactivity_days'],
    ['late_fee_days', 'INT NOT NULL DEFAULT 7 AFTER feedback_days'],
    ['bugfix_days', 'INT NOT NULL DEFAULT 30 AFTER late_fee_days'],
    ['accept_source', "ENUM('client','admin') NULL AFTER bugfix_days"],
    ['accepted_by', 'VARCHAR(200) NULL AFTER accept_source']
  ],
  invoices: [
    // A deposit is raised on contract signature, before any project exists, so
    // this is what scopes its idempotency and tells invoice.paid what to build.
    ['contract_id', 'BIGINT UNSIGNED NULL AFTER project_id']
  ],
  contracts: [
    ['project_id', 'BIGINT UNSIGNED NULL AFTER proposal_id'],
    // Copied from the proposal at generation time so the deposit's amount and
    // its percentage come from one signed snapshot.
    ['deposit_pct', 'DECIMAL(5,2) NULL AFTER billing_interval']
  ],
  projects: [
    ['deposit_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 50.00 AFTER project_fee'],
    // The ClickUp task standing for this project; its work items are subtasks.
    ['clickup_task_id', 'VARCHAR(100) NULL AFTER code'],
    ['clickup_sync_error', 'VARCHAR(255) NULL AFTER clickup_task_id']
  ],
  // The ClickUp task standing for this milestone — a subtask of the project's
  // task, and the parent of that milestone's work items. clickup_option_id is
  // SUPERSEDED (it pinned the old "Milestone" dropdown option); kept because
  // this file is additive-only and has no DROP path.
  project_milestones: [
    ['clickup_option_id', 'VARCHAR(100) NULL AFTER title'],
    ['clickup_task_id', 'VARCHAR(100) NULL AFTER title'],
    ['clickup_sync_error', 'VARCHAR(255) NULL AFTER clickup_task_id'],
    ['state_manual', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER state']
  ],
  websites: [
    ['do_droplet_id', 'BIGINT UNSIGNED NULL AFTER notes'],
    ['do_uptime_check_id', 'VARCHAR(36) NULL AFTER do_droplet_id']
  ],
  clients: [
    ['do_project_id', 'VARCHAR(36) NULL AFTER stripe_customer_id'],
    // ClickUp: the client's Folder + its two lists. The Care Plan list is
    // provisioned for your own use and deliberately never synced.
    ['clickup_folder_id', 'VARCHAR(100) NULL AFTER do_project_id'],
    ['clickup_list_id', 'VARCHAR(100) NULL AFTER clickup_folder_id'],
    ['clickup_careplan_list_id', 'VARCHAR(100) NULL AFTER clickup_list_id'],
    ['clickup_sync_error', 'VARCHAR(255) NULL AFTER clickup_careplan_list_id']
  ],
  // Delivery milestones: tasks gain a soft milestone_id (no FK, like the
  // project back-links above). project_milestones/milestone_templates are new
  // tables handled by CREATE TABLE IF NOT EXISTS, so they need no entry here.
  tasks: [
    ['milestone_id', 'BIGINT UNSIGNED NULL AFTER project_id'],
    // ClickUp mirror. clickup_shadow is the last state both sides agreed on
    // (in Ops values) — the echo-loop guard and the push field-diff basis.
    // clickup_version is ClickUp's date_updated, a monotonic guard so an
    // out-of-order or re-delivered webhook can't regress newer state.
    ['clickup_task_id', 'VARCHAR(100) NULL AFTER milestone_id'],
    ['clickup_shadow', 'JSON NULL AFTER clickup_task_id'],
    ['clickup_version', 'BIGINT UNSIGNED NULL AFTER clickup_shadow'],
    ['clickup_sync_error', 'VARCHAR(255) NULL AFTER clickup_version'],
    ['clickup_status', 'VARCHAR(50) NULL AFTER status'],
    ['clickup_synced_at', 'DATETIME NULL AFTER completed_at'],
    ['clickup_checklist_id', 'VARCHAR(100) NULL AFTER clickup_sync_error']
  ],
  task_checklist_items: [
    ['clickup_item_id', 'VARCHAR(100) NULL AFTER done']
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
    ['idx_tasks_milestone', 'ADD KEY idx_tasks_milestone (milestone_id)'],
    // MySQL allows unlimited NULLs in a UNIQUE key, so this is the same
    // look-up-by-remote-id-first idempotency guard as uq_calls_vapi.
    ['uq_tasks_clickup', 'ADD UNIQUE KEY uq_tasks_clickup (clickup_task_id)']
  ],
  projects: [
    ['uq_projects_clickup', 'ADD UNIQUE KEY uq_projects_clickup (clickup_task_id)']
  ],
  project_milestones: [
    ['uq_milestones_clickup', 'ADD UNIQUE KEY uq_milestones_clickup (clickup_task_id)']
  ],
  task_checklist_items: [
    ['uq_tci_clickup', 'ADD UNIQUE KEY uq_tci_clickup (clickup_item_id)']
  ],
  proposals: [
    ['uq_proposals_code', 'ADD UNIQUE KEY uq_proposals_code (code)'],
    ['idx_proposals_type', 'ADD KEY idx_proposals_type (project_type_id)']
  ],
  invoices: [
    ['idx_invoices_contract', 'ADD KEY idx_invoices_contract (contract_id)']
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
    // 'project' arrived with the proposal-first flow: a paid deposit creating a
    // project is its own kind of event, and the one an admin most wants to see.
    ['category', 'project',
      "ENUM('lead','call','proposal','contract','invoice','payment','project','task','ticket','expense','website','system') NOT NULL"]
  ],
  invoices: [
    // Care-plan subscription invoices arrive from Stripe, not from the app.
    ['kind', 'care_plan',
      "ENUM('deposit', 'balance', 'custom', 'care_plan') NOT NULL DEFAULT 'custom'"]
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


// The 18 Statement-of-Work columns, in the order both tables declare them.
// Exported shape used by the backfill and by the drop step (migrate-drop-sow.js).
export const SOW_COLUMNS = [
  'goals', 'pages_included', 'key_features', 'design_deliverables', 'content_provided_by',
  'revision_rounds', 'third_party_costs', 'project_fee', 'deposit_pct', 'hourly_rate',
  'content_deadline', 'start_date', 'target_launch_date', 'special_terms',
  'inactivity_days', 'feedback_days', 'late_fee_days', 'bugfix_days'
]

/**
 * Give every pre-existing project the proposal it would have had.
 *
 * The SOW moved to the proposal, so a project without one has nowhere to read
 * its scope, fee or dates from. This mints an already-accepted proposal per
 * project from the columns the project still carries, and links any contract
 * that project produced.
 *
 * Idempotent BY CONSTRUCTION rather than by a flag: the NOT EXISTS makes runs
 * 2..n insert zero rows, and a partially-completed run heals on the next pass
 * instead of refusing to continue. (backfillClientActivity's "return if the
 * table is non-empty" guard can't work here — proposals is not empty.)
 */
async function backfillProposalSow(conn, database) {
  // If the source columns are gone the migration has already completed; the
  // INSERT..SELECT below would be a hard error 1054 on every future run.
  const [cols] = await conn.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [database, 'projects']
  )
  const have = new Set(cols.map(r => r.COLUMN_NAME))
  if (!SOW_COLUMNS.every(c => have.has(c))) return

  const list = SOW_COLUMNS.join(', ')
  const [res] = await conn.query(
    `INSERT INTO proposals
       (client_id, project_id, project_type_id, title, currency, total, status, accepted_at, accept_source, ${list})
     SELECT p.client_id, p.id, p.project_type_id, p.name, 'USD',
            COALESCE(p.project_fee, 0), 'accepted', p.created_at, 'admin',
            ${SOW_COLUMNS.map(c => 'p.' + c).join(', ')}
       FROM projects p
      WHERE NOT EXISTS (SELECT 1 FROM proposals pr WHERE pr.project_id = p.id)`
  )
  if (res.affectedRows > 0) {
    // Codes need the auto-increment ids, so they're a second pass.
    await conn.query(
      "UPDATE proposals SET code = CONCAT('PROP-', LPAD(id, 4, '0')) WHERE code IS NULL"
    )
    console.log(`  + backfilled ${res.affectedRows} proposal(s) from existing projects`)
  }

  // Point each project's contract at the proposal that now holds its scope.
  // The type filter is load-bearing: without it a client's care-plan contract
  // would also claim the project's proposal, and getContractByProposalId is a
  // LIMIT 1 with no ordering — it would then return whichever MySQL felt like.
  const [linked] = await conn.query(
    `UPDATE contracts c
       JOIN proposals pr ON pr.project_id = c.project_id
        SET c.proposal_id = pr.id
      WHERE c.proposal_id IS NULL AND c.project_id IS NOT NULL AND c.type = 'project'`
  )
  if (linked.affectedRows > 0) console.log(`  + linked ${linked.affectedRows} contract(s) to their proposal`)
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
  await backfillProposalSow(conn, config.db.database)
  console.log(`✔ Schema applied to \`${config.db.database}\` at ${config.db.host}:${config.db.port}`)
} finally {
  await conn.end()
}
