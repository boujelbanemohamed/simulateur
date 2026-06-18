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
