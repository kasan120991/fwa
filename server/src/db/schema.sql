-- =====================================================================
-- FWA Ops — core schema
-- Two tables drive the app (see CLAUDE.md "Core data model"):
--   contacts  — one row backs a lead AND a client; conversion is a stage
--               change on this row, never a copy between tables.
--   calls     — append-only event log of receptionist calls; links to a
--               contact via a NULLABLE contact_id (set only when relevant).
-- Run with `npm run migrate` (creates the database if absent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- contacts — leads and clients, unified. Filtered into views by `stage`.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- How the contact entered. Drives the Leads page split:
  --   website + call = Inbound,  manual = Outreach.
  source             ENUM('website', 'call', 'manual', 'referral') NOT NULL,

  -- Unified lifecycle across both motions:
  --   Inbound early:  new -> qualifying
  --   Outreach early: to_contact -> contacted -> engaged
  --   Converge:       qualified -> proposal
  --   Client:         active (proposal won) -> past ;  lost = dead/declined
  -- Leads page = pre-client stages; Clients page = active/past.
  stage              ENUM('new', 'qualifying', 'to_contact', 'contacted',
                          'engaged', 'qualified', 'proposal', 'active',
                          'past', 'lost') NOT NULL DEFAULT 'new',

  -- `name` = primary contact person; `company` = the business.
  name               VARCHAR(160) NOT NULL,
  email              VARCHAR(254) NULL,
  phone              VARCHAR(32)  NULL,
  company            VARCHAR(160) NULL,
  title              VARCHAR(120) NULL,   -- contact's role, e.g. "Marketing Director"
  website            VARCHAR(255) NULL,   -- site/domain, e.g. "northwind.com"

  -- Client logo — a data: URL (small uploaded image) or external image URL.
  logo_url           MEDIUMTEXT NULL,

  -- Inbound inquiry text (website form message); call inquiries surface via `calls`.
  message            TEXT NULL,

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

  -- Billing email (invoices). Falls back to the contact email when blank.
  billing_email      VARCHAR(254) NULL,

  -- Date the contact became a client (stage -> active).
  client_since       DATE NULL,

  -- Stripe customer id (cus_…), created when the contact becomes an active client.
  stripe_customer_id VARCHAR(255) NULL,

  -- Outreach follow-up cadence. next_action_at in the past = overdue touch.
  last_contacted_at  DATETIME NULL,
  next_action_at     DATETIME NULL,

  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Clients view (stage IN active/past) and any stage filter.
  KEY idx_contacts_stage (stage),
  -- Leads views: Inbound/Outreach are (source) + (stage) filters.
  KEY idx_contacts_source_stage (source, stage),
  -- Outreach cadence: surface overdue/upcoming touches cheaply.
  KEY idx_contacts_next_action (next_action_at),
  KEY idx_contacts_email (email),
  KEY idx_contacts_phone (phone),
  -- Reverse lookup from a Stripe customer (e.g. webhook handling later).
  KEY idx_contacts_stripe (stripe_customer_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- calls — every receptionist (Vapi) call, linked or not. Append-only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calls (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Set only when a call becomes / belongs to a contact (inquiry or existing
  -- client). Everything else (spam, wrong_number, other) stays unlinked.
  contact_id         BIGINT UNSIGNED NULL,

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

  KEY idx_calls_contact (contact_id),
  KEY idx_calls_classification (classification),
  -- Receptionist inbox is ordered by recency.
  KEY idx_calls_occurred_at (occurred_at),

  -- Deleting a contact must NOT delete its call history — keep the event log.
  CONSTRAINT fk_calls_contact FOREIGN KEY (contact_id)
    REFERENCES contacts (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users — app login accounts. Two-sided by design (see CLAUDE.md):
--   role = 'admin'  -> internal ops app (the only role in use this phase)
--   role = 'client' -> external client portal (built in a later phase)
-- Client-portal users will later link to their contacts row; that column
-- is added when the portal is built, not speculatively now.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(254) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  role           ENUM('admin', 'client') NOT NULL DEFAULT 'admin',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at  DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
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

-- =====================================================================
-- Proposals & Contracts — the sales-paperwork layer (PandaDoc-driven).
-- Full rationale + workflow: server/proposals-contracts-build-plan.md;
-- annotated DDL reference: server/proposals_contracts_schema.sql. These
-- six tables are the operational copy (IF NOT EXISTS + the app's
-- utf8mb4_unicode_ci collation) that `npm run migrate` creates.
--
-- Design decisions baked in:
--   * Separate proposals and contracts tables, merged into one list at the
--     query layer (the Agreements page), not the schema layer.
--   * Model B: accepting a proposal generates a *separate* contract document;
--     contracts.proposal_id links back (NULL = standalone, e.g. Care Plan).
--   * Line items are SNAPSHOTTED — services holds current pricing; the
--     line-item tables freeze name/price/qty at build time. service_id
--     nullable: set = catalog line, NULL = one-off custom line.
--   * Contact stage stays coarse; granular state lives on these rows'
--     status. A signed contract of type='project' is the project trigger.
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
-- proposals — child of a contact; maps to one PandaDoc document.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id           BIGINT UNSIGNED NOT NULL,
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
  KEY idx_proposals_contact (contact_id),
  KEY idx_proposals_status  (status),
  CONSTRAINT fk_proposals_contact
    FOREIGN KEY (contact_id) REFERENCES contacts (id)
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
-- contracts — child of a contact; optionally born from a proposal.
--   type branches the "signed" webhook: project -> create project,
--   care_plan -> its own separate flow.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id           BIGINT UNSIGNED NOT NULL,
  proposal_id          BIGINT UNSIGNED NULL,       -- NULL = standalone (e.g. Care Plan)
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
  KEY idx_contracts_contact  (contact_id),
  KEY idx_contracts_proposal (proposal_id),
  KEY idx_contracts_type     (type),
  KEY idx_contracts_status   (status),
  CONSTRAINT fk_contracts_contact
    FOREIGN KEY (contact_id) REFERENCES contacts (id)
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
