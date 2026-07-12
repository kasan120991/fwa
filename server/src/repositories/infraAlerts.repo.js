import { query } from '../db/pool.js'

// Dedup/state store for infra alerting. One active row per (subject_type, subject_id,
// kind); resolved_at NULL = active. Open/resolve report whether a real transition
// happened so the caller notifies only on edges, not every poll.

/**
 * Open (or refresh) an alert. Returns { opened:true } when it was absent or previously
 * resolved — i.e. a healthy→unhealthy transition worth notifying on.
 */
export async function openAlert({ subject_type, subject_id, kind, label, detail = null, link = null, tone = 'error' }) {
  const existing = await query(
    'SELECT id, resolved_at FROM infra_alerts WHERE subject_type = :subject_type AND subject_id = :subject_id AND kind = :kind LIMIT 1',
    { subject_type, subject_id: String(subject_id), kind }
  )
  const row = existing[0]
  const opened = !row || row.resolved_at != null

  if (!row) {
    await query(
      `INSERT INTO infra_alerts (subject_type, subject_id, kind, label, detail, link, tone, opened_at)
       VALUES (:subject_type, :subject_id, :kind, :label, :detail, :link, :tone, NOW())`,
      { subject_type, subject_id: String(subject_id), kind, label, detail, link, tone }
    )
  } else if (opened) {
    // Re-open a previously resolved alert (fresh incident).
    await query(
      'UPDATE infra_alerts SET label = :label, detail = :detail, link = :link, tone = :tone, opened_at = NOW(), resolved_at = NULL WHERE id = :id',
      { id: row.id, label, detail, link, tone }
    )
  } else {
    // Still active — just refresh the display fields (e.g. the CPU %).
    await query('UPDATE infra_alerts SET label = :label, detail = :detail, link = :link, tone = :tone WHERE id = :id',
      { id: row.id, label, detail, link, tone })
  }
  return { opened }
}

/** Resolve an active alert. Returns { wasActive:true } if one was open (→ recovery notify). */
export async function resolveAlert(subject_type, subject_id, kind) {
  const res = await query(
    'UPDATE infra_alerts SET resolved_at = NOW() WHERE subject_type = :subject_type AND subject_id = :subject_id AND kind = :kind AND resolved_at IS NULL',
    { subject_type, subject_id: String(subject_id), kind }
  )
  return { wasActive: res.affectedRows > 0 }
}

/** Active alerts for the dashboard "Needs Attention" feed. */
export async function listActiveAlerts() {
  return query('SELECT * FROM infra_alerts WHERE resolved_at IS NULL ORDER BY opened_at ASC')
}
