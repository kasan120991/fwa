import { query } from '../db/pool.js'
import { invoiceStats } from './invoices.repo.js'

const num = v => Number(v ?? 0)

// One-shot dashboard KPIs. Cheap COUNT/SUM aggregates across the core tables,
// reusing invoiceStats() for the outstanding balance.
export async function dashboardSummary() {
  const [clients] = await query(
    `SELECT
       COUNT(*) AS active_clients,
       COALESCE(SUM(client_since >= (CURDATE() - INTERVAL 30 DAY)), 0) AS new_clients_30d
     FROM contacts WHERE stage = 'active'`
  )
  const [projects] = await query(
    `SELECT
       COALESCE(SUM(status <> 'completed'), 0) AS active_projects,
       COALESCE(SUM(created_at >= (NOW() - INTERVAL 30 DAY)), 0) AS new_projects_30d
     FROM projects`
  )
  const [tasks] = await query(
    `SELECT
       COALESCE(SUM(status <> 'done'), 0) AS open_tasks,
       COALESCE(SUM(status <> 'done' AND due_date = CURDATE()), 0) AS tasks_due_today
     FROM tasks`
  )
  const [invoices] = await query("SELECT COUNT(*) AS unpaid_count FROM invoices WHERE status = 'open'")
  const { outstanding } = await invoiceStats()

  return {
    active_clients: num(clients.active_clients),
    new_clients_30d: num(clients.new_clients_30d),
    active_projects: num(projects.active_projects),
    new_projects_30d: num(projects.new_projects_30d),
    open_tasks: num(tasks.open_tasks),
    tasks_due_today: num(tasks.tasks_due_today),
    outstanding: num(outstanding),
    unpaid_count: num(invoices.unpaid_count)
  }
}
