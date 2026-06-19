#!/usr/bin/env python3
"""
Flossx83 clearing batch — STAGE 3: Mastercard IPM generator.

Consumes the rows isolated by `claim_batch(conn, 'MASTERCARD')` (Stage 1) and
writes a Mastercard IPM file: a BINARY, blocked ISO 8583 file.

Binary structure (VBM / RDW / 1014 blocking)
--------------------------------------------
Each ISO 8583 message is prefixed by a 4-byte big-endian length (the RDW /
Record Descriptor Word); the stream is terminated by a zero-length record; and
the whole thing is wrapped in 1014-byte blocks (1012 data bytes + two 0x40 pad
bytes per block). This is exactly the logic in the provided `cardutil.java`
`MciIpm` (Block1014OutputStream / VbsWriter). We use the upstream Python
`cardutil` library (`cardutil.mciipm.IpmWriter(..., blocked=True)`), which the
Java version is a direct port of, so the byte layout is identical.

File envelope
-------------
    MTI 1644  File Header   (DE24 function code = 697)
    MTI 1240  First Presentment (one per approved Mastercard transaction)
    MTI 1644  File Trailer  (DE24 function code = 695) — carries control totals

DE-48 (Private Data) — PDS / TLV
-------------------------------
DE-48 is built from Private Data Subelements (PDS). Each PDS is encoded as
``tag(4n) + length(3n) + value`` and the PDSs are concatenated — the format
implemented by `Mastercard_Parsing`'s `_pds_to_de`, and the same one cardutil
uses: any ``PDSxxxx`` key in the message dict is rolled up into DE-48
automatically. We populate the terminal/environment subelements used for first
presentment and expose `extra_pds` so callers can add any tag.

Field mapping (per spec request)
-------------------------------
    DE2  <- decrypt_pan(pan_enc)          DE3  <- processing_code
    DE4  <- txn_amount (minor units, int) DE49 <- txn_currency
    DE24 <- function code (200 presentment / 697 header / 695 trailer)
    DE71 <- sequential message number
    DE48 <- PDS subelements (terminal type, transaction environment, TCC*)

* See the note on TCC in build_de48(): the Transaction Category Code placement
  varies across Mastercard spec versions; the tag used here is a documented,
  configurable constant to verify against your IPM Clearing Formats manual.

  --- Analyse crédit/débit pour remboursement (ajout étape 2) ---
  Le générateur Mastercard actuel ne porte PAS d'indicateur explicite de sens
  (crédit/débit). Le DE-4 (montant) est toujours un entier positif ; le DE-24
  (function code) est toujours 200 (First Presentment). Les PDS de
  réconciliation (PDS0301 / amount checksum, PDS0306 / message count) sont des
  cumuls non signés.

  Pour distinguer un remboursement en Mastercard, il faudrait au minimum :
    a) basculer sur un function code crédit (201 — Credit Voucher
       Presentment) dans DE-24, ou
    b) ajouter un indicateur C/D dans un PDS dédié (tag à confirmer dans la
       spec IPM Clearing Formats).

  Risques :
    - cardutil/IpmWriter construit le message à partir du dict Python ; ajouter
      un champ DE-24 différent ou un PDS supplémentaire n'est PAS cassant pour
      le format binaire (le TLV gère la taille variable, le bloquage 1014 reste
      correct automatiquement).
    - En revanche, le sens attendu par le récepteur (via le réseau Mastercard)
      n'est pas documenté dans les sources disponibles pour ce simulateur.
      Modifier DE-24 sans spec fiable risquerait de produire un fichier rejeté
      par le downstream.

  Décision pour l'étape 1 : NE PAS modifier le générateur Mastercard. Le
  remboursement sera traité dans une étape séparée quand les valeurs exactes
  (DE-24 201 vs PDS dédié) seront confirmées par la documentation réseau
  réelle.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import sys
from datetime import datetime, timezone
from typing import Any

from cardutil.mciipm import IpmWriter, IpmReader

from claim_clearing import (
    connect,
    load_key,
    decrypt_pan,
    mask_pan,
    claim_batch,
    confirm_exported,
    ensure_writable_dir,
)

# MTI / function codes
MTI_PRESENTMENT = "1240"      # First Presentment
MTI_FILE_CONTROL = "1644"     # File Header / Trailer (Advice)
FUNC_PRESENTMENT = "200"      # DE24 — First Presentment, full
FUNC_FILE_HEADER = "697"      # DE24 — File header
FUNC_FILE_TRAILER = "695"     # DE24 — File trailer

# DE-48 PDS tags (numeric, 4 digits). Names per Mastercard_Parsing decoding.
PDS_TERMINAL_TYPE = "0023"    # Terminal Type
PDS_TXN_ENV = "0165"          # transaction environment / settlement indicator
PDS_TCC = "0052"              # *Transaction Category indicator — VERIFY vs spec


# --------------------------------------------------------------------------- #
# DE-48 builder
# --------------------------------------------------------------------------- #
def build_de48(*, terminal_type: str, tcc: str, txn_env: str,
               extra_pds: dict[str, str] | None = None) -> dict[str, str]:
    """
    Return a dict of PDSxxxx keys. cardutil serialises each into DE-48 as
    tag(4) + length(3) + value, concatenated (PDS / TLV).

    Note on TCC: the legacy single-character Transaction Category Code does not
    have one fixed home across IPM spec versions (legacy standalone vs DE-48 PDS
    vs EMV tag 9F53 inside DE-55). PDS_TCC is therefore a documented, swappable
    constant — confirm the correct subelement against your IPM Clearing manual
    before production use.
    """
    pds: dict[str, str] = {
        f"PDS{PDS_TERMINAL_TYPE}": terminal_type,
        f"PDS{PDS_TXN_ENV}": txn_env,
        f"PDS{PDS_TCC}": tcc,
    }
    if extra_pds:
        for tag, value in extra_pds.items():
            tag = tag[3:] if tag.upper().startswith("PDS") else tag
            pds[f"PDS{int(tag):04d}"] = value
    return pds


# --------------------------------------------------------------------------- #
# Message builders
# --------------------------------------------------------------------------- #
def build_presentment(row: dict[str, Any], pan: str, msg_number: int, *,
                      terminal_type: str, tcc: str, txn_env: str) -> dict[str, Any]:
    """Build one MTI 1240 First Presentment message dict for cardutil."""
    if not (pan.isdigit() and 13 <= len(pan) <= 19):
        raise ValueError(f"invalid PAN length for STAN={row.get('stan')}")

    msg: dict[str, Any] = {
        "MTI": MTI_PRESENTMENT,
        "DE2": pan,                                   # PAN (LLVAR)
        "DE3": (row.get("processing_code") or "000000")[:6].rjust(6, "0"),
        "DE4": int(row["txn_amount"]),                # minor units, no decimal point
        "DE24": FUNC_PRESENTMENT,                     # function code
        "DE49": (row.get("txn_currency") or "000")[:3].rjust(3, "0"),
        "DE71": msg_number,                           # sequential message number
    }
    # DE-48 private data (rolled up from PDS keys by cardutil)
    msg.update(build_de48(terminal_type=terminal_type, tcc=tcc, txn_env=txn_env))
    return msg


# Reconciliation PDS tags for the 1644 file trailer (per Mastercard_Parsing /
# IPM_IncomingTrailer mapping):
#   PDS0105 = File identification: fileType(3) + refDate(6 YYMMDD) + procId(11) + fileSeq(5)
#   PDS0301 = File amount checksum (16n, 2 implied decimals)
#   PDS0306 = File message count
PDS_FILE_ID = "0105"
PDS_AMOUNT_CHECKSUM = "0301"
PDS_MESSAGE_COUNT = "0306"


def build_file_header(msg_number: int, created: datetime) -> dict[str, Any]:
    return {
        "MTI": MTI_FILE_CONTROL,
        "DE24": FUNC_FILE_HEADER,
        "DE71": msg_number,
    }


def build_file_trailer(msg_number: int, presentment_count: int, amount_total: int, *,
                       created: datetime, file_type: str = "000",
                       processor_id: str = "00000000000",
                       file_seq: str = "00001") -> dict[str, Any]:
    """
    MTI 1644 / DE24 695 file trailer.

    Control totals are now carried OFFICIALLY as DE-48 PDS (TLV) rather than in
    DE-4/DE-71:
        PDS0105 file identification, PDS0301 amount checksum, PDS0306 message count.
    DE-71 is kept only as this record's own sequential message number (its
    legitimate meaning), not as a total.
    """
    pds0105 = (
        file_type[:3].rjust(3, "0")
        + created.strftime("%y%m%d")
        + processor_id[:11].rjust(11, "0")
        + file_seq[:5].rjust(5, "0")
    )  # 3 + 6 + 11 + 5 = 25
    return {
        "MTI": MTI_FILE_CONTROL,
        "DE24": FUNC_FILE_TRAILER,
        "DE71": msg_number,                            # sequential msg number (not a total)
        f"PDS{PDS_FILE_ID}": pds0105,                  # file identification
        f"PDS{PDS_AMOUNT_CHECKSUM}": f"{int(amount_total):016d}",  # cumulative amount (16n)
        f"PDS{PDS_MESSAGE_COUNT}": f"{int(presentment_count):08d}",  # message count
    }


# --------------------------------------------------------------------------- #
# Assembly  (pure, testable: returns the raw blocked IPM bytes + totals)
# --------------------------------------------------------------------------- #
def generate_ipm_bytes(rows: list[dict[str, Any]], key: bytes, *,
                       terminal_type: str, tcc: str, txn_env: str,
                       created: datetime | None = None,
                       blocked: bool = True,
                       file_type: str = "000", processor_id: str = "00000000000",
                       file_seq: str = "00001") -> tuple[bytes, int, int]:
    """rows -> (ipm_bytes, presentment_count, amount_total)."""
    created = created or datetime.now(timezone.utc)
    buf = io.BytesIO()
    amount_total = 0
    seq = 1

    writer = IpmWriter(buf, blocked=blocked)
    writer.write(build_file_header(seq, created))     # MTI 1644 header
    for row in rows:
        seq += 1
        pan = decrypt_pan(row["pan_enc"], key)
        writer.write(build_presentment(row, pan, seq,
                                       terminal_type=terminal_type, tcc=tcc, txn_env=txn_env))
        amount_total += int(row["txn_amount"])
    count = len(rows)
    seq += 1
    writer.write(build_file_trailer(                  # MTI 1644 trailer (recon PDS)
        seq, count, amount_total, created=created,
        file_type=file_type, processor_id=processor_id, file_seq=file_seq))
    writer.close()                                    # zero-length terminator + final block

    return buf.getvalue(), count, amount_total


def write_ipm_file(data: bytes, out_dir: str, batch_id: str) -> tuple[str, str]:
    """Write the .ipm + a .sha256 sidecar. Returns (file_path, sha_hex)."""
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(out_dir, f"MC_IPM_{stamp}_{batch_id[:8]}.ipm")
    with open(path, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    sha = hashlib.sha256(data).hexdigest()
    with open(path + ".sha256", "w") as f:
        f.write(f"{sha}  {os.path.basename(path)}\n")
    return path, sha


def verify_ipm(data: bytes, *, blocked: bool = True) -> tuple[int, str | None]:
    """Re-read the bytes with cardutil to prove the file is well-formed.
    Returns (record_count, first_presentment_mti)."""
    reader = IpmReader(io.BytesIO(data), blocked=blocked)
    records = list(reader)
    first_1240 = next((r.get("MTI") for r in records if r.get("MTI") == MTI_PRESENTMENT), None)
    return len(records), first_1240


# --------------------------------------------------------------------------- #
# Orchestration: claim -> write -> verify -> confirm (Temps 2)
# --------------------------------------------------------------------------- #
def run(out_dir: str, *, terminal_type: str, tcc: str, txn_env: str,
        include_today: bool, blocked: bool, confirm: bool,
        file_type: str = "000", processor_id: str = "00000000000",
        file_seq: str = "00001") -> int:
    # Pre-flight: never claim rows we cannot write out. Alert BEFORE touching DB.
    if not ensure_writable_dir(out_dir):
        print(f"[MC] ALERT: output directory not writable, skipping claim: {out_dir}")
        return 2

    conn = connect()
    try:
        key = load_key()
        result = claim_batch(conn, "MASTERCARD", include_today=include_today)
        if result.count == 0:
            print("[MC] nothing to export (no pending APPROVED Mastercard rows)")
            return 0

        data, count, amount_total = generate_ipm_bytes(
            result.rows, key, terminal_type=terminal_type, tcc=tcc,
            txn_env=txn_env, blocked=blocked,
            file_type=file_type, processor_id=processor_id, file_seq=file_seq)

        # Invariant: a 1014-blocked file is an exact multiple of 1014 bytes.
        if blocked and len(data) % 1014 != 0:
            raise RuntimeError(f"blocked IPM size {len(data)} is not a multiple of 1014")

        # Round-trip sanity: cardutil must be able to read what we wrote.
        n_records, first_mti = verify_ipm(data, blocked=blocked)
        expected = count + 2  # header + presentments + trailer
        if n_records != expected:
            raise RuntimeError(f"re-read {n_records} records, expected {expected}")

        path, sha = write_ipm_file(data, out_dir, result.batch_id)
        print(f"[MC] wrote {path}")
        print(f"[MC] records: 1 header(1644) + {count} presentment(1240) + 1 trailer(1644) "
              f"= {n_records} | blocked={blocked} bytes={len(data)}")
        print(f"[MC] amount_total(minor units)={amount_total} | sha256={sha[:16]}…")

        if confirm:
            n = confirm_exported(conn, result.batch_id)
            print(f"[MC] Temps 2: marked {n} row(s) EXPORTED (batch {result.batch_id})")
        else:
            print(f"[MC] --no-confirm: rows left in EXPORTING (batch {result.batch_id})")

        sample = decrypt_pan(result.rows[0]["pan_enc"], key)
        print(f"[MC] sample: PAN {mask_pan(sample)} STAN={result.rows[0]['stan']}")
        return 0
    finally:
        conn.close()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Flossx83 — Mastercard IPM generator (Stage 3)")
    p.add_argument("--out-dir", default="./out")
    p.add_argument("--terminal-type", default="  Z", help="DE48 PDS0023 Terminal Type")
    p.add_argument("--tcc", default="T", help="Transaction Category indicator (see build_de48 note)")
    p.add_argument("--txn-env", default="0", help="DE48 transaction environment / settlement indicator")
    p.add_argument("--include-today", action="store_true")
    p.add_argument("--unblocked", action="store_true", help="Write without 1014 blocking (testing only)")
    p.add_argument("--no-confirm", action="store_true", help="Build + write but skip Temps 2")
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    return run(args.out_dir,
               terminal_type=args.terminal_type, tcc=args.tcc, txn_env=args.txn_env,
               include_today=args.include_today,
               blocked=not args.unblocked,
               confirm=not args.no_confirm)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
