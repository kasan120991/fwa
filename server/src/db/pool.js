import mysql from 'mysql2/promise'
import { config } from '../config/env.js'

let pool

/**
 * Lazily-created shared connection pool.
 *
 * TIMEZONE CONTRACT: every DATETIME/TIMESTAMP string crossing the API is UTC
 * wall-clock ('YYYY-MM-DD HH:MM:SS', no zone marker); the frontend parses it as
 * UTC (see app/app/utils/format.ts). This is pinned here rather than left to the
 * host, because the environments disagree — prod's MySQL runs in a UTC container,
 * local dev's runs on the Mac (host tz). Both settings below are required:
 *
 *   - `timezone: 'Z'` makes mysql2 serialize JS `Date` query params as UTC.
 *     It defaults to 'local' (Node's tz) and does NOT touch the session.
 *   - `SET time_zone` pins the MySQL session, so NOW()/CURRENT_TIMESTAMP and
 *     every TIMESTAMP-column read render UTC. `timezone:` has no effect on this.
 *
 * Drop either one and writes skew against reads on any non-UTC host.
 */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      connectionLimit: config.db.connectionLimit,
      waitForConnections: true,
      namedPlaceholders: true,
      enableKeepAlive: true,
      dateStrings: true,
      timezone: 'Z'
    })
    // Fires once per new pooled connection. mysql2 queues commands per connection,
    // so this lands before any query issued on it — no await needed.
    pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'")
    })
  }
  return pool
}

/** Thin query helper — returns rows. */
export async function query(sql, params) {
  const [rows] = await getPool().query(sql, params)
  return rows
}

/**
 * Run `fn` inside a transaction. `fn` receives a `q(sql, params)` helper (same
 * shape as `query`, but on the transaction's connection). Commits on success,
 * rolls back on any thrown error. Used where several writes must be atomic
 * (e.g. a proposal + its line items).
 */
export async function withTransaction(fn) {
  const conn = await getPool().getConnection()
  const q = async (sql, params) => {
    const [rows] = await conn.query(sql, params)
    return rows
  }
  try {
    await conn.beginTransaction()
    const result = await fn(q)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/** Ping the database; throws if it can't connect. */
export async function pingDb() {
  const conn = await getPool().getConnection()
  try {
    await conn.ping()
  } finally {
    conn.release()
  }
}

/** Close the pool (used on shutdown). */
export async function closePool() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
