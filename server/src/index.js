import { createApp } from './app.js'
import { config } from './config/env.js'
import { closePool } from './db/pool.js'
import { initRealtime } from './realtime/io.js'
import { startScheduler } from './jobs/scheduler.js'

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(`FWA API listening on http://localhost:${config.port} (${config.nodeEnv})`)
})

// Attach Socket.IO to the same HTTP server (shares the port).
initRealtime(server)

// Background jobs (analytics sync + uptime checks) — gated by env, no-op otherwise.
startScheduler()

// Graceful shutdown — stop accepting connections, then close the DB pool.
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`)
  server.close(async () => {
    await closePool()
    process.exit(0)
  })
  // Force-exit if close hangs.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
