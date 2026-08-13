// Create (or update) a login account.
// Usage:
//   npm run create-user -- --email you@fwa.com --name "Jordan Rivera" --password 'secret'
//   npm run create-user -- --email dana@northwind.com --name "Dana Cole" --password 'secret' \
//     --role client --company "Northwind Co."
//
// A client account must be linked to a client — that link is what the portal
// reads every request to scope the data. In production the link comes from the
// portal invite an admin sends; --company (or --client-id) is the local
// equivalent so a dev can make a working portal login in one command.
import { parseArgs } from 'node:util'
import bcrypt from 'bcryptjs'
import { getPool, closePool } from './pool.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string', default: 'admin' },
    company: { type: 'string' },
    'client-id': { type: 'string' }
  }
})

const { email, name, password, role, company } = values
const clientIdArg = values['client-id']

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
if (role === 'admin' && (company || clientIdArg)) {
  fail('--company / --client-id only apply to --role client')
}
if (role === 'client' && !company && !clientIdArg) {
  fail('A client account needs --company "Acme Co." (or --client-id 42) — without it the portal has nothing to scope to')
}

// Resolve the client link before hashing, so a bad company name fails fast.
let clientId = null
let clientCompany = null
if (role === 'client') {
  const [rows] = clientIdArg
    ? await getPool().query('SELECT id, company FROM clients WHERE id = ?', [Number(clientIdArg)])
    : await getPool().query('SELECT id, company FROM clients WHERE company = ?', [company])
  if (!rows.length) {
    await closePool()
    fail(`No client matches ${clientIdArg ? `id ${clientIdArg}` : `"${company}"`}`)
  }
  clientId = rows[0].id
  clientCompany = rows[0].company
}

const passwordHash = await bcrypt.hash(password, 12)

// Upsert so re-running with the same email rotates the password / updates
// details. client_id is only rewritten for client rows, so re-running against
// an admin can never quietly attach it to a client.
const sql = `
  INSERT INTO users (email, name, password_hash, role, client_id)
  VALUES (:email, :name, :passwordHash, :role, :clientId)
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    password_hash = VALUES(password_hash),
    role = VALUES(role),
    client_id = IF(VALUES(role) = 'admin', NULL, VALUES(client_id)),
    is_active = 1
`

try {
  await getPool().query(sql, { email, name, passwordHash, role, clientId })
  const link = clientId ? ` → ${clientCompany} (client #${clientId})` : ''
  console.log(`✔ Account ready: ${email} (${role})${link}`)
} finally {
  await closePool()
}
