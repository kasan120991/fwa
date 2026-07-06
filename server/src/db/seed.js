// Seeds sample contacts + calls so the app has data to render.
// Usage: npm run seed          (skips if contacts already exist)
//        npm run seed -- --force  (wipes calls + contacts first)
import { getPool, closePool } from './pool.js'

const force = process.argv.includes('--force')
const pool = getPool()

const now = Date.now()
// Local wall-clock 'YYYY-MM-DD HH:MM:SS' — matches MySQL's CURRENT_TIMESTAMP
// (session tz) and the frontend's timeAgo(), which parses these as local. Using
// toISOString() here would write UTC and skew every relative time by the tz offset.
const pad = n => String(n).padStart(2, '0')
const fmt = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const daysAgo = d => fmt(now - d * 86400e3)
const hoursAgo = h => fmt(now - h * 3600e3)
const daysAhead = d => fmt(now + d * 86400e3)
// DATE-column variants (no time component).
const dateAgo = d => daysAgo(d).slice(0, 10)
const dateAhead = d => daysAhead(d).slice(0, 10)

// ---- clients (stage active/past) ----
const CLIENTS = [
  { company: 'Northwind Co.', name: 'Dana Cole', title: 'Marketing Director', email: 'dana@northwind.com', phone: '(415) 555-0132', website: 'northwind.com', stage: 'active', tags: ['Retainer', 'E-commerce', 'Priority'], client_since: '2023-03-12', address_line1: '400 Market Street, Suite 210', city: 'San Francisco', region: 'CA', postal_code: '94111', country: 'United States', notes: 'Prefers async updates. Storefront rebuild is the priority; renews retainer in March.' },
  { company: 'Lumen Labs', name: 'Priya Shah', title: 'Founder', email: 'priya@lumenlabs.io', phone: '(628) 555-0148', website: 'lumenlabs.io', stage: 'active', tags: ['Retainer', 'SaaS'], client_since: '2024-01-08', address_line1: '55 Innovation Way', city: 'Oakland', region: 'CA', postal_code: '94607', country: 'United States' },
  { company: 'Harborview', name: 'Ellen Ross', title: 'Operations Lead', email: 'ellen@harborview.co', phone: '(206) 555-0199', website: 'harborview.co', stage: 'active', tags: ['Project'], client_since: '2023-09-21', address_line1: '1200 Harbor Ave SW', city: 'Seattle', region: 'WA', postal_code: '98116', country: 'United States' },
  { company: 'Mintleaf', name: 'Sam Tran', title: 'Owner', email: 'sam@mintleaf.com', phone: '(512) 555-0170', website: 'mintleaf.com', stage: 'active', tags: ['E-commerce', 'Priority'], client_since: '2023-11-02', address_line1: '88 Congress Ave', city: 'Austin', region: 'TX', postal_code: '78701', country: 'United States' },
  { company: 'Bright & Salt', name: 'Nina Patel', title: 'Creative Director', email: 'nina@brightsalt.co', phone: '(303) 555-0121', website: 'brightsalt.co', stage: 'active', tags: ['Retainer'], client_since: '2024-02-14', address_line1: '2100 Larimer St', city: 'Denver', region: 'CO', postal_code: '80205', country: 'United States' },
  { company: 'Ridgeline', name: 'Grace Lin', title: 'CTO', email: 'grace@ridgeline.dev', phone: '(646) 555-0188', website: 'ridgeline.dev', stage: 'active', tags: ['Retainer', 'Priority'], client_since: '2023-05-30', address_line1: '12 W 21st Street', city: 'New York', region: 'NY', postal_code: '10010', country: 'United States' },
  { company: 'Foundry & Co.', name: 'Iris Bell', title: 'Principal', email: 'iris@foundry.studio', phone: '(312) 555-0166', website: 'foundry.studio', stage: 'past', tags: ['Project'], client_since: '2022-06-05', address_line1: '400 N Wells St', city: 'Chicago', region: 'IL', postal_code: '60654', country: 'United States' },
  { company: 'Vantage Group', name: 'Leo Kim', title: 'VP Marketing', email: 'leo@vantage.io', phone: '(213) 555-0110', website: 'vantage.io', stage: 'past', tags: ['Archived'], client_since: '2021-08-19', address_line1: '900 Wilshire Blvd', city: 'Los Angeles', region: 'CA', postal_code: '90017', country: 'United States' }
]

// ---- inbound leads (source website/call) ----
const INBOUND = [
  { slug: 'brooks', company: 'Brooks Law', name: 'Aiden Brooks', email: 'aiden@brookslaw.com', source: 'website', stage: 'new', message: 'Looking for a redesign focused on getting more consultation requests from the site.', createdAt: hoursAgo(1) },
  { slug: 'bloom', company: 'Bloom Floral', name: 'Sofia Nguyen', phone: '(212) 555-0173', source: 'call', stage: 'qualifying', message: 'Called about e-commerce for her flower shop — wants same-day delivery scheduling.', createdAt: hoursAgo(5) },
  { slug: 'webb', company: 'Webb Fitness', name: 'Marcus Webb', email: 'marcus@webbfit.com', source: 'website', stage: 'qualifying', message: 'Needs a landing page for a personal-training program launching next month.', createdAt: daysAgo(1) },
  { slug: 'anand', company: 'Anand Dental', name: 'Priya Anand', email: 'priya@ananddental.com', source: 'website', stage: 'qualified', message: 'Wants a full site plus patient portal. Budget approved by the partners.', createdAt: daysAgo(2) },
  { slug: 'fielder', company: 'Fielder Roofing', name: 'Tom Fielder', phone: '(503) 555-0192', source: 'call', stage: 'proposal', message: 'Wants a lead-gen site with quote forms; ready to move fast, comparing two agencies.', createdAt: daysAgo(3) },
  { slug: 'okafor', company: 'Okafor Realty', name: 'Grace Okafor', email: 'grace@okaforrealty.com', source: 'website', stage: 'qualifying', message: 'Real-estate listings site with IDX integration; asked about ongoing maintenance.', createdAt: daysAgo(4) }
]

// ---- outreach leads (source manual) ----
const OUTREACH = [
  { company: 'Cho Orthodontics', name: 'Daniel Cho', email: 'daniel@choortho.com', stage: 'to_contact', next_action_at: null, last_contacted_at: null },
  { company: 'Lawson Interiors', name: 'Emma Lawson', email: 'emma@lawsonint.com', stage: 'contacted', next_action_at: daysAgo(3), last_contacted_at: daysAgo(9) },
  { company: 'Reyes Auto Group', name: 'Victor Reyes', email: 'victor@reyesauto.com', stage: 'engaged', next_action_at: daysAhead(2), last_contacted_at: daysAgo(2) },
  { company: 'Schmidt Bakery', name: 'Hannah Schmidt', email: 'hannah@schmidtbakery.com', stage: 'contacted', next_action_at: daysAgo(1), last_contacted_at: daysAgo(6) },
  { company: 'Barnes Consulting', name: 'Owen Barnes', email: 'owen@barnesco.com', stage: 'qualified', next_action_at: null, last_contacted_at: daysAgo(1) },
  { company: 'Chen Studio', name: 'Lily Chen', email: 'lily@chenstudio.com', stage: 'to_contact', next_action_at: null, last_contacted_at: null },
  { company: 'Patel Realty', name: 'Noah Patel', email: 'noah@patelrealty.com', stage: 'engaged', next_action_at: daysAhead(5), last_contacted_at: daysAgo(4) }
]

// ---- calls ---- (linkSlug references an INBOUND/CLIENT slug to set contact_id)
const CALLS = [
  { classification: 'inquiry', caller_name: 'Rachel Munoz', caller_number: '(415) 555-0148', business: 'Delta Kitchens', occurred_at: hoursAgo(0.2), reviewed: false, duration_seconds: 252,
    summary: 'Rachel runs a kitchen-remodeling business and wants a new website with online consultation booking. Her current site is six years old and not mobile-friendly.',
    captured: [['Name', 'Rachel Munoz'], ['Business', 'Delta Kitchens'], ['Reason for call', 'New website + online booking'], ['Timeline', 'Before spring']],
    transcript: [{ r: true, t: 'Thanks for calling Francis Web Agency — how can I help?' }, { r: false, t: 'I run a kitchen remodeling business and need a whole new website.' }, { r: true, t: "Happy to help. I'll pass this to the team to follow up." }] },
  { classification: 'inquiry', linkSlug: 'bloom', caller_name: 'Sofia Nguyen', caller_number: '(212) 555-0173', business: 'Bloom Floral', occurred_at: hoursAgo(5), reviewed: true, duration_seconds: 208,
    summary: 'Sofia owns a flower shop and wants e-commerce with same-day delivery scheduling. Currently takes orders by phone.',
    captured: [['Name', 'Sofia Nguyen'], ['Business', 'Bloom Floral'], ['Reason for call', 'E-commerce + delivery scheduling']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'I want to start selling flowers online with delivery times.' }] },
  { classification: 'client', linkClient: 'Northwind Co.', caller_name: 'Dana Cole', caller_number: '(503) 555-0110', business: 'Northwind Co. · Client', occurred_at: daysAgo(1), reviewed: true, duration_seconds: 125,
    summary: 'Dana from Northwind (existing client) called about an invoice question on their latest milestone.',
    captured: [['Name', 'Dana Cole'], ['Account', 'Active client'], ['Reason for call', 'Invoice question']],
    transcript: [{ r: true, t: 'Francis Web Agency, front desk.' }, { r: false, t: "It's Dana from Northwind — a quick invoice question." }] },
  { classification: 'spam', caller_number: '(800) 555-0011', occurred_at: daysAgo(1), reviewed: false, duration_seconds: 18,
    summary: 'Automated robocall about an expiring vehicle warranty. Receptionist ended the call.',
    captured: [['Number', '(800) 555-0011'], ['Detected as', 'Robocall']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: '(Pre-recorded) …your vehicle warranty…' }] },
  { classification: 'wrong_number', caller_number: '(646) 555-0295', occurred_at: daysAgo(2), reviewed: true, duration_seconds: 22,
    summary: 'Caller wanted a pharmacy and dialed the wrong number.',
    captured: [['Number', '(646) 555-0295'], ['Reason', 'Wanted a pharmacy']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'Is this the pharmacy on 5th?' }] },
  { classification: 'other', caller_name: 'City of Portland', caller_number: '(503) 555-0777', business: 'Permitting Office', occurred_at: daysAgo(3), reviewed: true, duration_seconds: 70,
    summary: 'City permitting office following up on a business license renewal. Left a reference number.',
    captured: [['Caller', 'City of Portland'], ['Reference', 'BL-2026-4471']],
    transcript: [{ r: true, t: 'Francis Web Agency, front desk.' }, { r: false, t: 'Portland permitting office re: license renewal BL-2026-4471.' }] },
  { classification: 'inquiry', linkSlug: 'fielder', caller_name: 'Tom Fielder', caller_number: '(503) 555-0192', business: 'Fielder Roofing', occurred_at: daysAgo(3), reviewed: true, duration_seconds: 347,
    summary: 'Tom wants a lead-generation site with quote-request forms; comparing two agencies, so a fast proposal matters.',
    captured: [['Name', 'Tom Fielder'], ['Business', 'Fielder Roofing'], ['Note', 'Comparing 2 agencies']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'I need a site that brings in roofing leads.' }] }
]

// ---- notifications ---- (top-bar feed; user_id NULL = broadcast to admins)
const NOTIFICATIONS = [
  { category: 'lead', tone: 'brand', icon: 'i-lucide-user-plus', title: 'New inbound lead', body: 'Aiden Brooks submitted the contact form on your site.', link: '/leads', read: false, created_at: hoursAgo(1) },
  { category: 'call', tone: 'error', icon: 'i-lucide-phone-missed', title: 'Missed call logged', body: 'The receptionist captured a call from (415) 555-0148.', link: '/receptionist', read: false, created_at: hoursAgo(0.3) },
  { category: 'proposal', tone: 'info', icon: 'i-lucide-file-text', title: 'Proposal viewed', body: 'Fielder Roofing opened the proposal you sent.', link: '/agreements', read: false, created_at: hoursAgo(3) },
  { category: 'invoice', tone: 'success', icon: 'i-lucide-check-circle-2', title: 'Invoice paid', body: 'Northwind Co. paid invoice #1042 in full — $3,200.', link: '/invoices', read: true, created_at: daysAgo(1) },
  { category: 'call', tone: 'info', icon: 'i-lucide-phone-call', title: 'Client call logged', body: 'Dana Cole (Northwind) called about an invoice question.', link: '/receptionist', read: true, created_at: daysAgo(1) },
  { category: 'task', tone: 'warning', icon: 'i-lucide-clock', title: 'Follow-up due', body: 'Your outreach touch for Lawson Interiors is overdue.', link: '/leads', read: true, created_at: daysAgo(2) }
]

// ---- projects ---- (SOW hub; each belongs to an active client by company)
const PROJECTS = [
  { key: 'northwind-rebuild', company: 'Northwind Co.', code: 'WEB-0001', name: 'Marketing site rebuild', status: 'in_progress',
    goals: 'Modernize the marketing site and lift consultation requests. Faster, mobile-first, clearer conversion path.',
    pages_included: 'Home, About, Services, Case Studies, Contact', key_features: 'Contact form, blog, analytics, newsletter signup',
    design_deliverables: 'Custom design, mobile-responsive, brand colors', content_provided_by: 'mix', revision_rounds: 2,
    third_party_costs: 'Client covers hosting + premium fonts', project_fee: 18000, hourly_rate: 120,
    content_deadline: dateAhead(7), start_date: dateAgo(20), target_launch_date: dateAhead(20), special_terms: null },
  { key: 'mintleaf-store', company: 'Mintleaf', code: 'WEB-0002', name: 'E-commerce storefront', status: 'in_progress',
    goals: 'Launch an online storefront with same-day local delivery scheduling.',
    pages_included: 'Home, Shop, Product, Cart, Checkout, About, Contact', key_features: 'Stripe checkout, delivery scheduler, inventory, order emails',
    design_deliverables: 'Custom design, mobile-responsive', content_provided_by: 'client', revision_rounds: 2,
    third_party_costs: 'Client covers Stripe fees + stock photography', project_fee: 24500, hourly_rate: 120,
    content_deadline: dateAgo(2), start_date: dateAgo(30), target_launch_date: dateAhead(10), special_terms: 'Phased launch: catalog first, delivery scheduling in phase 2.' },
  { key: 'harborview-booking', company: 'Harborview', code: 'WEB-0003', name: 'Booking site', status: 'planning',
    goals: 'A booking-focused site so clients can reserve consultations online.',
    pages_included: 'Home, Services, Booking, About, Contact', key_features: 'Calendar booking, reminders, maps',
    design_deliverables: 'Custom design, mobile-responsive, brand colors', content_provided_by: 'developer', revision_rounds: 2,
    third_party_costs: 'FWA advances booking-tool subscription, invoiced at cost', project_fee: 12000, hourly_rate: 110,
    content_deadline: dateAhead(14), start_date: dateAhead(3), target_launch_date: dateAhead(45), special_terms: null },
  { key: 'ridgeline-dashboard', company: 'Ridgeline', code: 'WEB-0004', name: 'Customer dashboard', status: 'in_review',
    goals: 'Design + build a customer-facing dashboard for their SaaS.',
    pages_included: 'Login, Dashboard, Reports, Settings, Billing', key_features: 'Auth, charts, CSV export, role-based access',
    design_deliverables: 'Custom design, mobile-responsive, design system', content_provided_by: 'client', revision_rounds: 3,
    third_party_costs: 'Client owns all infra and third-party APIs', project_fee: 32000, hourly_rate: 140,
    content_deadline: dateAgo(10), start_date: dateAgo(40), target_launch_date: dateAgo(2), special_terms: 'NDA on file. Two extra revision rounds included.' },
  { key: 'lumen-marketing', company: 'Lumen Labs', code: 'WEB-0005', name: 'SaaS marketing site', status: 'planning',
    goals: 'A launch marketing site to support their product release.',
    pages_included: 'Home, Features, Pricing, Docs, Contact', key_features: 'Pricing table, docs, demo request form',
    design_deliverables: 'Custom design, mobile-responsive, brand colors', content_provided_by: 'mix', revision_rounds: 2,
    third_party_costs: 'Client covers hosting', project_fee: 15000, hourly_rate: 120,
    content_deadline: dateAhead(21), start_date: dateAhead(7), target_launch_date: dateAhead(60), special_terms: null }
]

// ---- tasks ---- (projectKey references a PROJECTS.key; null = standalone)
const TASKS = [
  { projectKey: 'northwind-rebuild', title: 'Kickoff + discovery call', status: 'done', priority: 'high', position: 0, doneAgo: 18 },
  { projectKey: 'northwind-rebuild', title: 'Sitemap + wireframes', status: 'done', priority: 'high', position: 1, doneAgo: 12 },
  { projectKey: 'northwind-rebuild', title: 'Homepage design', status: 'done', priority: 'medium', position: 2, doneAgo: 6 },
  { projectKey: 'northwind-rebuild', title: 'Build responsive templates', status: 'in_progress', priority: 'high', position: 3, due: dateAgo(0) },
  { projectKey: 'northwind-rebuild', title: 'Migrate blog content', status: 'todo', priority: 'medium', position: 4, due: dateAhead(9) },
  { projectKey: 'northwind-rebuild', title: 'QA + launch checklist', status: 'todo', priority: 'medium', position: 5, due: dateAhead(18) },
  { projectKey: 'mintleaf-store', title: 'Product catalog import', status: 'done', priority: 'high', position: 0, doneAgo: 8 },
  { projectKey: 'mintleaf-store', title: 'Stripe checkout integration', status: 'in_progress', priority: 'high', position: 1, due: dateAgo(0) },
  { projectKey: 'mintleaf-store', title: 'Delivery scheduler', status: 'blocked', priority: 'high', position: 2, due: dateAhead(8) },
  { projectKey: 'mintleaf-store', title: 'Order confirmation emails', status: 'todo', priority: 'medium', position: 3, due: dateAhead(6) },
  { projectKey: 'harborview-booking', title: 'Choose booking tool', status: 'todo', priority: 'high', position: 0, due: dateAhead(5) },
  { projectKey: 'harborview-booking', title: 'Draft content outline', status: 'todo', priority: 'low', position: 1 },
  { projectKey: 'ridgeline-dashboard', title: 'Design review with stakeholders', status: 'in_progress', priority: 'high', position: 0, due: dateAhead(1) },
  { projectKey: 'ridgeline-dashboard', title: 'Accessibility audit', status: 'todo', priority: 'medium', position: 1, due: dateAgo(1) },
  // Standalone (no project) — ad-hoc admin tasks.
  { projectKey: null, title: 'Renew business license (BL-2026-4471)', status: 'todo', priority: 'medium', position: 0, due: dateAhead(12) },
  { projectKey: null, title: 'Update portfolio with latest launches', status: 'todo', priority: 'low', position: 1 }
]

// ---- invoices ---- (key = seed handle; projectKey optional; historical mock,
// so stripe ids are null — real ones come from the Stripe-backed flows)
const INVOICES = [
  { key: 'inv-northwind-dep', company: 'Northwind Co.', projectKey: 'northwind-rebuild', number: 'FWA-0001', kind: 'deposit', status: 'paid',
    amount_due: 9000, amount_paid: 9000, description: 'Deposit (50%) — Marketing site rebuild', line: 'Deposit (50%) — Marketing site rebuild',
    finalized_at: daysAgo(12), due_date: dateAgo(5), paid_at: daysAgo(5) },
  { key: 'inv-mintleaf-dep', company: 'Mintleaf', projectKey: 'mintleaf-store', number: 'FWA-0002', kind: 'deposit', status: 'open',
    amount_due: 12250, amount_paid: 0, description: 'Deposit (50%) — E-commerce storefront', line: 'Deposit (50%) — E-commerce storefront',
    finalized_at: daysAgo(3), due_date: dateAhead(10), paid_at: null },
  { key: 'inv-ridgeline-bal', company: 'Ridgeline', projectKey: 'ridgeline-dashboard', number: 'FWA-0003', kind: 'balance', status: 'open',
    amount_due: 16000, amount_paid: 0, description: 'Final payment — Customer dashboard', line: 'Final (50%) — Customer dashboard',
    finalized_at: daysAgo(20), due_date: dateAgo(5), paid_at: null },
  { key: 'inv-harborview-custom', company: 'Harborview', projectKey: null, number: null, kind: 'custom', status: 'draft',
    amount_due: 1500, amount_paid: 0, description: 'Discovery workshop', line: 'Discovery workshop (half day)',
    finalized_at: null, due_date: dateAhead(14), paid_at: null }
]

// ---- payments ---- (invoiceKey references an INVOICES.key)
const PAYMENTS = [
  { invoiceKey: 'inv-northwind-dep', company: 'Northwind Co.', amount: 9000, method: 'card', paid_at: daysAgo(5), note: null }
]

function cols(obj) {
  const keys = Object.keys(obj)
  return { sql: `(${keys.join(', ')}) VALUES (${keys.map(k => `:${k}`).join(', ')})`, params: obj }
}

async function insertContact(row) {
  const { slug, ...rest } = row
  if (rest.tags) rest.tags = JSON.stringify(rest.tags)
  const { sql, params } = cols(rest)
  const [res] = await pool.query(`INSERT INTO contacts ${sql}`, params)
  return res.insertId
}

try {
  // Ensure the base project type exists (config, not sample data) on every run,
  // even for an existing DB that skips the sample seed below.
  await pool.query(
    "INSERT IGNORE INTO project_types (`key`, name, description, code_prefix, sort_order) VALUES ('website', 'Website Design & Development', 'Custom website design + build under the FWA Website Design & Development Agreement.', 'WEB', 0)"
  )
  const [[websiteType]] = await pool.query("SELECT id FROM project_types WHERE `key` = 'website' LIMIT 1")

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM contacts')
  if (n > 0 && !force) {
    console.log(`Contacts already present (${n}). Use "npm run seed -- --force" to reseed.`)
    await closePool()
    process.exit(0)
  }
  if (force) {
    // Children first — everything that FK-references contacts (RESTRICT) must go
    // before contacts. Line-item tables cascade with their parent.
    await pool.query('DELETE FROM payments')
    await pool.query('DELETE FROM invoices') // cascades invoice_line_items
    await pool.query('DELETE FROM contracts') // cascades contract_line_items
    await pool.query('DELETE FROM proposals') // cascades proposal_line_items
    await pool.query('DELETE FROM tasks')
    await pool.query('DELETE FROM projects')
    await pool.query('DELETE FROM notifications')
    await pool.query('DELETE FROM calls')
    await pool.query('DELETE FROM contacts')
    console.log('Cleared billing + sales + tasks + projects + notifications + calls + contacts.')
  }

  const slugToId = {}
  const companyToId = {}

  for (const c of CLIENTS) {
    const id = await insertContact(c)
    companyToId[c.company] = id
  }
  for (const l of INBOUND) {
    const { slug, createdAt, ...rest } = l
    const id = await insertContact({ ...rest, source: rest.source, created_at: createdAt })
    slugToId[slug] = id
  }
  for (const o of OUTREACH) {
    await insertContact({ ...o, source: 'manual' })
  }

  for (const call of CALLS) {
    const { linkSlug, linkClient, business, captured, transcript, reviewed, ...rest } = call
    const contactId = linkSlug ? slugToId[linkSlug] : (linkClient ? companyToId[linkClient] : null)
    const row = {
      ...rest,
      contact_id: contactId ?? null,
      transcript: JSON.stringify(transcript),
      extracted: JSON.stringify({ business: business ?? null, captured }),
      reviewed_at: reviewed ? daysAgo(0) : null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO calls ${sql}`, params)
  }

  for (const note of NOTIFICATIONS) {
    const { read, ...rest } = note
    const row = { ...rest, user_id: null, read_at: read ? daysAgo(0) : null }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO notifications ${sql}`, params)
  }

  const projectKeyToId = {}
  for (const p of PROJECTS) {
    const { key, company, ...rest } = p
    const row = { ...rest, contact_id: companyToId[company], project_type_id: websiteType.id }
    const { sql, params } = cols(row)
    const [res] = await pool.query(`INSERT INTO projects ${sql}`, params)
    projectKeyToId[key] = res.insertId
  }

  for (const t of TASKS) {
    const { projectKey, due, doneAgo, ...rest } = t
    const row = {
      ...rest,
      project_id: projectKey ? projectKeyToId[projectKey] : null,
      due_date: due ?? null,
      completed_at: rest.status === 'done' ? daysAgo(doneAgo ?? 1) : null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO tasks ${sql}`, params)
  }

  const invoiceKeyToId = {}
  for (const inv of INVOICES) {
    const { key, company, projectKey, line, ...rest } = inv
    const row = { ...rest, contact_id: companyToId[company], project_id: projectKey ? projectKeyToId[projectKey] : null }
    const { sql, params } = cols(row)
    const [res] = await pool.query(`INSERT INTO invoices ${sql}`, params)
    invoiceKeyToId[key] = res.insertId
    // One snapshot line item mirroring the total.
    await pool.query(
      'INSERT INTO invoice_line_items (invoice_id, name_snapshot, unit_price_snapshot, qty, sort_order) VALUES (?, ?, ?, 1, 0)',
      [res.insertId, line, rest.amount_due]
    )
  }

  for (const p of PAYMENTS) {
    const { invoiceKey, company, ...rest } = p
    const row = { ...rest, contact_id: companyToId[company], invoice_id: invoiceKeyToId[invoiceKey] ?? null }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO payments ${sql}`, params)
  }

  const [[cc]] = await pool.query('SELECT COUNT(*) AS n FROM contacts')
  const [[kc]] = await pool.query('SELECT COUNT(*) AS n FROM calls')
  const [[nc]] = await pool.query('SELECT COUNT(*) AS n FROM notifications')
  const [[pc]] = await pool.query('SELECT COUNT(*) AS n FROM projects')
  const [[tc]] = await pool.query('SELECT COUNT(*) AS n FROM tasks')
  const [[ic]] = await pool.query('SELECT COUNT(*) AS n FROM invoices')
  const [[yc]] = await pool.query('SELECT COUNT(*) AS n FROM payments')
  console.log(`✔ Seeded ${cc.n} contacts, ${kc.n} calls, ${nc.n} notifications, ${pc.n} projects, ${tc.n} tasks, ${ic.n} invoices, and ${yc.n} payments.`)
} finally {
  await closePool()
}
