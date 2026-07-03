# FWA Ops App — Project Brief

## What this is

This is the business-management app for Francis Web Agency (FWA), a solo web design agency. It runs the whole business in one place — leads, clients, projects, sales, billing, and delivery. It's a fully custom build with no CMS layer.

The app is **two-sided**:

- **Admin app** — the internal side, used only by me. This is the entire current build target (see Scope). Everything described in this doc — the shell, dashboard, leads, clients, receptionist, and all the deferred internal pages — is the admin side.
- **Client portal** — an external-facing side for FWA's clients, **deferred to a later phase**. It introduces non-admin users, so it isn't a single-user tool overall even though the admin side is.

Because a second user type is coming, keep the auth model and routing ready for an **admin vs. client account-type distinction** and a **separate portal route area** — but don't build any portal functionality until that phase. The login screen built so far is the **admin** login.

Note: this is **not** the FWA marketing website (that's a separate Nuxt 4 + Directus project). This repo is the internal ops tool only.

## Scope — build this now

Only a subset of the app has been designed so far, and that subset is the entire build target for this phase. Those pages were prototyped in Claude Design; Claude Design is **not** used going forward (it's too token-heavy), so everything from here is built directly in Claude Code.

**In scope now (designed, ready to build):**

- App shell — sidebar nav + top bar
- Dashboard
- Clients list + Client detail
- Leads (Inbound / Outreach)
- AI Receptionist (call inbox)

**Deferred (built later, directly in Claude Code):** Projects, Tasks, Proposals, Contracts, Invoices, Payments, Files, Calendar, Websites, Support Tickets, Settings.

**Deferred to a later phase entirely:** the **client portal** (the external-facing side — see What this is). Not part of this admin-app build.

The nav shell is designed with the full structure, so keep all groups and items in place — the deferred destinations are placeholder/stub routes for now and get fleshed out later, following the same design system. Don't build the deferred pages this phase unless I ask.

## Stack

- **Frontend:** Nuxt + Vue + Nuxt UI, styled with Tailwind v4.
- **Backend:** Node + Express, hand-rolled REST API.
- **Database:** MySQL.
- No CMS, no ORM assumptions — the schema and API are custom.

## Repo layout

This file lives at the repo root. Two top-level folders sit beside it:

- `server/` — the backend: Node + Express API, MySQL access, and schema/migrations.
- `frontend/` — the frontend: the Nuxt + Vue + Nuxt UI app.

Keep backend work in `server/` and frontend work in `frontend/`. This root file is the shared context for both halves.

## Core data model (read this before touching anything data-related)

Two facts drive the whole app. Get these right and the rest follows.

**1. One `contacts` table backs both Leads and Clients.** A lead and a client are the *same record* at different points in a lifecycle — not separate tables. Conversion is a **stage change on one row**, never a copy or migration between tables. All the related records (calls, notes, proposals, projects, invoices) hang off that one contact and must never be re-pointed just because a lead became a client.

- `source` — how the contact entered: `website`, `call`, `manual` (optionally `referral`). This drives the two sections of the Leads page: `website` + `call` = **Inbound**, `manual` = **Outreach**.
- `stage` — the lifecycle. Unified enum across both motions:
  - Inbound early stages: `new` → `qualifying`
  - Outreach early stages: `to_contact` → `contacted` → `engaged`
  - Both converge: `qualified` → `proposal`
  - Client stages: `active` (proposal won) → `past`; plus `lost` for dead/declined
- **Leads page** = the view where `stage` is pre-client. **Clients page** = the view where `stage` is `active` or `past`. Same table, two filters.
- **Proposal sent ≠ client.** `stage = proposal` means a proposal is out. The contact only becomes a client (`stage = active`) when the proposal is **won**. Those are two distinct transitions; keep them separate so "outstanding proposals" and "won" are both answerable.
- **Proposals** are their own records, children of a contact (a contact can have more than one over time).

**2. Calls are events, not entities — they live in a separate `calls` table.** Every call the AI receptionist handles is logged here regardless of outcome. A call links to a contact via a **nullable `contact_id`**, set only when a call becomes (or belongs to) a contact.

- The receptionist (Vapi) classifies each call: `inquiry`, `client`, `spam`, `wrong_number`, `other`.
- Only `inquiry` (and existing-`client`) calls get a `contact_id`. Everything else stays an unlinked call record.
- A call record holds: caller number, caller name (if captured), classification, summary, transcript, recording URL, duration, timestamp, and any structured fields the receptionist extracted.
- **Convert to lead** (from the receptionist page) creates a `contacts` row with `source = call`, `stage = new`, and sets the call's `contact_id`. It appears in Leads → Inbound.

The reason for the asymmetry: conflating leads and clients into two tables causes duplication and broken history, so they're unified. Conflating a call (a raw event) with a contact (an entity) causes noise and duplicate contacts, so those are split. Same principle — model the thing at the right grain — applied in opposite directions.

## Pages & navigation

Persistent left sidebar (collapsible to an icon rail) + top bar + main content area. Nav groups (✓ = in scope this phase, per Scope above; unmarked = deferred stub route):

- **(top)** Dashboard ✓
- **Clients & Work** — Leads ✓ · Clients ✓ · Projects · Tasks
- **Sales** — Proposals · Contracts
- **Billing** — Invoices · Payments
- **Workspace** — Files · Calendar · Websites · AI Receptionist ✓
- **(pinned bottom)** Support Tickets · Settings

Page-specific notes (in-scope pages):

- **Leads** — two sections (Inbound / Outreach) over the `contacts` table, split by `source`. Inbound rows surface the inquiry (form message or call summary, with the call peek-able); Outreach rows surface a follow-up cadence with overdue touches highlighted.
- **Clients** — the `contacts` view where stage is `active`/`past`. Row click → client detail (Overview, Projects, Websites, Invoices, Contracts, Files, Support, Activity tabs).
- **AI Receptionist** — an inbox (master-detail) over the `calls` table: call list + detail pane with recording player, summary, captured details, and transcript. Inquiry calls can convert to leads.

## Design workflow

The in-scope pages were prototyped in **Claude Design**, which defers entirely to an established design system (the single source of truth for color, type, spacing, radii, icons, and components). Convert those prototypes into real Nuxt UI + Tailwind v4 components faithfully — don't invent new visual styles.

Claude Design is not part of the loop going forward (too token-heavy). Once the in-scope pages are converted, **their components and tokens become the design system in this repo** — the reference every later page follows. The deferred pages, when their time comes, are built directly here in Claude Code, reusing those components and matching the established patterns so the app stays visually consistent without another design pass. Build shared components (tables, badges/chips, segmented controls, drawers, the call-detail component used by both Leads and the Receptionist page) once and reuse them.

## Current phase & build order

Schema-first approach: MySQL schema → Express API → Nuxt UI. Design work for the in-scope pages is done, so the order for this phase is:

1. **MySQL schema for `contacts` and `calls`** — stage/source/classification enums, the nullable `contact_id` FK, and indexes tuned for the Leads and Clients views. This underpins Leads, Clients, and the Receptionist page, so it comes first.
2. **Express routes** backing those views.
3. **Convert and wire the in-scope pages** — shell/dashboard, clients list + detail, leads, receptionist — into Nuxt UI + Tailwind v4.

Steps 1–2 live in `server/`; step 3 lives in `frontend/`.

Deferred pages come in a later phase, built directly in Claude Code. **Before writing code, check the actual state of the repo** — it may not be scaffolded yet.

## Guardrails

- Never split leads and clients into separate tables, and never copy a record to "convert" it — conversion is a `stage` update.
- Never auto-create a contact from a raw call; only `inquiry`/`client` calls link, and lead creation is an explicit action.
- Keep `calls` as an append-only event log; the receptionist logs every call, linked or not.
- Defer all visual styling to the existing design system.
