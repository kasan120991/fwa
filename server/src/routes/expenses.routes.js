import { Router } from 'express'
import {
  createExpense, getExpense, listExpenses, updateExpense, deleteExpense, expenseStats,
  EXPENSE_CATEGORIES, EXPENSE_STATUSES, PAYMENT_METHODS, BILLING_INTERVALS
} from '../repositories/expenses.repo.js'
import { getClient } from '../repositories/clients.repo.js'
import { notify } from '../services/notifications.service.js'
import { emitExpenseChanged } from '../realtime/io.js'

export const expensesRouter = Router()

function badRequest(message, fields) {
  const err = new Error(message)
  err.status = 400
  if (fields) err.fields = fields
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}
// Validate an optional date field; returns a 'YYYY-MM-DD' string or null.
function parseDate(value, field, fields) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw badRequest('Validation failed', { ...fields, [field]: 'must be a valid date' })
  }
  return value.slice(0, 10)
}

// GET /api/expenses/stats
expensesRouter.get('/stats', async (req, res) => {
  res.json({ data: await expenseStats() })
})

// GET /api/expenses  ?category= ?client_id= ?project_id= ?status= ?billable= ?search=
expensesRouter.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  if (category && !EXPENSE_CATEGORIES.has(category)) throw badRequest(`Unknown category: ${category}`)
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (status && !EXPENSE_STATUSES.has(status)) throw badRequest(`Unknown status: ${status}`)
  const result = await listExpenses({
    category,
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
    status,
    billable: req.query.billable === '1' || req.query.billable === 'true' ? true : undefined,
    search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/expenses/:id
expensesRouter.get('/:id', async (req, res) => {
  const expense = await getExpense(parseId(req))
  if (!expense) return res.status(404).json({ error: { message: 'Expense not found' } })
  res.json({ data: expense })
})

// POST /api/expenses
expensesRouter.post('/', async (req, res) => {
  const body = req.body ?? {}

  const category = body.category
  if (!EXPENSE_CATEGORIES.has(category)) throw badRequest('Validation failed', { category: 'client, business, or subscription is required' })

  const vendor = typeof body.vendor === 'string' && body.vendor.trim() ? body.vendor.trim() : null
  if (!vendor) throw badRequest('Validation failed', { vendor: 'vendor is required' })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Validation failed', { amount: 'must be a number > 0' })

  const expense_date = parseDate(body.expense_date, 'expense_date')
  if (!expense_date) throw badRequest('Validation failed', { expense_date: 'expense_date is required' })

  const payment_method = PAYMENT_METHODS.has(body.payment_method) ? body.payment_method : 'card'

  // Client expenses must name a real client; others may optionally carry one.
  let client_id = body.client_id != null && body.client_id !== '' ? Number(body.client_id) : null
  if (category === 'client') {
    if (!Number.isInteger(client_id) || client_id <= 0) throw badRequest('Validation failed', { client_id: 'a client is required for a client expense' })
  }
  if (client_id != null) {
    const client = await getClient(client_id)
    if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
  }

  // Subscriptions require a billing cycle + renewal date.
  let billing_interval = null
  let next_renewal_at = null
  if (category === 'subscription') {
    if (!BILLING_INTERVALS.has(body.billing_interval)) throw badRequest('Validation failed', { billing_interval: 'monthly or yearly is required for a subscription' })
    billing_interval = body.billing_interval
    next_renewal_at = parseDate(body.next_renewal_at, 'next_renewal_at')
    if (!next_renewal_at) throw badRequest('Validation failed', { next_renewal_at: 'a renewal date is required for a subscription' })
  }

  const billable = category === 'client' ? Boolean(body.billable) : false
  const project_id = body.project_id != null && body.project_id !== '' ? Number(body.project_id) : null
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  const receipt_url = typeof body.receipt_url === 'string' && body.receipt_url.trim() ? body.receipt_url.trim() : null

  const expense = await createExpense({
    category, client_id, project_id, vendor, description, amount,
    currency: typeof body.currency === 'string' ? body.currency.slice(0, 3).toUpperCase() : 'USD',
    expense_date, payment_method, billable, receipt_url, billing_interval, next_renewal_at, notes
  })

  const label = category === 'subscription' ? 'Subscription added' : 'Expense recorded'
  try {
    await notify({
      category: 'expense', tone: 'info', icon: 'i-lucide-wallet',
      title: label,
      body: `${vendor} — $${amount.toLocaleString('en-US')}`,
      link: '/expenses'
    }, req.user.id)
  } catch (err) {
    console.error(`Expense notification failed for ${expense.id}:`, err.message)
  }
  emitExpenseChanged(expense.id)
  res.status(201).json({ data: expense })
})

// PATCH /api/expenses/:id
expensesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req)
  const existing = await getExpense(id)
  if (!existing) return res.status(404).json({ error: { message: 'Expense not found' } })

  const body = req.body ?? {}
  const data = {}

  if (body.vendor !== undefined) {
    const v = typeof body.vendor === 'string' ? body.vendor.trim() : ''
    if (!v) throw badRequest('Validation failed', { vendor: 'vendor cannot be empty' })
    data.vendor = v
  }
  if (body.amount !== undefined) {
    const n = Number(body.amount)
    if (!Number.isFinite(n) || n <= 0) throw badRequest('Validation failed', { amount: 'must be a number > 0' })
    data.amount = n
  }
  if (body.expense_date !== undefined) data.expense_date = parseDate(body.expense_date, 'expense_date')
  if (body.payment_method !== undefined) {
    if (!PAYMENT_METHODS.has(body.payment_method)) throw badRequest('Validation failed', { payment_method: 'invalid payment method' })
    data.payment_method = body.payment_method
  }
  if (body.status !== undefined) {
    if (!EXPENSE_STATUSES.has(body.status)) throw badRequest('Validation failed', { status: 'invalid status' })
    data.status = body.status
  }
  if (body.client_id !== undefined) {
    const cid = body.client_id != null && body.client_id !== '' ? Number(body.client_id) : null
    if (existing.category === 'client' && (!Number.isInteger(cid) || cid <= 0)) throw badRequest('Validation failed', { client_id: 'a client is required for a client expense' })
    if (cid != null) {
      const client = await getClient(cid)
      if (!client) throw badRequest('Validation failed', { client_id: 'client not found' })
    }
    data.client_id = cid
  }
  if (body.billing_interval !== undefined) {
    if (existing.category === 'subscription' && !BILLING_INTERVALS.has(body.billing_interval)) throw badRequest('Validation failed', { billing_interval: 'monthly or yearly is required' })
    data.billing_interval = body.billing_interval || null
  }
  if (body.next_renewal_at !== undefined) {
    const nr = parseDate(body.next_renewal_at, 'next_renewal_at')
    if (existing.category === 'subscription' && !nr) throw badRequest('Validation failed', { next_renewal_at: 'a renewal date is required for a subscription' })
    data.next_renewal_at = nr
    // A rescheduled renewal reopens the reminder window for that cycle.
    data.renewal_reminded_on = null
  }
  if (body.billable !== undefined) data.billable = existing.category === 'client' ? Boolean(body.billable) : false
  if (body.reimbursed_at !== undefined) data.reimbursed_at = body.reimbursed_at ? new Date() : null
  if (body.project_id !== undefined) data.project_id = body.project_id != null && body.project_id !== '' ? Number(body.project_id) : null
  if (body.description !== undefined) data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  if (body.notes !== undefined) data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  if (body.receipt_url !== undefined) data.receipt_url = typeof body.receipt_url === 'string' && body.receipt_url.trim() ? body.receipt_url.trim() : null
  if (body.currency !== undefined && typeof body.currency === 'string') data.currency = body.currency.slice(0, 3).toUpperCase()

  const updated = await updateExpense(id, data)
  emitExpenseChanged(id)
  res.json({ data: updated })
})

// POST /api/expenses/:id/cancel — cancel a subscription (stops the renewal rollup + reminders).
expensesRouter.post('/:id/cancel', async (req, res) => {
  const id = parseId(req)
  const existing = await getExpense(id)
  if (!existing) return res.status(404).json({ error: { message: 'Expense not found' } })
  if (existing.category !== 'subscription') return res.status(409).json({ error: { message: 'Only a subscription can be cancelled' } })
  if (existing.status === 'cancelled') return res.status(409).json({ error: { message: 'Subscription is already cancelled' } })
  const updated = await updateExpense(id, { status: 'cancelled' })
  emitExpenseChanged(id)
  res.json({ data: updated })
})

// DELETE /api/expenses/:id
expensesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req)
  const ok = await deleteExpense(id)
  if (!ok) return res.status(404).json({ error: { message: 'Expense not found' } })
  emitExpenseChanged(id)
  res.json({ data: { id, deleted: true } })
})
