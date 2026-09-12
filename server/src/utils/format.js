// Display formatting shared by the document generators (PandaDoc tokens, the
// ClickUp scope summary). Pure functions of their arguments — no I/O, no config.

export const str = v => (v == null ? '' : String(v))

export const money = v => (v == null ? '' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

// Format a DATE (YYYY-MM-DD or Date) as "June 17, 2026", timezone-safe (no off-by-one).
export const date = (v) => {
  if (v == null || v === '') return ''
  const s = (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return str(v)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
