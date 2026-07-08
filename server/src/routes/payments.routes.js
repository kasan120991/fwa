import { Router } from 'express'
import { listPayments, getPayment, paymentStats, PAYMENT_METHODS } from '../repositories/payments.repo.js'

export const paymentsRouter = Router()

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}
function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id')
  return id
}

// GET /api/payments/stats
paymentsRouter.get('/stats', async (req, res) => {
  res.json({ data: await paymentStats() })
})

// GET /api/payments  ?client_id= ?invoice_id= ?method=
paymentsRouter.get('/', async (req, res) => {
  const method = typeof req.query.method === 'string' ? req.query.method : undefined
  if (method && !PAYMENT_METHODS.has(method)) throw badRequest(`Unknown method: ${method}`)
  const result = await listPayments({
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    invoice_id: req.query.invoice_id ? Number(req.query.invoice_id) : undefined,
    method,
    limit: req.query.limit,
    offset: req.query.offset
  })
  res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset })
})

// GET /api/payments/:id
paymentsRouter.get('/:id', async (req, res) => {
  const payment = await getPayment(parseId(req))
  if (!payment) return res.status(404).json({ error: { message: 'Payment not found' } })
  res.json({ data: payment })
})
