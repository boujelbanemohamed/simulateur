#!/usr/bin/env python3
"""
Generate test rows for the clearing_transaction table.

It encrypts each PAN with CLEARING_PAN_KEY exactly the way the Java
ClearingPanCipher does (AES-256-GCM, blob = iv(12) || ciphertext+tag), so the
clearing batch can later decrypt pan_enc and build real files. No cleartext PAN
is ever written to the SQL — only the encrypted bytea.

Usage:
    export CLEARING_PAN_KEY="...the same Base64 key as the batch/switch..."
    python3 make_test_data.py                  # print INSERTs to stdout
    python3 make_test_data.py --out test_data.sql
    # then:  psql flossx83 -f test_data.sql

Notes:
  * transmission_ts is set to ~yesterday so the orchestrator picks the rows up
    by default (it only exports fully-closed days unless --include-today).
  * Each row has a distinct (stan, transmission_ts, acquirer_id) to satisfy the
    uq_capture unique constraint.
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LEN = 12  # must match ClearingPanCipher / claim_clearing


def load_key() -> bytes:
    b64 = os.environ.get("CLEARING_PAN_KEY")
    if not b64:
        sys.exit("error: CLEARING_PAN_KEY env var is required (same value as the batch)")
    raw = base64.b64decode(b64.strip())
    if len(raw) != 32:
        sys.exit(f"error: CLEARING_PAN_KEY must decode to 32 bytes, got {len(raw)}")
    return raw


def encrypt_pan(pan: str, key: bytes) -> bytes:
    """Mirror of Java ClearingPanCipher.encrypt: iv(12) || ciphertext+tag."""
    iv = os.urandom(IV_LEN)
    return iv + AESGCM(key).encrypt(iv, pan.encode("utf-8"), None)


def bytea_hex(blob: bytes) -> str:
    """PostgreSQL bytea hex input literal: '\\xDEADBEEF'."""
    return "\\x" + blob.hex()


# Sample transactions (clear PANs live ONLY here, never in the output SQL).
SAMPLES = [
    # network, pan, amount(minor), currency, proc, mcc, acquirer, terminal,
    # acceptor_id, name_loc, country, pos_entry, auth, stan, rrn
    ("VISA", "4111111111111111", 1550, "788", "000000", "5812", "40010001234",
     "10000001", "000000000012345", "CAFE DE PARIS TUNIS", "788", "051", "A1B2C3", "100001", "412345600001"),
    ("VISA", "4532015112830366", 250000, "788", "000000", "7011", "40010001234",
     "10000002", "000000000067890", "HOTEL LAICO TUNIS", "788", "071", "B7K2P0", "100002", "412345600002"),
    ("MASTERCARD", "5413330089020011", 4999, "788", "000000", "5411", "40010005678",
     "20000001", "000000000054321", "CARREFOUR LA MARSA", "788", "051", "MC1234", "200001", "512345600001"),
    ("MASTERCARD", "2223000048400011", 120000, "788", "000000", "5999", "40010005678",
     "20000002", "000000000099999", "TUNISIE TELECOM", "788", "012", "MC5678", "200002", "512345600002"),
]


def build_inserts(key: bytes) -> str:
    ts = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    local_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%m%d")
    lines = [
        "-- Test data for clearing_transaction (status APPROVED, response_code '00').",
        "-- pan_enc is AES-256-GCM with your CLEARING_PAN_KEY; regenerate if the key changes.",
        "BEGIN;",
    ]
    for (network, pan, amount, ccy, proc, mcc, acq, term, accid, nameloc,
         country, pos, auth, stan, rrn) in SAMPLES:
        enc = bytea_hex(encrypt_pan(pan, key))
        token = "TKN" + pan[-4:]
        lines.append(
            "INSERT INTO clearing_transaction "
            "(mti, stan, rrn, pan_token, pan_enc, processing_code, txn_amount, "
            "txn_currency, transmission_ts, local_txn_date, local_txn_time, mcc, "
            "merchant_country, acquirer_id, terminal_id, acceptor_id, "
            "acceptor_name_loc, pos_entry_mode, network, response_code, "
            "auth_id_response, status, created_at) VALUES ("
            f"'0210', '{stan}', '{rrn}', '{token}', '{enc}', '{proc}', {amount}, "
            f"'{ccy}', '{ts}', '{local_date}', '103000', '{mcc}', "
            f"'{country}', '{acq}', '{term}', '{accid}', "
            f"'{nameloc}', '{pos}', '{network}', '00', "
            f"'{auth}', 'APPROVED', now());"
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Generate clearing_transaction test rows")
    p.add_argument("--out", help="Write SQL to this file instead of stdout")
    args = p.parse_args(argv)

    key = load_key()
    sql = build_inserts(key)
    if args.out:
        with open(args.out, "w") as f:
            f.write(sql)
        print(f"wrote {args.out} ({len(SAMPLES)} rows: "
              f"{sum(1 for s in SAMPLES if s[0]=='VISA')} VISA, "
              f"{sum(1 for s in SAMPLES if s[0]=='MASTERCARD')} MASTERCARD)")
    else:
        sys.stdout.write(sql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
