import {
  ensureProjectTask, pushProjectMilestones, pushProjectTasks
} from './clickupSync.js'
import { getProject } from '../repositories/projects.repo.js'
import { notify } from './notifications.service.js'

/**
 * Build the project's ClickUp tree: the project task, a subtask per
 * template-seeded milestone, then its work items nested under those.
 *
 * Best-effort and fire-and-forget, mirroring syncStripeCustomer — a ClickUp
 * outage must never fail whatever created the project. `ensureProjectTask`
 * heals upward, so a client whose folder never provisioned gets one here.
 *
 * The milestone step is an ordering nicety rather than a correctness
 * requirement (pushTask provisions a missing milestone task itself). What it
 * buys is creation order in ClickUp, and milestones with NO tasks, which
 * pushTask would never reach.
 *
 * Lives here rather than in projects.routes because it now has two callers: the
 * admin create, and a project born from a paid deposit.
 */
export function provisionLater(projectId) {
  if (!projectId) return
  ensureProjectTask(projectId)
    .then(link => (link.linked ? pushProjectMilestones(projectId) : null))
    .then(res => (res ? pushProjectTasks(projectId) : null))
    .catch(async (err) => {
      console.error(`[clickup] provision project ${projectId}:`, err.message)
      // When an admin pressed Create, they'd notice the missing badge. A
      // project born at 2am from a Stripe webhook has nobody watching, and the
      // first symptom would be the client asking where their tasks are.
      try {
        const project = await getProject(projectId)
        await notify({
          category: 'system', tone: 'error', icon: 'i-lucide-triangle-alert',
          title: 'ClickUp provisioning failed',
          body: `${project?.code || `Project ${projectId}`} has no ClickUp tree — ${err.message}`,
          link: `/projects/${projectId}`
        })
      } catch { /* the console line above is the floor */ }
    })
}
