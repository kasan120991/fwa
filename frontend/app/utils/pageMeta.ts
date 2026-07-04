// Maps a route path to its top-bar title + breadcrumb. Deriving the header
// from the route (rather than a per-page side effect) keeps SSR and client
// render identical, avoiding hydration mismatches.
export interface PageMeta {
  title: string
  breadcrumb?: string
}

const MAP: Record<string, PageMeta> = {
  '/': { title: 'Dashboard', breadcrumb: 'Workspace · Overview' },
  '/leads': { title: 'Leads', breadcrumb: 'Clients & Work · Leads' },
  '/clients': { title: 'Clients', breadcrumb: 'Clients & Work · Clients' },
  '/projects': { title: 'Projects', breadcrumb: 'Clients & Work · Projects' },
  '/tasks': { title: 'Tasks', breadcrumb: 'Clients & Work · Tasks' },
  '/agreements': { title: 'Agreements', breadcrumb: 'Sales · Agreements' },
  '/proposals': { title: 'Proposals', breadcrumb: 'Sales · Proposals' },
  '/contracts': { title: 'Contracts', breadcrumb: 'Sales · Contracts' },
  '/invoices': { title: 'Invoices', breadcrumb: 'Billing · Invoices' },
  '/payments': { title: 'Payments', breadcrumb: 'Billing · Payments' },
  '/files': { title: 'Files', breadcrumb: 'Workspace · Files' },
  '/calendar': { title: 'Calendar', breadcrumb: 'Workspace · Calendar' },
  '/websites': { title: 'Websites', breadcrumb: 'Workspace · Websites' },
  '/receptionist': { title: 'AI Receptionist', breadcrumb: 'Workspace · AI Receptionist' },
  '/support': { title: 'Support tickets', breadcrumb: 'Support' },
  '/settings': { title: 'Settings', breadcrumb: 'Settings' }
}

export function resolvePageMeta(path: string): PageMeta {
  const known = MAP[path]
  if (known) return known
  const seg = path.replace(/^\//, '').split('/')[0] ?? ''
  const title = seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'Not found'
  return { title, breadcrumb: title }
}
