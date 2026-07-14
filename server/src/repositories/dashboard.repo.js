import { query } from '../db/pool.js'
import { invoiceStats } from './invoices.repo.js'
import { listActiveAlerts } from './infraAlerts.repo.js'
import { titleCase } from '../utils/text.js'

const num = v => Number(v ?? 0)

// One-shot dashboard KPIs. Cheap COUNT/SUM aggregates across the core tables,
// reusing invoiceStats() for the outstanding balance.
export async function dashboardSummary() {
  const [clients] = await query(
    `SELECT
       COUNT(*) AS active_clients,
       COALESCE(SUM(client_since >= (CURDATE() - INTERVAL 30 DAY)), 0) AS new_clients_30d
     FROM clients WHERE status = 'active'`
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// First day of the month `offset` months from the current month, as 'YYYY-MM-01'.
function firstOfMonth(offset) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Collected revenue for the dashboard hero chart: succeeded payments summed per
// month over the last `span` months (6 or 12, incl. the current partial month),
// plus a matching prior-window comparison. Same source as paymentStats() so the
// numbers agree with the Payments page. Months are zero-filled in JS so the chart
// always renders a full set of bars.
export async function revenueCollected(months = 6) {
  const span = months === 12 ? 12 : 6
  const start = firstOfMonth(-(span - 1)) // start of the current window
  const prevStart = firstOfMonth(-(2 * span - 1)) // start of the prior window

  const monthly = await query(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS ym, COALESCE(SUM(amount), 0) AS total
       FROM payments
      WHERE status = 'succeeded' AND paid_at >= :start
      GROUP BY ym`,
    { start }
  )
  const [{ prev }] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS prev
       FROM payments
      WHERE status = 'succeeded' AND paid_at >= :prevStart AND paid_at < :start`,
    { prevStart, start }
  )

  const byYm = new Map(monthly.map(r => [r.ym, num(r.total)]))
  const now = new Date()
  const series = []
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    series.push({ label: MONTH_LABELS[d.getMonth()], ym, total: byYm.get(ym) ?? 0, current: i === 0 })
  }

  const total = series.reduce((s, m) => s + m.total, 0)
  const prevTotal = num(prev)
  const delta_pct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  return { months: series, total, delta_pct, span }
}

// Display helpers for the attention feed (backend formats the strings so the
// frontend stays a dumb renderer, matching the card's title/meta/chip shape).
const money = n => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const plural = (n, w) => `${n} ${w}${Number(n) === 1 ? '' : 's'}`

// "Needs Attention" feed: a prioritized, cross-source list of things the owner
// should act on — overdue invoices, agreements awaiting a close, overdue outreach
// follow-ups, and unreviewed calls. Tasks are excluded on purpose: the dashboard's
// Tasks Due card is their sole home. Each item carries display fields + a deep
// link; lower `priority` sorts first. Per-signal item lists are capped so no one
// source floods the card, while `total` is the true count across every signal (so
// the badge can exceed the shown list).
export async function dashboardAttention() {
  const items = []
  let total = 0

  // 1) Overdue invoices — money owed, most urgent.
  const [{ n: invN }] = await query(
    "SELECT COUNT(*) AS n FROM invoices WHERE status = 'open' AND due_date IS NOT NULL AND due_date < CURDATE()"
  )
  total += Number(invN)
  const invoices = await query(
    `SELECT i.id, (i.amount_due - i.amount_paid) AS balance,
            DATEDIFF(CURDATE(), i.due_date) AS days_late,
            COALESCE(c.company, c.name) AS client
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.status = 'open' AND i.due_date IS NOT NULL AND i.due_date < CURDATE()
      ORDER BY i.due_date ASC LIMIT 3`
  )
  for (const r of invoices) {
    const d = Number(r.days_late)
    items.push({
      id: `invoice-${r.id}`,
      title: `${r.client} invoice overdue`,
      meta: `${money(r.balance)} · ${plural(d, 'day')} past due`,
      icon: 'i-lucide-triangle-alert', tone: 'error', chip: 'error', chipText: 'Overdue',
      to: '/invoices', priority: 1000 - Math.min(d, 90)
    })
  }

  // NB: late/due-today tasks are deliberately NOT a signal here — the dashboard's
  // Tasks Due card owns them outright, so listing them again would double up.

  // 3) Agreements awaiting a close — proposals/contracts sent or viewed.
  const [{ n: agrN }] = await query(
    `SELECT (
       (SELECT COUNT(*) FROM proposals WHERE status IN ('sent', 'viewed')) +
       (SELECT COUNT(*) FROM contracts WHERE status IN ('sent', 'viewed'))
     ) AS n`
  )
  total += Number(agrN)
  const agreements = await query(
    `SELECT * FROM (
       SELECT 'proposal' AS kind, p.id, p.total,
              DATEDIFF(CURDATE(), p.sent_at) AS sent_days, DATEDIFF(p.expires_at, CURDATE()) AS expires_in,
              COALESCE(c.company, c.name) AS client
         FROM proposals p JOIN clients c ON c.id = p.client_id
        WHERE p.status IN ('sent', 'viewed')
       UNION ALL
       SELECT 'contract' AS kind, ct.id, ct.total,
              DATEDIFF(CURDATE(), ct.sent_at) AS sent_days, DATEDIFF(ct.expires_at, CURDATE()) AS expires_in,
              COALESCE(c.company, c.name) AS client
         FROM contracts ct JOIN clients c ON c.id = ct.client_id
        WHERE ct.status IN ('sent', 'viewed')
     ) a
     ORDER BY (a.expires_in IS NULL) ASC, a.expires_in ASC, a.sent_days DESC LIMIT 3`
  )
  for (const r of agreements) {
    const noun = r.kind === 'proposal' ? 'proposal' : 'contract'
    const expIn = r.expires_in == null ? null : Number(r.expires_in)
    const expiring = expIn != null && expIn >= 0 && expIn <= 7
    items.push({
      id: `${r.kind}-${r.id}`,
      title: `${r.client} ${noun} ${r.kind === 'proposal' ? 'awaiting reply' : 'unsigned'}`,
      meta: expiring
        ? `${money(r.total)} · expires in ${plural(expIn, 'day')}`
        : `${money(r.total)} · sent ${plural(Number(r.sent_days ?? 0), 'day')} ago`,
      icon: 'i-lucide-file-text', tone: expiring ? 'warning' : 'info',
      chip: expiring ? 'warning' : 'info', chipText: expiring ? 'Expiring' : 'Awaiting',
      to: '/agreements', priority: 3000 - (expiring ? (7 - expIn) * 10 : 0)
    })
  }

  // 4) Overdue outreach follow-ups (aggregate row).
  const [{ n: fuN }] = await query(
    `SELECT COUNT(*) AS n FROM leads
      WHERE source = 'manual' AND next_action_at IS NOT NULL AND next_action_at < NOW()
        AND stage NOT IN ('qualified', 'lost')`
  )
  const fu = Number(fuN)
  total += fu
  if (fu > 0) {
    items.push({
      id: 'followups',
      title: `${plural(fu, 'outreach follow-up')} overdue`,
      meta: 'Manual outreach · past due',
      icon: 'i-lucide-arrow-up-from-line', tone: 'warning', chip: 'warning', chipText: 'Follow up',
      to: '/leads', priority: 4000
    })
  }

  // 5) New (unreviewed) receptionist calls (aggregate row).
  const [{ n: callN }] = await query('SELECT COUNT(*) AS n FROM calls WHERE reviewed_at IS NULL')
  const calls = Number(callN)
  total += calls
  if (calls > 0) {
    items.push({
      id: 'calls',
      title: `${plural(calls, 'new call')} to review`,
      meta: 'AI Receptionist inbox',
      icon: 'i-lucide-phone', tone: 'info', chip: 'info', chipText: 'New',
      to: '/receptionist', priority: 4500
    })
  }

  // 6) Support tickets — two aggregate signals: the total open queue, plus a
  //    high-priority highlight. High-priority is a subset of open, so only the
  //    open count feeds `total` (avoids double-counting the badge).
  const TICKET_OPEN = `status IN ('open', 'in_progress', 'waiting')`
  const [{ n: openN }] = await query(`SELECT COUNT(*) AS n FROM tickets WHERE ${TICKET_OPEN}`)
  const [{ n: hiN }] = await query(`SELECT COUNT(*) AS n FROM tickets WHERE ${TICKET_OPEN} AND priority = 'high'`)
  total += Number(openN)
  if (Number(hiN) > 0) {
    items.push({
      id: 'tickets-high',
      title: `${plural(hiN, 'high priority ticket')}`,
      meta: 'Support · needs attention',
      icon: 'i-lucide-life-buoy', tone: 'warning', chip: 'warning', chipText: 'High',
      to: '/support', priority: 2200
    })
  }
  if (Number(openN) > 0) {
    items.push({
      id: 'tickets-open',
      title: `${plural(openN, 'open ticket')}`,
      meta: 'Support · in the queue',
      icon: 'i-lucide-life-buoy', tone: 'info', chip: 'info', chipText: 'Open',
      to: '/support', priority: 2900
    })
  }

  // 7) Subscriptions renewing soon — recurring spend about to hit again.
  const [{ n: renN }] = await query(
    `SELECT COUNT(*) AS n FROM expenses
      WHERE category = 'subscription' AND status = 'active'
        AND next_renewal_at IS NOT NULL AND next_renewal_at <= (CURDATE() + INTERVAL 7 DAY)`
  )
  total += Number(renN)
  const renewals = await query(
    `SELECT id, vendor, amount, billing_interval, DATEDIFF(next_renewal_at, CURDATE()) AS days_until
       FROM expenses
      WHERE category = 'subscription' AND status = 'active'
        AND next_renewal_at IS NOT NULL AND next_renewal_at <= (CURDATE() + INTERVAL 7 DAY)
      ORDER BY next_renewal_at ASC LIMIT 2`
  )
  for (const r of renewals) {
    const d = Number(r.days_until)
    const when = d < 0 ? `${plural(-d, 'day')} overdue` : d === 0 ? 'renews today' : `in ${plural(d, 'day')}`
    items.push({
      id: `subscription-${r.id}`,
      title: `${r.vendor} renews soon`,
      meta: `${money(r.amount)} · ${r.billing_interval} · ${when}`,
      icon: 'i-lucide-calendar-clock', tone: 'warning', chip: 'warning', chipText: 'Renewing',
      to: '/expenses', priority: 4200 - Math.min(Math.max(7 - d, 0), 30)
    })
  }

  // 8) Billable client expenses not yet recovered (aggregate row).
  const [{ n: billN }] = await query(
    'SELECT COUNT(*) AS n FROM expenses WHERE billable = 1 AND reimbursed_at IS NULL'
  )
  const billable = Number(billN)
  total += billable
  if (billable > 0) {
    items.push({
      id: 'billable-expenses',
      title: `${plural(billable, 'billable expense')} to recover`,
      meta: 'Client expenses · not yet rebilled',
      icon: 'i-lucide-wallet', tone: 'info', chip: 'info', chipText: 'Rebill',
      to: '/expenses', priority: 4600
    })
  }

  // 9) Infrastructure alerts — down sites, high CPU, low disk (poll-based DO alerting).
  const INFRA_META = {
    site_down: { chip: 'Down', icon: 'i-lucide-server-crash' },
    high_cpu: { chip: 'High CPU', icon: 'i-lucide-cpu' },
    disk_full: { chip: 'Low disk', icon: 'i-lucide-hard-drive' }
  }
  const alerts = await listActiveAlerts()
  total += alerts.length
  for (const a of alerts) {
    const meta = INFRA_META[a.kind] || { chip: 'Alert', icon: 'i-lucide-server-crash' }
    items.push({
      id: `infra-${a.id}`,
      title: `${a.label} · ${meta.chip}`,
      meta: a.detail || '',
      icon: meta.icon, tone: a.tone, chip: a.tone, chipText: meta.chip,
      to: a.link || '/websites',
      priority: a.kind === 'site_down' ? 400 : 2500
    })
  }

  items.sort((a, b) => a.priority - b.priority)
  // Title-case every title so the feed reads uniformly regardless of the source
  // signal's phrasing (e.g. "1 open ticket" -> "1 Open Ticket").
  const shown = items.slice(0, 6).map(it => ({ ...it, title: titleCase(it.title) }))
  return { items: shown, total }
}
