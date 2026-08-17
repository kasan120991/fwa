# FWA — Francis Web Agency

The software that runs a web agency: an internal operations platform, a client portal, and the
public marketing site that feeds them. Leads arrive from a contact form or the phone, become
clients, and carry proposals, contracts, projects, invoices and the websites they pay for, all in
one system.

Built solo. Three deployable projects live side by side in this repo.

**▶ Live demo — [demo.franciswebagency.com](https://demo.franciswebagency.com)**
The Ops admin app, signed in automatically as a demo account. Everything in it is sample data and it
resets nightly, so click anything. The integrations are key-gated off, so nothing leaves the box.

![The FWA Ops dashboard — KPI cards, collected-revenue chart, and a cross-source Needs Attention
feed](docs/screenshots/dashboard.png)
*Ops dashboard. What the agency owner sees first: the numbers, the money collected, and everything
across the system that needs a decision today.*

![The AI Receptionist call inbox — call list on the left, the selected call's summary, captured
details, and transcript on the right](docs/screenshots/receptionist.png)
*AI Receptionist. Every Vapi call lands here classified, summarized, and transcribed, with the
caller's intent extracted. Inquiries convert to leads in one click.*

![The client portal home — a dark greeting band with the client's numbers, their project, recently
shared files, and latest activity](docs/screenshots/portal.png)
*Client portal. The same API, a different audience. Clients see their projects, invoices, files,
and tickets, and pay in-portal through Stripe.*

<sub>Screenshots are the local dev build at 1440×900, running the same seed the live demo does. Every
client, call, and dollar figure in them is fictional.</sub>

## What's in here

| Project | Path | What it is |
|---|---|---|
| **Ops app — admin** | `app/` | Nuxt 4 · Nuxt UI 4 · Tailwind v4. The internal tool: leads, clients, receptionist, sales, billing, delivery, websites |
| **Ops app — API** | `server/` | Node · Express 5 · MySQL. Hand-rolled REST, cookie-session auth, Socket.IO, Stripe / PandaDoc / Vapi integrations |
| **Client portal** | `portal/` | Nuxt 4. External-facing side for clients, sharing the same API |
| **Marketing site** | `website/` | Nuxt 4 + Directus. Public franciswebagency.com. **Its own git repo, its own `CLAUDE.md`** |

`app/` and `server/` are two halves of one product. `website/` is separate: a contact-form
submission there POSTs to the server's webhook and lands in the Ops app as an inbound lead.

## Stack

**Frontend** Vue 3 · Nuxt 4 · Nuxt UI 4 · Tailwind v4 · Socket.IO client
**Backend** Node 22 · Express 5 · MySQL via `mysql2` (no ORM) · Socket.IO · cookie-session auth over bcrypt
**Integrations** Stripe (customers, invoices, payments, webhooks) · PandaDoc (proposals, contracts) · Vapi (voice AI) · Plausible (analytics)
**Infra** Docker Compose · Caddy · DigitalOcean

## The parts worth reading

Most of this is ordinary CRUD. These are the decisions that weren't.

**Leads and clients are separate tables, and conversion is a copy, not a stage flip.**
The obvious design unifies them in one `contacts` table with a status column. This repo had that
design and abandoned it. A lead is top-of-funnel and owns nothing; a client owns proposals,
contracts, projects, invoices, and websites. Every sales artifact foreign-keys `client_id`, which
means the schema itself makes "invoice a lead" unrepresentable rather than merely discouraged.
`POST /api/leads/:id/convert` copies the lead into a new client row, provisions the Stripe customer,
moves any linked calls across, optionally creates a project, then deletes the lead.

**The AI receptionist is a Vapi voice assistant, and it is deliberately not trusted.**
Calls arrive by webhook and are ingested **idempotently, keyed on Vapi's call ID**, so a retry or a
duplicate delivery can't double-write. Transcripts persist as structured turns, get classified
(`inquiry` / `client` / `spam` / `wrong_number` / `other`), and link to a lead or a client through
nullable foreign keys that `SET NULL` rather than cascade.

What it does *not* do is auto-create leads. An AI that mishears a wrong number would otherwise
quietly poison the pipeline, so promotion is always an explicit `POST /api/calls/:id/convert`. The
`calls` table stays an append-only event log. Calls are events, not entities.

**Agreements is a view, not a table.** Proposals and contracts are genuinely different things with
different lifecycles, so they stay separate tables; the Agreements page merges them in a union query
where each row carries its own `kind` and `uid`. The merge lives in the query layer. Denormalizing
them into one table would have made the page easier and the model wrong.

**Projects originate contracts, not the other way around.** The naive flow is contract → project.
Inverted here: the project is the statement-of-work hub, and the contract hangs off it. Work is the
thing that exists; paperwork describes it.

**All SQL lives in repositories.** The server is strictly layered: `routes/` (thin, `requireAuth`-gated)
→ `services/` (business logic and integrations) → `repositories/` (every query) → `db/pool.js`. No
ORM: the schema and queries are hand-written, which is a deliberate trade of convenience for control
over the union queries and rollups the dashboards need.

**One API, two front ends, one front door.** Caddy proxies `/api`, `/socket.io`, and `/uploads` to
the API and everything else to the Nuxt app, so both front ends are same-origin and CORS is mostly
moot. Background jobs handle Plausible analytics sync and scheduled uptime checks.

## Running it locally

Requires **Node 22** and a reachable **MySQL**. Without a database the server still boots and
`GET /api/health` reports `"db": "down"`.

```bash
# API → http://localhost:4000
cd server
npm install
cp .env.example .env     # dev defaults work as-is; add keys for Stripe/PandaDoc/Vapi features
npm run migrate          # creates the DB (default: fwa_ops) and applies the schema
npm run seed             # demo clients, leads, calls, projects, invoices, six months of payments
npm run create-user -- --email you@fwa.com --name "Your Name" --password '…'
npm run dev

# Admin app → http://localhost:3000
cd ../app && npm install && npm run dev

# Client portal → http://localhost:3001 (Nuxt takes the next free port)
cd ../portal && npm install && npm run dev
```

The seed is what the screenshots above were taken from. To see the portal side, add a client login
and reseed. The portal's notification feed is per-user, so it fills in on the next seed:

```bash
cd server
npm run create-user -- --email dana@northwind.com --name "Dana Cole" \
  --password '…' --role client --company "Northwind Co."
npm run seed -- --force
```

Both apps run on `localhost`, and cookies ignore the port, so signing into one signs you out of the
other. That's a local-only artifact; in production they sit on separate subdomains.

The marketing site runs separately. See `website/CLAUDE.md`.

Integrations degrade rather than crash when unconfigured: Plausible sync is key-gated, and the Vapi
and PandaDoc webhooks simply never fire without their secrets.

## Deployment

Both projects co-deploy on one box. The Ops app is a Docker stack of `mysql` + `api` (:4000) +
`app` (:3000), configured from `.env.production` (template: `.env.production.example`). The
marketing site deploys from `website/` with its own compose file, and **its Caddy is the shared
front door** for both; the ops stack attaches to the website's Docker network.

```bash
docker compose --env-file .env.production up -d --build
```

The public demo runs from that same compose file behind a `demo` profile: the same two images
pointed at their own database, every integration key left unset so each one no-ops, and a nightly
job that drops the schema and reseeds it.

Host details, the rsync deploy procedure, and the full architecture rationale are in
[`CLAUDE.md`](./CLAUDE.md).

## Repo layout

```
app/        Nuxt admin app (srcDir is app/app/)
server/     Express API — routes/ → services/ → repositories/ → db/
            db/ holds schema + migrations; jobs/ holds analytics sync and uptime checks
portal/     Nuxt client portal
website/    Marketing site — separate git repo, separate CLAUDE.md
brand/      Design system: tokens, styles, voice guide (the `fwa-design` skill)
deploy/     Caddyfile for the ops vhost, and the demo's nightly reset script
```

Backend work belongs in `server/`, admin-frontend work in `app/`. The marketing site does **not**
use Nuxt UI and has its own primitives, so follow `website/CLAUDE.md` before touching it.
