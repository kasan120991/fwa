// Shared text helpers.

// Minor words kept lowercase mid-title (standard title case).
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

/**
 * Normalize a string to Title Case so UI text reads uniformly (producers can
 * write plain sentence case). Words that already carry an uppercase letter or a
 * digit are left untouched, so codes/acronyms/proper nouns survive (e.g.
 * `SR-001`, `PDF`, `In Progress`, `Northwind`). Minor words stay lowercase
 * mid-string.
 */
export function titleCase(str) {
  return String(str).split(/\s+/).map((w, i) => {
    if (!w) return w
    if (/[A-Z0-9]/.test(w)) return w
    if (i > 0 && MINOR_WORDS.has(w)) return w
    return w[0].toUpperCase() + w.slice(1)
  }).join(' ')
}
