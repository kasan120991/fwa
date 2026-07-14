-- =====================================================================
-- FWA Ops — core schema
-- Three tables drive the app (see CLAUDE.md "Core data model"):
--   leads    — top-of-funnel only: website contact-form + manual outreach.
--              A lead holds no sales artifacts. Converting a lead COPIES it
--              into a new `clients` row and DELETES the lead.
--   clients  — converted parties. Everything sales/billing/delivery
--              (proposals, contracts, projects, invoices, payments) FKs a
--              client. Leads never own those.
--   calls    — append-only receptionist call log; links to a lead OR a
--              client via NULLABLE lead_id / client_id (set when relevant).
-- Run with `npm run migrate` (creates the database if absent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- leads — top-of-funnel pipeline. source website = Inbound (contact form),
--   source manual = Outreach. No billing/address/stripe — those are client
--   concerns. A lead is converted (copied to `clients`, then deleted) once
--   real work starts; it is never itself the parent of a proposal/project.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- How the lead entered: website (contact form) = Inbound, manual = Outreach.
  source             ENUM('website', 'manual') NOT NULL,

  -- Lead lifecycle (pre-client only):
  --   Inbound:  new -> qualifying -> qualified
  --   Outreach: to_contact -> contacted -> engaged -> qualified
  --   lost = dead/declined. There is no 'proposal'/'active'/'past' here —
  --   converting to a client leaves this table.
  stage              ENUM('new', 'qualifying', 'to_contact', 'contacted',
                          'engaged', 'qualified', 'lost') NOT NULL DEFAULT 'new',

  -- `name` = primary contact person; `company` = the business.
  name               VARCHAR(160) NOT NULL,
  email              VARCHAR(254) NULL,
  phone              VARCHAR(32)  NULL,
  company            VARCHAR(160) NULL,
  title              VARCHAR(120) NULL,   -- contact's role, e.g. "Marketing Director"
  website            VARCHAR(255) NULL,   -- site/domain, e.g. "northwind.com"

  -- Inbound inquiry text (website form message); call inquiries surface via `calls`.
  message            TEXT NULL,

  -- Freeform internal notes.
  notes              TEXT NULL,

  -- Tags — JSON array of strings (e.g. ["E-commerce","Priority"]).
  tags               JSON NULL,

  -- Outreach follow-up cadence. next_action_at in the past = overdue touch.
  last_contacted_at  DATETIME NULL,
  next_action_at     DATETIME NULL,

  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_leads_stage (stage),
  -- Inbound/Outreach are (source) + (stage) filters.
  KEY idx_leads_source_stage (source, stage),
  -- Outreach cadence: surface overdue/upcoming touches cheaply.
  KEY idx_leads_next_action (next_action_at),
  KEY idx_leads_email (email),
  KEY idx_leads_phone (phone)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- lead_touches — the outreach touch log for a lead (call/email/etc.). A
--   lead-phase concern only: CASCADE-deleted when the lead converts (and is
--   deleted) or is removed. Logging a touch also bumps leads.last_contacted_at.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_touches (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id      BIGINT UNSIGNED NOT NULL,
  channel      ENUM('call', 'email', 'sms', 'meeting', 'note', 'other') NOT NULL DEFAULT 'note',
  body         TEXT NULL,                 -- what happened
  occurred_at  DATETIME NOT NULL,         -- when the touch happened
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_lead_touches_lead (lead_id, occurred_at),
  CONSTRAINT fk_lead_touches_lead FOREIGN KEY (lead_id)
    REFERENCES leads (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- clients — converted parties. Created by copying a lead on conversion
--   (or directly). Owns all sales/billing artifacts via client_id FKs.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Client relationship status. active = current; past = former; lost =
  -- converted but the deal fell through.
  status             ENUM('active', 'past', 'lost') NOT NULL DEFAULT 'active',

  -- How the client originally entered (carried from the lead, for reporting).
  source             ENUM('website', 'manual', 'call', 'direct') NOT NULL DEFAULT 'direct',

  -- `name` = primary contact person; `company` = the business.
  name               VARCHAR(160) NOT NULL,
  email              VARCHAR(254) NULL,
  phone              VARCHAR(32)  NULL,
  company            VARCHAR(160) NULL,
  title              VARCHAR(120) NULL,
  website            VARCHAR(255) NULL,

  -- Client logo — a data: URL (small uploaded image) or external image URL.
  logo_url           MEDIUMTEXT NULL,

  -- Freeform internal notes (client detail notes box).
  notes              TEXT NULL,

  -- Tags — JSON array of strings (e.g. ["Retainer","E-commerce"]).
  tags               JSON NULL,

  -- Billing address (structured, for invoicing).
  address_line1      VARCHAR(255) NULL,
  address_line2      VARCHAR(255) NULL,
  city               VARCHAR(120) NULL,
  region             VARCHAR(120) NULL,   -- state / province
  postal_code        VARCHAR(20)  NULL,
  country            VARCHAR(120) NULL,

  -- Billing email (invoices). Falls back to the client email when blank.
  billing_email      VARCHAR(254) NULL,

  -- Date the party became a client (conversion date).
  client_since       DATE NULL,

  -- Stripe customer id (cus_…), created when the client is provisioned.
  stripe_customer_id VARCHAR(255) NULL,

  -- DigitalOcean Project (resource group) for this client's hosting; set on first provision.
  do_project_id      VARCHAR(36) NULL,

  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_clients_status (status),
  KEY idx_clients_email (email),
  KEY idx_clients_phone (phone),
  -- Reverse lookup from a Stripe customer (webhook handling).
  KEY idx_clients_stripe (stripe_customer_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- calls — every receptionist (Vapi) call, linked or not. Append-only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calls (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Set only when a call belongs to a lead or a client. An inquiry call
  -- converted to a lead sets lead_id; an existing-client call sets client_id;
  -- on conversion the link is moved lead_id -> client_id. Everything else
  -- (spam, wrong_number, other) stays unlinked.
  lead_id            BIGINT UNSIGNED NULL,
  client_id          BIGINT UNSIGNED NULL,

  -- Vapi's call id — dedupes retried end-of-call-report webhooks. NULL for
  -- seeded/manual rows (MySQL allows multiple NULLs under a UNIQUE key).
  vapi_call_id       VARCHAR(64) NULL,

  classification     ENUM('inquiry', 'client', 'spam', 'wrong_number', 'other') NOT NULL,

  caller_number      VARCHAR(32)  NOT NULL,
  caller_name        VARCHAR(160) NULL,
  summary            TEXT NULL,
  transcript         MEDIUMTEXT NULL,
  recording_url      VARCHAR(1024) NULL,
  duration_seconds   INT UNSIGNED NULL,

  -- Structured fields the receptionist extracted (intent, budget, business, etc.).
  extracted          JSON NULL,

  -- Set when the call has been reviewed in the inbox (NULL = unread).
  reviewed_at        DATETIME NULL,

  occurred_at        DATETIME NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_calls_lead (lead_id),
  KEY idx_calls_client (client_id),
  KEY idx_calls_classification (classification),
  -- Receptionist inbox is ordered by recency.
  KEY idx_calls_occurred_at (occurred_at),
  -- Idempotent Vapi ingestion — one call row per Vapi call id.
  UNIQUE KEY uq_calls_vapi (vapi_call_id),

  -- Deleting a lead/client must NOT delete its call history — keep the event log.
  CONSTRAINT fk_calls_lead FOREIGN KEY (lead_id)
    REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_calls_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users — app login accounts. Two-sided by design (see CLAUDE.md):
--   role = 'admin'  -> internal ops app
--   role = 'client' -> external client portal; client_id links to the
--                      clients row whose data that portal login may see.
--   client_id is NULL for admins, set for portal users (invite flow).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(254) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  avatar_url     MEDIUMTEXT NULL,                -- profile photo (data: or /uploads URL)
  role           ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  client_id      BIGINT UNSIGNED NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at  DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_client (client_id),
  CONSTRAINT fk_users_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- sessions — server-side login sessions (httpOnly cookie holds the raw
-- token; only its SHA-256 hash is stored here, so a DB leak can't be
-- replayed). Deleting a row = revoking that session.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  user_agent     VARCHAR(255) NULL,
  ip             VARCHAR(45) NULL,
  expires_at     DATETIME NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),

  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- portal_invites — one-time tokens for the client-portal set-password
-- flow (and reusable for password reset). Mirrors sessions: the emailed
-- link carries the raw token; only its SHA-256 hash is stored. A row is
-- spent when used_at is set.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_invites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_invites_token (token_hash),
  KEY idx_portal_invites_user (user_id),
  CONSTRAINT fk_portal_invites_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- settings — a single app-wide config row (id is pinned to 1). Holds the
-- agency's own identity (used on invoices/proposals), billing defaults,
-- and admin notification preferences. There is one FWA; one row.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  agency_legal_name    VARCHAR(200) NULL,
  agency_display_name  VARCHAR(160) NULL,
  agency_support_email VARCHAR(254) NULL,
  agency_phone         VARCHAR(40)  NULL,
  agency_logo_url      MEDIUMTEXT   NULL,
  agency_address_line1 VARCHAR(200) NULL,
  agency_address_line2 VARCHAR(200) NULL,
  agency_city          VARCHAR(120) NULL,
  agency_region        VARCHAR(120) NULL,
  agency_postal_code   VARCHAR(20)  NULL,
  agency_country       VARCHAR(80)  NULL,
  invoice_due_days     SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  invoice_currency     CHAR(3)      NOT NULL DEFAULT 'USD',
  notification_prefs   JSON         NULL,          -- { "<category>": false, … } opt-out map
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Ensure the singleton row always exists.
INSERT IGNORE INTO settings (id) VALUES (1);

-- =====================================================================
-- Proposals & Contracts — the sales-paperwork layer (PandaDoc-driven).
-- Full rationale + workflow: server/proposals-contracts-build-plan.md.
-- These tables are the operational copy that `npm run migrate` creates.
--
-- Design decisions baked in:
--   * All sales artifacts are children of a CLIENT (client_id) — leads never
--     own proposals/contracts. Starting one presupposes a converted client.
--   * Separate proposals and contracts tables, merged into one list at the
--     query layer (the Agreements page), not the schema layer.
--   * Model B: accepting a proposal generates a *separate* contract document;
--     contracts.proposal_id links back (NULL = standalone, e.g. Care Plan).
--   * Line items are SNAPSHOTTED — services holds current pricing; the
--     line-item tables freeze name/price/qty at build time. service_id
--     nullable: set = catalog line, NULL = one-off custom line.
--   * A signed contract of type='project' marks the client won (status active).
-- =====================================================================

-- ---------------------------------------------------------------------
-- services — the price book / catalog (source of truth for pricing).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(255)    NOT NULL,
  description      TEXT            NULL,
  category         ENUM('website_package', 'care_plan', 'addon') NOT NULL,
  price            DECIMAL(10,2)   NOT NULL,
  billing_interval ENUM('one_time', 'monthly') NOT NULL DEFAULT 'one_time',
  pandadoc_sku     VARCHAR(100)    NULL,          -- optional map to PandaDoc Catalog
  is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
  sort_order       INT             NOT NULL DEFAULT 0,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_services_category (category),
  KEY idx_services_active   (is_active)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- proposals — child of a client; maps to one PandaDoc document.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id            BIGINT UNSIGNED NOT NULL,
  project_id           BIGINT UNSIGNED NULL,       -- soft link: the originating project (no FK, see migrate.js)
  title                VARCHAR(255)    NOT NULL,
  status               ENUM('draft', 'sent', 'viewed', 'accepted',
                            'declined', 'expired', 'voided')
                                       NOT NULL DEFAULT 'draft',
  currency             CHAR(3)         NOT NULL DEFAULT 'USD',
  total                DECIMAL(10,2)   NOT NULL DEFAULT 0.00,  -- app-maintained from line items

  -- PandaDoc sync
  pandadoc_document_id VARCHAR(100)    NULL,
  pandadoc_template_id VARCHAR(100)    NULL,
  pandadoc_status      VARCHAR(50)     NULL,      -- raw last-seen status
  last_webhook_at      TIMESTAMP       NULL,

  -- lifecycle timestamps
  sent_at              TIMESTAMP       NULL,
  viewed_at            TIMESTAMP       NULL,
  accepted_at          TIMESTAMP       NULL,
  declined_at          TIMESTAMP       NULL,
  expires_at           DATE            NULL,

  created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proposals_pandadoc_doc (pandadoc_document_id),
  KEY idx_proposals_client (client_id),
  KEY idx_proposals_project (project_id),
  KEY idx_proposals_status  (status),
  CONSTRAINT fk_proposals_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- proposal_line_items — frozen snapshot of what was quoted.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposal_line_items (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proposal_id               BIGINT UNSIGNED NOT NULL,
  service_id                BIGINT UNSIGNED NULL,   -- NULL = one-off custom line
  name_snapshot             VARCHAR(255)    NOT NULL,
  description_snapshot      TEXT            NULL,
  unit_price_snapshot       DECIMAL(10,2)   NOT NULL,
  qty                       DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
  billing_interval_snapshot ENUM('one_time', 'monthly') NOT NULL DEFAULT 'one_time',
  line_total                DECIMAL(12,2)
                            GENERATED ALWAYS AS (unit_price_snapshot * qty) STORED,
  sort_order                INT             NOT NULL DEFAULT 0,
  created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pli_proposal (proposal_id),
  KEY idx_pli_service  (service_id),
  CONSTRAINT fk_pli_proposal
    FOREIGN KEY (proposal_id) REFERENCES proposals (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pli_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE SET NULL ON UPDATE CASCADE   -- deleting a service never breaks a snapshot
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- contracts — child of a client; optionally born from a proposal.
--   type branches the "signed" webhook: project -> marks the client won,
--   care_plan -> its own separate flow.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id            BIGINT UNSIGNED NOT NULL,
  proposal_id          BIGINT UNSIGNED NULL,       -- NULL = standalone (e.g. Care Plan)
  project_id           BIGINT UNSIGNED NULL,       -- soft link: the originating project (no FK, see migrate.js)
  type                 ENUM('project', 'care_plan') NOT NULL,
  title                VARCHAR(255)    NOT NULL,
  status               ENUM('draft', 'sent', 'viewed', 'signed',
                            'declined', 'expired', 'voided')
                                       NOT NULL DEFAULT 'draft',
  currency             CHAR(3)         NOT NULL DEFAULT 'USD',
  total                DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  billing_interval     ENUM('one_time', 'monthly') NOT NULL DEFAULT 'one_time',
  start_date           DATE            NULL,       -- care-plan / engagement start

  -- PandaDoc sync
  pandadoc_document_id VARCHAR(100)    NULL,
  pandadoc_template_id VARCHAR(100)    NULL,
  pandadoc_status      VARCHAR(50)     NULL,
  last_webhook_at      TIMESTAMP       NULL,

  -- lifecycle timestamps
  sent_at              TIMESTAMP       NULL,
  viewed_at            TIMESTAMP       NULL,
  signed_at            TIMESTAMP       NULL,
  declined_at          TIMESTAMP       NULL,
  expires_at           DATE            NULL,

  created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contracts_pandadoc_doc (pandadoc_document_id),
  KEY idx_contracts_client   (client_id),
  KEY idx_contracts_proposal (proposal_id),
  KEY idx_contracts_project  (project_id),
  KEY idx_contracts_type     (type),
  KEY idx_contracts_status   (status),
  CONSTRAINT fk_contracts_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_contracts_proposal
    FOREIGN KEY (proposal_id) REFERENCES proposals (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- contract_line_items — re-snapshotted from proposal_line_items on
--   contract generation (INSERT..SELECT), or built fresh for standalone.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_line_items (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id               BIGINT UNSIGNED NOT NULL,
  service_id                BIGINT UNSIGNED NULL,   -- NULL = one-off custom line
  name_snapshot             VARCHAR(255)    NOT NULL,
  description_snapshot      TEXT            NULL,
  unit_price_snapshot       DECIMAL(10,2)   NOT NULL,
  qty                       DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
  billing_interval_snapshot ENUM('one_time', 'monthly') NOT NULL DEFAULT 'one_time',
  line_total                DECIMAL(12,2)
                            GENERATED ALWAYS AS (unit_price_snapshot * qty) STORED,
  sort_order                INT             NOT NULL DEFAULT 0,
  created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cli_contract (contract_id),
  KEY idx_cli_service  (service_id),
  CONSTRAINT fk_cli_contract
    FOREIGN KEY (contract_id) REFERENCES contracts (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cli_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- document_templates — maps a PandaDoc template UUID to its purpose,
--   so templates can change without a redeploy.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_templates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose       ENUM('proposal', 'project_contract', 'care_plan') NOT NULL,
  template_uuid VARCHAR(100)    NOT NULL,
  name          VARCHAR(255)    NULL,
  is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_templates_purpose (purpose, is_active)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- notifications — the top-bar alert feed (bell popover + slide-over).
--   category = semantic source; tone + icon = presentation the producer
--   chooses (e.g. a paid invoice is success/check, an overdue one is
--   error/alert). read_at NULL = unread (mirrors calls.reviewed_at).
--   user_id NULL = broadcast to all admins; set = targeted to one user.
--   Ready for the deferred client portal without changing the shape.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NULL,

  category    ENUM('lead', 'call', 'proposal', 'contract',
                   'invoice', 'payment', 'task', 'ticket', 'expense', 'website', 'system') NOT NULL,
  tone        ENUM('brand', 'success', 'warning', 'info', 'error')
                NOT NULL DEFAULT 'brand',
  icon        VARCHAR(64)  NOT NULL,   -- lucide id, e.g. 'i-lucide-user-plus'

  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(500) NULL,
  link        VARCHAR(512) NULL,       -- in-app route to open on click

  read_at     DATETIME NULL,           -- NULL = unread
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Feed query: a user's notifications, newest first, unread filterable.
  KEY idx_notifications_user_created (user_id, created_at),
  KEY idx_notifications_user_unread (user_id, read_at),

  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- infra_alerts — dedup/state store for poll-based DigitalOcean infra alerting.
-- One active row per (subject, kind); resolved_at NULL = active. The poll job
-- writes it (notifying on open/resolve); the dashboard reads active rows. No FKs:
-- subject_id is a website id or droplet id (droplets aren't a local table).
CREATE TABLE IF NOT EXISTS infra_alerts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type ENUM('website', 'droplet') NOT NULL,
  subject_id   VARCHAR(64)  NOT NULL,        -- website id or droplet id (string)
  kind         ENUM('site_down', 'high_cpu', 'disk_full') NOT NULL,
  label        VARCHAR(200) NOT NULL,        -- display subject (site/droplet name)
  detail       VARCHAR(200) NULL,            -- condition text ('CPU 94%')
  link         VARCHAR(512) NULL,            -- deep link (/websites/:id)
  tone         ENUM('warning', 'error') NOT NULL DEFAULT 'error',
  opened_at    DATETIME     NOT NULL,
  resolved_at  DATETIME     NULL,            -- NULL = active
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_infra_alert (subject_type, subject_id, kind),
  KEY idx_infra_alerts_active (resolved_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =====================================================================
-- PROJECTS & TASKS
--   Inverts the old "signed contract creates the project" flow: the
--   PROJECT is the hub. It's created on a contact, holds the Statement
--   of Work (Exhibit A of the Website Design & Development Agreement),
--   and ORIGINATES its contract (proposals/contracts carry a soft
--   project_id back-link above). project_types is an extensible lookup
--   so new kinds of project are a row insert, each mapped to its own
--   contract template. Tasks hang off a project (nullable = standalone).
-- =====================================================================

-- ---------------------------------------------------------------------
-- project_types — extensible catalog of project kinds. Each type sets a
--   code prefix and (optionally) which document template its contract
--   generates from. Seed at least the 'website' type.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_types (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key`                VARCHAR(50)     NOT NULL,          -- slug, e.g. 'website'
  name                 VARCHAR(120)    NOT NULL,          -- 'Website Design & Development'
  description          VARCHAR(255)    NULL,
  code_prefix          VARCHAR(10)     NOT NULL DEFAULT 'PRJ',  -- 'WEB' -> WEB-0007
  contract_template_id BIGINT UNSIGNED NULL,              -- which agreement template to generate
  is_active            BOOLEAN         NOT NULL DEFAULT TRUE,
  sort_order           INT             NOT NULL DEFAULT 0,
  created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_types_key (`key`),
  KEY idx_project_types_active (is_active),
  CONSTRAINT fk_project_types_template
    FOREIGN KEY (contract_template_id) REFERENCES document_templates (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- milestone_templates — SUPERSEDED by project_templates (named, selectable
--   templates managed in Settings). Left defined so existing DBs don't error,
--   but no longer read at project creation. New template data lives in the
--   project_templates* tables below.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestone_templates (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_type_id BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(160)    NOT NULL,
  position        INT             NOT NULL DEFAULT 0,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_milestone_templates_type (project_type_id, position),
  CONSTRAINT fk_milestone_templates_type
    FOREIGN KEY (project_type_id) REFERENCES project_types (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- project_templates — named, reusable delivery blueprints. Each holds an
--   ordered set of milestones, each with an ordered set of tasks. Picked in
--   the New Project form (or a type's default is applied when none is chosen)
--   and copied into project_milestones + tasks at project creation. Managed in
--   Settings → Project Templates.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_templates (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(160)    NOT NULL,
  description     VARCHAR(255)    NULL,
  project_type_id BIGINT UNSIGNED NULL,               -- optional grouping + default-per-type lookup
  is_default      BOOLEAN         NOT NULL DEFAULT FALSE,  -- default for its project_type
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  sort_order      INT             NOT NULL DEFAULT 0,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_templates_type (project_type_id),
  KEY idx_project_templates_active (is_active),
  CONSTRAINT fk_project_templates_type
    FOREIGN KEY (project_type_id) REFERENCES project_types (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- project_template_milestones — the milestones inside a template.
CREATE TABLE IF NOT EXISTS project_template_milestones (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(160)    NOT NULL,
  position    INT             NOT NULL DEFAULT 0,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ptm_template (template_id, position),
  CONSTRAINT fk_ptm_template
    FOREIGN KEY (template_id) REFERENCES project_templates (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- project_template_tasks — the tasks inside a template. template_milestone_id
--   NULL = a milestone-less "General" task (seeds a task with no milestone).
CREATE TABLE IF NOT EXISTS project_template_tasks (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id           BIGINT UNSIGNED NOT NULL,
  template_milestone_id BIGINT UNSIGNED NULL,
  title                 VARCHAR(255)    NOT NULL,
  position              INT             NOT NULL DEFAULT 0,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ptt_template (template_id, position),
  KEY idx_ptt_milestone (template_milestone_id),
  CONSTRAINT fk_ptt_template
    FOREIGN KEY (template_id) REFERENCES project_templates (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ptt_milestone
    FOREIGN KEY (template_milestone_id) REFERENCES project_template_milestones (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- projects — a client engagement + its Statement of Work (Exhibit A).
--   Child of a client; typed via project_types. The SOW fields below
--   feed the contract's PandaDoc tokens on generation.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id            BIGINT UNSIGNED NOT NULL,
  project_type_id      BIGINT UNSIGNED NOT NULL,
  code                 VARCHAR(50)     NULL,              -- 'WEB-0007', assigned on create
  name                 VARCHAR(255)    NOT NULL,
  status               ENUM('planning', 'awaiting_signature', 'awaiting_deposit', 'in_progress',
                            'in_review', 'awaiting_final', 'on_hold', 'completed')
                                       NOT NULL DEFAULT 'planning',

  -- Statement of Work (Exhibit A)
  goals                TEXT            NULL,              -- project goals / description
  pages_included       TEXT            NULL,
  key_features         TEXT            NULL,
  design_deliverables  TEXT            NULL,
  content_provided_by  ENUM('client', 'developer', 'mix') NULL,
  revision_rounds      INT             NOT NULL DEFAULT 2,
  third_party_costs    TEXT            NULL,              -- who pays hosting/domain/plugins
  project_fee          DECIMAL(10,2)   NULL,              -- total
  deposit_pct          DECIMAL(5,2)    NOT NULL DEFAULT 50.00,  -- deposit share; final = 100 - this
  hourly_rate          DECIMAL(10,2)   NULL,              -- extra work / out-of-scope
  content_deadline     DATE            NULL,
  start_date           DATE            NULL,
  target_launch_date   DATE            NULL,
  special_terms        TEXT            NULL,

  -- Policy constants (editable, fill the agreement body brackets)
  inactivity_days      INT             NOT NULL DEFAULT 30,
  feedback_days        INT             NOT NULL DEFAULT 5,
  late_fee_days        INT             NOT NULL DEFAULT 7,
  bugfix_days          INT             NOT NULL DEFAULT 30,

  created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_code (code),
  KEY idx_projects_client (client_id),
  KEY idx_projects_type    (project_type_id),
  KEY idx_projects_status  (status),
  KEY idx_projects_due     (target_launch_date),
  CONSTRAINT fk_projects_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_projects_type
    FOREIGN KEY (project_type_id) REFERENCES project_types (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- project_milestones — the client-visible delivery layer. Groups tasks
--   (tasks.milestone_id) and rolls up their completion. Hybrid state:
--   progress % is derived from tasks, but the admin sets `state`
--   (current/complete) and a target_date. Orthogonal to projects.status
--   (which is the commercial/billing lifecycle).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_milestones (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(160)    NOT NULL,
  description  TEXT            NULL,
  state        ENUM('upcoming', 'in_progress', 'complete') NOT NULL DEFAULT 'upcoming',
  position     INT             NOT NULL DEFAULT 0,
  target_date  DATE            NULL,
  completed_at TIMESTAMP       NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_milestones_project (project_id, position),
  CONSTRAINT fk_project_milestones_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- tasks — units of work. project_id NULL = a standalone ad-hoc task.
--   completed_at is stamped when status crosses into 'done'.
--   milestone_id is a soft link (no FK, like proposals.project_id); the
--   app nulls it when a milestone is deleted.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   BIGINT UNSIGNED NULL,
  milestone_id BIGINT UNSIGNED NULL,             -- soft link (no FK); app nulls on milestone delete
  title        VARCHAR(255)    NOT NULL,
  description  TEXT            NULL,
  status       ENUM('todo', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'todo',
  priority     ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  due_date     DATE            NULL,
  position     INT             NOT NULL DEFAULT 0,
  completed_at TIMESTAMP       NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_project (project_id),
  KEY idx_tasks_milestone (milestone_id),
  KEY idx_tasks_status  (status),
  KEY idx_tasks_due     (due_date),
  CONSTRAINT fk_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- task_checklist_items — a flat checklist of sub-items under a task. Drives the
-- per-task progress bar (done/total); independent of the task's own done state.
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id    BIGINT UNSIGNED NOT NULL,
  title      VARCHAR(255)    NOT NULL,
  done       TINYINT(1)      NOT NULL DEFAULT 0,
  position   INT             NOT NULL DEFAULT 0,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tci_task (task_id, position),
  CONSTRAINT fk_tci_task
    FOREIGN KEY (task_id) REFERENCES tasks (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =====================================================================
-- BILLING — invoices & payments.
--   Local source of truth for the Invoices/Payments pages, kept in sync
--   with Stripe via webhooks (status is Stripe's; past-due is derived =
--   open + due_date < today). project_id is a soft link (no FK) like
--   proposals/contracts. A project deposit is an invoice with kind='deposit'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- invoices — a bill sent to a client, mirrored from a Stripe invoice.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id          BIGINT UNSIGNED NOT NULL,
  project_id         BIGINT UNSIGNED NULL,             -- soft link (no FK, see migrate.js)
  stripe_invoice_id  VARCHAR(100)    NULL,
  number             VARCHAR(50)     NULL,             -- Stripe number, set on finalize
  status             ENUM('draft', 'open', 'paid', 'uncollectible', 'void')
                                     NOT NULL DEFAULT 'draft',
  kind               ENUM('deposit', 'balance', 'custom') NOT NULL DEFAULT 'custom',
  currency           CHAR(3)         NOT NULL DEFAULT 'USD',
  amount_due         DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  amount_paid        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  description        VARCHAR(500)    NULL,
  hosted_invoice_url TEXT            NULL,
  invoice_pdf        TEXT            NULL,
  due_date           DATE            NULL,
  finalized_at       TIMESTAMP       NULL,
  paid_at            TIMESTAMP       NULL,
  voided_at          TIMESTAMP       NULL,
  created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_stripe (stripe_invoice_id),
  KEY idx_invoices_client (client_id),
  KEY idx_invoices_project (project_id),
  KEY idx_invoices_status  (status),
  KEY idx_invoices_due     (due_date),
  CONSTRAINT fk_invoices_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- invoice_line_items — frozen snapshot of what was billed (mirrors
--   contract_line_items).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id                BIGINT UNSIGNED NOT NULL,
  service_id                BIGINT UNSIGNED NULL,   -- NULL = one-off custom line
  name_snapshot             VARCHAR(255)    NOT NULL,
  description_snapshot      TEXT            NULL,
  unit_price_snapshot       DECIMAL(10,2)   NOT NULL,
  qty                       DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
  billing_interval_snapshot ENUM('one_time', 'monthly') NOT NULL DEFAULT 'one_time',
  line_total                DECIMAL(12,2)
                            GENERATED ALWAYS AS (unit_price_snapshot * qty) STORED,
  sort_order                INT             NOT NULL DEFAULT 0,
  created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ili_invoice (invoice_id),
  KEY idx_ili_service (service_id),
  CONSTRAINT fk_ili_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ili_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- payments — a received payment against an invoice (Stripe charge or a
--   manually-recorded offline payment). Powers the Payments page.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id                BIGINT UNSIGNED NOT NULL,
  invoice_id               BIGINT UNSIGNED NULL,
  stripe_payment_intent_id VARCHAR(100)    NULL,
  amount                   DECIMAL(10,2)   NOT NULL,
  currency                 CHAR(3)         NOT NULL DEFAULT 'USD',
  method                   ENUM('card', 'bank', 'manual', 'other') NOT NULL DEFAULT 'card',
  status                   ENUM('succeeded', 'refunded', 'failed') NOT NULL DEFAULT 'succeeded',
  note                     VARCHAR(255)    NULL,
  paid_at                  TIMESTAMP       NULL,
  created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_stripe_pi (stripe_payment_intent_id),
  KEY idx_payments_client (client_id),
  KEY idx_payments_invoice (invoice_id),
  KEY idx_payments_paid    (paid_at),
  CONSTRAINT fk_payments_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_payments_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- expenses — money OUT. Three kinds via `category`:
--   'client'       — a cost incurred for a specific client (client_id set;
--                    `billable` marks pass-through costs to be rebilled).
--   'business'     — general agency overhead, no client.
--   'subscription' — a recurring third-party tool/service. Carries the
--                    subscription-only fields (billing_interval, next_renewal_at,
--                    status) and drives the recurring-spend rollup + renewal
--                    reminders. One-off expenses leave those NULL / status='active'.
-- client_id is nullable (LEFT JOIN in the repo); required only when category='client'.
-- project_id is a soft link (no FK) like invoices/proposals.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category            ENUM('client', 'business', 'subscription') NOT NULL,
  client_id           BIGINT UNSIGNED NULL,             -- required when category='client'
  project_id          BIGINT UNSIGNED NULL,             -- soft link (no FK, see migrate.js)
  vendor              VARCHAR(255)    NOT NULL,          -- payee / merchant / tool name
  description         VARCHAR(500)    NULL,
  amount              DECIMAL(10,2)   NOT NULL,
  currency            CHAR(3)         NOT NULL DEFAULT 'USD',
  expense_date        DATE            NOT NULL,          -- date incurred / last charge
  payment_method      ENUM('card', 'bank', 'cash', 'other') NOT NULL DEFAULT 'card',
  billable            TINYINT(1)      NOT NULL DEFAULT 0, -- client expenses: rebill to client
  reimbursed_at       TIMESTAMP       NULL,              -- set when a billable expense is recovered
  receipt_url         VARCHAR(512)    NULL,              -- uploaded receipt (see useUploads)
  -- subscription-only fields (NULL for one-off expenses):
  billing_interval    ENUM('monthly', 'yearly') NULL,
  next_renewal_at     DATE            NULL,
  renewal_reminded_on DATE            NULL,              -- idempotency for the reminder job
  status              ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  notes               TEXT            NULL,
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_expenses_category (category),
  KEY idx_expenses_client   (client_id),
  KEY idx_expenses_project  (project_id),
  KEY idx_expenses_status   (status),
  KEY idx_expenses_date     (expense_date),
  KEY idx_expenses_renewal  (next_renewal_at),
  CONSTRAINT fk_expenses_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- websites — one row per site FWA builds/maintains, under a client. Daily traffic
-- lives in website_metrics; top pages/sources + health are current snapshots on the
-- row. analytics_provider = 'none' means analytics isn't connected yet. project_id
-- links back to the SOW that built it (optional).
CREATE TABLE IF NOT EXISTS websites (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id          BIGINT UNSIGNED NOT NULL,
  project_id         BIGINT UNSIGNED NULL,
  name               VARCHAR(160)    NOT NULL,
  domain             VARCHAR(255)    NOT NULL,
  url                VARCHAR(255)    NULL,
  environment        ENUM('live', 'staging', 'dev')                      NOT NULL DEFAULT 'live',
  status             ENUM('active', 'archived')                          NOT NULL DEFAULT 'active',
  analytics_provider ENUM('none', 'plausible', 'ga4', 'fathom', 'umami') NOT NULL DEFAULT 'none',
  analytics_site_id  VARCHAR(190)    NULL,
  last_synced_at     DATETIME        NULL,
  conversion_goal    VARCHAR(120)    NULL,
  health_state       ENUM('up', 'degraded', 'down', 'unknown')          NOT NULL DEFAULT 'unknown',
  uptime_pct         DECIMAL(5,2)    NULL,
  perf_score         TINYINT UNSIGNED NULL,
  avg_lcp_ms         INT UNSIGNED    NULL,
  last_checked_at    DATETIME        NULL,
  top_pages          JSON            NULL,
  top_sources        JSON            NULL,
  launched_at        DATE            NULL,
  notes              TEXT            NULL,
  do_droplet_id      BIGINT UNSIGNED NULL, -- linked DigitalOcean Droplet (live infra panel)
  do_uptime_check_id VARCHAR(36)     NULL, -- managed DigitalOcean Uptime check (health verdict)
  created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_websites_client (client_id),
  KEY idx_websites_project (project_id),
  CONSTRAINT fk_websites_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_websites_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- website_metrics — daily traffic snapshot per site; source for trend charts + the
-- 30-day rollups shown on the dashboard and detail pages.
CREATE TABLE IF NOT EXISTS website_metrics (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  website_id  BIGINT UNSIGNED NOT NULL,
  date        DATE            NOT NULL,
  visitors    INT UNSIGNED    NOT NULL DEFAULT 0,
  pageviews   INT UNSIGNED    NOT NULL DEFAULT 0,
  conversions INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wm_site_date (website_id, date),
  CONSTRAINT fk_wm_website
    FOREIGN KEY (website_id) REFERENCES websites (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- website_checks — uptime/response-time history (one row per check), source for
-- the detail page's health trend and the rolling uptime %.
CREATE TABLE IF NOT EXISTS website_checks (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  website_id  BIGINT UNSIGNED NOT NULL,
  checked_at  DATETIME        NOT NULL,
  up          TINYINT(1)      NOT NULL DEFAULT 1,
  status_code INT             NULL,
  response_ms INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  KEY idx_wc_site_time (website_id, checked_at),
  CONSTRAINT fk_wc_website
    FOREIGN KEY (website_id) REFERENCES websites (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =====================================================================
-- SUPPORT TICKETS — the admin opens tickets for a client (site updates,
--   issues, bugs) with a reply thread and file attachments. Built portal-
--   ready: opened_by / author_type / uploaded_by carry an admin|client
--   distinction so the future client portal reuses these tables unchanged
--   (only 'admin' is written this phase).
-- =====================================================================

CREATE TABLE IF NOT EXISTS tickets (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id        BIGINT UNSIGNED NOT NULL,
  website_id       BIGINT UNSIGNED NULL,            -- optional: a specific site
  subject          VARCHAR(255)    NOT NULL,
  description      TEXT            NULL,
  type             ENUM('update', 'issue', 'bug', 'question', 'other') NOT NULL DEFAULT 'other',
  status           ENUM('open', 'in_progress', 'waiting', 'resolved', 'closed') NOT NULL DEFAULT 'open',
  priority         ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  opened_by        ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  resolved_at      TIMESTAMP       NULL,
  closed_at        TIMESTAMP       NULL,
  last_activity_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tickets_client   (client_id),
  KEY idx_tickets_status   (status),
  KEY idx_tickets_website  (website_id),
  CONSTRAINT fk_tickets_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_website
    FOREIGN KEY (website_id) REFERENCES websites (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ticket_messages — the reply thread on a ticket (admin now; client + admin
-- in the portal phase). author_user_id is who wrote it (NULL if the author is
-- gone).
CREATE TABLE IF NOT EXISTS ticket_messages (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id      BIGINT UNSIGNED NOT NULL,
  author_type    ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  author_user_id BIGINT UNSIGNED NULL,
  body           TEXT            NOT NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tmsg_ticket (ticket_id, id),
  CONSTRAINT fk_tmsg_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tmsg_author
    FOREIGN KEY (author_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ticket_attachments — files on a ticket, optionally hung off a specific reply
-- (message_id). Reuses the shared upload store: `path` is the /uploads/<name>
-- returned by POST /api/uploads.
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id        BIGINT UNSIGNED NOT NULL,
  message_id       BIGINT UNSIGNED NULL,
  path             VARCHAR(512)    NOT NULL,
  name             VARCHAR(255)    NOT NULL,
  mime             VARCHAR(120)    NULL,
  size_bytes       BIGINT UNSIGNED NULL,
  uploaded_by      ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  uploaded_user_id BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tatt_ticket  (ticket_id, id),
  KEY idx_tatt_message (message_id),
  CONSTRAINT fk_tatt_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tatt_message
    FOREIGN KEY (message_id) REFERENCES ticket_messages (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tatt_uploader
    FOREIGN KEY (uploaded_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- files — the Workspace › Files library. A first-class file record, optionally
-- attached to a client and/or a project, grouped by `category`. Reuses the
-- shared upload store: `path` is the /uploads/<name> returned by POST
-- /api/uploads (bytes are written there first; this row is the metadata). FKs
-- are SET NULL so deleting a client/project leaves the file (unattached) rather
-- than destroying bytes. Deleting a file row also unlinks the file on disk
-- (handled in files.routes.js), so no orphaned bytes accumulate.
CREATE TABLE IF NOT EXISTS files (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id        BIGINT UNSIGNED NULL,
  project_id       BIGINT UNSIGNED NULL,
  category         ENUM('brand', 'contract', 'deliverable', 'other') NOT NULL DEFAULT 'other',
  path             VARCHAR(512)    NOT NULL,
  name             VARCHAR(255)    NOT NULL,
  title            VARCHAR(255)    NULL,     -- display title; NULL = show `name`
  mime             VARCHAR(120)    NULL,
  size_bytes       BIGINT UNSIGNED NULL,
  uploaded_by      ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  uploaded_user_id BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_files_client  (client_id, id),
  KEY idx_files_project (project_id, id),
  KEY idx_files_created (created_at),
  CONSTRAINT fk_files_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_files_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_files_uploader
    FOREIGN KEY (uploaded_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- client_activity — the per-client event timeline shown on the client detail
-- page (Support & Calls tab). Append-only, written best-effort by
-- services/clientActivity.service.js wherever a client-scoped event already
-- raises a notification (invoice sent/paid, contract signed, ticket opened,
-- call logged, …). CASCADE: the timeline is meaningless without its client.
CREATE TABLE IF NOT EXISTS client_activity (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id   BIGINT UNSIGNED NOT NULL,

  category    ENUM('invoice', 'payment', 'project', 'agreement',
                   'ticket', 'call', 'website', 'portal', 'file',
                   'note', 'status') NOT NULL,
  icon        VARCHAR(64)  NOT NULL,   -- lucide id, e.g. 'i-lucide-receipt-text'
  title       VARCHAR(200) NOT NULL,
  meta        VARCHAR(500) NULL,       -- secondary line ('$4,000 · due Jul 2')
  link        VARCHAR(512) NULL,       -- in-app route to open on click

  occurred_at DATETIME  NOT NULL,      -- event time (backfill uses source rows)
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Feed query: a client's timeline, newest first, paginated.
  KEY idx_client_activity_feed (client_id, occurred_at),

  CONSTRAINT fk_client_activity_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
