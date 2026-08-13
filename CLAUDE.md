# FWA — Monorepo Brief

## What's in this repo

This root (`fwa/`) holds Francis Web Agency's web presence and internal tooling. FWA is a
**solo web design agency**. Three projects live side by side:

- **`app/`** — the **FWA Ops admin app** (Nuxt 4 SPA, Nuxt UI 4). The internal
  business-management tool: leads, clients, projects, sales, billing, delivery, websites.
- **`server/`** — the **Ops backend** (Node + Express 5 + MySQL) that `app/` talks to. Hand-rolled
  REST API, cookie-session auth, Socket.IO realtime, Stripe/PandaDoc integrations.
- **`website/`** — the **public FWA marketing website** (Nuxt 4 + Directus). Its **own git repo**
  with its **own `CLAUDE.md`** — read that before touching it.

**How they relate:** `app/` + `server/` are the two halves of the **FWA Ops app** (one product).
`website/` is the separate marketing site that *feeds* it — a contact-form submission on the
website POSTs to the server's webhook and becomes an **inbound `website` lead** in the Ops app.
`app/` and `website/` share the same FWA brand tokens but are built differently (the app uses
Nuxt UI; the website deliberately does not — see below).

> Working in `website/`? Follow **`website/CLAUDE.md`** (its build rules differ from the app's).
> This root file is the shared context; the sections below are mostly the **Ops app (`app/` + `server/`)**.

---

## The Ops app (`app/` + `server/`)

### Two-sided by design

- **Admin app** — the internal side, used only by the owner. This is the entire current build
  target. Everything below — shell, dashboard, leads, clients, receptionist, sales, billing,
  delivery, websites — is the admin side.
- **Client portal** — an external-facing side for FWA's clients, **deferred to a later phase**.

Because a second user type is coming, the auth model already carries an **admin vs. client
account-type distinction** (`users.role` enum, `admin` only in use this phase) and routing is kept
ready for a **separate portal route area** — but don't build portal functionality until that phase.
The login screen built so far is the **admin** login.

### Scope — where the build is now

**Built (schema + API + pages, wired to live data):**

- App shell — sidebar nav + top bar, with a live notification feed
- Dashboard (live KPIs, collected-revenue chart, cross-source "Needs Attention" feed)
- Leads (Inbound / Outreach) + new/edit
- Clients list + Client detail + new/edit
- AI Receptionist (call inbox)
- **Sales — Agreements**: proposals + contracts merged into one page, PandaDoc-driven
- **Billing**: Invoices + Payments, Stripe-driven
- **Delivery**: Projects (+ detail) and Tasks, with a project-type catalog
- **Websites**: cross-client analytics dashboard + per-site detail (traffic, conversions, top
  pages/sources, uptime/perf history), optional Plausible sync + uptime checks
- File storage (local disk today; logos/uploads)

**Still deferred (stub routes, build when asked):** Files (page), Calendar, Support Tickets, Settings.

**Deferred to a later phase entirely:** the **client portal**.

Keep all nav groups and items in place — deferred destinations are stub routes, fleshed out later
reusing the same components and design system. Don't build deferred pages unless asked.

### Stack

- **`app/` (frontend):** Nuxt 4 + Vue + Nuxt UI 4, Tailwind v4. Socket.IO client for realtime.
  Nuxt srcDir is **`app/app/`** (`pages/`, `components/`, `composables/`, `layouts/`, `utils/`).
- **`server/` (backend):** Node + Express 5, hand-rolled REST API. Cookie-session auth (bcrypt).
  Socket.IO for realtime push (notifications, new calls, invoice/task/website changes).
- **Database:** MySQL (via `mysql2`, no ORM — hand-written SQL).
- **Integrations:** Stripe (customers, invoices, payments, webhooks), PandaDoc
  (proposals/contracts docs), Plausible (website analytics sync — optional, key-gated).
- No CMS, no ORM — the schema and API are custom.

### Layout

- `server/` — layered: `routes/` (thin, `requireAuth`-gated) → `services/` (business logic +
  integrations) → `repositories/` (all SQL) → `db/pool.js`. Schema + migrations in `server/src/db/`.
  Background jobs (analytics sync, uptime checks) in `server/src/jobs/`. Uploads land in
  `server/uploads/`.
- `app/` — the Nuxt app under `app/app/`.
- `deploy/`, `docker-compose.yml`, `Dockerfile`s, `.env.production.example` — Ops-app production
  deployment (see Deployment).

Keep backend work in `server/` and admin-frontend work in `app/`. Respect the server's layering —
**SQL belongs in repositories**, not routes or services.

## Core data model (read before touching anything data-related)

Three tables — `leads`, `clients`, `calls` — are the spine. Leads and clients are **separate
tables**; a lead is copied into a client on conversion, then deleted. (This supersedes an earlier
design that unified them in a `contacts` table — that table no longer exists.)

**1. `leads` — top of funnel only.** Website contact-form submissions and manual outreach. A lead
owns **no** sales artifacts (no proposals/projects/invoices).

- `source` — `website` (contact form → **Inbound**) or `manual` (outreach → **Outreach**). Calls
  are no longer a lead source.
- `stage` — `new`, `qualifying`, `to_contact`, `contacted`, `engaged`, `qualified`, `lost`.
  - Inbound: `new` → `qualifying` → `qualified`; Outreach: `to_contact` → `contacted` → `engaged`
    → `qualified`; `lost` = dead. No `proposal`/`active`/`past` stage on a lead.
- Minimal fields: identity, `message` (inbound inquiry), `notes`, `tags`, outreach cadence
  (`last_contacted_at`, `next_action_at`). No billing/address/stripe — those are client concerns.

**2. `clients` — converted parties.** Everything sales/billing/delivery FKs a **client**
(`client_id`). Leads never own those; starting a proposal or project presupposes a client.

- `status` — `active`, `past`, `lost` (relationship state, not a pipeline stage).
- `source` — origin (`website`/`manual`/`call`/`direct`), carried from the lead for reporting.
- Full fields: identity + `logo_url`, billing address, `billing_email`, `client_since`,
  `stripe_customer_id`, `notes`, `tags`.

**Conversion (lead → client)** is `POST /api/leads/:id/convert` (body optionally `{ project }`):
**copies** the lead into a new `clients` row (`status = active`, `client_since = today`), provisions
the Stripe customer, moves any linked calls to the client, optionally creates a project, then
**deletes the lead**. A signed project contract also confirms the client won (`markClientWon` →
`status = active`) via the PandaDoc webhook.

**3. `calls` — events, not entities.** Every AI-receptionist (Vapi) call is logged in its own
append-only table. Links via **nullable `lead_id`** *or* **`client_id`** (`ON DELETE SET NULL`).

- Classification: `inquiry`, `client`, `spam`, `wrong_number`, `other`.
- **Convert to lead** (`POST /api/calls/:id/convert`) creates a `manual` lead (`stage = new`) and
  sets the call's `lead_id`. On a later lead→client conversion the link moves `lead_id` → `client_id`.

### Sales, billing, delivery & websites (children of a client)

- **Proposals** and **contracts** — children of a client, line items snapshotted from the
  `services` price book. Proposals are PandaDoc-backed; contracts carry a `type`
  (`project` / `care_plan`).
- **Agreements** is a *view*, not a table — the page merges proposals + contracts into one union
  query (each row carries a `kind` + `uid`). Keep the merge in the query layer; the tables stay separate.
- **Projects** are the **SOW hub**: a project originates its contract (inverting a naive
  "contract creates project" flow). Projects carry a `project_type`, hang off a client, own **tasks**.
- **Invoices** + **payments** — Stripe-driven, children of a client (invoices carry line items).
- **`websites`** + **`website_metrics`** (daily traffic) + **`website_checks`** (uptime history) —
  sites FWA builds/maintains, FK a client (+ optional originating project). Metrics are stored rows
  (seeded now, Plausible-synced when a key is set); the Websites pages compute rollups/charts from them.
- **`services`** — the price book (website packages, care plans, add-ons).
- **`notifications`** — back the top-bar alert feed, pushed over Socket.IO.

## Pages & navigation

Persistent left sidebar (collapsible) + top bar + main content. Nav groups (✓ = built; unmarked = stub):

- **(top)** Dashboard ✓ · AI Receptionist ✓
- **Clients & Work** — Leads ✓ · Clients ✓ · Projects ✓ · Tasks ✓
- **Sales** — Agreements ✓
- **Billing** — Invoices ✓ · Payments ✓
- **Workspace** — Files · Calendar · Websites ✓
- **(pinned bottom)** Support tickets · Settings

## Design workflow (Ops app)

The app's design system is the invocable **`fwa-design` skill** (a symlink →
`brand/`) — use it for any admin-app UI work. It's the single source of truth for color,
type, spacing, radii, icons, and components. Build as Nuxt UI + Tailwind v4 components that defer to
it. Reuse the established shared components (tables, `StatusChip`, forms, `StatCard`, `TrendChart`,
phone/tag inputs, the call-detail component) and match existing patterns.

> The **marketing `website/` does NOT use Nuxt UI** and has its own tokens/primitives — do not apply
> app patterns there; follow `website/CLAUDE.md`.

## Deployment

Both projects co-deploy on one box.

- **Ops app** — Docker stack (`docker-compose.yml`): `mysql` + `api` (Express, :4000) + `app`
  (Nuxt, :3000). Config from `.env.production` (template `.env.production.example`).
- **Marketing website** — deploys from `website/` (its own `docker-compose.yml`, project
  `name: website`), and its **Caddy is the shared front door**. The ops stack attaches to the
  website's Docker network (`website_default`). Caddy proxies the ops domain — `/api`, `/socket.io`,
  `/uploads` → `api:4000`, everything else → `app:3000` (vhosts now committed in `website/deploy/Caddyfile` (was: appended
  to the server copy — superseded 2026-07-30).

### How to redeploy (ops app)

- **Server:** DigitalOcean droplet (hostname `FWA`, IntelliJ alias `fwa-droplet`), reached as
  `$DEPLOY_USER@$DEPLOY_HOST`. **Both live in `.env.deploy`** — untracked, local-only, covered by the
  `.env.*` ignore rule and by the rsync `--exclude='.env*'` below, so it never lands in the repo or
  on the server. Public URL `https://app.franciswebagency.com` (`OPS_DOMAIN`).
- **The box is not a git checkout.** The ops app lives at `/opt/fwa-ops`, populated by
  **uploading the local working tree** (not `git pull` — this repo isn't pushed). Ops app is
  `/opt/fwa-ops`; marketing site is `/opt/fwa-site`.
- **`/opt/fwa-ops/.env.production` is server-only** (root-owned) — never overwrite it during a sync.
- **Redeploy = rsync the tree up, then rebuild the stack:**

  ```bash
  # from the repo root (/Users/kasanfrancis/Projects/fwa)
  source .env.deploy          # sets DEPLOY_USER and DEPLOY_HOST

  rsync -az --itemize-changes \
    --exclude='.git' --exclude='node_modules' --exclude='.nuxt' --exclude='.output' \
    --exclude='dist' --exclude='.env.production' --exclude='.env*' --exclude='.DS_Store' \
    --exclude='.playwright-mcp' --exclude='website' --exclude='*.png' --exclude='uploads' \
    --exclude='.idea' --exclude='.claude' --exclude='.junie' \
    ./ "$DEPLOY_USER@$DEPLOY_HOST":/opt/fwa-ops/

  ssh "$DEPLOY_USER@$DEPLOY_HOST" 'cd /opt/fwa-ops && docker compose --env-file .env.production up -d --build'
  ```

  Exclude `website/` — it deploys separately to `/opt/fwa-site`. Verify with
  `docker ps --filter name=fwa-ops`, `docker logs fwa-ops-api-1 --tail 15`, and
  `curl -I https://app.franciswebagency.com/`.

---

## The marketing website (`website/`)

Public site at franciswebagency.com. **Nuxt 4 + Tailwind v4 (CSS-first, no config), NO Nuxt UI.**
Content comes from **Directus** (`@directus/sdk`); analytics via **Plausible** (`@nuxtjs/plausible`);
self-hosted fonts (`@nuxt/fonts`) + `@nuxt/image`.

- Layout: `website/app/` (Nuxt srcDir), `website/server/` (Nitro `api`/`routes` — incl. the
  **contact-form endpoint** that POSTs to the Ops server webhook), `website/directus-seed/`,
  `website/docs/` (`fwa-site-structure.md` = routes, `fwa-website-copy.md` = copy, used **verbatim**).
- Shares FWA brand tokens (`website/app/assets/css/tokens.css`) but builds local primitives
  (`AppButton`, `Eyebrow`, `Card`) instead of Nuxt UI.
- **It's a separate git repo** — commits/branches there are independent of the ops repo.

Full build rules (design conversion, motion, content voice) live in **`website/CLAUDE.md`**.

---

## Guardrails

- **Leads and clients are separate tables.** Conversion copies a lead into a new `clients` row and
  deletes the lead (`POST /api/leads/:id/convert`) — not a stage flip. All sales/billing/delivery FK
  `client_id`; leads never own them.
- Leads are `website` (contact form) or `manual` (outreach) only — calls are not a lead source.
  Never auto-create a lead from a raw call; conversion is explicit (`POST /api/calls/:id/convert`).
- Keep `calls` an append-only event log (nullable `lead_id`/`client_id`, SET NULL).
- Keep Agreements a query-layer merge — proposals and contracts stay separate tables.
- Keep the project → contract direction: projects are the SOW hub that originate contracts.
- Respect the server layering: all SQL lives in repositories.
- Defer app visual styling to the `fwa-design` skill; keep app work in `app/`, backend in `server/`.
- For the marketing site, work in `website/` and follow `website/CLAUDE.md` — no Nuxt UI there.
