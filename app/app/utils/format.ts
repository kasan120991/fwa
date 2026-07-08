// Formatting helpers for API datetime strings ('YYYY-MM-DD HH:MM:SS').

function toDate(input?: string | null): Date | null {
  if (!input) return null
  const d = new Date(input.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/** "12m ago", "5h ago", "3d ago", "2w ago", "2mo ago". */
export function timeAgo(input?: string | null): string {
  const d = toDate(input)
  if (!d) return ''
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  const day = h / 24
  if (day < 7) return `${Math.round(day)}d ago`
  const w = day / 7
  if (w < 5) return `${Math.round(w)}w ago`
  const mo = day / 30
  if (mo < 12) return `${Math.round(mo)}mo ago`
  return `${Math.round(day / 365)}y ago`
}

/** Whole days from now (negative = past). */
export function daysFromNow(input?: string | null): number | null {
  const d = toDate(input)
  if (!d) return null
  return Math.round((d.getTime() - Date.now()) / 86400e3)
}

export function durationMMSS(sec?: number | null): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "Today, 9:12 AM" / "Yesterday, 3:22 PM" / "Jul 1, 10:12 AM". */
export function callTimestamp(input?: string | null): string {
  const d = toDate(input)
  if (!d) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOf(today) - startOf(d)) / 86400e3)
  if (dayDiff === 0) return `Today, ${time}`
  if (dayDiff === 1) return `Yesterday, ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/** Initials from a name ("Dana Cole" → "DC"); falls back to "#". */
export function initials(name?: string | null): string {
  if (!name) return '#'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '#'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Strip a phone number to raw digits — what we store in the DB. */
export function phoneDigits(input?: string | null): string {
  return String(input ?? '').replace(/\D/g, '')
}

/** Format a phone number for display (US-style). Strips to digits first, so it
 *  accepts raw or already-formatted input; unusual lengths degrade gracefully. */
export function formatPhone(input?: string | null): string {
  const d = phoneDigits(input)
  if (!d) return ''
  if (d.length === 11 && d[0] === '1') {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  }
  const p = d.slice(0, 10)
  let out
  if (p.length <= 3) out = `(${p}`
  else if (p.length <= 6) out = `(${p.slice(0, 3)}) ${p.slice(3)}`
  else out = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`
  // keep any extra digits (non-US lengths) rather than dropping them
  return d.length > 10 ? `${out} ${d.slice(10)}` : out
}

/** Whole-dollar money "$18,000" (no cents). Pass cents=true to keep decimals. */
export function formatMoney(n?: number | null, opts?: { cents?: boolean }): string {
  if (n == null || Number.isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', opts?.cents
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 })
}

/** Short date "Mar 12, 2023". */
export function shortDate(input?: string | null): string {
  const d = toDate(input)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Support-ticket display number: SR-001, SR-002, … (derived from the id). */
export function ticketCode(id?: number | null): string {
  return id == null ? '' : `SR-${String(id).padStart(3, '0')}`
}

/** Build SVG polyline point strings for a sparkline/area chart from a number
 *  series, scaled to a `w`×`h` box. Returns `line` (the stroke) + `area` (a closed
 *  fill down to the baseline). Empty when there aren't at least two points. */
export function spark(arr: number[], w = 120, h = 34): { line: string, area: string } {
  if (!arr || arr.length < 2) return { line: '', area: '' }
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  const span = (max - min) || 1
  const step = w / (arr.length - 1)
  const pts = arr.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`)
  return { line: pts.join(' '), area: `0,${h} ${pts.join(' ')} ${w},${h}` }
}
