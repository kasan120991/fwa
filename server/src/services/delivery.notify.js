import { getProject } from '../repositories/projects.repo.js'
import { emitClientProjectChanged, emitClientMilestoneChanged } from '../realtime/io.js'

// Milestone progress is a SQL rollup over tasks.milestone_id, and the portal
// divides those counts client-side — so any task write that changes a rollup
// changes what the client sees. Admin sockets already get task:*/milestone:*;
// this is the client-room half.
//
// Best-effort and never throws, mirroring notify() and logClientActivity(): a
// failed push must not break the business action that triggered it.
export async function notifyDeliveryChanged(projectId) {
  if (!projectId) return
  try {
    const project = await getProject(projectId)
    if (!project?.client_id) return
    emitClientProjectChanged(project.client_id, project.id)
    emitClientMilestoneChanged(project.client_id, project.id)
  } catch (err) {
    console.error(`[delivery] notify project ${projectId}:`, err.message)
  }
}
