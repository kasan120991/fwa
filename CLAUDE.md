# FWA — Monorepo Brief

## What's in this repo

This root (`fwa/`) holds Francis Web Agency's web presence and internal tooling. FWA is a
**solo web design agency**. Four projects live side by side:

- **`app/`** — the **FWA Ops admin app** (Nuxt 4 SPA, Nuxt UI 4). The internal
  business-management tool: leads, clients, projects, sales, billing, delivery, websites.
- **`server/`** — the **Ops backend** (Node + Express 5 + MySQL) that `app/` *and* `portal/` talk
  to. Hand-rolled REST API, cookie-session auth, Socket.IO realtime, Stripe/PandaDoc/Vapi/DO
  integrations.
- **`portal/`** — the **client portal** (Nuxt 4 SPA, Nuxt UI 4). The external-facing side, for
  FWA's clients. **Built and live** at portal.franciswebagency.com.
- **`website/`** — the **public FWA marketing website** (Nuxt 4 + Directus). Its **own git repo**
  with its **own `CLAUDE.md`** — read that before touching it.

**How they relate:** `app/` + `portal/` + `server/` are the **FWA Ops app** (one product, one API,
two front ends). `website/` is the separate marketing site that *feeds* it — a contact-form
submission on the website POSTs to the server's webhook and becomes an **inbound `website` lead**.
`app/` and `portal/` share a byte-identical Highlighter token layer; `website/` shares the same
brand but is built differently (the apps use Nuxt UI; the website deliberately does not).

> Only `website/` is a separate git repo. `app/`, `server/`, `portal/`, and `deploy/` are tracked
> in this one. **`brand/` is local-only** (gitignored since 2026-09-12, and rewritten out of the
> public history) — the `fwa-design` skill symlinks into it and the deploy rsync ships it, but it
> is never pushed. Back it up separately.

> Working in `website/`? Follow **`website/CLAUDE.md`** (its build rules differ from the app's).
> This root file is the shared context; the sections below are mostly the **Ops app**.

---

## The Ops app (`app/` + `portal/` + `server/`)

### Two-sided — both sides are built

- **Admin app (`app/`)** — the internal side, used only by the owner. Shell, dashboard, leads,
  clients, receptionist, sales, billing, delivery, websites, files, tickets, settings.
- **Client portal (`portal/`)** — the external side, for FWA's clients. Self-service projects,
  invoices (pay in-portal), agreements (sign in-portal), files, support, websites, account.

Both are Nuxt 4 SPAs on Nuxt UI 4 hitting the same Express API, distinguished by
**`users.role` `ENUM('admin','client')`** plus a nullable **`users.client_id`**. See
*Portal & auth* below — the scoping rules there are load-bearing.

### Scope — where the build is now

**Built (schema + API + pages, wired to live data):**

- App shell — sidebar nav + top bar, live notification feed, ⌘K global search
- Dashboard (live KPIs, collected-revenue chart, cross-source "Needs Attention" feed)
- Leads (Inbound / Outreach) + new/edit, with an outreach **touch log**
- Clients list + Client detail (incl. an activity timeline + Calls tab) + new/edit
- AI Receptionist (call inbox; Vapi, caller-aware, with in-call tools)
- **Sales — Proposals** (the SOW lives here, with a public accept link) **+ Contracts**,
  PandaDoc-driven
- **Billing**: Invoices + Payments (Stripe-driven) + **Expenses** (incl. recurring subscriptions)
- **Delivery**: Projects (+ detail), **milestones**, Tasks (+ checklists), project types,
  reusable **project templates**
- **Websites**: cross-client analytics + per-site detail, Plausible **and** GA4 sync, uptime
  (local pinger *or* DigitalOcean managed checks), one-click DO provisioning, hosting-cost vs
  care-plan-MRR margins, infra alerts
- **Files**: the Workspace file library (local disk storage), shareable into the portal
- **Support Tickets**: cross-client list + threaded detail with attachments
- **Settings**: agency identity/branding, billing defaults, notification prefs, project
  templates, integration status, portal access
- **The whole client portal**

**Still deferred (stub route, build when asked):** **Calendar** — and that's the only one. It
falls through to the `[...slug].vue` "isn't built yet" placeholder.

Keep the nav item in place; it's fleshed out later reusing the same components and design system.

### Stack

- **`app/` + `portal/` (frontends):** Nuxt ^4.4 + Vue + Nuxt UI ^4.9, Tailwind v4. Socket.IO
  client for realtime. `app/` srcDir is **`app/app/`**; `portal/` uses the Nuxt 4 default
  **`portal/app/`**. `portal/` is `ssr: false` on purpose — route middleware runs client-side
  after the session resolves from the API's httpOnly cookie.
- **`server/` (backend):** Node + Express 5, hand-rolled REST API. Cookie-session auth
  (bcryptjs). Socket.IO for realtime push (notifications, calls, invoice/task/ticket/file/website
  changes), including **client-scoped rooms** for the portal.
- **Database:** MySQL (via `mysql2`, no ORM — hand-written SQL).
- **Integrations:** Stripe (customers, invoices, payments, Payment Element, webhooks), PandaDoc
  (proposal/contract docs + embedded signing), **ClickUp (the delivery workspace — see *Delivery in
  ClickUp* below)**, Vapi (AI receptionist), Resend (transactional email), Plausible + GA4 (website
  analytics), DigitalOcean (droplets, managed uptime checks, provisioning, hosting costs).
  **Every integration is key-gated and no-ops when unset.**
- No CMS, no ORM — the schema and API are custom.

### Layout

- `server/` — layered: `routes/` (thin, guard-gated) → `services/` (business logic +
  integrations) → `repositories/` (all SQL) → `db/pool.js`. Schema + migrations in `server/src/db/`.
  Background jobs in `server/src/jobs/scheduler.js`. Uploads land in `server/uploads/`.
- `app/` — the admin Nuxt app under `app/app/`.
- `portal/` — the client Nuxt app under `portal/app/`.
- `brand/` — the Highlighter design system (the `fwa-design` skill symlinks here).
- `deploy/`, `docker-compose.yml`, `Dockerfile`s, `.env.production.example` — production
  deployment (see Deployment).
- `docs/screenshots/` — README images only, no prose docs. The rsync deploy excludes `*.png`, so
  they never ship. (Don't confuse this with `website/docs/`, which holds real content docs.)

Keep backend work in `server/`, admin-frontend work in `app/`, client-frontend work in `portal/`.
Respect the server's layering — **SQL belongs in repositories**, not routes or services.

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
- **`lead_touches`** — the outreach touch log (`channel` call/email/sms/meeting/note/other, `body`,
  `occurred_at`). Logging a touch bumps the lead's `last_contacted_at` and can schedule the next
  follow-up in the same call (`/api/leads/:id/touches`).

**2. `clients` — converted parties.** Everything sales/billing/delivery FKs a **client**
(`client_id`). Leads never own those; starting a proposal or project presupposes a client.

- `status` — `active`, `past`, `lost` (relationship state, not a pipeline stage).
- `source` — origin (`website`/`manual`/`call`/`direct`), carried from the lead for reporting.
- Full fields: identity + `logo_url`, billing address, `billing_email`, `client_since`,
  `stripe_customer_id`, `do_project_id` (the client's DigitalOcean resource group), `notes`, `tags`.
- **`client_activity`** — the per-client timeline on the client detail page. Rows are
  pre-rendered for display (`category`, lucide `icon`, `title`, `meta`, `link`, `occurred_at`).
  `logClientActivity()` mirrors `notify()`, is best-effort and **never throws** — a failed
  timeline write must not break the business action that triggered it.

**Conversion (lead → client)** is `POST /api/leads/:id/convert` (body optionally `{ project }`):
**copies** the lead into a new `clients` row (`status = active`, `client_since = today`), provisions
the Stripe customer, moves any linked calls to the client, optionally creates a project, then
**deletes the lead**. A signed project contract also confirms the client won (`markClientWon` →
`status = active`) via the PandaDoc webhook.

**3. `calls` — events, not entities.** Every AI-receptionist (Vapi) call is logged in its own
append-only table. Links via **nullable `lead_id`** *or* **`client_id`** (`ON DELETE SET NULL`).

- Classification: `inquiry`, `client`, `spam`, `wrong_number`, `other`.
- `line` — `main` or `demo` (the marketing site's demo line lands in the same inbox, chipped).
- **Convert to lead** (`POST /api/calls/:id/convert`) creates a `manual` lead (`stage = new`) and
  sets the call's `lead_id`. On a later lead→client conversion the link moves `lead_id` → `client_id`.

### Sales & billing (children of a client)

- **Proposals own the Statement of Work** and are the entry point to everything downstream —
  children of a client, line items optionally snapshotted from the `services` price book (with no
  itemisation the SOW's `project_fee` is the total). A proposal carries the 18 SOW fields, a
  `project_type_id` pinning which contract template it generates from, and a `code` (`PROP-0007`).
- **Contracts** carry a `type` (`project` / `care_plan`) and a `deposit_pct` **snapshotted at
  signature**, so the deposit's amount and its percentage come from one frozen record. On a
  contract `NULL` is legacy and means 50; **`0` is exact and means no deposit** (the column is a
  DECIMAL — read it through `contractDepositPct()`, never with a bare `?? 50`).
  `document_templates` maps a `purpose` to a PandaDoc template.
- **Agreements** is a *view*, not a table — the Contracts page merges proposals + contracts into
  one union query (each row carries a `kind` + `uid`). Keep the merge in the query layer; the
  tables stay separate.
- **Invoices** + **payments** — Stripe-driven, children of a client (invoices carry line items).
  Project billing is a **deposit/balance split**, not milestone invoicing: `kind='deposit'`
  (fee × `deposit_pct`, idempotent, auto-issued on contract signature when `deposit_pct > 0`) and
  `kind='balance'` (fee − deposit, one per project — the whole fee when there was no deposit).
  Invoices are created as a local draft *first* so their id can ride in Stripe metadata and dodge
  the webhook create race.
- **`expenses`** — `category` `client`/`business`/`subscription`, **immutable after creation**.
  Client expenses require a client and can be flagged `billable` for rebilling; subscriptions add
  `billing_interval`, `next_renewal_at`, and `renewal_reminded_on` (the reminder job's idempotency
  gate). Note `project_id` is a **soft link with no FK**. Expenses are *not* connected to hosting
  costs — DO hosting spend is computed live from the API and never written here.
- **`services`** — the price book (website packages, care plans, add-ons).
- **Care plans have no recurring-billing flow yet.** They exist only as `contracts` rows with
  `type='care_plan'`; MRR is derived from them (`careplanMrr`) and the UI only *displays* that.
  Assigning a plan and provisioning recurring Stripe invoicing is unbuilt — the Stripe service
  knows one-off invoices only (no products/prices/subscriptions).

### The sales flow (proposal → contract → deposit → project)

One direction, each step gated on the last. Nothing downstream can be conjured by hand.

```
proposal (SOW)  →  [email optional]  →  accept  →  contract  →  signed
                        │                             │
              (or Mark Accepted after       deposit_pct > 0        deposit_pct = 0
               a yes given on the phone)              │                   │
                                                deposit invoice           │
                                                      │                   │
                                                 deposit PAID             │
                                                      └─────────┬─────────┘
                                       PROJECT created, seeded, ClickUp provisioned
```

- **Sending is optional.** `POST /api/proposals/:id/send` mints a public link and emails it
  (Resend `proposal-sent`), but nothing downstream depends on it — a proposal agreed on a call goes
  straight to Mark Accepted. `accept_source` + `accepted_by` record which it was, because a spoken
  yes is legally a different thing from a click.
- **`proposal_access_tokens`** is a sibling of `portal_invites`, deliberately not a reuse of it
  (that table's `user_id` is NOT NULL and a prospect has no user row). Only the SHA-256 hash is
  stored; the raw token travels in the URL of the emailed link and then in the
  **`X-Proposal-Token` header** — never in a request path, because morgan logs every URL. A read
  never consumes it (mail scanners GET every link in an inbound email); a decision burns it.
  Missing, expired and already-used all return the *same* 404, so nothing is probeable.
- **`services/proposalAcceptance.js` is the only accept/decline path** — the public page, the admin
  button and the PandaDoc webhook all go through it. It claims the status transition *first*
  (`claimProposalStatus`, a conditional UPDATE), then does the expensive work, so N concurrent
  accepts on one link produce exactly one contract.
- **PandaDoc creates documents asynchronously**, and its two send errors are opposites: a document
  still rendering (`document.uploaded`) answers **409**, one already out answers **403
  document-cant-be-sent**. Both send paths go through `sendDocumentWhenReady()`, which waits for
  `document.draft` first and treats already-sent as success — it also re-reads the status after a
  failed send, because PandaDoc can accept the send and still fail the HTTP call, which used to
  strand a contract as `draft` here while it was out for signature there.
- **Paying the deposit is what creates the project** — or, for a **no-deposit** proposal
  (`deposit_pct = 0`), the signature itself is. Both go through `onContractSigned()` in
  `services/contractToProject.js`: it **re-reads the contract and refuses unless it is `signed`**
  (the PandaDoc webhook hands it the pre-update row), then either raises the deposit or calls
  `ensureProjectForContract` directly with `invoice: null`. `invoice.paid` → `ensureProjectForContract`,
  whose idempotency token is `claimContractForProject` — a conditional UPDATE run as the **last**
  statement inside the project-create transaction (it locks the contract row, so claiming first
  would hold that lock across the whole template-seeding loop). Its repair steps run on **every**
  path, not only when the project was just created, or a retry after a mid-flight crash would leave
  a paid project with no ClickUp tree forever.
- Both claims live **outside** any `UPDATABLE` whitelist on purpose: an unconditional SET is an
  overwrite, not a claim, and would expose the field to `PATCH`.
- **`server/src/db/proposal-flow-check.mjs`** walks the whole chain — the deposit leg and the
  no-deposit leg (38 checks, every replay guard, the unsigned-contract refusal, self-cleaning)
  against a real database. Run it with the integration keys blanked.

### Delivery — projects, milestones, tasks

- **A project is delivery work, and it doesn't exist until it's been paid for.** It owns no SOW of
  its own: `projects.repo.js` LEFT JOINs the accepted proposal and exposes the SOW **under the same
  column names**, which is why every consumer (the money card, the balance invoice, time billing,
  the ClickUp date push) reads it untouched. A project created without a proposal is *bare* — it
  has no fee, so it can't raise a balance invoice.
- **`projects.status` is a commercial pipeline, forward-only**:
  `planning → awaiting_signature → awaiting_deposit → in_progress → in_review → awaiting_final →
  completed`, plus out-of-band `on_hold`. `advanceProject()` never moves backward and is driven by
  contract/invoice events, not by hand.
- **`project_milestones` is the client-visible delivery layer, orthogonal to `projects.status`.**
  Both `state` (`upcoming`/`in_progress`/`complete`) and progress are **derived from the child-task
  rollup** (`services/delivery.service.js`) — nobody flips state by hand now that the work lives in
  ClickUp. Setting `state` through the API pins it (`state_manual = 1`) and auto-pilot skips it
  until "Resume Auto"; a milestone with **no** tasks has nothing to derive from and stays manual.
  "Started" means any task off `todo`, so a phase lights up as soon as work begins.
  `tasks.milestone_id` is a **soft link with no FK** — the app nulls it when a milestone is deleted.
- **`project_templates`** (+ `project_template_milestones` / `_tasks`) are named, reusable delivery
  plans managed in Settings. They're applied **inside the project-create transaction**. Resolution:
  an explicit `template_id` wins; explicit `null` seeds nothing; **omitting the field falls back to
  the project type's default template**.
- **`project_types`** is an extensible lookup supplying the project **code prefix** (`WEB-0007`),
  pinning **which contract template** the project generates from, and grouping project templates.
- **`tasks`** own `task_checklist_items` — a flat ordered checklist mirrored from ClickUp. A
  **fully-ticked checklist completes its task**, and un-ticking reopens it, so a task with a
  checklist no longer owns its own status (the UI disables the toggle and says so). A task with
  *no* checklist items is never touched by that rule. Tasks with `project_id = NULL` are standalone
  and are the one kind ClickUp never originates.
- **`milestone_templates` is dead** — superseded by `project_templates`, kept defined only so
  existing DBs don't error. Don't build on it.

### Delivery in ClickUp

Day-to-day delivery work happens in **ClickUp**; Ops stays the system of record for milestones and
the client-facing rollup. The whole feature rests on one existing fact: milestone progress is a SQL
rollup over `tasks.milestone_id`, so keeping `tasks` an accurate mirror makes the milestone bars,
the admin boards and the portal update themselves. **The rollup SQL is untouched.**

**The tree.** A `Clients` space holds one **Folder per client**, with a `Projects` list Ops syncs and
a `Care Plan` list it provisions and deliberately leaves alone. Inside `Projects`:

```
project task            ← projects.clickup_task_id
  milestone task        ← project_milestones.clickup_task_id
    work item           ← tasks.clickup_task_id  (tasks.milestone_id = that milestone)
  work item             ← a direct child of the project task = the "General" bucket
```

Membership is **structural** — the ClickUp parent *is* the milestone link. (An earlier design used a
space-level "Milestone" dropdown; it's gone, because ClickUp can create a custom field via API but
not update one.) Requires the **Nested Subtasks ClickApp** (all plans; ClickUp allows 4 levels, we
use 3). Anything nested under a work item is reported as `tooDeep` and ignored.

**Milestone tasks are named `1. Discovery`, `2. Design`, …** — and that numbering is the *only* way
order survives. ClickUp can't be reordered: `orderindex` is server-assigned from creation time and
the API accepts then silently ignores any attempt to set it (their FAQ: tasks "no longer use the
order_index"), and subtasks can't be dragged inside a task card either. So rank rides in the name,
padded to two digits past nine phases, ranked by array index rather than the `position` value
(positions have gaps — a delete doesn't renumber). A reorder in Ops renames the phases whose rank
moved; anything that slips through is corrected by the sweep's drift check. Don't "tidy" the prefix
away — it's load-bearing, and safe only because milestones are one-way.

**Two directions, three contracts.**

| | direction | mechanism |
|---|---|---|
| Work items | **two-way** | shadow + `clickup_version` CAS; ClickUp wins on conflict |
| Milestone tasks | **one-way**, Ops → ClickUp | no shadow; the sweep re-asserts drift |
| Project task | **one-way**, Ops → ClickUp | SOW fields (read through the proposal) Ops owns |

- **Ops owns milestone existence.** A direct child of a project task is a milestone *only* if Ops
  knows it by stored id; an unrecognized one is adopted as a milestone-less task. **ClickUp can
  never create a phase** — and deleting a milestone task there doesn't delete the phase, it gets
  re-created (its work items are unlinked and re-pushed, losing ClickUp-only comments/attachments).
  Remove a phase in Ops, not in ClickUp.
- **Derived state is pushed down.** `deliveryChanged()` pushes each moved milestone's state onto its
  ClickUp task — the one deliberate service-layer push, safe because milestones have no pull path.
- **Deleting a milestone in Ops re-parents its ClickUp children up to the project task** before
  deleting the milestone task, which lands them in "General" — exactly what Ops just did to them.
- **Echo suppression** is a stored shadow of the last agreed state, held in **Ops** values, so a
  ClickUp edit mapping to the same Ops value is invisible. Pushes send only changed fields, and the
  shadow is set from the API **response**, never from what we meant to send.
- **Deletes have teeth.** Absence from a list read is confirmed individually (a moved or archived
  task looks exactly like a deleted one); a cascade is unlinked rather than deleted; a sweep that
  would delete more than `CLICKUP_MAX_SWEEP_DELETES` (10) aborts; `CLICKUP_ALLOW_REMOTE_DELETES=false`
  turns the path off entirely.
- **Webhook** `POST /api/webhooks/clickup`, HMAC-SHA256 in `X-Signature`. It **acks logic errors with
  200** — ClickUp disables a webhook after sustained non-2xx, and the sweep is the backstop. Register
  it with `npm run clickup:webhook -- register <base-url>`; the signing secret is shown **once**.
- **Layering**: `services/clickup.js` (HTTP) → `clickupMap.js` (pure mapping + the shadow) →
  `clickupProvision.js` (the `ensure*` chain + milestone push) → `clickupSync.js` (the two-way
  engine) → `repositories/clickup.repo.js` (all SQL). Task pushes are fired from the **route** layer,
  never the service, so the pull path can't echo.

### Websites & infrastructure

More than analytics — this is an infra console.

- **`websites`** + **`website_metrics`** (daily traffic) + **`website_checks`** (uptime history) —
  sites FWA builds/maintains, FK a client (+ optional originating project).
- **Analytics: GA4 is additive, not a replacement.** `analytics_provider` is an enum, but only
  `plausible` and `ga4` have sync support, behind a provider registry where each exposes
  `isConfigured()` + `fetchSiteAnalytics()`. Each is independently key-gated.
- **Uptime has two modes.** When a DigitalOcean managed check exists (`do_uptime_check_id`),
  **DO owns the health verdict** (multi-region states collapse to `up`/`degraded`/`down`) and the
  local pinger records latency but stops recomputing health. Disabling hands health back.
- **Provisioning** — one-click DO droplet from a project, filed under the client's DO Project,
  tagged, with **rollback** if the website insert fails so nothing is left billing.
- **Hosting costs** — droplet prices from one account-wide API call, paired against care-plan MRR
  to give per-client cost vs MRR, margin, and margin %.
- **`infra_alerts`** — `site_down`, `high_cpu`, `disk_full`, with a `UNIQUE (subject_type,
  subject_id, kind)` so an alert opens once and stays open until resolved. Feeds "Needs Attention".

### Support, files, settings, search

- **`tickets`** + `ticket_messages` + `ticket_attachments`. Codes are `SR-001`
  (`ticketCode(id)`); the receptionist speaks them as "SR dash 8" because ElevenLabs reads a hyphen
  as "minus". **Three creators:** admin (`opened_by='admin'`), the client portal, and the AI
  receptionist's in-call tools — the last two are `opened_by='client'`, and the receptionist always
  resolves the client **server-side from the caller's number, never from model args**.
- **`files`** — `client_id`/`project_id` both nullable with `ON DELETE SET NULL` (deleting a client
  orphans the row rather than destroying bytes). Bytes go to `POST /api/uploads` first, then
  metadata is recorded — one shared byte store also used by ticket attachments, expense receipts,
  and the agency logo. Filenames are random hex (unguessable, capability-style URLs) and `/uploads`
  is served **publicly by URL** while writes stay auth-gated. Attaching a file to a client shares
  it into the portal and notifies them.
- **`settings`** — a true singleton (`CHECK (id = 1)`, seeded at migrate). Agency identity/branding,
  billing defaults (`invoice_due_days`, `invoice_currency`), and `notification_prefs` JSON.
  It's cached in memory because it's read on hot paths. Two consumers: **notification gating**
  (broadcast admin alerts only — user-targeted ones always land; opt-out semantics, a category
  notifies unless explicitly `false`) and **Stripe invoices** (currency, due days, and the agency
  footer on emails/PDFs).
- **`notifications`** — back the top-bar alert feed, pushed over Socket.IO.
- **Global search** — `GET /api/search` backs the ⌘K palette across clients, projects, invoices,
  expenses, and tickets, returning results already shaped as `{ id, title, subtitle, link }`.

### Portal & auth

- One `users` table, one `sessions` table, one `/api/auth/login` — the portal is not a separate
  auth system. A portal user is **`role='client'` + non-null `client_id`**.
- **`/api/portal/*` is mounted behind `requirePortal`**, which 401s the unauthenticated and **403s
  anyone who isn't a client** (admins included). It attaches `req.clientId`, and **every portal
  query scopes to that, never to a URL param** — foreign ids return 404, not 403, so they aren't
  probeable. Admin routers are mounted behind `requireAdmin`.
- **Invite-only, no self-signup.** Admin hits `POST /api/clients/:id/invite` → upserts a
  `role='client'` user → writes a `portal_invites` row storing **only a SHA-256 token hash** →
  emails a set-password link via Resend. The link is also returned to the admin so it can be
  handed over if Resend is down. `POST /api/clients/:id/portal/revoke` disables the login and kills
  sessions. The invite refuses if the email already belongs to an admin user.
- The portal pays invoices **in-portal** via the Stripe Payment Element (confirming the invoice's
  own PaymentIntent, so `invoice.paid` fires and normal reconciliation runs) and signs agreements
  **in-portal** via an embedded PandaDoc session (recipient comes from the client record, never a
  param).
- Client uploads go through a **separate hardened multer instance** with an extension **and** MIME
  allowlist — no executables, scripts, HTML, or SVG.

### Background jobs (`server/src/jobs/scheduler.js`)

Plain `setInterval`, all `.unref()`'d, each independently gated. Six jobs:

| Job | Gate | Default interval |
|---|---|---|
| Analytics sync (Plausible/GA4 → `website_metrics`) | any analytics key configured | 60m |
| Local uptime checks | `WEBSITE_CHECKS_ENABLED === 'true'` (**off by default**) | 10m |
| DO managed-uptime sync | `DIGITALOCEAN_API_TOKEN` set (independent of the above) | 10m |
| Infra alerts poll | DO token **and** `DIGITALOCEAN_ALERTS_ENABLED !== 'false'` | 10m + at boot |
| Subscription renewal reminders | `EXPENSE_REMINDERS_ENABLED !== 'false'` (**on** by default) | 24h + at boot |
| ClickUp reconcile sweep | `CLICKUP_API_TOKEN` + `CLICKUP_SPACE_ID` set | 15m |

The ClickUp sweep catches webhooks that were never delivered and is the **only pull path in local
dev** (ClickUp can't reach localhost) — force it with `POST /api/clickup/sync` rather than waiting.

## Pages & navigation

Persistent left sidebar (collapsible) + top bar + main content. Nav groups (✓ = built):

- **(top)** Dashboard ✓ · AI Receptionist ✓
- **Clients & Work** — Leads ✓ · Clients ✓ · Projects ✓ · Tasks ✓
- **Sales** — Proposals ✓ · Contracts ✓
- **Billing** — Invoices ✓ · Payments ✓ · Expenses ✓
- **Workspace** — Files ✓ · **Calendar (stub)** · Websites ✓
- **(pinned bottom)** Support Tickets ✓

**Settings is not in the sidebar** — it lives in the AppTopBar account dropdown, and its page is a
section rail driven by a `?section=` query param.

`/p/:token` is the one **unauthenticated** page in the portal (whitelisted in `auth.global.ts`) —
the public proposal, for a prospect who has no account and never will.

Portal nav (`portal/app/layouts/default.vue`): Home · Projects · Invoices · Agreements · Files ·
Support · Websites, with Account / Sign out in a menu.

App chrome (page titles, labels, buttons, chips) is **Title Case**; prose and messages are
sentence case.

## Design workflow (Ops app)

The app's design system is the invocable **`fwa-design` skill** (a symlink →
`brand/`) — use it for any admin-app or portal UI work. It's the single source of truth for color,
type, spacing, radii, icons, and components. Build as Nuxt UI + Tailwind v4 components that defer to
it. Reuse the established shared components (tables, `StatusChip`, forms, `StatCard`, `TrendChart`,
phone/tag inputs, the call-detail component) and match existing patterns.

`app/` and `portal/` share a **byte-identical** `main.css` token layer — a change to one belongs in
both.

> The **marketing `website/` does NOT use Nuxt UI** and has its own tokens/primitives — do not apply
> app patterns there; follow `website/CLAUDE.md`.

## Deployment

Both products co-deploy on one box.

- **Ops app** — Docker stack (`docker-compose.yml`, project `name: fwa-ops`): `mysql` + `api`
  (Express, :4000) + `app` (Nuxt, :3000) + **`portal`** (Nuxt, :3000), plus `api-demo` + `app-demo`
  behind the `demo` profile. Config from `.env.production` (template `.env.production.example`).
- **Marketing website** — deploys from `website/` (its own `docker-compose.yml`, project
  `name: website`), and its **Caddy is the shared front door**. The ops stack attaches to the
  website's Docker network via **`PROXY_NETWORK`** (live value `website_default`). Caddy proxies
  each ops domain — `/api`, `/socket.io`, `/uploads` → `api:4000`, everything else → the matching
  Nuxt service. Vhosts are committed in `website/deploy/Caddyfile`; `deploy/ops.Caddyfile` is
  **superseded** and reference-only.

> **`PROXY_NETWORK` gotcha:** the compose *default* is the stale `fwa-site_default`, but the site
> now deploys as project `website`, so the real network is `website_default`. Production must set
> `PROXY_NETWORK` explicitly — don't rely on the default, and don't flip it without checking the
> live box first.

> **`PORTAL_DOMAIN` is required.** It has no compose default and feeds `CORS_ORIGIN`,
> `PORTAL_BASE_URL` (portal invite links), and the portal's `NUXT_PUBLIC_API_BASE`. Left unset it
> expands empty and silently breaks portal CORS and set-password links.

`.env.production` groups: domains (`OPS_DOMAIN`, `PORTAL_DOMAIN`, `DEMO_DOMAIN`), `DB_ROOT_PASSWORD`,
Stripe (secret/webhook/publishable), PandaDoc (key, webhook key, role names),
`CONTACT_FORM_WEBHOOK_SECRET` (the marketing site's contact form), **ClickUp
(`CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID`, `CLICKUP_SPACE_ID`, `CLICKUP_WEBHOOK_SECRET`, plus the
`CLICKUP_ALLOW_REMOTE_DELETES` / `CLICKUP_MAX_SWEEP_DELETES` safety pair)**, Resend, Plausible, GA4
(`GA4_CLIENT_EMAIL` / `GA4_PRIVATE_KEY_BASE64`), DigitalOcean, Vapi, the demo user vars, and the
job toggles (`WEBSITE_CHECKS_ENABLED`, `EXPENSE_REMINDERS_ENABLED`, `DIGITALOCEAN_ALERTS_ENABLED`).

### How to redeploy (ops app)

- **Server:** DigitalOcean droplet (hostname `FWA`, IntelliJ alias `fwa-droplet`), reached as
  `$DEPLOY_USER@$DEPLOY_HOST`. **Both live in `.env.deploy`** — untracked, local-only, covered by the
  `.env.*` ignore rule and by the rsync `--exclude='.env*'` below, so it never lands in the repo or
  on the server. Public URL `https://app.franciswebagency.com` (`OPS_DOMAIN`).
- **The box is not a git checkout.** The ops app lives at `/opt/fwa-ops`, populated by
  **uploading the local working tree** (not `git pull` — this repo isn't pushed). Ops app is
  `/opt/fwa-ops`; marketing site is `/opt/fwa-site`.
- **`/opt/fwa-ops/.env.production` is server-only** (owned by `deploy`, mode 600) — never overwrite
  it during a sync.
- **Schema changes are not automatic** — after a rebuild, run
  `docker compose exec api npm run migrate`.
- **The box is hardened (14 Aug 2026)** — deploys run as the non-root **`deploy`** user, not root:
  - SSH is key-only and `AllowUsers deploy`; **root login over SSH is off**. Adding a second user
    means adding it to `AllowUsers` in `/etc/ssh/sshd_config.d/10-hardening.conf` — and that file's
    `10-` prefix is load-bearing (sshd takes the *first* value it obtains for a keyword, and
    `sshd_config` Includes the dir at the top, so a `99-` file would lose to `50-cloud-init.conf`).
  - A DO cloud firewall fronts the box: SSH is source-restricted, 80/443 open, outbound wide open
    (the UDP rule is what keeps DNS working). **Deploying from a new network needs the SSH rule
    updated first** — see the DO dashboard. Recovery if that goes wrong is out-of-band, documented
    outside this repo.
  - `deploy` is in the `docker` group, so the rebuild below needs no `sudo`.
- **Redeploy = rsync the tree up, then rebuild the stack.** Always rsync from the **absolute** repo
  path — a relative `./` after a `cd` has previously uploaded `server/` to the remote root:

  ```bash
  source /Users/kasanfrancis/Projects/fwa/.env.deploy   # sets DEPLOY_USER and DEPLOY_HOST

  rsync -az --itemize-changes \
    --exclude='.git' --exclude='node_modules' --exclude='.nuxt' --exclude='.output' \
    --exclude='dist' --exclude='.env.production' --exclude='.env*' --exclude='.DS_Store' \
    --exclude='.playwright-mcp' --exclude='website' --exclude='*.png' --exclude='uploads' \
    --exclude='.idea' --exclude='.claude' --exclude='.junie' \
    /Users/kasanfrancis/Projects/fwa/ "$DEPLOY_USER@$DEPLOY_HOST":/opt/fwa-ops/

  ssh "$DEPLOY_USER@$DEPLOY_HOST" 'cd /opt/fwa-ops && docker compose --env-file .env.production up -d --build'
  ```

  Exclude `website/` — it deploys separately to `/opt/fwa-site`. Verify with
  `docker ps --filter name=fwa-ops`, `docker logs fwa-ops-api-1 --tail 15`, and
  `curl -I https://app.franciswebagency.com/` (plus `https://portal.franciswebagency.com/`).

> **rsync never deletes.** A file removed locally lingers on the box and can shadow the new
> version — delete it by hand when a route or component disappears.

> **New api env vars need TWO edits:** `.env.production` *and* an `environment:` mapping in
> `docker-compose.yml`. The compose file lists env vars explicitly; `.env.production` keys are not
> auto-injected, and forgetting the mapping yields a confusing 503.

### The public demo (`demo.franciswebagency.com`)

A prospect-facing copy of the admin app, added 15 Aug 2026. Same two images as the real app,
behind the **`demo` compose profile** (`api-demo` + `app-demo`) — so the normal redeploy command
above never starts, stops, or rebuilds it.

- **Data:** a separate `fwa_ops_demo` schema **inside the same `mysql` container** (the box is a
  2 GB droplet; a second mysqld is the one thing not duplicated). Own `demo_uploads` volume.
- **Safety:** every integration key is deliberately left unset on `api-demo`, so each one no-ops —
  no Stripe customer, PandaDoc document, Resend email, or Vapi call can escape the demo. The
  background jobs (uptime checks, expense reminders, DO alerts) are off too, so the data doesn't
  drift from the seed.
- **Auto-login:** `DEMO_MODE=true` is the *only* place `POST /api/auth/demo-login` exists (it 404s
  everywhere else). The app's startup plugin calls it when `NUXT_PUBLIC_DEMO_MODE=true`, so a
  visitor lands on the dashboard as the demo account; `/login` offers the same door as a button.
- **Nightly reset:** `deploy/demo-reset.sh` (cron, 04:10 UTC, `deploy` user) drops and recreates
  the schema, migrates, seeds, and recreates the demo account with a fresh random password.
- **Front door:** the `demo.` vhost lives in `website/deploy/Caddyfile` with the others — and it's
  `noindex`, so the demo never competes with the marketing site in search. **Changing it means
  redeploying `website/`, not the ops stack.**

> **Caddyfile gotcha:** it's bind-mounted as a *file*, so an rsync (which writes a temp file and
> renames) leaves the container pinned to the old inode — `caddy reload` then cheerfully reports
> "config is unchanged". After syncing the Caddyfile you must `docker restart website-caddy-1`
> (~1s blip on every vhost). Validate before restarting:
> `docker compose --env-file .env.production exec -T caddy caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile`.
> Then verify **all** vhosts: franciswebagency.com, app., portal., demo.

Bring it up (or rebuild it after a sync) — **name the two services**, or enabling the profile
sweeps the real `api`/`app` into the same rebuild-and-recreate:

```bash
ssh "$DEPLOY_USER@$DEPLOY_HOST" \
  'cd /opt/fwa-ops && docker compose --env-file .env.production --profile demo up -d --build api-demo app-demo'
```

`.env.production` is server-only (the rsync excludes `.env*`), so `DEMO_DOMAIN`, `DEMO_USER_EMAIL`,
and `DEMO_USER_NAME` have to be added there by hand — see `.env.production.example`.

Reset it by hand at any time: `ssh … '/opt/fwa-ops/deploy/demo-reset.sh'`.

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
- It also owns the **shared Caddyfile** (`website/deploy/Caddyfile`), so any front-door change is a
  `website/` deploy, not an ops one.

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
- **Keep the sales flow's direction: proposal → contract → deposit → project.** The proposal owns
  the SOW; accepting it generates the contract; signing raises the deposit; **paying the deposit is
  what creates the project** — except at `deposit_pct = 0`, where the signature is, via
  `onContractSigned` (the only path that may birth a project without a payment, and it re-checks
  `status = 'signed'` itself). Never re-add SOW editing to `ProjectForm` or to `projects`'
  `UPDATABLE` — the read path prefers the proposal, so such a save appears to work and changes
  nothing. Never create a project from an unsigned contract, or from an unpaid contract that
  carries a deposit.
- **Keep `projects.status` (commercial, forward-only, event-driven) separate from
  `project_milestones` (client-visible delivery, task-derived).** They are deliberately orthogonal.
- **ClickUp: work items are two-way, milestones and the project task are one-way.** Ops owns
  milestone existence — ClickUp can never create a phase, and an unrecognized direct child of a
  project task is adopted as a milestone-less task, never as a milestone.
- **A milestone task must never be mirrored into `tasks`.** Every progress bar in both apps is
  `task_done / task_total`, so one phantom row per milestone silently skews all of them. The guard
  lives at the top of `applyRemoteTask`, which is the only path to the three writes that could do it.
- **Never destroy Ops work on a remote absence.** A task missing from a ClickUp read is confirmed
  individually first, and a cascade (its milestone task was deleted) unlinks rather than deletes.
- **Every portal query scopes to `req.clientId`, never to a URL param.** Foreign ids 404 rather
  than 403. Never trust a client-supplied id, and never trust the Vapi model's args for identity —
  resolve the client server-side from the caller's number.
- **Stripe webhooks: drop anything from the other livemode, and never trust `fwa_invoice_id`
  metadata on its own.** Endpoints are registered per mode, so a test-mode endpoint aimed at the
  production URL feeds test events into live data — and the metadata hint (which exists to close
  the invoice create race) would resolve a test id to a same-numbered *live* invoice and mark the
  wrong client's invoice paid. The livemode check sits right after signature verification;
  `localInvoiceFor()` only trusts the hint when that row is unlinked or already linked to this
  Stripe invoice.
- Respect the server layering: all SQL lives in repositories.
- Defer app visual styling to the `fwa-design` skill; keep app work in `app/`, portal work in
  `portal/`, backend in `server/`. The two apps' token layers stay identical.
- For the marketing site, work in `website/` and follow `website/CLAUDE.md` — no Nuxt UI there.
