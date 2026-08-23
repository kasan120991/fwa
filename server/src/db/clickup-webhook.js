import { config } from '../config/env.js'
import * as cu from '../services/clickup.js'

// Register / inspect / remove the ClickUp delivery webhook.
//   npm run clickup:webhook -- list
//   npm run clickup:webhook -- register https://app.franciswebagency.com
//   npm run clickup:webhook -- delete <webhook_id>
//
// Never auto-registered at boot: the signing secret is only returned once, at
// creation, and a restart loop would pile up duplicate webhooks.

const EVENTS = [
  'taskCreated', 'taskUpdated', 'taskStatusUpdated', 'taskPriorityUpdated',
  'taskDueDateUpdated', 'taskMoved', 'taskDeleted'
]

const [cmd, arg] = process.argv.slice(2)

if (!cu.isConfigured()) {
  console.error('ClickUp is not configured — set CLICKUP_API_TOKEN and CLICKUP_SPACE_ID.')
  process.exit(1)
}
if (!config.clickup.teamId) {
  console.error('CLICKUP_TEAM_ID is required to manage webhooks.')
  process.exit(1)
}

try {
  if (cmd === 'list') {
    const hooks = await cu.listWebhooks()
    if (!hooks.length) console.log('No webhooks registered.')
    for (const w of hooks) {
      console.log(`${w.id}  ${w.endpoint}`)
      console.log(`   events: ${(w.events ?? []).join(', ')}`)
      console.log(`   health: ${w.health?.status} (fail_count ${w.health?.fail_count ?? 0})`)
    }
  } else if (cmd === 'register') {
    if (!arg) { console.error('Usage: clickup:webhook -- register <base-url>'); process.exit(1) }
    const endpoint = `${arg.replace(/\/+$/, '')}/api/webhooks/clickup`
    const hook = await cu.createWebhook(endpoint, EVENTS)
    console.log(`Registered webhook ${hook.id} -> ${endpoint}`)
    console.log('\nAdd this to .env (and .env.production on the server):\n')
    console.log(`CLICKUP_WEBHOOK_SECRET=${hook.secret}\n`)
    console.log('The secret is shown ONCE. Losing it means deleting and re-registering.')
  } else if (cmd === 'delete') {
    if (!arg) { console.error('Usage: clickup:webhook -- delete <webhook_id>'); process.exit(1) }
    await cu.deleteWebhook(arg)
    console.log(`Deleted webhook ${arg}`)
  } else {
    console.log('Usage: npm run clickup:webhook -- list | register <base-url> | delete <id>')
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
