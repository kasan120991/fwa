// A deliberately small fixed-window limiter for the public (unauthenticated)
// routes. No dependency, no store.
//
// Be honest about what this is: the counter lives in this process's memory, so
// it resets on every deploy and doesn't span the api and api-demo containers.
// It is a brake on scripted abuse of endpoints that mutate state, send email
// and call two paid APIs — not a security control. If the public surface ever
// grows past the proposal page, replace it with something shared.
//
// req.ip is trustworthy here: app.js sets `trust proxy`, so it's the real
// client address rather than Caddy's.

const buckets = new Map()

// Bounded so a flood of distinct IPs can't grow the map without limit; at the
// cap we stop tracking new IPs rather than evict (failing open is correct for a
// brake, and the alternative is evicting the very attacker being limited).
const MAX_TRACKED = 10_000

export function rateLimit({ windowMs = 60_000, max = 30, name = 'public' } = {}) {
  return function rateLimiter(req, res, next) {
    const now = Date.now()
    const key = `${name}:${req.ip}`
    const hit = buckets.get(key)

    if (!hit || hit.resetAt <= now) {
      if (!hit && buckets.size >= MAX_TRACKED) return next()
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (hit.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ error: { message: 'Too many requests. Please try again shortly.' } })
    }
    hit.count++
    next()
  }
}

// Opportunistic sweep so an idle process doesn't hold every IP it ever saw.
// Unref'd, like the scheduler's intervals, so it never holds the process open.
setInterval(() => {
  const now = Date.now()
  for (const [key, hit] of buckets) if (hit.resetAt <= now) buckets.delete(key)
}, 5 * 60_000).unref()
