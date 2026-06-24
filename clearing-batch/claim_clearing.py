#!/usr/bin/env python3
"""
Flossx83 clearing batch — STAGE 1: connection + atomic claim ("Temps 1").

This module is intentionally scoped to *isolating* the rows a given batch run
will export. It does NOT yet write any clearing file — TC05 (Visa) and IPM
(Mastercard) generation are Stage 2 and Stage 3 and will import `claim_batch`
from here.

Design recap
------------
- Claiming is a single atomic statement: a data-modifying CTE that SELECTs the
  pending backlog with FOR UPDATE SKIP LOCKED and flips it to 'EXPORTING' in the
  same breath, RETURNING the claimed rows. This is the canonical job-queue
  pattern: no race, no double-claim across concurrent runs.
- Les lignes de classe extourse (MTI 14xx) sont exclues du présentment filaire
  par un filtre dans _CLAIM_SQL, car un reversal n'est pas un présentment.
  Elles restent en base (status APPROVED) jusqu'à ce que le générateur de
  reversal (TC 25/26/27) soit implémenté séparément.
- The rows are only marked 'EXPORTED' *after* the file is written and
  checksummed (Stage 2/3, "Temps 2"). A crash in between leaves them in
  'EXPORTING'; `requeue_stale` reverts those, so nothing is lost or duplicated.
- The real PAN lives encrypted in `pan_enc` (AES-256-GCM, iv||ct). `decrypt_pan`
  reverses the Java `ClearingPanCipher` using the SHARED key from env
  CLEARING_PAN_KEY. PANs are never printed in full.
- Chiffrement : AES-256-GCM, nonce 12 octets, pas de padding (GCM est un mode
  stream). Layout : iv(12) || ciphertext + tag(16). Clé 32 octets partagée entre
  Java et Python via CLEARING_PAN_KEY (Base64). La rotation de clé n'est pas
  encore implémentée mais le code est prêt : load_key() lit la variable
  d'environnement, un futur mécanisme pourrait versionner la clé (ex. suffixe
  _v2) et stocker l'index de version avec pan_enc.

Environment
-----------
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD   # standard libpq vars
  CLEARING_PAN_KEY                                 # Base64 of the 32-byte AES key
                                                   # (same value as the Java
                                                   # clearing.pan-encryption-key)

Usage
-----
  python3 claim_clearing.py --network VISA
  python3 claim_clearing.py --network MASTERCARD --include-today
  python3 claim_clearing.py --requeue-stale 30      # housekeeping
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
import uuid
from dataclasses import dataclass
from typing import Any

import psycopg2
import psycopg2.extras
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LEN = 12  # must match ClearingPanCipher.IV_LEN

VALID_NETWORKS = ("VISA", "MASTERCARD")


# --------------------------------------------------------------------------- #
# Connection
# --------------------------------------------------------------------------- #
def connect():
    """Open a PostgreSQL connection from standard libpq env vars."""
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=os.environ.get("PGPORT", "5432"),
        dbname=os.environ.get("PGDATABASE", "flossx83"),
        user=os.environ.get("PGUSER", "flossx83"),
        password=os.environ.get("PGPASSWORD", "flossx83"),
    )


def load_key(*, version: str = "") -> bytes:
    """Load and validate the shared AES-256 key.

    Defaults to CLEARING_PAN_KEY.  When *version* is non-empty (e.g. "v1")
    the env var is CLEARING_PAN_KEY_V1 etc.  This allows gradual key rotation
    without invalidating existing encrypted PANs — each generation of keys
    lives under its own version namespace.
    """
    suffix = f"_{version.upper()}" if version else ""
    env_key = f"CLEARING_PAN_KEY{suffix}"
    b64 = os.environ.get(env_key)
    if not b64:
        raise RuntimeError(f"{env_key} env var is required")
    raw = base64.b64decode(b64.strip())
    if len(raw) != 32:
        raise RuntimeError(
            f"{env_key} must decode to 32 bytes (AES-256); got {len(raw)}"
        )
    return raw


# --------------------------------------------------------------------------- #
# PAN crypto (mirror of Java ClearingPanCipher)
# --------------------------------------------------------------------------- #
def decrypt_pan(pan_enc: bytes | memoryview, key: bytes | None = None) -> str:
    """Reverse ClearingPanCipher: blob = iv(12) || ciphertext+tag.

    Key rotation support:
      - If pan_enc starts with a version prefix (e.g. b"v1|"), the prefix
        is stripped and the corresponding key is loaded via load_key(version=...).
      - If no prefix, *key* must be provided (backward-compatible mode).
    """
    blob = bytes(pan_enc)
    version = ""
    for sep in (b"|", b":"):
        idx = blob.find(sep)
        if idx is not None and idx > 0 and idx <= 3:
            candidate = blob[:idx].decode("ascii", errors="replace")
            if candidate.startswith("v") and candidate[1:].isdigit():
                version = candidate
                blob = blob[idx + 1:]
                break
    if version:
        key = load_key(version=version)
    if key is None:
        raise RuntimeError("no key provided and no version prefix in pan_enc")
    iv, ct = blob[:IV_LEN], blob[IV_LEN:]
    return AESGCM(key).decrypt(iv, ct, None).decode("utf-8")


def mask_pan(pan: str) -> str:
    """PCI-safe: never log more than the last 4 digits."""
    return ("*" * max(0, len(pan) - 4)) + pan[-4:] if pan else ""


# --------------------------------------------------------------------------- #
# Temps 1 — atomic claim
# --------------------------------------------------------------------------- #
_CLAIM_SQL = """
WITH claimed AS (
    SELECT id
    FROM clearing_transaction
    WHERE status = 'APPROVED'
      AND response_code = '00'
      AND network = %(network)s
      AND substring(mti from 2 for 1) <> '4'  -- exclut la classe extourse (14xx) du présentment ;
                                               -- le reversal (TC 25/26/27) sera traité séparément
      {day_filter}
    ORDER BY id
    FOR UPDATE SKIP LOCKED
)
UPDATE clearing_transaction t
SET status = 'EXPORTING',
    export_batch_id = %(batch_id)s
FROM claimed
WHERE t.id = claimed.id
RETURNING t.*;
"""


@dataclass
class ClaimResult:
    batch_id: str
    network: str
    rows: list[dict[str, Any]]

    @property
    def count(self) -> int:
        return len(self.rows)


def claim_batch(
    conn,
    network: str,
    *,
    include_today: bool = False,
    batch_id: str | None = None,
) -> ClaimResult:
    """
    Atomically claim the pending APPROVED rows for `network` and flip them to
    EXPORTING under a fresh batch_id. Commits on success.

    Returns the claimed rows (as dicts) for the file generator to consume.
    Decryption of pan_enc is left to the caller (Stage 2/3) via `decrypt_pan`.
    """
    if network not in VALID_NETWORKS:
        raise ValueError(f"network must be one of {VALID_NETWORKS}, got {network!r}")

    batch_id = batch_id or uuid.uuid4().hex
    # Only compensate fully-closed days unless explicitly told otherwise.
    day_filter = "" if include_today else "AND transmission_ts < date_trunc('day', now())"
    sql = _CLAIM_SQL.format(day_filter=day_filter)

    with conn:  # transaction: commit on clean exit, rollback on exception
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"network": network, "batch_id": batch_id})
            rows = cur.fetchall()

    return ClaimResult(batch_id=batch_id, network=network, rows=[dict(r) for r in rows])


_CLAIM_REVERSAL_SQL = """
WITH claimed AS (
    SELECT id
    FROM clearing_transaction
    WHERE status = 'CANCELLED'
      AND network = %(network)s
      {day_filter}
    ORDER BY id
    FOR UPDATE SKIP LOCKED
)
UPDATE clearing_transaction t
SET status = 'EXPORTING',
    export_batch_id = %(batch_id)s
FROM claimed
WHERE t.id = claimed.id
RETURNING t.*;
"""


def claim_reversals(
    conn,
    network: str,
    *,
    include_today: bool = False,
    batch_id: str | None = None,
) -> ClaimResult:
    """
    Atomically claim CANCELLED rows for `network` and flip them to EXPORTING
    under a fresh batch_id. These are then rendered as reversal messages
    (TC 25/26/27 for Visa, PDS 0025="R" for Mastercard).

    Returns the claimed rows for the file generator to consume.
    """
    if network not in VALID_NETWORKS:
        raise ValueError(f"network must be one of {VALID_NETWORKS}, got {network!r}")

    batch_id = batch_id or uuid.uuid4().hex
    day_filter = "" if include_today else "AND transmission_ts < date_trunc('day', now())"
    sql = _CLAIM_REVERSAL_SQL.format(day_filter=day_filter)

    with conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"network": network, "batch_id": batch_id})
            rows = cur.fetchall()

    return ClaimResult(batch_id=batch_id, network=network, rows=[dict(r) for r in rows])


def ensure_writable_dir(path: str) -> bool:
    """Pre-flight check: make `path` and confirm we can actually write a file in
    it. Returns True if writable, False otherwise (the caller logs an alert and
    must NOT claim rows it cannot write out). We do a real probe write rather
    than trusting os.access(), which can lie on some filesystems (NFS, ACLs).
    """
    try:
        os.makedirs(path, exist_ok=True)
        probe = os.path.join(path, f".write_probe_{uuid.uuid4().hex}")
        with open(probe, "wb") as f:
            f.write(b"\0")
        os.remove(probe)
        return True
    except OSError:
        return False


def confirm_exported(conn, batch_id: str) -> int:
    """
    Temps 2: once the clearing file has been written AND checksummed, flip the
    claimed rows from EXPORTING to EXPORTED. Returns the number of rows updated.
    Must only be called after the file is safely on disk.
    """
    sql = """
        UPDATE clearing_transaction
        SET status = 'EXPORTED', exported_at = now()
        WHERE export_batch_id = %(batch_id)s AND status = 'EXPORTING'
    """
    with conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"batch_id": batch_id})
            return cur.rowcount


def requeue_stale(conn, older_than_minutes: int = 30) -> int:
    """
    Housekeeping: revert rows stuck in EXPORTING (a batch crashed before
    confirming) back to APPROVED so the next run picks them up. Returns the
    number of rows requeued.
    """
    sql = """
        UPDATE clearing_transaction
        SET status = 'APPROVED', export_batch_id = NULL
        WHERE status = 'EXPORTING'
          AND created_at < now() - (%(mins)s || ' minutes')::interval
    """
    with conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"mins": older_than_minutes})
            return cur.rowcount


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Flossx83 clearing — Stage 1 atomic claim")
    p.add_argument("--network", choices=VALID_NETWORKS,
                   help="Scheme to claim rows for.")
    p.add_argument("--include-today", action="store_true",
                   help="Also claim today's (not-yet-closed) transactions.")
    p.add_argument("--requeue-stale", type=int, metavar="MINUTES",
                   help="Housekeeping mode: requeue EXPORTING rows older than N minutes, then exit.")
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    conn = connect()
    try:
        if args.requeue_stale is not None:
            n = requeue_stale(conn, args.requeue_stale)
            print(f"[CLEARING] requeued {n} stale EXPORTING row(s)")
            return 0

        if not args.network:
            print("error: --network is required (or use --requeue-stale)", file=sys.stderr)
            return 2

        key = load_key()  # validate key early; Stage 2/3 will use it to decrypt
        result = claim_batch(conn, args.network, include_today=args.include_today)

        print(f"[CLEARING] batch_id={result.batch_id} network={result.network} "
              f"claimed={result.count} row(s)")
        # Sanity-check decryption on the first row only, masked. (Stage 2 decrypts all.)
        if result.rows:
            sample = decrypt_pan(result.rows[0]["pan_enc"], key)
            print(f"[CLEARING] sample PAN (masked): {mask_pan(sample)} "
                  f"STAN={result.rows[0]['stan']} amount={result.rows[0]['txn_amount']}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
