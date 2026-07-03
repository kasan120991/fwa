import { createApp } from './app.js'
import { config } from './config/env.js'
import { closePool } from './db/pool.js'

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(`FWA API listening on http://localhost:${config.port} (${config.nodeEnv})`)
})

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
