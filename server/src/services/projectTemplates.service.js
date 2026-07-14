import * as repo from '../repositories/projectTemplates.repo.js'

// Thin write-path wrapper over the repo. Templates aren't realtime (they're
// config edited in Settings), so no socket emits — reads go straight to the repo.

export async function saveTemplate(id, payload) {
  return repo.saveTemplate(id, payload)
}

export async function deleteTemplate(id) {
  return repo.deleteTemplate(id)
}
