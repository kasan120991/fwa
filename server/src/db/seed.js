// Seeds sample contacts + calls so the app has data to render.
// Usage: npm run seed          (skips if contacts already exist)
//        npm run seed -- --force  (wipes calls + contacts first)
import { getPool, closePool } from './pool.js'

const force = process.argv.includes('--force')
const pool = getPool()

const now = Date.now()
const fmt = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const daysAgo = d => fmt(now - d * 86400e3)
const hoursAgo = h => fmt(now - h * 3600e3)
const daysAhead = d => fmt(now + d * 86400e3)

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
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM contacts')
  if (n > 0 && !force) {
    console.log(`Contacts already present (${n}). Use "npm run seed -- --force" to reseed.`)
    await closePool()
    process.exit(0)
  }
  if (force) {
    await pool.query('DELETE FROM calls')
    await pool.query('DELETE FROM contacts')
    console.log('Cleared calls + contacts.')
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

  const [[cc]] = await pool.query('SELECT COUNT(*) AS n FROM contacts')
  const [[kc]] = await pool.query('SELECT COUNT(*) AS n FROM calls')
  console.log(`✔ Seeded ${cc.n} contacts and ${kc.n} calls.`)
} finally {
  await closePool()
}
