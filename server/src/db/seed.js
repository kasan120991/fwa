// Seeds sample leads + clients + calls so the app has data to render.
// Usage: npm run seed          (skips if clients already exist)
//        npm run seed -- --force  (wipes everything first)
import { getPool, closePool } from './pool.js'
import { seedWebsites } from './seedWebsites.js'
import { ticketCode } from '../repositories/tickets.repo.js'

const force = process.argv.includes('--force')
const pool = getPool()

const now = Date.now()
// UTC wall-clock 'YYYY-MM-DD HH:MM:SS' — the API's timezone contract (see
// db/pool.js). Matches MySQL's CURRENT_TIMESTAMP under the pool's UTC session and
// the frontend's timeAgo(), which parses these as UTC. Writing local wall-clock
// here would skew every relative time by the host's offset.
const fmt = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const daysAgo = d => fmt(now - d * 86400e3)
const hoursAgo = h => fmt(now - h * 3600e3)
const daysAhead = d => fmt(now + d * 86400e3)
// DATE-column variants (no time component).
const dateAgo = d => daysAgo(d).slice(0, 10)
const dateAhead = d => daysAhead(d).slice(0, 10)
// Same day offset, pinned to a UTC hour. Rows that inherit the run clock all
// land in the same hour bucket, which skews any hour-of-day metric — the
// receptionist's "after-hours answered" counts everything outside 09:00–17:00,
// so a seed run in the evening would report 100% after-hours.
const daysAgoAtHour = (d, hour) => `${dateAgo(d)} ${String(hour).padStart(2, '0')}:00:00`

// ---- clients (status active/past) ----
const CLIENTS = [
  { company: 'Northwind Co.', name: 'Dana Cole', title: 'Marketing Director', email: 'dana@northwind.com', phone: '(415) 555-0132', website: 'northwind.com', status: 'active', source: 'direct', tags: ['Retainer', 'E-commerce', 'Priority'], client_since: '2023-03-12', address_line1: '400 Market Street, Suite 210', city: 'San Francisco', region: 'CA', postal_code: '94111', country: 'United States', notes: 'Prefers async updates. Storefront rebuild is the priority; renews retainer in March.' },
  { company: 'Lumen Labs', name: 'Priya Shah', title: 'Founder', email: 'priya@lumenlabs.io', phone: '(628) 555-0148', website: 'lumenlabs.io', status: 'active', source: 'direct', tags: ['Retainer', 'SaaS'], client_since: '2024-01-08', address_line1: '55 Innovation Way', city: 'Oakland', region: 'CA', postal_code: '94607', country: 'United States' },
  { company: 'Harborview', name: 'Ellen Ross', title: 'Operations Lead', email: 'ellen@harborview.co', phone: '(206) 555-0199', website: 'harborview.co', status: 'active', source: 'website', tags: ['Project'], client_since: '2023-09-21', address_line1: '1200 Harbor Ave SW', city: 'Seattle', region: 'WA', postal_code: '98116', country: 'United States' },
  { company: 'Mintleaf', name: 'Sam Tran', title: 'Owner', email: 'sam@mintleaf.com', phone: '(512) 555-0170', website: 'mintleaf.com', status: 'active', source: 'direct', tags: ['E-commerce', 'Priority'], client_since: '2023-11-02', address_line1: '88 Congress Ave', city: 'Austin', region: 'TX', postal_code: '78701', country: 'United States' },
  { company: 'Bright & Salt', name: 'Nina Patel', title: 'Creative Director', email: 'nina@brightsalt.co', phone: '(303) 555-0121', website: 'brightsalt.co', status: 'active', source: 'manual', tags: ['Retainer'], client_since: '2024-02-14', address_line1: '2100 Larimer St', city: 'Denver', region: 'CO', postal_code: '80205', country: 'United States' },
  { company: 'Ridgeline', name: 'Grace Lin', title: 'CTO', email: 'grace@ridgeline.dev', phone: '(646) 555-0188', website: 'ridgeline.dev', status: 'active', source: 'direct', tags: ['Retainer', 'Priority'], client_since: '2023-05-30', address_line1: '12 W 21st Street', city: 'New York', region: 'NY', postal_code: '10010', country: 'United States' },
  { company: 'Foundry & Co.', name: 'Iris Bell', title: 'Principal', email: 'iris@foundry.studio', phone: '(312) 555-0166', website: 'foundry.studio', status: 'past', source: 'website', tags: ['Project'], client_since: '2022-06-05', address_line1: '400 N Wells St', city: 'Chicago', region: 'IL', postal_code: '60654', country: 'United States' },
  { company: 'Vantage Group', name: 'Leo Kim', title: 'VP Marketing', email: 'leo@vantage.io', phone: '(213) 555-0110', website: 'vantage.io', status: 'past', source: 'manual', tags: ['Archived'], client_since: '2021-08-19', address_line1: '900 Wilshire Blvd', city: 'Los Angeles', region: 'CA', postal_code: '90017', country: 'United States' }
]

// ---- inbound leads (source website — the contact form) ----
const INBOUND = [
  { slug: 'brooks', company: 'Brooks Law', name: 'Aiden Brooks', email: 'aiden@brookslaw.com', source: 'website', stage: 'new', message: 'Looking for a redesign focused on getting more consultation requests from the site.', createdAt: hoursAgo(1) },
  { slug: 'webb', company: 'Webb Fitness', name: 'Marcus Webb', email: 'marcus@webbfit.com', source: 'website', stage: 'qualifying', message: 'Needs a landing page for a personal-training program launching next month.', createdAt: daysAgo(1) },
  { slug: 'anand', company: 'Anand Dental', name: 'Priya Anand', email: 'priya@ananddental.com', source: 'website', stage: 'qualified', message: 'Wants a full site plus patient portal. Budget approved by the partners.', createdAt: daysAgo(2) },
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

// ---- lead touches ---- (outreach cadence log; company references an OUTREACH lead)
const LEAD_TOUCHES = [
  { company: 'Lawson Interiors', channel: 'email', body: 'Sent intro email with a few portfolio links.', occurredAt: daysAgo(9) },
  { company: 'Lawson Interiors', channel: 'call', body: 'Called to follow up — left a voicemail.', occurredAt: daysAgo(3) },
  { company: 'Reyes Auto Group', channel: 'call', body: 'Great call — they want a quote for a new inventory site. Sending pricing.', occurredAt: daysAgo(2) },
  { company: 'Reyes Auto Group', channel: 'email', body: 'Emailed the pricing sheet and a couple of case studies.', occurredAt: daysAgo(2) },
  { company: 'Schmidt Bakery', channel: 'email', body: 'Cold intro email about their online-ordering setup.', occurredAt: daysAgo(6) },
  { company: 'Barnes Consulting', channel: 'meeting', body: 'Discovery call — budget confirmed, ready for a proposal.', occurredAt: daysAgo(1) },
  { company: 'Patel Realty', channel: 'sms', body: 'Texted to confirm they received the deck.', occurredAt: daysAgo(4) }
]

// ---- calls ---- (linkSlug -> a lead's lead_id; linkClient -> a client's client_id.
// Unresolved links stay null — e.g. inquiry calls not yet converted to a lead.)
const CALLS = [
  { classification: 'inquiry', caller_name: 'Rachel Munoz', caller_number: '(415) 555-0148', business: 'Delta Kitchens', occurred_at: hoursAgo(0.2), reviewed: false, duration_seconds: 252,
    summary: 'Rachel runs a kitchen-remodeling business and wants a new website with online consultation booking. Her current site is six years old and not mobile-friendly.',
    captured: [['Name', 'Rachel Munoz'], ['Business', 'Delta Kitchens'], ['Reason for call', 'New website + online booking'], ['Timeline', 'Before spring']],
    transcript: [{ r: true, t: 'Thanks for calling Francis Web Agency — how can I help?' }, { r: false, t: 'I run a kitchen remodeling business and need a whole new website.' }, { r: true, t: "Happy to help. I'll pass this to the team to follow up." }] },
  { classification: 'inquiry', caller_name: 'Sofia Nguyen', caller_number: '(212) 555-0173', business: 'Bloom Floral', occurred_at: hoursAgo(5), reviewed: false, duration_seconds: 208,
    summary: 'Sofia owns a flower shop and wants e-commerce with same-day delivery scheduling. Currently takes orders by phone.',
    captured: [['Name', 'Sofia Nguyen'], ['Business', 'Bloom Floral'], ['Reason for call', 'E-commerce + delivery scheduling']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'I want to start selling flowers online with delivery times.' }] },
  { classification: 'client', linkClient: 'Northwind Co.', caller_name: 'Dana Cole', caller_number: '(503) 555-0110', business: 'Northwind Co. · Client', occurred_at: daysAgoAtHour(1, 11), reviewed: true, duration_seconds: 125,
    summary: 'Dana from Northwind (existing client) called about an invoice question on their latest milestone.',
    captured: [['Name', 'Dana Cole'], ['Account', 'Active client'], ['Reason for call', 'Invoice question']],
    transcript: [{ r: true, t: 'Francis Web Agency, front desk.' }, { r: false, t: "It's Dana from Northwind — a quick invoice question." }] },
  { classification: 'spam', caller_number: '(800) 555-0011', occurred_at: daysAgo(1), reviewed: false, duration_seconds: 18,
    summary: 'Automated robocall about an expiring vehicle warranty. Receptionist ended the call.',
    captured: [['Number', '(800) 555-0011'], ['Detected as', 'Robocall']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: '(Pre-recorded) …your vehicle warranty…' }] },
  { classification: 'wrong_number', caller_number: '(646) 555-0295', occurred_at: daysAgoAtHour(2, 10), reviewed: true, duration_seconds: 22,
    summary: 'Caller wanted a pharmacy and dialed the wrong number.',
    captured: [['Number', '(646) 555-0295'], ['Reason', 'Wanted a pharmacy']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'Is this the pharmacy on 5th?' }] },
  { classification: 'other', caller_name: 'City of Portland', caller_number: '(503) 555-0777', business: 'Permitting Office', occurred_at: daysAgoAtHour(3, 14), reviewed: true, duration_seconds: 70,
    summary: 'City permitting office following up on a business license renewal. Left a reference number.',
    captured: [['Caller', 'City of Portland'], ['Reference', 'BL-2026-4471']],
    transcript: [{ r: true, t: 'Francis Web Agency, front desk.' }, { r: false, t: 'Portland permitting office re: license renewal BL-2026-4471.' }] },
  { classification: 'inquiry', caller_name: 'Tom Fielder', caller_number: '(503) 555-0192', business: 'Fielder Roofing', occurred_at: daysAgoAtHour(3, 15), reviewed: false, duration_seconds: 347,
    summary: 'Tom wants a lead-generation site with quote-request forms; comparing two agencies, so a fast proposal matters.',
    captured: [['Name', 'Tom Fielder'], ['Business', 'Fielder Roofing'], ['Note', 'Comparing 2 agencies']],
    transcript: [{ r: true, t: 'Francis Web Agency, how can I help?' }, { r: false, t: 'I need a site that brings in roofing leads.' }] }
]

// ---- notifications ---- (top-bar feed; user_id NULL = broadcast to admins)
const NOTIFICATIONS = [
  { category: 'lead', tone: 'brand', icon: 'i-lucide-user-plus', title: 'New inbound lead', body: 'Aiden Brooks submitted the contact form on your site.', link: '/leads', read: false, created_at: hoursAgo(1) },
  { category: 'call', tone: 'error', icon: 'i-lucide-phone-missed', title: 'Missed call logged', body: 'The receptionist captured a call from (415) 555-0148.', link: '/receptionist', read: false, created_at: hoursAgo(0.3) },
  { category: 'proposal', tone: 'info', icon: 'i-lucide-file-text', title: 'Proposal viewed', body: 'Ridgeline opened the proposal you sent.', link: '/agreements', read: false, created_at: hoursAgo(3) },
  { category: 'invoice', tone: 'success', icon: 'i-lucide-check-circle-2', title: 'Invoice paid', body: 'Northwind Co. paid invoice #1042 in full — $3,200.', link: '/invoices', read: true, created_at: daysAgo(1) },
  { category: 'call', tone: 'info', icon: 'i-lucide-phone-call', title: 'Client call logged', body: 'Dana Cole (Northwind) called about an invoice question.', link: '/receptionist', read: true, created_at: daysAgo(1) },
  { category: 'task', tone: 'warning', icon: 'i-lucide-clock', title: 'Follow-up due', body: 'Your outreach touch for Lawson Interiors is overdue.', link: '/leads', read: true, created_at: daysAgo(2) }
]

// ---- projects ---- (SOW hub; each belongs to a client by company)
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
// Rows without an invoiceKey are historical collections that predate the seeded
// invoices. They exist so the dashboard's collected-revenue chart has a curve
// instead of a single bar: spaced ~15 days apart across the last six months, so
// every month in the 6M window carries two whenever the seed happens to run.
const PAYMENTS = [
  { invoiceKey: 'inv-northwind-dep', company: 'Northwind Co.', amount: 9000, method: 'card', paid_at: daysAgo(5), note: null },
  { company: 'Lumen Labs', amount: 5400, method: 'card', paid_at: daysAgo(12), note: 'Customer dashboard — deposit' },
  { company: 'Northwind Co.', amount: 1800, method: 'bank', paid_at: daysAgo(20), note: 'Care plan — quarterly' },
  { company: 'Bright & Salt', amount: 2900, method: 'card', paid_at: daysAgo(35), note: 'Care plan — half-year' },
  { company: 'Harborview', amount: 3600, method: 'bank', paid_at: daysAgo(48), note: 'Booking site — final' },
  { company: 'Mintleaf', amount: 8800, method: 'card', paid_at: daysAgo(62), note: 'E-commerce storefront — deposit' },
  { company: 'Lumen Labs', amount: 2400, method: 'card', paid_at: daysAgo(75), note: 'Brand site — final' },
  { company: 'Ridgeline', amount: 7500, method: 'bank', paid_at: daysAgo(90), note: 'Customer dashboard — deposit' },
  { company: 'Bright & Salt', amount: 6200, method: 'card', paid_at: daysAgo(105), note: 'Brand site — final' },
  { company: 'Northwind Co.', amount: 1800, method: 'bank', paid_at: daysAgo(120), note: 'Care plan — quarterly' },
  { company: 'Harborview', amount: 2800, method: 'card', paid_at: daysAgo(135), note: 'Booking site — deposit' },
  { company: 'Lumen Labs', amount: 4500, method: 'card', paid_at: daysAgo(150), note: 'Site build — deposit' },
  { company: 'Vantage Group', amount: 3400, method: 'bank', paid_at: daysAgo(165), note: 'Retainer — final month' }
]

// ---- support tickets ---- (the portal's Support page, the admin Support
// Tickets page, and the dashboard's open/high-priority Needs Attention rows.
// Both stay `open` so the dashboard reads "2 Open Tickets · 1 High Priority".)
const TICKETS = [
  { key: 'northwind-form', company: 'Northwind Co.', subject: 'Contact form submissions aren’t arriving', type: 'issue', status: 'open', priority: 'high', opened_by: 'client',
    description: 'We filled in the contact form twice this morning and nothing came through to our inbox. Nothing in spam either.',
    created_at: daysAgo(4), last_activity_at: daysAgo(1),
    messages: [
      { author_type: 'client', body: 'Tested from two different browsers — the form says it sent, but no email arrives.', at: daysAgo(4) },
      { author_type: 'admin', body: 'Found it: the notification address bounced after your domain move. Repointed it and sent a test through — can you confirm you got it?', at: daysAgo(1) }
    ] },
  { key: 'lumen-safari', company: 'Lumen Labs', subject: 'Dashboard login loop on Safari', type: 'bug', status: 'open', priority: 'medium', opened_by: 'client',
    description: 'Signing in on Safari bounces straight back to the login screen. Chrome is fine.',
    created_at: daysAgo(6), last_activity_at: daysAgo(2),
    messages: [
      { author_type: 'client', body: 'Two of our team hit this on Safari 18. Chrome and Firefox log in normally.', at: daysAgo(6) },
      { author_type: 'admin', body: 'Reproduced — Safari is dropping the session cookie under ITP. Testing a fix on staging today.', at: daysAgo(2) }
    ] }
]

// ---- files ---- (Workspace › Files, and the portal's "Recently shared" rail.)
// Metadata only: `path` points into the shared upload store, but the seed writes
// no bytes there, so downloading a seeded row 404s. Everything the UI renders —
// name, type, size, who shared it, when — comes from the row.
const FILES = [
  { company: 'Northwind Co.', projectKey: null, category: 'deliverable', name: 'Brand-guidelines.pdf', title: null, mime: 'application/pdf', size_bytes: 1204338, uploaded_by: 'admin', created_at: daysAgo(3), path: '/uploads/seed-brand-guidelines.pdf' },
  { company: 'Northwind Co.', projectKey: 'northwind-rebuild', category: 'deliverable', name: 'Homepage-mockup-v3.png', title: 'Homepage Mockup — v3', mime: 'image/png', size_bytes: 842113, uploaded_by: 'admin', created_at: daysAgo(7), path: '/uploads/seed-homepage-mockup-v3.png' },
  { company: 'Northwind Co.', projectKey: null, category: 'brand', name: 'Northwind-logo.png', title: 'Northwind Primary Logo', mime: 'image/png', size_bytes: 118204, uploaded_by: 'client', created_at: daysAgo(12), path: '/uploads/seed-northwind-logo.png' },
  { company: 'Mintleaf', projectKey: 'mintleaf-store', category: 'deliverable', name: 'Product-photography.zip', title: null, mime: 'application/zip', size_bytes: 24880512, uploaded_by: 'client', created_at: daysAgo(9), path: '/uploads/seed-product-photography.zip' }
]

// ---- client notifications ---- (the portal bell + the portal home's "Latest
// activity" rail). Notifications are strictly per-user, so these are only
// inserted when a portal login already exists for the client — `npm run
// create-user -- --role client --company "…"` makes one. `ticketKey` resolves
// to that ticket's SR- code and deep link once the ticket has an id.
const CLIENT_NOTIFICATIONS = [
  { company: 'Northwind Co.', category: 'ticket', tone: 'info', icon: 'i-lucide-life-buoy', ticketKey: 'northwind-form', title: 'New Reply on {code}', body: 'Contact form submissions aren’t arriving', read: false, created_at: daysAgo(1) },
  { company: 'Northwind Co.', category: 'payment', tone: 'success', icon: 'i-lucide-check-circle-2', title: 'Payment Received', body: 'Thanks — your $1,800 payment was received.', link: '/invoices', read: true, created_at: daysAgo(2) },
  { company: 'Northwind Co.', category: 'system', tone: 'brand', icon: 'i-lucide-check-circle-2', title: 'New File Shared', body: 'Homepage-mockup-v3.png', link: '/files', read: true, created_at: daysAgo(7) }
]

// ---- expenses ---- (money out). `company` (optional) links to a client;
// subscriptions carry billing_interval + next_renewal_at (some due soon so the
// dashboard "Needs Attention" card + reminder job have something to surface).
const EXPENSES = [
  // client-related (billable = to rebill; one already reimbursed)
  { category: 'client', company: 'Northwind Co.', projectKey: 'northwind-rebuild', vendor: 'Shutterstock', description: 'Stock photography for the rebuild', amount: 149, payment_method: 'card', billable: 1, expense_date: dateAgo(18), reimbursed_at: null },
  { category: 'client', company: 'Mintleaf', projectKey: 'mintleaf-store', vendor: 'Stripe (test charges)', description: 'Sandbox transaction fees', amount: 32.5, payment_method: 'card', billable: 1, expense_date: dateAgo(9), reimbursed_at: null },
  { category: 'client', company: 'Ridgeline', projectKey: null, vendor: 'Google Maps API', description: 'Store-locator map credits', amount: 88, payment_method: 'card', billable: 1, expense_date: dateAgo(40), reimbursed_at: daysAgo(30) },
  // business overhead (no client)
  { category: 'business', vendor: 'DigitalOcean', description: 'Droplet hosting — Ops app', amount: 24, payment_method: 'card', expense_date: dateAgo(6) },
  { category: 'business', vendor: 'Namecheap', description: 'Domain renewals (batch)', amount: 63.4, payment_method: 'card', expense_date: dateAgo(15) },
  { category: 'business', vendor: 'US Post Office', description: 'Client welcome gifts — postage', amount: 41.2, payment_method: 'cash', expense_date: dateAgo(22) },
  // third-party subscriptions (recurring)
  { category: 'subscription', vendor: 'Figma', description: 'Professional seat', amount: 15, payment_method: 'card', billing_interval: 'monthly', expense_date: dateAgo(24), next_renewal_at: dateAhead(4) },
  { category: 'subscription', vendor: 'Adobe Creative Cloud', description: 'All apps plan', amount: 59.99, payment_method: 'card', billing_interval: 'monthly', expense_date: dateAgo(27), next_renewal_at: dateAhead(2) },
  { category: 'subscription', vendor: 'GitHub', description: 'Team plan', amount: 44, payment_method: 'card', billing_interval: 'monthly', expense_date: dateAgo(12), next_renewal_at: dateAhead(18) },
  { category: 'subscription', vendor: 'Google Workspace', description: 'Business Standard (annual)', amount: 144, payment_method: 'card', billing_interval: 'yearly', expense_date: dateAgo(120), next_renewal_at: dateAhead(45) },
  { category: 'subscription', vendor: 'Zoom', description: 'Pro plan — cancelled', amount: 14.99, payment_method: 'card', billing_interval: 'monthly', status: 'cancelled', expense_date: dateAgo(60), next_renewal_at: dateAgo(2) }
]

function cols(obj) {
  const keys = Object.keys(obj)
  return { sql: `(${keys.join(', ')}) VALUES (${keys.map(k => `:${k}`).join(', ')})`, params: obj }
}

async function insertRow(table, row) {
  if (row.tags) row.tags = JSON.stringify(row.tags)
  const { sql, params } = cols(row)
  const [res] = await pool.query(`INSERT INTO ${table} ${sql}`, params)
  return res.insertId
}

try {
  // Ensure the base project type exists (config, not sample data) on every run,
  // even for an existing DB that skips the sample seed below.
  await pool.query(
    "INSERT IGNORE INTO project_types (`key`, name, description, code_prefix, sort_order) VALUES ('website', 'Website Design & Development', 'Custom website design + build under the FWA Website Design & Development Agreement.', 'WEB', 0)"
  )
  const [[websiteType]] = await pool.query("SELECT id FROM project_types WHERE `key` = 'website' LIMIT 1")

  // Default delivery-plan template for the website type (config, not sample data).
  // A named "Website Build" template with milestones + starter tasks, flagged as
  // the type's default so it applies when a project is created without an explicit
  // template pick (e.g. the lead→client conversion path). Seed once if none exist.
  const [[{ pt }]] = await pool.query('SELECT COUNT(*) AS pt FROM project_templates WHERE project_type_id = ?', [websiteType.id])
  if (pt === 0) {
    const WEBSITE_TEMPLATE = [
      ['Discovery', ['Kickoff call', 'Gather brand assets & content', 'Confirm sitemap & scope']],
      ['Design', ['Homepage mockup', 'Interior page designs', 'Design review & sign-off']],
      ['Build', ['Develop pages', 'Wire up forms & integrations', 'Responsive & cross-browser QA']],
      ['Launch', ['Client review & revisions', 'Go-live & DNS', 'Post-launch check-in']]
    ]
    const [tplRes] = await pool.query(
      'INSERT INTO project_templates (name, description, project_type_id, is_default, is_active, sort_order) VALUES (?, ?, ?, 1, 1, 0)',
      ['Website Build', 'Standard delivery plan for a website project.', websiteType.id]
    )
    const templateId = tplRes.insertId
    for (let i = 0; i < WEBSITE_TEMPLATE.length; i++) {
      const [title, tasks] = WEBSITE_TEMPLATE[i]
      const [mRes] = await pool.query(
        'INSERT INTO project_template_milestones (template_id, title, position) VALUES (?, ?, ?)',
        [templateId, title, i]
      )
      const milestoneId = mRes.insertId
      for (let j = 0; j < tasks.length; j++) {
        await pool.query(
          'INSERT INTO project_template_tasks (template_id, template_milestone_id, title, position) VALUES (?, ?, ?, ?)',
          [templateId, milestoneId, tasks[j], j]
        )
      }
    }
  }

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM clients')
  if (n > 0 && !force) {
    console.log(`Clients already present (${n}). Use "npm run seed -- --force" to reseed.`)
    await closePool()
    process.exit(0)
  }
  // users.client_id is ON DELETE SET NULL, so wiping clients silently unlinks
  // every portal login and leaves it unable to see anything. Remember which
  // company each one belonged to and re-link by name once the new rows exist.
  let portalLinks = []
  if (force) {
    ;[portalLinks] = await pool.query(
      "SELECT u.id, c.company FROM users u JOIN clients c ON c.id = u.client_id WHERE u.role = 'client'"
    )
    // Children first — everything that FK-references clients (RESTRICT) must go
    // before clients. Line-item tables cascade with their parent. calls SET NULL,
    // deleted explicitly. leads has no children.
    await pool.query('DELETE FROM payments')
    await pool.query('DELETE FROM expenses') // client_id RESTRICT, must precede clients
    await pool.query('DELETE FROM tickets') // cascades ticket_messages + ticket_attachments
    await pool.query('DELETE FROM files') // client/project FKs are SET NULL — clear explicitly
                                          // or old rows survive every reseed, unattached
    await pool.query('DELETE FROM websites') // cascades website_metrics
    await pool.query('DELETE FROM invoices') // cascades invoice_line_items
    await pool.query('DELETE FROM contracts') // cascades contract_line_items
    await pool.query('DELETE FROM proposals') // cascades proposal_line_items
    await pool.query('DELETE FROM tasks')
    await pool.query('DELETE FROM projects')
    await pool.query('DELETE FROM notifications')
    await pool.query('DELETE FROM calls')
    await pool.query('DELETE FROM lead_touches')
    await pool.query('DELETE FROM leads')
    await pool.query('DELETE FROM clients')
    console.log('Cleared billing + sales + tasks + projects + notifications + calls + leads + clients.')
  }

  const companyToClientId = {}
  const slugToLeadId = {}
  const companyToLeadId = {}

  for (const c of CLIENTS) {
    companyToClientId[c.company] = await insertRow('clients', { ...c })
  }
  for (const link of portalLinks) {
    const clientId = companyToClientId[link.company]
    if (clientId) await pool.query('UPDATE users SET client_id = ? WHERE id = ?', [clientId, link.id])
  }
  for (const l of INBOUND) {
    const { slug, createdAt, ...rest } = l
    slugToLeadId[slug] = await insertRow('leads', { ...rest, created_at: createdAt })
  }
  for (const o of OUTREACH) {
    companyToLeadId[o.company] = await insertRow('leads', { ...o, source: 'manual' })
  }

  for (const t of LEAD_TOUCHES) {
    const leadId = companyToLeadId[t.company]
    if (!leadId) continue
    await pool.query(
      'INSERT INTO lead_touches (lead_id, channel, body, occurred_at) VALUES (?, ?, ?, ?)',
      [leadId, t.channel, t.body, t.occurredAt]
    )
  }

  for (const call of CALLS) {
    const { linkSlug, linkClient, business, captured, transcript, reviewed, ...rest } = call
    const row = {
      ...rest,
      lead_id: linkSlug ? (slugToLeadId[linkSlug] ?? null) : null,
      client_id: linkClient ? (companyToClientId[linkClient] ?? null) : null,
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
    const row = { ...rest, client_id: companyToClientId[company], project_type_id: websiteType.id }
    const { sql, params } = cols(row)
    const [res] = await pool.query(`INSERT INTO projects ${sql}`, params)
    projectKeyToId[key] = res.insertId
  }

  // Seed delivery milestones per project from the type's templates (the seed
  // inserts projects directly, bypassing createProject's auto-seed). Give a
  // little state variety so the timeline reads realistically.
  const [templateRows] = await pool.query(
    'SELECT title, position FROM milestone_templates WHERE project_type_id = ? AND is_active = 1 ORDER BY position ASC, id ASC',
    [websiteType.id]
  )
  const projectKeyToMilestoneIds = {}
  for (const [key, projectId] of Object.entries(projectKeyToId)) {
    const ids = []
    for (const t of templateRows) {
      const [res] = await pool.query(
        'INSERT INTO project_milestones (project_id, title, position) VALUES (?, ?, ?)',
        [projectId, t.title, t.position]
      )
      ids.push(res.insertId)
    }
    projectKeyToMilestoneIds[key] = ids
    if (ids[0]) await pool.query("UPDATE project_milestones SET state = 'complete', completed_at = ? WHERE id = ?", [daysAgo(10), ids[0]])
    if (ids[1]) await pool.query("UPDATE project_milestones SET state = 'in_progress' WHERE id = ?", [ids[1]])
  }

  for (const t of TASKS) {
    const { projectKey, due, doneAgo, ...rest } = t
    const row = {
      ...rest,
      project_id: projectKey ? projectKeyToId[projectKey] : null,
      milestone_id: null,
      due_date: due ?? null,
      completed_at: rest.status === 'done' ? daysAgo(doneAgo ?? 1) : null
    }
    // Bucket tasks into milestones by status so completed work sits under the
    // completed milestone, active work under the in-progress one, etc.
    const ms = projectKey ? projectKeyToMilestoneIds[projectKey] : null
    if (ms?.length) {
      const idx = rest.status === 'done' ? 0 : rest.status === 'todo' ? Math.min(2, ms.length - 1) : 1
      row.milestone_id = ms[idx] ?? null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO tasks ${sql}`, params)
  }

  // A few demo checklists so the task progress bar shows on a fresh seed.
  // (--force clears tasks, cascading task_checklist_items, so this stays clean.)
  const [checklistTasks] = await pool.query('SELECT id FROM tasks WHERE project_id IS NOT NULL ORDER BY id LIMIT 3')
  const CHECKLISTS = [
    [['Audit current site', 1], ['Gather brand assets', 1], ['Confirm sitemap', 0], ['Kickoff notes to client', 0]],
    [['Wireframe home', 1], ['Wireframe interior pages', 0], ['Client review round', 0]],
    [['Set up components', 0], ['Build home page', 0], ['Responsive pass', 0], ['QA + launch checklist', 0]]
  ]
  for (let i = 0; i < checklistTasks.length; i++) {
    const items = CHECKLISTS[i]
    if (!items) break
    for (let p = 0; p < items.length; p++) {
      await pool.query('INSERT INTO task_checklist_items (task_id, title, done, position) VALUES (?, ?, ?, ?)', [checklistTasks[i].id, items[p][0], items[p][1], p])
    }
  }

  const invoiceKeyToId = {}
  for (const inv of INVOICES) {
    const { key, company, projectKey, line, ...rest } = inv
    const row = { ...rest, client_id: companyToClientId[company], project_id: projectKey ? projectKeyToId[projectKey] : null }
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
    const row = { ...rest, client_id: companyToClientId[company], invoice_id: invoiceKeyToId[invoiceKey] ?? null }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO payments ${sql}`, params)
  }

  for (const e of EXPENSES) {
    const { company, projectKey, ...rest } = e
    const row = {
      ...rest,
      client_id: company ? companyToClientId[company] : null,
      project_id: projectKey ? projectKeyToId[projectKey] : null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO expenses ${sql}`, params)
  }

  const ticketKeyToId = {}
  for (const t of TICKETS) {
    const { key, company, messages, ...rest } = t
    const row = { ...rest, client_id: companyToClientId[company] }
    const { sql, params } = cols(row)
    const [res] = await pool.query(`INSERT INTO tickets ${sql}`, params)
    ticketKeyToId[key] = res.insertId
    for (const m of messages ?? []) {
      await pool.query(
        'INSERT INTO ticket_messages (ticket_id, author_type, body, created_at) VALUES (?, ?, ?, ?)',
        [res.insertId, m.author_type, m.body, m.at]
      )
    }
  }

  for (const f of FILES) {
    const { company, projectKey, ...rest } = f
    const row = {
      ...rest,
      client_id: company ? companyToClientId[company] : null,
      project_id: projectKey ? projectKeyToId[projectKey] : null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO files ${sql}`, params)
  }

  // Portal-side notifications hang off a login, not a client, so they can only
  // be seeded for clients that already have one.
  const [portalUsers] = await pool.query("SELECT id, client_id FROM users WHERE role = 'client' AND client_id IS NOT NULL")
  const clientIdToUserId = Object.fromEntries(portalUsers.map(u => [u.client_id, u.id]))
  let clientNotes = 0
  for (const note of CLIENT_NOTIFICATIONS) {
    const { company, ticketKey, read, ...rest } = note
    const userId = clientIdToUserId[companyToClientId[company]]
    if (!userId) continue
    const ticketId = ticketKey ? (ticketKeyToId[ticketKey] ?? null) : null
    const row = {
      ...rest,
      user_id: userId,
      title: ticketId ? rest.title.replace('{code}', ticketCode(ticketId)) : rest.title,
      link: ticketId ? `/support/${ticketId}` : (rest.link ?? null),
      read_at: read ? daysAgo(0) : null
    }
    const { sql, params } = cols(row)
    await pool.query(`INSERT INTO notifications ${sql}`, params)
    clientNotes++
  }
  if (clientNotes === 0) {
    console.log('• No client logins found — skipped the portal notification feed. Create one, then reseed:')
    console.log('  npm run create-user -- --email dana@northwind.com --name "Dana Cole" --password \'…\' --role client --company "Northwind Co."')
  }

  // websites + 90d of daily metrics (idempotent; links to the clients/projects above).
  const web = await seedWebsites()

  const [[lc]] = await pool.query('SELECT COUNT(*) AS n FROM leads')
  const [[lt]] = await pool.query('SELECT COUNT(*) AS n FROM lead_touches')
  const [[cc]] = await pool.query('SELECT COUNT(*) AS n FROM clients')
  const [[kc]] = await pool.query('SELECT COUNT(*) AS n FROM calls')
  const [[nc]] = await pool.query('SELECT COUNT(*) AS n FROM notifications')
  const [[pc]] = await pool.query('SELECT COUNT(*) AS n FROM projects')
  const [[tc]] = await pool.query('SELECT COUNT(*) AS n FROM tasks')
  const [[ic]] = await pool.query('SELECT COUNT(*) AS n FROM invoices')
  const [[yc]] = await pool.query('SELECT COUNT(*) AS n FROM payments')
  const [[ec]] = await pool.query('SELECT COUNT(*) AS n FROM expenses')
  const [[sc]] = await pool.query('SELECT COUNT(*) AS n FROM tickets')
  const [[fc]] = await pool.query('SELECT COUNT(*) AS n FROM files')
  console.log(`✔ Seeded ${lc.n} leads (${lt.n} touches), ${cc.n} clients, ${kc.n} calls, ${nc.n} notifications, ${pc.n} projects, ${tc.n} tasks, ${ic.n} invoices, ${yc.n} payments, ${ec.n} expenses, ${sc.n} tickets, ${fc.n} files, and ${web.created} websites (${web.metricsInserted} metric rows).`)
} finally {
  await closePool()
}
