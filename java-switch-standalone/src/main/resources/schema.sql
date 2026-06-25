-- =====================================================================
-- Flossx83 clearing capture schema (STAGE 1)
-- Idempotent: safe to run on every Spring Boot startup.
-- =====================================================================

CREATE TABLE IF NOT EXISTS clearing_transaction (
    id                BIGSERIAL PRIMARY KEY,
    mti               VARCHAR(4)  NOT NULL,
    stan              VARCHAR(6)  NOT NULL,           -- DE-11
    rrn               VARCHAR(12),                    -- DE-37
    pan_token         VARCHAR(64) NOT NULL,           -- HSM token (PCI-safe view)
    pan_enc           BYTEA       NOT NULL,           -- real PAN, AES-256-GCM (iv||ct), for clearing
    processing_code   VARCHAR(6)  NOT NULL,           -- DE-3
    txn_amount        BIGINT      NOT NULL,           -- DE-4, minor units
    txn_currency      CHAR(3)     NOT NULL,           -- DE-49
    transmission_ts   TIMESTAMP   NOT NULL,           -- DE-7
    local_txn_date    CHAR(4),                        -- DE-13 MMDD
    local_txn_time    CHAR(6),                        -- DE-12 hhmmss
    mcc               CHAR(4),                        -- DE-18
    merchant_country  CHAR(3),                        -- DE-19 (acquiring/merchant country)
    acquirer_id       VARCHAR(11),                    -- DE-32
    terminal_id       VARCHAR(8),                     -- DE-41
    acceptor_id       VARCHAR(15),                    -- DE-42
    acceptor_name_loc VARCHAR(40),                    -- DE-43
    pos_entry_mode    CHAR(3),                        -- DE-22
    network           VARCHAR(10) NOT NULL,           -- 'VISA' | 'MASTERCARD'
    response_code     CHAR(2)     NOT NULL,           -- DE-39  ('00' = approved)
    auth_id_response  VARCHAR(6),                     -- DE-38
    status            VARCHAR(12) NOT NULL DEFAULT 'APPROVED', -- APPROVED|EXPORTING|EXPORTED
    export_batch_id   VARCHAR(40),
    created_at        TIMESTAMP   NOT NULL DEFAULT now(),
    exported_at       TIMESTAMP,
    CONSTRAINT uq_capture UNIQUE (stan, transmission_ts, acquirer_id)
);

-- Migration for databases created before DE-19 capture was added (idempotent).
ALTER TABLE clearing_transaction ADD COLUMN IF NOT EXISTS merchant_country CHAR(3);

-- Partial index: the batch only ever scans the pending backlog.
CREATE INDEX IF NOT EXISTS idx_clearing_pending
    ON clearing_transaction (network)
    WHERE status = 'APPROVED';

-- =====================================================================
-- STAGE 2 — Issuer role (data model only)
-- Idempotent: safe to run on every Spring Boot startup.
-- =====================================================================

CREATE TABLE IF NOT EXISTS issuer (
    id          BIGSERIAL    PRIMARY KEY,
    bin         VARCHAR(8)   NOT NULL UNIQUE,           -- BIN/IIN émetteur (6-8 chiffres)
    name        VARCHAR(60)  NOT NULL,
    country     CHAR(3)      NOT NULL,                  -- ISO numérique pays émetteur
    network     VARCHAR(10)  NOT NULL,                  -- 'VISA' | 'MASTERCARD'
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cardholder_account (
    id            BIGSERIAL    PRIMARY KEY,
    issuer_id     BIGINT       NOT NULL REFERENCES issuer(id),
    pan_token     VARCHAR(64)  NOT NULL UNIQUE,          -- vue PCI-safe (cohérent avec clearing_transaction.pan_token)
    pan_enc       BYTEA        NOT NULL,                 -- PAN réel chiffré AES-256-GCM (même convention que clearing_transaction)
    currency      CHAR(3)      NOT NULL,                 -- devise du compte
    balance       BIGINT       NOT NULL DEFAULT 0,       -- solde en minor units
    credit_limit  BIGINT       NOT NULL DEFAULT 0,       -- plafond autorisé en minor units
    status        VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|BLOCKED|CLOSED
    created_at    TIMESTAMP    NOT NULL DEFAULT now()
    -- Pas de contrainte balance >= 0 ici : overdraft géré par la logique applicative
);

CREATE INDEX IF NOT EXISTS idx_account_issuer
    ON cardholder_account (issuer_id);

CREATE INDEX IF NOT EXISTS idx_account_pan_token
    ON cardholder_account (pan_token);

-- =====================================================================
-- STAGE 2 — Issuer posting idempotency (Réception-2)
-- Empêche la double-imputation quand l'orchestrateur rejoue les mêmes
-- fichiers de clearing. Chaque mouvement imputé est tracé dans cette
-- table avec une contrainte d'unicité (network, movement_ref, amount,
-- account_id) : si le même fichier est traité deux fois, l'INSERT
-- viole la contrainte et l'imputation est sautée (ALREADY_POSTED).
-- Idempotent : CREATE TABLE IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS posted_movement (
    id            BIGSERIAL    PRIMARY KEY,
    account_id    BIGINT       NOT NULL REFERENCES cardholder_account(id),
    network       VARCHAR(10)  NOT NULL,
    mti_or_tc     VARCHAR(8)   NOT NULL,
    amount        BIGINT       NOT NULL,
    movement_ref  VARCHAR(64)  NOT NULL,  -- raw_ref (STAN/ARN) si dispo, sinon hash SHA-256 déterministe
    sense         VARCHAR(8)   NOT NULL,  -- debit | credit
    posted_at     TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_posted_movement UNIQUE (network, movement_ref, amount, account_id)
);

CREATE INDEX IF NOT EXISTS idx_posted_movement_account
    ON posted_movement (account_id, posted_at DESC);

COMMENT ON TABLE posted_movement IS
    'Idempotency tracking for issuer clearing posting. Prevents double-imputation on replay.';
COMMENT ON COLUMN posted_movement.movement_ref IS
    'STAN/ARN from clearing file, or deterministic SHA-256 hex digest fallback (see issuer_posting.build_movement_ref). Never contains clear PAN. NOT NULL: our code always provides a value via build_movement_ref().';
