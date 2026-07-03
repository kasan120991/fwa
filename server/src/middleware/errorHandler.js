import { isProd } from '../config/env.js'

/**
 * Central error handler. Express 5 forwards rejected promises from async
 * handlers here automatically, so route code can just `throw`.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args)
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500
  const body = { error: { message: err.message || 'Internal server error' } }

  if (err.fields) body.error.fields = err.fields
  if (status >= 500) console.error(err)
  if (!isProd && err.stack) body.error.stack = err.stack

  res.status(status).json(body)
}
