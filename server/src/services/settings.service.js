import { getSettings, updateSettings } from '../repositories/settings.repo.js'

// The settings row is read on hot paths (every notify() + invoice creation), so
// keep it in memory and refresh only when it changes.
let cache = null
let inflight = null

/** The settings row, cached. First call loads it; later calls are in-memory. */
export async function getCachedSettings() {
  if (cache) return cache
  if (!inflight) inflight = getSettings().then((s) => { cache = s; inflight = null; return s })
  return inflight
}

/** Persist a patch to the settings row and refresh the cache. */
export async function saveSettings(patch) {
  cache = await updateSettings(patch)
  return cache
}

/**
 * Whether admin alerts for a notification `category` are enabled. Opt-out: a
 * category notifies unless it's explicitly turned off in notification_prefs.
 */
export async function notificationEnabled(category) {
  if (!category) return true
  const prefs = (await getCachedSettings())?.notification_prefs
  return !(prefs && prefs[category] === false)
}
