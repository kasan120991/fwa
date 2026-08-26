import { config } from '../config/env.js'

// ClickUp API v2 client. Empty CLICKUP_API_TOKEN (or space id) = disabled
// (no-op), matching the DigitalOcean/Plausible pattern. Native fetch, and note
// the auth header is the BARE token — not `Bearer <token>`. No DB access here;
// callers (services/clickupProvision.js, services/clickupSync.js) gate and shape it.
export const isConfigured = () => Boolean(config.clickup.apiToken && config.clickup.spaceId)

// ClickUp allows ~100 requests/minute per token, and provisioning a project is
// bursty by nature: a task plus its checklist is half a dozen calls, so a
// template with a few phases clears the limit on its own. A 429 is a "wait",
// not a failure — retrying it here keeps every caller from having to know, and
// stops a backfill from leaving a half-built tree behind.
const RATE_LIMIT_RETRIES = 3
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function cuFetch(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString()
    : ''
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${config.clickup.baseUrl}${path}${qs}`, {
      method,
      headers: {
        Authorization: config.clickup.apiToken,
        'Content-Type': 'application/json'
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000)
    })
    if (res.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      // Prefer what ClickUp tells us; its window is per-minute, so fall back to
      // waiting out the rest of one rather than a token-bucket-sized sleep.
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 60) * 1000
        : (attempt + 1) * 20_000
      console.warn(`[clickup] rate limited on ${method} ${path} — retrying in ${Math.round(waitMs / 1000)}s`)
      await sleep(waitMs)
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // The message reaches the admin toast verbatim, so keep the real reason.
      throw new Error(`ClickUp ${res.status}: ${text.slice(0, 200)}`)
    }
    if (res.status === 204) return null
    const text = await res.text()
    return text ? JSON.parse(text) : {}
  }
}

/* ---------------------------------------------------------------- structure */

/** Folders in the Clients space (one per client). */
export async function listFolders() {
  const json = await cuFetch(`/space/${config.clickup.spaceId}/folder`, { query: { archived: 'false' } })
  return json.folders ?? []
}

/** Create a client's folder. */
export async function createFolder(name) {
  return cuFetch(`/space/${config.clickup.spaceId}/folder`, { method: 'POST', body: { name } })
}

export async function deleteFolder(folderId) {
  return cuFetch(`/folder/${folderId}`, { method: 'DELETE' })
}

/** Lists inside a folder. */
export async function listFolderLists(folderId) {
  const json = await cuFetch(`/folder/${folderId}/list`, { query: { archived: 'false' } })
  return json.lists ?? []
}

/** Create a list inside a folder ("Projects" / "Care Plan"). */
export async function createList(folderId, name) {
  return cuFetch(`/folder/${folderId}/list`, { method: 'POST', body: { name } })
}

/** One list, including its `statuses[]` — needed to map Ops status → ClickUp. */
export async function getList(listId) {
  return cuFetch(`/list/${listId}`)
}

/* -------------------------------------------------------------------- tasks */

/**
 * Every task in a list including subtasks and closed ones — the reconcile
 * sweep's single call per client. ClickUp pages at 100; follow `last_page`.
 */
export async function listTasks(listId) {
  const out = []
  for (let page = 0; page < 50; page++) {
    const json = await cuFetch(`/list/${listId}/task`, {
      query: { subtasks: 'true', include_closed: 'true', archived: 'false', page: String(page) }
    })
    const batch = json.tasks ?? []
    out.push(...batch)
    if (json.last_page || batch.length === 0) break
  }
  return out
}

export async function getTask(taskId) {
  return cuFetch(`/task/${taskId}`, { query: { include_subtasks: 'true' } })
}

/** Create a task, or a subtask when `parent` is a task id. */
export async function createTask(listId, body) {
  return cuFetch(`/list/${listId}/task`, { method: 'POST', body })
}

export async function updateTask(taskId, body) {
  return cuFetch(`/task/${taskId}`, { method: 'PUT', body })
}

export async function deleteTask(taskId) {
  return cuFetch(`/task/${taskId}`, { method: 'DELETE' })
}

/* --------------------------------------------------------------- checklists */
// A task's checklists ride along in getTask()/listTasks() as `checklists[]`, so
// reading costs no extra request. Note item `orderindex` comes back null in
// practice — order is the array order.

/** Create a checklist on a task (Ops keeps one per task). */
export async function createChecklist(taskId, name = 'Checklist') {
  const json = await cuFetch(`/task/${taskId}/checklist`, { method: 'POST', body: { name } })
  return json.checklist ?? json
}

export async function createChecklistItem(checklistId, name) {
  const json = await cuFetch(`/checklist/${checklistId}/checklist_item`, { method: 'POST', body: { name } })
  return json.checklist ?? json
}

/** Rename or resolve an item. Note the path is nested under its checklist. */
export async function updateChecklistItem(checklistId, itemId, body) {
  const json = await cuFetch(`/checklist/${checklistId}/checklist_item/${itemId}`, { method: 'PUT', body })
  return json.checklist ?? json
}

export async function deleteChecklistItem(checklistId, itemId) {
  return cuFetch(`/checklist/${checklistId}/checklist_item/${itemId}`, { method: 'DELETE' })
}

/* ----------------------------------------------------------------- webhooks */

export async function listWebhooks() {
  const json = await cuFetch(`/team/${config.clickup.teamId}/webhook`)
  return json.webhooks ?? []
}

/** Register the delivery webhook; the response carries the signing `secret`. */
export async function createWebhook(endpoint, events) {
  const json = await cuFetch(`/team/${config.clickup.teamId}/webhook`, {
    method: 'POST', body: { endpoint, events, space_id: Number(config.clickup.spaceId) }
  })
  return json.webhook ?? json
}

export async function deleteWebhook(webhookId) {
  return cuFetch(`/webhook/${webhookId}`, { method: 'DELETE' })
}
