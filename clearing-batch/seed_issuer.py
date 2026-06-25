#!/usr/bin/env python3
"""Seed un émetteur + un compte porteur de test (PAN chiffré avec CLEARING_PAN_KEY).
Usage:  source ~/flossx83_env.sh && python3 seed_issuer.py
Le compte : PAN 4111111111111111, solde 0, plafond 100000 (=1000.00), devise 788, ACTIVE.
"""
import os, sys, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import psycopg2

def load_key() -> bytes:
    b64 = os.environ.get("CLEARING_PAN_KEY")
    if not b64:
        sys.exit("error: CLEARING_PAN_KEY env var required (same as switch)")
    raw = base64.b64decode(b64)
    if len(raw) != 32:
        sys.exit(f"error: key must be 32 bytes, got {len(raw)}")
    return raw

def encrypt_pan(pan: str, key: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, pan.encode("utf-8"), None)

PAN = "4111111111111111"
key = load_key()
enc = encrypt_pan(PAN, key)
token = "TKN" + PAN[-4:]

conn = psycopg2.connect(
    host=os.environ.get("PGHOST", "localhost"),
    port=os.environ.get("PGPORT", "5432"),
    dbname=os.environ.get("PGDATABASE", "flossx83"),
    user=os.environ.get("PGUSER", os.environ.get("USER")),
    password=os.environ.get("PGPASSWORD", ""),
)
cur = conn.cursor()
cur.execute(
    "INSERT INTO issuer (bin, name, country, network) "
    "VALUES ('411111', 'Test Issuer Bank', '788', 'VISA') "
    "ON CONFLICT (bin) DO UPDATE SET name = EXCLUDED.name RETURNING id"
)
issuer_id = cur.fetchone()[0]
cur.execute(
    "INSERT INTO cardholder_account "
    "(issuer_id, pan_token, pan_enc, currency, balance, credit_limit, status) "
    "VALUES (%s, %s, %s, '788', 0, 100000, 'ACTIVE') "
    "ON CONFLICT (pan_token) DO UPDATE SET pan_enc = EXCLUDED.pan_enc, "
    "balance = EXCLUDED.balance, credit_limit = EXCLUDED.credit_limit, "
    "status = EXCLUDED.status",
    (issuer_id, token, enc),
)
conn.commit()
print(f"OK: issuer id={issuer_id}, account PAN {PAN[:6]}...{PAN[-4:]}, "
      f"balance=0, credit_limit=100000 (1000.00), ACTIVE")
