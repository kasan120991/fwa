import { query } from '../db/pool.js'
import { ticketCode } from './tickets.repo.js'

// Cross-entity global search powering the ⌘K command palette. Each entity is a
// capped LIKE query; results are shaped { id, title, subtitle, link } so the
// frontend stays a dumb renderer (mirrors dashboard.repo.js's cross-source feed).

const num = v => (v == null ? null : Number(v))
const money = n => (n == null ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
const dash = (...parts) => parts.filter(Boolean).join(' · ')

/**
 * Search clients, projects, invoices, expenses, and tickets for `q`.
 * Returns grouped results, each list capped at `perType`. Empty groups for a
 * blank/too-short query (the route guards this too).
 */
export async function globalSearch(q, perType = 6) {
  const term = String(q ?? '').trim()
  const empty = { clients: [], projects: [], invoices: [], expenses: [], tickets: [] }
  if (term.length < 2) return empty
  const params = { q: `%${term}%` }
  const limit = Math.min(Math.max(Number(perType) || 6, 1), 20)

  const clients = await query(
    `SELECT id, name, company, email FROM clients
      WHERE name LIKE :q OR company LIKE :q OR email LIKE :q
      ORDER BY (company LIKE :q OR name LIKE :q) DESC, name ASC LIMIT ${limit}`,
    params
  )
  const projects = await query(
    `SELECT p.id, p.name, p.code, p.status, c.name AS client_name, c.company AS client_company
       FROM projects p JOIN clients c ON c.id = p.client_id
      WHERE p.name LIKE :q OR p.code LIKE :q OR c.name LIKE :q OR c.company LIKE :q
      ORDER BY p.created_at DESC LIMIT ${limit}`,
    params
  )
  const invoices = await query(
    `SELECT i.id, i.number, i.description, i.amount_due, c.name AS client_name, c.company AS client_company
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.number LIKE :q OR i.description LIKE :q OR c.name LIKE :q OR c.company LIKE :q
      ORDER BY i.created_at DESC LIMIT ${limit}`,
    params
  )
  const expenses = await query(
    `SELECT e.id, e.vendor, e.category, e.amount, c.name AS client_name, c.company AS client_company
       FROM expenses e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.vendor LIKE :q OR e.description LIKE :q OR c.name LIKE :q OR c.company LIKE :q
      ORDER BY e.expense_date DESC LIMIT ${limit}`,
    params
  )
  const tickets = await query(
    `SELECT t.id, t.subject, t.status, c.name AS client_name, c.company AS client_company
       FROM tickets t JOIN clients c ON c.id = t.client_id
      WHERE t.subject LIKE :q OR c.name LIKE :q OR c.company LIKE :q
      ORDER BY t.last_activity_at DESC LIMIT ${limit}`,
    params
  )

  const clientLabel = r => r.client_company || r.client_name || null

  return {
    clients: clients.map(r => ({
      id: r.id,
      title: r.company || r.name,
      subtitle: dash(r.company ? r.name : null, r.email),
      link: `/clients/${r.id}`
    })),
    projects: projects.map(r => ({
      id: r.id,
      title: r.name,
      subtitle: dash(r.code, clientLabel(r), r.status),
      link: `/projects/${r.id}`
    })),
    invoices: invoices.map(r => ({
      id: r.id,
      title: r.number || r.description || `Invoice #${r.id}`,
      subtitle: dash(clientLabel(r), money(num(r.amount_due))),
      link: '/invoices'
    })),
    expenses: expenses.map(r => ({
      id: r.id,
      title: r.vendor,
      subtitle: dash(r.category, clientLabel(r), money(num(r.amount))),
      link: '/expenses'
    })),
    tickets: tickets.map(r => ({
      id: r.id,
      title: r.subject,
      subtitle: dash(ticketCode(r.id), clientLabel(r)),
      link: `/support/${r.id}`
    }))
  }
}
