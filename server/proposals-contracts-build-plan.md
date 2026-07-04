# Proposals & Contracts — Build Plan

The sales-paperwork layer of the FWA Ops App: how a lead becomes a signed
engagement. Sits between the `contacts` layer (already built) and the
`projects` layer (next). Fully integrated with **PandaDoc** for document
generation, sending, e-signature, and status tracking.

All six tables below are **new additions to the existing FWA Ops database** —
the one that already holds `contacts`, `calls`, etc. No existing tables are
modified; these are created alongside them and reference `contacts` by foreign
key.

Companion file: `proposals_contracts_schema.sql` (the MySQL DDL). This document
explains the *why* and the *flow*; the SQL is the source of truth for columns.

---

## Locked decisions

These four calls drive the whole design — treat them as settled.

1. **Separate `proposals` and `contracts` tables.** They're merged into a
   single list at the query layer — on the top-level **Agreements** page and its
   per-client filtered view — not at the schema layer.
2. **Model B — proposal and contract are two documents.** Accepting a proposal
   *triggers* generation of a separate contract document; it does not double as
   the contract. `contracts.proposal_id` links back to the origin (NULL for
   standalone contracts).
3. **Line items are snapshotted, and one-off lines are allowed.** `services`
   holds current pricing; the line-item tables freeze name/price/qty at
   build time. `service_id` nullable = catalog line (set) vs custom one-off
   (NULL).
4. **The contact stage stays coarse.** It answers only "lead vs client." All
   granular paperwork state lives on the proposal/contract `status` fields.
   **A signed contract of `type='project'` is the project-creation trigger** —
   not proposal acceptance.

---

## The workflow

### 1. Proposal (contact must already exist)

A proposal can only be created for an existing contact. From the catalog the
user picks a website package plus any add-ons (or adds one-off custom lines).
The backend then:

- Snapshots each selected service into `proposal_line_items`
  (name / price / qty / billing_interval frozen).
- Computes and stores `proposals.total`.
- Creates a PandaDoc document from the **proposal template**, passing the
  contact as recipient, contact details as **tokens**, and the line items as
  the **pricing table**, and stamps internal IDs into PandaDoc **metadata**.
- Stores the returned `pandadoc_document_id` on the proposal row.
- Once the document reaches `document.draft`, sends it. Status → `sent`.

The contact's stage moves to `proposal` (existing stage machine) when the
proposal goes out.

### 2. Acceptance → contract generation (Model B)

The client views and accepts the proposal. PandaDoc fires
`document.completed`; the webhook maps it to `accepted`, stamps `accepted_at`,
and then **generates the contract**:

- Creates a `contracts` row with `type='project'`, `proposal_id` set,
  `billing_interval` and `start_date` populated as needed.
- Copies `proposal_line_items` → `contract_line_items` as a **fresh snapshot**
  (`INSERT ... SELECT`) — so a price edit in the gap between acceptance and
  signature can't change what the contract carries.
- Creates a PandaDoc document from the **contract template**, sends it for
  signature. Status → `sent`.

The contact stage does **not** change here — it's still `proposal`-era coarse
state; the detail is on the rows.

### 3. Contract signed → project trigger

The client signs the contract. PandaDoc fires `document.completed`; the webhook
maps it to `signed`, stamps `signed_at`, and **branches on `contracts.type`**:

- `type='project'` → flip the contact to **`active` (won)** and **create the
  project** (handoff to the projects flow).
- `type='care_plan'` → run the separate care-plan flow (below); no project.

**Signed project contract = the "won" event.** This is the single, unambiguous
trigger the projects layer keys off.

### 4. Standalone contract (Care Plan) — its own flow

Some contracts have no proposal. The Website Care Plan is created directly for a
contact (a client), from the care-plan service (recurring, `monthly`):

- `contracts` row with `type='care_plan'`, `proposal_id = NULL`,
  `billing_interval='monthly'`, `start_date` set.
- Line items built fresh into `contract_line_items` (the care-plan service).
- PandaDoc document from the **care-plan template**, sent, signed.
- On signed, the `care_plan` branch fires its **own separate trigger/flow**
  (recurring billing / care engagement — designed later), not project creation.

---

## Tables to create

Create these six **new** tables in the existing database (the DDL is in
`proposals_contracts_schema.sql` — run that to create them). The existing
`contacts`, `calls`, and other tables are left untouched; the new tables
reference `contacts(id)` by foreign key. Roles and key columns:

**`services`** — the price book / catalog and source of truth for pricing.
`category` (`website_package` | `care_plan` | `addon`), fixed `price`,
`billing_interval` (`one_time` | `monthly`), `is_active`, `sort_order`.
Optional `pandadoc_sku` to reconcile with PandaDoc's Catalog.

**`proposals`** — child of `contacts`; one row ↔ one PandaDoc document.
`status` (`draft`→`sent`→`viewed`→`accepted`/`declined`/`expired`/`voided`),
`total`, PandaDoc sync columns (`pandadoc_document_id` unique,
`pandadoc_template_id`, `pandadoc_status`, `last_webhook_at`), and lifecycle
timestamps (`sent_at`, `viewed_at`, `accepted_at`, `declined_at`, `expires_at`).

**`proposal_line_items`** — frozen snapshot of the quote. Nullable `service_id`
(catalog vs one-off), `*_snapshot` columns, `qty`, generated `line_total`,
`sort_order`. Cascades on proposal delete; `SET NULL` on service delete.

**`contracts`** — child of `contacts`; optional `proposal_id` back to origin.
**`type`** (`project` | `care_plan`) — the discriminator the signed-webhook
branches on. `status` ends at `signed` (not `accepted`). `billing_interval`,
`start_date`, same PandaDoc sync columns and lifecycle timestamps (with
`signed_at`).

**`contract_line_items`** — same shape as `proposal_line_items`; populated by
re-snapshotting from the proposal (or built fresh for standalone contracts).

**`document_templates`** — maps a PandaDoc `template_uuid` to a `purpose`
(`proposal` | `project_contract` | `care_plan`) with `is_active`, so templates
can change without a redeploy.

> **Reconcile before running:** the FKs assume `contacts.id` is
> `BIGINT UNSIGNED`. If your contacts PK differs, change the `contact_id`
> columns to match.

---

## PandaDoc integration mechanics

**Create from template.** POST the `template_uuid` with `recipients` (the
contact), `tokens` (merge variables — client name, company, address, dates,
total), and pricing-table `items` (the snapshotted line items). The template
needs a pricing-table block with **data-merge enabled** so the backend can
inject line items — this is the "backend populates prices" path.

**Creation is async.** The document lands in `document.uploaded`, then
`document.draft` when ready. Only after `document.draft` can you POST
`/documents/{id}/send`. Store `pandadoc_document_id` as soon as it's returned;
don't assume the doc is immediately sendable.

**Metadata stamping.** At creation, write internal IDs into PandaDoc `metadata`
(`contact_id`, record id, `type`). The webhook can then resolve a document back
to its row from metadata as a backup to the stored `pandadoc_document_id`, and
it identifies the record type without a lookup.

**Webhook-driven sync.** One endpoint subscribed to `document_state_changed`.
Verify the signature. Make the handler **idempotent** — PandaDoc retries and can
deliver the same event more than once. Respond `200` within 20 seconds.

**Status mapping (raw → internal):**

| PandaDoc raw        | proposals  | contracts |
| ------------------- | ---------- | --------- |
| `document.sent`     | `sent`     | `sent`    |
| `document.viewed`   | `viewed`   | `viewed`  |
| `document.completed`| `accepted` | `signed`  |
| `document.declined` | `declined` | `declined`|
| `document.expired`  | `expired`  | `expired` |

Store the raw value in `pandadoc_status` alongside the mapped internal `status`.

---

## What to build next (Express, server/)

In priority order:

1. **PandaDoc webhook handler** — the spine of the whole flow. Verify signature
   → map status idempotently → on proposal `accepted`, generate the contract
   from `proposal_line_items` → on contract `signed` + `type='project'`, flip
   the contact to `active` and fire the project trigger.
2. **Create-proposal route** — snapshot line items, compute total, build the
   PandaDoc pricing-table + tokens payload, create + send, persist the doc id.
3. **Services CRUD** — manage the price book.
4. **Read routes** — proposals/contracts lists and detail, plus the merged
   **Agreements** page query (all clients) and its per-client filtered view.
5. **Standalone care-plan contract route** — create/send a `care_plan` contract
   directly for a client.

Build order overall stays schema-first: schema (done) → these routes → the Nuxt
UI that wires into them.
