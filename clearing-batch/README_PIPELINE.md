# Flossx83 Offline Clearing Engine

Off-line clearing for the Flossx83 monetics simulator: approved transactions are
captured (encrypted) by the Java switch into PostgreSQL, then a nightly Python
batch claims them atomically and emits industry-format clearing files —
**Visa BASE II CTF** (fixed 168-char records) and **Mastercard IPM** (binary,
RDW + 1014 blocking) — before marking them exported.

## Project layout

```
flossx83-clearing/
├── java-switch-patches/          # apply onto the Flossx83 java-switch module
│   ├── ClearingTransaction.java      # JPA entity (incl. merchant_country / DE-19)
│   ├── ClearingCaptureService.java   # capture: filter DE-39=00, encrypt PAN, persist
│   └── schema.sql                    # table + partial index + idempotent ALTER
└── clearing-batch/               # standalone Python batch
    ├── requirements.txt
    ├── claim_clearing.py             # connect, claim (Temps 1), confirm (Temps 2),
    │                                 # requeue_stale, ensure_writable_dir, decrypt_pan
    ├── visa_clearing_generator.py    # TC90 -> [TC05… + TC91]* -> TC92  (multi-batch)
    ├── mastercard_clearing_generator.py # 1644 hdr -> 1240* -> 1644 trailer (recon PDS)
    ├── clearing_orchestrator.py      # nightly cron driver
    ├── test_clearing_suite.py        # 11 DB-free conformance tests
    └── README_PIPELINE.md            # this file
```

### Java integration note

`java-switch-patches/` contains the files changed by the final DE-19 refactor.
A complete switch build also needs these companion files (delivered earlier,
unchanged): `ClearingPanCipher.java`, `ClearingTransactionRepository.java`, the
patched `IsoMessageController.java`, plus `pom.xml` (JPA + PostgreSQL driver
re-enabled) and `application.properties` (datasource + `clearing.pan-encryption-key`).

## Lifecycle guarantee

`APPROVED → EXPORTING (atomic claim) → EXPORTED (after file written + checksummed)`.
The claim uses `FOR UPDATE SKIP LOCKED`; the unique constraint
`uq_capture (stan, transmission_ts, acquirer_id)` blocks double-capture; and
`requeue_stale()` recovers rows stranded by a crash — so no transaction is ever
exported twice or silently lost.

## Environment

```bash
# Shared with the Java switch property clearing.pan-encryption-key — REQUIRED.
# Same Base64 32-byte key on both sides (AES-256-GCM PAN-at-rest).
export CLEARING_PAN_KEY="$(openssl rand -base64 32)"

# PostgreSQL (standard libpq vars)
export PGHOST=localhost PGPORT=5432 PGDATABASE=flossx83 PGUSER=flossx83 PGPASSWORD=flossx83

# Optional knobs
export CLEARING_OUTBOUND_ROOT=/outbound/clearing
export CLEARING_STALE_MINUTES=720          # requeue EXPORTING older than this
export CLEARING_MERCHANT_COUNTRY=788        # Visa TC05 fallback when DE-19 absent
export VISA_SENDING_ID=000000 VISA_RECEIVING_ID=000000
export MC_TERMINAL_TYPE="  Z" MC_TCC=T MC_TXN_ENV=0
```

## Install & run

```bash
cd clearing-batch
pip install -r requirements.txt

# Full nightly run: pre-flight write check -> housekeeping -> Visa -> Mastercard
python3 clearing_orchestrator.py

# Individual schemes (each: pre-flight -> claim -> generate -> verify -> confirm)
python3 visa_clearing_generator.py       --out-dir ./out [--batch-size N] [--no-confirm]
python3 mastercard_clearing_generator.py --out-dir ./out [--unblocked] [--no-confirm]

# Housekeeping only
python3 claim_clearing.py --requeue-stale 30

# Conformance tests (no database required)
python3 -m unittest test_clearing_suite -v        # or: pytest test_clearing_suite.py -v
```

## Output

```
/<outbound-root>/<YYYY-MM-DD>/VISA_CTF_<date>_<batch>.dat (+ .sha256)
/<outbound-root>/<YYYY-MM-DD>/MC_IPM_<date>_<batch>.ipm  (+ .sha256)
```

## Cron (02:30 nightly)

```cron
30 2 * * *  CLEARING_PAN_KEY=... PGHOST=... PGPASSWORD=... \
    /usr/bin/python3 /opt/flossx83/clearing-batch/clearing_orchestrator.py \
    >> /var/log/flossx83/clearing.log 2>&1
```

The orchestrator returns non-zero if any phase fails, so the scheduler can alert.

## Format notes (verify against issuer manuals before production)

* **Visa**: file uses TC90 header / TC91 batch trailers / TC92 file trailer
  (there is no TC99 in BASE II). Amounts are minor units, right-justified,
  zero-filled, no decimal point. PAN is left in the 16-char account field with a
  3-char extension for 19-digit PANs.
* **Mastercard**: file trailer (1644 / DE24 696) carries control totals as
  DE-48 PDS — `PDS0301` (amount checksum, 16n), `PDS0306` (message count),
  `PDS0105` (file identification). The TCC subelement (`PDS_TCC` constant) and
  the exact PDS widths should be confirmed against the IPM Clearing Formats
  manual. Crypto keys here are lab/demo grade — use a real KMS/HSM in production.
