import { config } from '../config/env.js'
import {
  isConfigured, createDroplet, deleteDroplet, listSshKeys, listSizes, listRegions,
  listDoProjects, createDoProject, assignDropletToProject
} from './digitalocean.js'
import { getProject } from '../repositories/projects.repo.js'
import { getClient, setClientDoProject } from '../repositories/clients.repo.js'
import { createWebsite } from '../repositories/websites.repo.js'
import { emitWebsiteChanged } from '../realtime/io.js'

export const provisionConfigured = isConfigured

/** Sizes + regions for the provision modal (with the account's defaults). */
export async function provisionOptions() {
  if (!isConfigured()) return { configured: false }
  const [sizes, regions] = await Promise.all([listSizes(), listRegions()])
  return {
    configured: true,
    sizes,
    regions,
    defaults: { region: config.digitalocean.provisionRegion, size: config.digitalocean.provisionSize }
  }
}

// A DO droplet name allows letters, digits, dots and dashes only.
function dropletName(domain, project) {
  const slug = String(domain || '').toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/^-+|-+$/g, '')
  return slug || `fwa-${project.code || project.id}`
}

// One DO Project per client (resource group). Reuses the stored id, else matches
// an existing project by name, else creates one — idempotent across reprovisions.
async function ensureClientDoProject(client) {
  if (client.do_project_id) return client.do_project_id
  const name = client.company || client.name
  const existing = (await listDoProjects()).find(p => p.name === name)
  const id = existing?.id ?? (await createDoProject({
    name, purpose: 'Client hosting (FWA)', environment: 'Production'
  })).id
  await setClientDoProject(client.id, id)
  return id
}

/**
 * One-click hosting for a project: create a droplet, link a website record, and
 * file the droplet under the client's DO Project. Never 500s (shape carries state).
 * On website-insert failure the droplet is rolled back so nothing is left billing.
 */
export async function provisionHosting(projectId, { name, domain, region, size, environment = 'staging' } = {}) {
  const project = await getProject(projectId)
  if (!project) return { notFound: true }
  if (!isConfigured()) return { configured: false }
  if (!domain) return { configured: true, error: 'A domain is required.' }

  try {
    const client = await getClient(project.client_id)
    const ssh_keys = (await listSshKeys()).map(k => k.fingerprint)

    const droplet = await createDroplet({
      name: dropletName(domain, project),
      region: region || config.digitalocean.provisionRegion,
      size: size || config.digitalocean.provisionSize,
      image: config.digitalocean.provisionImage,
      ssh_keys,
      tags: ['fwa', `client-${project.client_id}`]
    })

    let website
    try {
      website = await createWebsite({
        client_id: project.client_id,
        project_id: projectId,
        name: name || project.name,
        domain,
        url: `https://${domain}`,
        environment,
        do_droplet_id: droplet.id
      })
    } catch (err) {
      // Don't leave an orphaned, billing droplet if the record can't be written.
      await deleteDroplet(droplet.id).catch(() => {})
      throw err
    }

    // Best-effort grouping — a failure here must never roll back the droplet/site.
    let grouped = false
    try {
      const projectDoId = await ensureClientDoProject(client)
      await assignDropletToProject(projectDoId, droplet.id)
      grouped = true
    } catch (err) {
      console.error(`[websiteProvision] grouping droplet ${droplet.id} failed:`, err.message)
    }

    emitWebsiteChanged(website.id)
    return {
      provisioned: true,
      website_id: website.id,
      droplet_id: droplet.id,
      monthly_price: droplet.size?.price_monthly ?? null,
      grouped
    }
  } catch (err) {
    console.error(`[websiteProvision] project ${projectId} failed:`, err.message)
    return { configured: true, error: err.message }
  }
}
