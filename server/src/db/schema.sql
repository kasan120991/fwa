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
  KEY idx_proposals_contact (contact_id),
  KEY idx_proposals_project (project_id),
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
  KEY idx_contracts_contact  (contact_id),
  KEY idx_contracts_proposal (proposal_id),
  KEY idx_contracts_project  (project_id),
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
                   'invoice', 'payment', 'task', 'system') NOT NULL,
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
-- projects — a client engagement + its Statement of Work (Exhibit A).
--   Child of a contact; typed via project_types. The SOW fields below
--   feed the contract's PandaDoc tokens on generation.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id           BIGINT UNSIGNED NOT NULL,
  project_type_id      BIGINT UNSIGNED NOT NULL,
  code                 VARCHAR(50)     NULL,              -- 'WEB-0007', assigned on create
  name                 VARCHAR(255)    NOT NULL,
  status               ENUM('planning', 'in_progress', 'in_review', 'on_hold', 'completed')
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
  KEY idx_projects_contact (contact_id),
  KEY idx_projects_type    (project_type_id),
  KEY idx_projects_status  (status),
  KEY idx_projects_due     (target_launch_date),
  CONSTRAINT fk_projects_contact
    FOREIGN KEY (contact_id) REFERENCES contacts (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_projects_type
    FOREIGN KEY (project_type_id) REFERENCES project_types (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- tasks — units of work. project_id NULL = a standalone ad-hoc task.
--   completed_at is stamped when status crosses into 'done'.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   BIGINT UNSIGNED NULL,
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
  KEY idx_tasks_status  (status),
  KEY idx_tasks_due     (due_date),
  CONSTRAINT fk_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
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
-- invoices — a bill sent to a contact, mirrored from a Stripe invoice.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contact_id         BIGINT UNSIGNED NOT NULL,
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
  KEY idx_invoices_contact (contact_id),
  KEY idx_invoices_project (project_id),
  KEY idx_invoices_status  (status),
  KEY idx_invoices_due     (due_date),
  CONSTRAINT fk_invoices_contact
    FOREIGN KEY (contact_id) REFERENCES contacts (id)
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
  contact_id               BIGINT UNSIGNED NOT NULL,
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
  KEY idx_payments_contact (contact_id),
  KEY idx_payments_invoice (invoice_id),
  KEY idx_payments_paid    (paid_at),
  CONSTRAINT fk_payments_contact
    FOREIGN KEY (contact_id) REFERENCES contacts (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_payments_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
