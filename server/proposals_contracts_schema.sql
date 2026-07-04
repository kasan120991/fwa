-- ============================================================================
-- FWA Ops App — Proposals & Contracts schema
-- ----------------------------------------------------------------------------
-- Build order: this is step 1 (schema) for the server/ folder. Routes next.
--
-- Assumptions:
--   * MySQL 8+ (uses generated columns and utf8mb4_0900 collation).
--   * A `contacts` table already exists. All FKs to contacts(id) below assume
--     contacts.id is BIGINT UNSIGNED. >>> If your contacts PK is a different
--     type, change the contact_id columns here to match or the FK will fail. <<<
--
-- Design decisions baked in:
--   * Separate proposals and contracts tables (joined into one list on the
--     client-detail Contracts tab at the query layer, not the schema layer).
--   * Model B: a proposal is accepted -> the backend generates a *separate*
--     contract document. contracts.proposal_id links back (NULL = standalone,
--     e.g. Care Plan).
--   * Line items are SNAPSHOTTED. services holds current pricing; line-item
--     tables freeze name/price/qty at document-build time. service_id is
--     nullable: set = came from the catalog, NULL = one-off custom line.
--   * Contact stage stays coarse. Granular state lives on these rows' status.
--     Contract signed (type='project') is the project-creation trigger.
--
-- PandaDoc status mapping (raw -> internal), for the webhook handler:
--   document.sent      -> sent
--   document.viewed    -> viewed
--   document.completed -> accepted (proposals) / signed (contracts)
--   document.declined  -> declined
--   document.expired   -> expired
--   (store the raw value in pandadoc_status; keep the handler idempotent.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. services — the price book / catalog (source of truth for pricing)
-- ----------------------------------------------------------------------------
CREATE TABLE services (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name             VARCHAR(255)    NOT NULL,
    description      TEXT            NULL,
    category         ENUM('website_package','care_plan','addon') NOT NULL,
    price            DECIMAL(10,2)   NOT NULL,
    billing_interval ENUM('one_time','monthly') NOT NULL DEFAULT 'one_time',
    pandadoc_sku     VARCHAR(100)    NULL,          -- optional map to PandaDoc Catalog
    is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order       INT             NOT NULL DEFAULT 0,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_services_category (category),
    KEY idx_services_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------------------------------------------------------
-- 2. proposals — child of a contact; maps to one PandaDoc document
-- ----------------------------------------------------------------------------
CREATE TABLE proposals (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contact_id           BIGINT UNSIGNED NOT NULL,
    title                VARCHAR(255)    NOT NULL,
    status               ENUM('draft','sent','viewed','accepted',
                              'declined','expired','voided')
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------------------------------------------------------
-- 3. proposal_line_items — frozen snapshot of what was quoted
-- ----------------------------------------------------------------------------
CREATE TABLE proposal_line_items (
    id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    proposal_id               BIGINT UNSIGNED NOT NULL,
    service_id                BIGINT UNSIGNED NULL,   -- NULL = one-off custom line
    name_snapshot             VARCHAR(255)    NOT NULL,
    description_snapshot       TEXT           NULL,
    unit_price_snapshot       DECIMAL(10,2)   NOT NULL,
    qty                       DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
    billing_interval_snapshot ENUM('one_time','monthly') NOT NULL DEFAULT 'one_time',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------------------------------------------------------
-- 4. contracts — child of a contact; optionally born from a proposal
--    type branches the "signed" webhook: project -> create project,
--    care_plan -> its own separate flow.
-- ----------------------------------------------------------------------------
CREATE TABLE contracts (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contact_id           BIGINT UNSIGNED NOT NULL,
    proposal_id          BIGINT UNSIGNED NULL,       -- NULL = standalone (e.g. Care Plan)
    type                 ENUM('project','care_plan') NOT NULL,
    title                VARCHAR(255)    NOT NULL,
    status               ENUM('draft','sent','viewed','signed',
                              'declined','expired','voided')
                                         NOT NULL DEFAULT 'draft',
    currency             CHAR(3)         NOT NULL DEFAULT 'USD',
    total                DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    billing_interval     ENUM('one_time','monthly') NOT NULL DEFAULT 'one_time',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------------------------------------------------------
-- 5. contract_line_items — re-snapshotted from proposal_line_items on
--    contract generation (INSERT..SELECT), or built fresh for standalone.
-- ----------------------------------------------------------------------------
CREATE TABLE contract_line_items (
    id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_id               BIGINT UNSIGNED NOT NULL,
    service_id                BIGINT UNSIGNED NULL,   -- NULL = one-off custom line
    name_snapshot             VARCHAR(255)    NOT NULL,
    description_snapshot       TEXT           NULL,
    unit_price_snapshot       DECIMAL(10,2)   NOT NULL,
    qty                       DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
    billing_interval_snapshot ENUM('one_time','monthly') NOT NULL DEFAULT 'one_time',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ----------------------------------------------------------------------------
-- 6. document_templates — maps a PandaDoc template UUID to its purpose,
--    so templates can change without a redeploy.
-- ----------------------------------------------------------------------------
CREATE TABLE document_templates (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    purpose       ENUM('proposal','project_contract','care_plan') NOT NULL,
    template_uuid VARCHAR(100)    NOT NULL,
    name          VARCHAR(255)    NULL,
    is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_templates_purpose (purpose, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================================
-- Optional seed for the price book — edit prices to your real numbers.
-- ============================================================================
-- INSERT INTO services (name, category, price, billing_interval, sort_order) VALUES
--   ('Starter Website',        'website_package', 1500.00, 'one_time', 10),
--   ('Business Website',       'website_package', 3000.00, 'one_time', 20),
--   ('Premium Website',        'website_package', 5000.00, 'one_time', 30),
--   ('Care Plan — Basic',      'care_plan',         49.00, 'monthly',  40),
--   ('Care Plan — Pro',        'care_plan',         99.00, 'monthly',  50),
--   ('Extra Page',             'addon',            150.00, 'one_time', 60),
--   ('Logo Design',            'addon',            400.00, 'one_time', 70),
--   ('Copywriting (per page)', 'addon',            120.00, 'one_time', 80),
--   ('Rush Delivery',          'addon',            500.00, 'one_time', 90);
