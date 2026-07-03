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
  KEY idx_contacts_phone (phone)
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
