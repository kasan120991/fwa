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
