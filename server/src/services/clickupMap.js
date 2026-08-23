// Pure mapping between ClickUp's model and Ops'. No I/O, no DB, no config
// beyond the timezone offset — everything here is a function of its arguments,
// so the round-trip invariants below can be checked in isolation.
//
// The load-bearing rule: the "shadow" (the last state both sides agreed on) is
// stored in OPS space, not ClickUp space. A ClickUp edit that maps to the same
// Ops value is therefore invisible to the sync — no write, no emit, no push
// back. That's what makes a deliberately lossy status mapping safe.

const norm = s => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const normTitle = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * MySQL hands us 'YYYY-MM-DD HH:MM:SS' in UTC with no zone marker (see
 * db/pool.js's timezone contract), which Date.parse would read as LOCAL —
 * silently correct in the prod UTC container, hours wrong on a dev Mac.
 */
export function utcMs(s) {
  if (!s) return 0
  if (s instanceof Date) return s.getTime()
  return Date.parse(String(s).replace(' ', 'T') + 'Z') || 0
}

/* ------------------------------------------------------------------ status */

// Ops has four statuses; a ClickUp Space can define any names it likes. Match
// on name first so intent survives, and fall back on ClickUp's `type`.
const STATUS_ALIASES = {
  todo: ['to do', 'todo', 'open', 'backlog', 'not started', 'new', 'pending'],
  in_progress: ['in progress', 'in review', 'review needed', 'doing', 'active', 'wip', 'started', 'working on it'],
  blocked: ['blocked', 'on hold', 'hold', 'waiting', 'waiting on client', 'needs info', 'paused'],
  done: ['done', 'complete', 'completed', 'closed', 'shipped', 'approved', 'delivered']
}
const BY_NAME = new Map(
  Object.entries(STATUS_ALIASES).flatMap(([ops, names]) => names.map(n => [n, ops]))
)

/**
 * ClickUp status object → Ops enum. Never throws, never returns undefined.
 *
 * Only the done/not-done boundary actually matters: the milestone rollup counts
 * SUM(status = 'done'), so confusing todo with in_progress changes nothing the
 * portal displays. ClickUp reserves type 'open' for a list's first status and
 * 'closed'/'done' for its finished ones, which pins that boundary exactly
 * regardless of what the status is named.
 */
export function statusToOps(cuStatus) {
  const named = BY_NAME.get(norm(cuStatus?.status))
  if (named) return named
  switch (cuStatus?.type) {
    case 'closed':
    case 'done': return 'done'
    case 'open': return 'todo'
    // Every status between the first and last is 'custom' — i.e. genuinely
    // "started, not finished".
    case 'custom': return 'in_progress'
    default: return 'todo'
  }
}

/**
 * Resolve Ops enum → the status NAME to send, against a list's real statuses.
 * PUT /task with a status the list doesn't define returns 400, so we can never
 * invent one. Returns { map, lossy } — `lossy` names Ops statuses that collapse
 * onto another's ClickUp name, which is a round trip that won't survive.
 */
export function buildStatusMap(statuses = []) {
  const ordered = [...statuses].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))
  const open = ordered.find(s => s.type === 'open')
  // Prefer the 'done' category over 'closed': ClickUp treats 'done' as the
  // friendly finished state and 'closed' as the archive-ish terminal one. Both
  // map back to Ops 'done', so this is purely about what reads better in ClickUp.
  const closed = ordered.find(s => s.type === 'done') || ordered.find(s => s.type === 'closed')
  const custom = ordered.filter(s => s.type === 'custom')
  const byAlias = ops => ordered.find(s => STATUS_ALIASES[ops].includes(norm(s.status)))

  const map = {
    todo: (byAlias('todo') ?? open ?? ordered[0])?.status ?? null,
    in_progress: (byAlias('in_progress') ?? custom[0] ?? open ?? ordered[0])?.status ?? null,
    done: (closed ?? ordered.at(-1))?.status ?? null,
    blocked: null
  }
  // Never invent a Blocked status — fall back to whatever in_progress resolved
  // to, and report the collapse rather than hiding it.
  map.blocked = byAlias('blocked')?.status ?? map.in_progress

  const lossy = Object.entries(map)
    .filter(([ops, name]) => name && Object.entries(map).some(([o, n]) => o !== ops && n === name))
    .map(([ops]) => ops)
  return { map, lossy }
}

/* ---------------------------------------------------------------- priority */

// ClickUp: null | {priority: 'urgent'|'high'|'normal'|'low'}. Ops has no "none",
// so null and 'normal' both land on medium. Lossy, but stable: because pushes
// send only CHANGED fields, an untouched Ops priority is never in a PUT body,
// so 'urgent' is never silently demoted by an unrelated title edit.
export function priorityToOps(p) {
  switch (norm(p?.priority ?? p)) {
    case 'urgent': case 'high': return 'high'
    case 'low': return 'low'
    default: return 'medium'
  }
}
export function priorityToClickUp(p) {
  return p === 'high' ? 2 : p === 'low' ? 4 : 3 // ClickUp: 1 urgent, 2 high, 3 normal, 4 low
}

/* -------------------------------------------------------------------- date */

/**
 * Ops stores DATE ('YYYY-MM-DD'); ClickUp stores epoch ms. Push NOON UTC so
 * neither side's timezone normalization can cross midnight and shift the date
 * by a day — the classic silent corrupter, and worse here because an unstable
 * round trip turns a one-day skew into a permanent push/pull loop.
 */
export function dateToClickUp(d) {
  if (!d) return null
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return null
  return Date.UTC(y, m - 1, day, 12, 0, 0)
}
export function dateToOps(ms, offsetMinutes = 0) {
  if (ms == null || ms === '') return null
  const n = Number(ms)
  if (!Number.isFinite(n)) return null
  // Clamp the workspace offset to ±11h. We push noon UTC, so anything inside
  // that window lands on the same calendar day; an unclamped ±12h+ offset
  // (UTC+12/+13) would roll a date we ourselves wrote forward by a day and
  // turn the one-day skew into a permanent push/pull loop.
  const off = Math.max(-660, Math.min(660, Number(offsetMinutes) || 0))
  return new Date(n + off * 60_000).toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ shadow */

// The exact field set the two sides keep in step. `position` is excluded on
// purpose (ClickUp's orderindex is a per-view float that doesn't round-trip)
// and so is completed_at (tasks.repo derives it from status). Syncing either
// would produce permanent churn.
export const SYNCED_FIELDS = ['title', 'description', 'status', 'priority', 'due_date', 'milestone_title']

export function shadowOf(x) {
  return {
    title: String(x?.title ?? '').trim(),
    description: String(x?.description ?? '').trim() || null,
    status: x?.status ?? 'todo',
    priority: x?.priority ?? 'medium',
    due_date: x?.due_date ? String(x.due_date).slice(0, 10) : null,
    milestone_title: x?.milestone_title ? normTitle(x.milestone_title) : null
  }
}

export const shadowEq = (a, b) => SYNCED_FIELDS.every(f => (a?.[f] ?? null) === (b?.[f] ?? null))
export const changedFields = (a, b) => SYNCED_FIELDS.filter(f => (a?.[f] ?? null) !== (b?.[f] ?? null))
