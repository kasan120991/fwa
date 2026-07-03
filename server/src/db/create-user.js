// Create (or update) a login account.
// Usage:
//   npm run create-user -- --email you@fwa.com --name "Jordan Rivera" --password 'secret'
//   npm run create-user -- --email c@acme.com --name "Acme" --password 'secret' --role client
import { parseArgs } from 'node:util'
import bcrypt from 'bcryptjs'
import { getPool, closePool } from './pool.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string', default: 'admin' }
  }
})

const { email, name, password, role } = values

function fail(msg) {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

if (!email || !name || !password) {
  fail('Required: --email, --name, --password (optional: --role admin|client)')
}
if (!['admin', 'client'].includes(role)) {
  fail(`Invalid --role "${role}" (expected "admin" or "client")`)
}
if (password.length < 8) {
  fail('Password must be at least 8 characters')
}

const passwordHash = await bcrypt.hash(password, 12)

// Upsert so re-running with the same email rotates the password / updates details.
const sql = `
  INSERT INTO users (email, name, password_hash, role)
  VALUES (:email, :name, :passwordHash, :role)
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    password_hash = VALUES(password_hash),
    role = VALUES(role),
    is_active = 1
`

try {
  await getPool().query(sql, { email, name, passwordHash, role })
  console.log(`✔ Account ready: ${email} (${role})`)
} finally {
  await closePool()
}
