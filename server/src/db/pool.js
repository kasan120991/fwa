import mysql from 'mysql2/promise'
import { config } from '../config/env.js'

let pool

/** Lazily-created shared connection pool. */
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
      dateStrings: true
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
