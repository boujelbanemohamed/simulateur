#!/usr/bin/env python3
"""
Flossx83 clearing batch — STAGE 2: Visa BASE II CTF generator.

Consumes the rows isolated by `claim_batch(conn, 'VISA')` (Stage 1) and writes a
Visa BASE II Clearing Transaction File (CTF): an ASCII, fixed-length,
**168-bytes-per-record** file, positional (no bitmaps, no LLVAR).

File envelope
-------------
    TC 90   File Header          (1 record)
    TC 05   First Presentment    (1 per approved Visa purchase)            -- TCR 0
    TC 06   Credit Voucher       (1 per approved Visa refund)              -- TCR 0 (même layout)
    TC 07   Cash Disbursement    (1 per approved Visa ATM withdrawal)      -- TCR 0 (même layout)
    TC 92   File Trailer         (1 record: count + hash total)

Offsets are taken from the provided reference repos:
  * TC 05 / TCR 0  -> SCHEMAS.TCR0_DRAFT in Visa-Base-II-parser-CTF/index.html
  * TC 92 / TCR 0  -> CTF_Data_Dictionary.docx, section "Batch / File Trailers"
  * TC 90          -> only defined at the TC-code level in the spec (the parser
                     treats it as GENERIC), so the header layout below is a
                     documented, lab-reasonable envelope, NOT an authoritative
                     positional spec. Adjust to your host's header contract.

Padding rules (monétique)
--------------------------
  * numeric fields  -> right-justified, zero-filled, NO decimal point
                       (amounts are already stored in minor units as integers).
                       Overflow raises -- we never silently truncate a PAN or an
                       amount.
  * alpha fields    -> left-justified, space-filled (truncated if too long).

Note: TC99 is intentionally NOT used. In BASE II the file trailer carrying the
record count and the cumulative ("hash") amount is TC92; TC99 is not a defined
record. If a downstream host genuinely expects a literal "99", change
TRAILER_TC below.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import datetime, timezone
from typing import Any

# Stage 1 lifecycle model (claim / confirm / housekeeping).
from claim_clearing import (
    connect,
    load_key,
    decrypt_pan,
    mask_pan,
    claim_batch,
    confirm_exported,
    ensure_writable_dir,
)

RECORD_LEN = 168
HEADER_TC = "90"
DRAFT_TC = "05"          # First Presentment, Sales Draft (purchase default)
REFUND_TC = "06"         # Credit Voucher / Refund (also TCR-0, same 168-byte layout)
CASH_TC = "07"           # Cash Disbursement / ATM withdrawal (also TCR-0, same 168-byte layout)
REVERSAL_SALE_TC = "25"  # Sales Draft Reversal (annulation achat)
REVERSAL_REFUND_TC = "26"  # Credit Voucher Reversal (annulation remboursement)
REVERSAL_CASH_TC = "27"  # Cash Disbursement Reversal (annulation retrait)
BATCH_TC = "91"          # Batch Trailer
TRAILER_TC = "92"        # File Trailer (NOT 99 -- see module docstring)
ARN_MODE = "0"           # ARN position 1 (acquirer processing mode)

# --------------------------------------------------------------------------- #
# Transaction-type classification from DE-3 processing code.
# Convention du simulateur : les 2 premiers chiffres du processing_code
# indiquent le type. Ces valeurs sont réseau-spécifiques (Visa, Mastercard…)
# et ne sont pas normatives ISO 8583.
# --------------------------------------------------------------------------- #
def _txn_type_from_pc(processing_code: str) -> str:
    """
    Return 'purchase', 'refund', 'withdrawal', or 'purchase' (default).

    DE-3 first 2 digits: 00=purchase, 01=withdrawal, 12=cash advance (TC07),
    09=cashback (TC05), 20=refund.
    Le cashback (09) reste en TC 05 (achat) ; le DE-54 n'est pas séparé dans
    le TCR 0 actuel (réserve simulateur — le montant total DE-4 inclut le
    cashback dans le présentment Visa).
    """
    prefix = (processing_code or "000000")[:2]
    if prefix == "20":
        return "refund"
    if prefix in ("01", "12"):
        return "withdrawal"
    return "purchase"


# --------------------------------------------------------------------------- #
# Field formatting primitives
# --------------------------------------------------------------------------- #
def numeric(value: Any, length: int) -> str:
    """Right-justified, zero-filled, no sign, no decimal point."""
    s = str(value if value is not None else "").strip()
    if s == "":
        s = "0"
    if not s.isdigit():
        # keep only digits (e.g. currency stored as '788 ')
        s = "".join(ch for ch in s if ch.isdigit()) or "0"
    if len(s) > length:
        raise ValueError(f"numeric overflow: {s!r} does not fit in {length} chars")
    return s.rjust(length, "0")


def alpha(value: Any, length: int) -> str:
    """Left-justified, space-filled, truncated to length."""
    s = "" if value is None else str(value)
    return s[:length].ljust(length, " ")


def _luhn_check_digit(digits: str) -> str:
    total = 0
    # rightmost digit of `digits` is the one just before the check digit:
    # standard Luhn doubling from the right.
    for i, ch in enumerate(reversed(digits)):
        d = ord(ch) - 48
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - (total % 10)) % 10)


def _julian_yddd(dt: datetime) -> str:
    """Single-digit year + 3-digit day-of-year, e.g. 2026-06-15 -> '6166'."""
    return f"{dt.year % 10}{dt.timetuple().tm_yday:03d}"


def _placer(buf: list[str]):
    """Return a place(pos, length, text) that writes 1-indexed into buf and
    asserts the text is exactly `length` chars (catches off-by-one early)."""
    def place(pos: int, length: int, text: str) -> None:
        if len(text) != length:
            raise ValueError(
                f"field at pos {pos} must be {length} chars, got {len(text)}: {text!r}")
        start = pos - 1
        buf[start:start + length] = list(text)
    return place


# --------------------------------------------------------------------------- #
# ARN (Acquirer Reference Number) — Base II uses this, not the ISO STAN.
# 23 digits: mode(1) + acquirer BIN(6) + julian YDDD(4) + sequence(11) + Luhn(1)
# We fold the ISO STAN into the sequence so it stays traceable.
#
# Conformité (Base II Clearing Services, 15 avril 2023, table CPS/ATM) :
#   L'Acquiring Identifier est aux positions 28–33 du TCR 0. L'ARN commence en
#   position 27 (notre place(27, 23, build_arn(...))) : son mode (pos 1 de l'ARN)
#   tombe en position 27, et le BIN acquéreur (pos 2–7 de l'ARN) tombe donc
#   exactement en positions 28–33 → CONFORME.
# --------------------------------------------------------------------------- #
def build_arn(acquirer_id: str | None, stan: str | None, dt: datetime) -> str:
    acq_digits = "".join(ch for ch in (acquirer_id or "") if ch.isdigit())
    bin6 = numeric(acq_digits[-6:], 6)  # acquirer BIN = last 6 digits
    julian = _julian_yddd(dt)              # 4
    seq = numeric(stan, 11)                # STAN -> 11-digit sequence
    body = ARN_MODE + bin6 + julian + seq  # 1+6+4+11 = 22
    return body + _luhn_check_digit(body)  # 23


# --------------------------------------------------------------------------- #
# Record builders (each returns exactly 168 chars)
# --------------------------------------------------------------------------- #
def build_header(sending_id: str, receiving_id: str, created: datetime,
                 reel_seq: int = 1) -> str:
    """TC 90 File Header. Documented envelope (no authoritative positional spec
    in the reference repos)."""
    buf = [" "] * RECORD_LEN
    place = _placer(buf)
    place(1, 2, HEADER_TC)
    place(3, 1, "0")                                   # TC Qualifier
    place(4, 1, "0")                                   # TCR sequence
    place(5, 6, numeric(sending_id, 6))                # sending (acquirer) id
    place(11, 6, numeric(receiving_id, 6))             # receiving (Visa) id
    place(17, 6, created.strftime("%y%m%d"))           # file creation date YYMMDD
    place(23, 4, _julian_yddd(created))                # creation date YDDD
    place(27, 2, numeric(reel_seq, 2))                 # reel/file sequence
    line = "".join(buf)
    assert len(line) == RECORD_LEN
    return line


def build_tc05(row: dict[str, Any], pan: str, *, merchant_country: str,
               txn_type: str = "purchase") -> str:
    """TC 05 / TC 06 / TC 07 / TCR 0 — First Presentment (purchase/refund/withdrawal).
    Offsets per TCR0_DRAFT schema. Le TC est dérivé du type d'opération :
    purchase -> TC 05, refund -> TC 06, withdrawal -> TC 07. Le layout est
    identique (mêmes offsets, même longueur 168).
    
    NOTE conformité (Base II Clearing Services, 15 avril 2023, §8) :
      Destination Amount (pos 62–73) = TADC calculé par Visa en multi-devises.
      En mono-devise (périmètre actuel), source = destination est une simplification
      acceptable : les deux montants sont identiques. Si le simulateur devait un jour
      produire des transactions multi-devises, le Destination Amount devrait être laissé
      vide ou calculé par Visa — son remplissage par l'acquéreur serait incorrect."""
    dt = row["transmission_ts"]
    if not isinstance(dt, datetime):
        dt = datetime.now(timezone.utc)

    amount = numeric(row["txn_amount"], 12)            # minor units, no point
    currency = numeric(row.get("txn_currency"), 3)
    purchase_mmdd = (row.get("local_txn_date") or dt.strftime("%m%d"))[:4]

    if not (pan.isdigit() and 13 <= len(pan) <= 19):
        raise ValueError(f"invalid PAN length for STAN={row.get('stan')}")
    pan_main = pan[:16].ljust(16, "0")                 # account number (16)
    pan_ext = numeric(pan[16:19], 3) if len(pan) > 16 else "000"

    txn_code = REFUND_TC if txn_type == "refund" else CASH_TC if txn_type == "withdrawal" else DRAFT_TC

    buf = [" "] * RECORD_LEN
    place = _placer(buf)
    place(1, 2, txn_code)                              # Transaction Code (05, 06 or 07)
    place(3, 1, "0")                                   # TC Qualifier (Default)
    place(4, 1, "0")                                   # TCR Sequence No
    place(5, 16, pan_main)                             # Account Number (PAN)
    place(21, 3, pan_ext)                              # Account Number Extension
    place(24, 1, "0")                                  # Floor Limit Indicator
    place(25, 1, "0")                                  # CRB/Exception File Ind
    place(26, 1, " ")                                  # Reserved
    place(27, 23, build_arn(row.get("acquirer_id"), row.get("stan"), dt))  # ARN
    place(50, 8, numeric((row.get("acquirer_id") or "")[-8:], 8))          # Acq Business ID
    place(58, 4, alpha(purchase_mmdd, 4))              # Purchase Date (MMDD)
    place(62, 12, amount)                              # Destination Amount
    place(74, 3, currency)                             # Destination Currency
    place(77, 12, amount)                              # Source Amount (= dest, single ccy)
    place(89, 3, currency)                             # Source Currency
    place(92, 25, alpha(row.get("acceptor_name_loc"), 25))  # Merchant Name
    place(117, 13, alpha("", 13))                      # Merchant City (not captured)
    place(130, 3, numeric(row.get("merchant_country") or merchant_country, 3))  # Merchant Country (DE-19)
    place(133, 4, numeric(row.get("mcc"), 4))          # MCC
    place(137, 5, alpha("", 5))                        # Merchant ZIP
    place(142, 3, alpha("", 3))                        # Merchant State/Prov
    place(145, 1, "0")                                 # Requested Payment Service
    place(146, 1, "1")                                 # Number of Payment Forms
    place(147, 1, "1")                                 # Usage Code (1 = Original)
    place(148, 2, "00")                                # Reason Code
    place(150, 1, "0")                                 # Settlement Flag
    place(151, 1, " ")                                 # Auth Characteristics Ind
    place(152, 6, alpha(row.get("auth_id_response"), 6))    # Authorization Code
    place(158, 1, "0")                                 # POS Terminal Capability
    place(159, 1, " ")                                 # Reserved
    place(160, 1, "0")                                 # Cardholder ID Method
    place(161, 1, "0")                                 # Collection-Only Flag
    place(162, 2, numeric((row.get("pos_entry_mode") or "")[:2], 2))  # POS Entry Mode
    place(164, 4, _julian_yddd(dt))                    # Central Processing Date YDDD
    place(168, 1, "0")                                 # Reimbursement Attribute
    line = "".join(buf)
    assert len(line) == RECORD_LEN
    return line


def build_reversal(row: dict[str, Any], pan: str, *, merchant_country: str,
                   original_txn_type: str = "purchase",
                   reason_code: str = "00",
                   reversal_amount: int | None = None) -> str:
    """TC 25 / TC 26 / TC 27 — Reversal (annulation d'une transaction).
    Même layout TCR-0 que le présentment initial, avec :
      - TC = 25 (sale reversal) / 26 (refund reversal) / 27 (cash reversal)
      - Usage Code (pos 147) = "2" (Reversal) au lieu de "1" (Original)
      - Reason Code (pos 148) = code raison (défaut "00")
      - reversal_amount : montant partiel optionnel (≤ txn_amount).
        None = full reversal (montant original inchangé).
    En mono-devise (périmètre actuel), Source Amount = Destination Amount ;
    en multi-devise, la convention Base II attend un swap des montants pour
    indiquer le sens inverse du flux."""
    dt = row["transmission_ts"]
    if not isinstance(dt, datetime):
        dt = datetime.now(timezone.utc)

    raw_amt = reversal_amount if reversal_amount is not None else int(row["txn_amount"])
    if reversal_amount is not None and reversal_amount > int(row["txn_amount"]):
        raise ValueError(
            f"reversal_amount ({reversal_amount}) exceeds original "
            f"txn_amount ({row['txn_amount']}) for STAN={row.get('stan')}")
    amount = numeric(raw_amt, 12)
    currency = numeric(row.get("txn_currency"), 3)
    purchase_mmdd = (row.get("local_txn_date") or dt.strftime("%m%d"))[:4]

    if not (pan.isdigit() and 13 <= len(pan) <= 19):
        raise ValueError(f"invalid PAN length for STAN={row.get('stan')}")
    pan_main = pan[:16].ljust(16, "0")
    pan_ext = numeric(pan[16:19], 3) if len(pan) > 16 else "000"

    txn_code = (REVERSAL_REFUND_TC if original_txn_type == "refund"
                else REVERSAL_CASH_TC if original_txn_type == "withdrawal"
                else REVERSAL_SALE_TC)

    buf = [" "] * RECORD_LEN
    place = _placer(buf)
    place(1, 2, txn_code)                              # Transaction Code (25, 26 or 27)
    place(3, 1, "0")
    place(4, 1, "0")
    place(5, 16, pan_main)
    place(21, 3, pan_ext)
    place(24, 1, "0")
    place(25, 1, "0")
    place(26, 1, " ")
    place(27, 23, build_arn(row.get("acquirer_id"), row.get("stan"), dt))
    place(50, 8, numeric((row.get("acquirer_id") or "")[-8:], 8))
    place(58, 4, alpha(purchase_mmdd, 4))
    place(62, 12, amount)
    place(74, 3, currency)
    place(77, 12, amount)
    place(89, 3, currency)
    place(92, 25, alpha(row.get("acceptor_name_loc"), 25))
    place(117, 13, alpha("", 13))
    place(130, 3, numeric(row.get("merchant_country") or merchant_country, 3))
    place(133, 4, numeric(row.get("mcc"), 4))
    place(137, 5, alpha("", 5))
    place(142, 3, alpha("", 3))
    place(145, 1, "0")
    place(146, 1, "1")                                 # Number of Payment Forms
    place(147, 1, "2")                                 # Usage Code (2 = Reversal)
    place(148, 2, numeric(reason_code, 2))             # Reason Code
    place(150, 1, "0")
    place(151, 1, " ")
    place(152, 6, alpha(row.get("auth_id_response"), 6))
    place(158, 1, "0")
    place(159, 1, " ")
    place(160, 1, "0")
    place(161, 1, "0")
    place(162, 2, numeric((row.get("pos_entry_mode") or "")[:2], 2))
    place(164, 4, _julian_yddd(dt))
    place(168, 1, "0")
    line = "".join(buf)
    assert len(line) == RECORD_LEN
    return line


def build_count_trailer(tc: str, count: int, debit_total: int, credit_total: int, *,
                        processing: datetime, cib: str = "000000",
                        batch_number: int = 1) -> str:
    """Build a TC 91 (batch) or TC 92 (file) trailer.

    Both share the same TCR-0 layout per CTF_Data_Dictionary 'Batch / File
    Trailers'; only the TC and the counters/hashes (batch-level vs file-level)
    differ.

    debit_total = sum of debit amounts (TC 05 + TC 07)
    credit_total = sum of credit amounts (TC 06)
    net_total = debit_total - credit_total  (convention simulateur mono-devise)
    The trailer stores net_total in the hash fields (positions 16 and 102).

    NOTE : la spec Base II n'impose pas de décomposition débit/crédit dans le
    trailer TCR 91/92 ; les totaux séparés sont conservés en paramètre pour
    traçabilité et calcul explicite du net. En multi-devise, le net serait
    remplacé par un cumul signé.
    """
    net_total = debit_total - credit_total
    hash_val = abs(net_total)  # Base II trailer hash fields are unsigned numeric
    buf = [" "] * RECORD_LEN
    place = _placer(buf)
    place(1, 2, tc)                                    # Transaction Code (91 or 92)
    place(3, 1, "0")                                   # TC Qualifier
    place(4, 1, "0")                                   # TCR Seq#
    place(5, 6, numeric(cib, 6))                       # Center Information Block
    yyddd = f"{processing.year % 100:02d}{processing.timetuple().tm_yday:03d}"
    place(11, 5, yyddd)                                # Processing Date (YYDDD)
    place(16, 15, numeric(hash_val, 15))               # Destination Amount (net total, unsigned)
    place(31, 12, numeric(count, 12))                  # Number of Monetary Transactions
    place(43, 6, numeric(batch_number, 6))             # Batch Number
    place(49, 12, numeric(count, 12))                  # Number of TCRs (1 TCR0 per txn)
    place(67, 8, numeric(batch_number, 8))             # Center Batch ID
    place(75, 9, numeric(count, 9))                    # Number of Transactions
    place(102, 15, numeric(hash_val, 15))            # Source Amount (net total, unsigned)
    line = "".join(buf)
    assert len(line) == RECORD_LEN
    return line


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #
def generate_ctf_lines(rows: list[dict[str, Any]], key: bytes, *,
                       sending_id: str, receiving_id: str,
                       merchant_country: str,
                       created: datetime | None = None,
                       batch_size: int | None = None) -> tuple[list[str], int, int]:
    """Pure builder: rows -> (lines, count, debit_total, credit_total).

    Structure: TC90 header, then one or more batches each closed by a TC91
    batch trailer (carrying that batch's own count + debit/credit totals),
    then a single TC92 file trailer (carrying the file totals; its Batch
    Number field holds the number of batches).
    `batch_size` = max TC05 per batch (None = single batch).

    Les totaux débits (= TC 05 + TC 07) et crédits (= TC 06) sont suivis
    séparément. Le trailer stocke le net = débits - crédits. Cf. docstring
    de build_count_trailer pour la justification.
    """
    created = created or datetime.now(timezone.utc)
    lines = [build_header(sending_id, receiving_id, created)]

    count = len(rows)
    chunk = batch_size if (batch_size and batch_size > 0) else max(count, 1)
    file_debits = 0
    file_credits = 0
    batch_number = 0

    for start in range(0, count, chunk):
        batch_rows = rows[start:start + chunk]
        if not batch_rows:
            continue
        batch_number += 1
        batch_debits = 0
        batch_credits = 0
        for row in batch_rows:
            pan = decrypt_pan(row["pan_enc"], key)
            txn_type = _txn_type_from_pc(row.get("processing_code"))
            lines.append(build_tc05(row, pan, merchant_country=merchant_country, txn_type=txn_type))
            amt = int(row["txn_amount"])
            if txn_type == "refund":
                batch_credits += amt
            else:
                batch_debits += amt
        # TC91 batch trailer: this batch's own counters/totals
        lines.append(build_count_trailer(
            BATCH_TC, len(batch_rows), batch_debits, batch_credits,
            processing=created, batch_number=batch_number))
        file_debits += batch_debits
        file_credits += batch_credits

    # TC92 file trailer: file-level totals; Batch Number = number of batches
    lines.append(build_count_trailer(
        TRAILER_TC, count, file_debits, file_credits,
        processing=created, batch_number=max(batch_number, 1)))
    return lines, count, file_debits, file_credits


def generate_reversal_ctf_lines(rows: list[dict[str, Any]], key: bytes, *,
                                sending_id: str, receiving_id: str,
                                merchant_country: str,
                                created: datetime | None = None,
                                batch_size: int | None = None
                                ) -> tuple[list[str], int, int, int]:
    """Pure builder: rows -> (lines, count, reversal_total, 0).

    Produit un fichier de reversals (TC 25/26/27) structurellement identique
    au fichier de présentment : TC90 header, batches (TC91), file trailer (TC92).
    Chaque row est rendue via build_reversal() avec le montant partiel si
    row.get("reversal_amount") est présent, sinon full reversal.
    """
    created = created or datetime.now(timezone.utc)
    lines = [build_header(sending_id, receiving_id, created)]

    count = len(rows)
    chunk = batch_size if (batch_size and batch_size > 0) else max(count, 1)
    file_total = 0
    batch_number = 0

    for start in range(0, count, chunk):
        batch_rows = rows[start:start + chunk]
        if not batch_rows:
            continue
        batch_number += 1
        batch_total = 0
        for row in batch_rows:
            pan = decrypt_pan(row["pan_enc"], key)
            txn_type = _txn_type_from_pc(row.get("processing_code"))
            rev_amt = row.get("reversal_amount")
            lines.append(build_reversal(
                row, pan, merchant_country=merchant_country,
                original_txn_type=txn_type,
                reversal_amount=int(rev_amt) if rev_amt is not None else None))
            amt = int(rev_amt) if rev_amt is not None else int(row["txn_amount"])
            batch_total += amt
        lines.append(build_count_trailer(
            BATCH_TC, len(batch_rows), batch_total, 0,
            processing=created, batch_number=batch_number))
        file_total += batch_total

    lines.append(build_count_trailer(
        TRAILER_TC, count, file_total, 0,
        processing=created, batch_number=max(batch_number, 1)))
    return lines, count, file_total, 0


def write_ctf_file(lines: list[str], out_dir: str, batch_id: str) -> tuple[str, str]:
    """Write the CTF + a .sha256 sidecar. Returns (file_path, sha_hex)."""
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(out_dir, f"VISA_CTF_{stamp}_{batch_id[:8]}.dat")
    # Records are joined by CRLF (Base II ASCII CTF convention). The 168 is the
    # record payload; the line terminator is separate.
    payload = "\r\n".join(lines) + "\r\n"
    data = payload.encode("ascii")
    with open(path, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    sha = hashlib.sha256(data).hexdigest()
    with open(path + ".sha256", "w") as f:
        f.write(f"{sha}  {os.path.basename(path)}\n")
    return path, sha


# --------------------------------------------------------------------------- #
# Orchestration: claim -> write -> confirm (Temps 2)
# --------------------------------------------------------------------------- #
def run(out_dir: str, *, sending_id: str, receiving_id: str,
        merchant_country: str, include_today: bool, confirm: bool,
        batch_size: int | None = None) -> int:
    # Pre-flight: never claim rows we cannot write out. Alert BEFORE touching DB.
    if not ensure_writable_dir(out_dir):
        print(f"[VISA] ALERT: output directory not writable, skipping claim: {out_dir}")
        return 2

    conn = connect()
    try:
        key = load_key()
        result = claim_batch(conn, "VISA", include_today=include_today)
        if result.count == 0:
            print("[VISA] nothing to export (no pending APPROVED Visa rows)")
            return 0

        lines, count, debit_total, credit_total = generate_ctf_lines(
            result.rows, key,
            sending_id=sending_id, receiving_id=receiving_id,
            merchant_country=merchant_country, batch_size=batch_size)
        net_total = debit_total - credit_total

        # Hard invariant: every record is exactly 168 chars.
        bad = [i for i, ln in enumerate(lines) if len(ln) != RECORD_LEN]
        if bad:
            raise RuntimeError(f"record length != {RECORD_LEN} at line(s) {bad}")

        n_batches = sum(1 for ln in lines if ln[:2] == BATCH_TC)
        path, sha = write_ctf_file(lines, out_dir, result.batch_id)
        ref_count = sum(1 for r in result.rows if _txn_type_from_pc(r.get("processing_code")) == "refund")
        cash_count = sum(1 for r in result.rows if _txn_type_from_pc(r.get("processing_code")) == "withdrawal")
        draft_count = count - ref_count - cash_count
        print(f"[VISA] wrote {path}")
        print(f"[VISA] records: 1 header + {draft_count} TC05 / {ref_count} TC06 / {cash_count} TC07"
              f" + {n_batches} TC91 + 1 TC92 | "
              f"debits={debit_total} credits={credit_total} net={net_total}"
              f" | sha256={sha[:16]}…")

        if confirm:
            n = confirm_exported(conn, result.batch_id)
            print(f"[VISA] Temps 2: marked {n} row(s) EXPORTED (batch {result.batch_id})")
        else:
            print(f"[VISA] --no-confirm: rows left in EXPORTING (batch {result.batch_id})")
        # Masked sample for the operator.
        sample = decrypt_pan(result.rows[0]["pan_enc"], key)
        print(f"[VISA] sample: PAN {mask_pan(sample)} STAN={result.rows[0]['stan']}")
        return 0
    finally:
        conn.close()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Flossx83 — Visa BASE II CTF generator (Stage 2)")
    p.add_argument("--out-dir", default="./out", help="Output directory for the .dat file")
    p.add_argument("--sending-id", default="000000", help="Sending (acquirer) processor id, 6n")
    p.add_argument("--receiving-id", default="000000", help="Receiving (Visa) processor id, 6n")
    p.add_argument("--merchant-country", default="788",
                   help="ISO numeric merchant country code (DE-19 is not yet captured; default TND/788)")
    p.add_argument("--batch-size", type=int, default=None,
                   help="Max TC05 per batch (each batch closed by a TC91). Default: single batch.")
    p.add_argument("--include-today", action="store_true")
    p.add_argument("--no-confirm", action="store_true",
                   help="Build + write the file but do NOT run Temps 2 (for testing)")
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    return run(args.out_dir,
               sending_id=args.sending_id,
               receiving_id=args.receiving_id,
               merchant_country=args.merchant_country,
               include_today=args.include_today,
               confirm=not args.no_confirm,
               batch_size=args.batch_size)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
