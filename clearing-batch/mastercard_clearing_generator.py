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
    DE4  <- txn_amount (minor units, int) DE12 <- transmission_ts (YYMMDDhhmmss)
    DE24 <- function code (200 presentment / 697 header / 695 trailer)
    DE26 <- mcc (n-4)                     DE31 <- ARD (n-23, Luhn) — build_de31_ard()
    DE33 <- acquirer_id (n-11 LLVAR)      DE43 <- acceptor_name_loc + pays alpha-3 (LLVAR)
    DE49 <- txn_currency                  DE71 <- sequential message number
    DE93 <- PAN BIN (destination issuer)  DE94 <- acquirer_id (originator)
    DE48 <- PDS subelements (terminal type, transaction environment, TCC*)

* See the note on TCC in build_de48(): the Transaction Category Code placement
  varies across Mastercard spec versions; the tag used here is a documented,
  configurable constant to verify against your IPM Clearing Formats manual.

  --- Sens crédit/débit — conforme IPM Clearing Formats, Juin 2019 §5 ---
  Le sens n'est PAS porté par un champ explicite. Il se déduit de la
  combinaison MTI + DE-24 + DE-3 + PDS-0025 (Message Reversal Indicator).

  Table officielle — Premier Présentment (MTI 1240, DE-24 = 200) :

    DE-3 (préfixe)  PDS 0025    Sens Acquéreur (Org)    Sens Émetteur (Dst)
    ──────────────  ─────────   ─────────────────────   ───────────────────
    00–18, 50       —           Cr (crédit)             Dr (débit)
    00–18, 50       R           Dr (débit)              Cr (crédit)
    20, 28          —           Dr (débit)              Cr (crédit)   ← refund
    20, 28          R           Cr (crédit)             Dr (débit)

  Le générateur n'a RIEN à ajouter : le réseau calcule le sens à partir du
  DE-3 (processing_code) déjà présent. Le refund (préfixe 20) produit
  automatiquement un sens débit acquéreur / crédit émetteur sans modifier
  DE-24 ni ajouter de PDS.
  Voir §5 « Reconciliation Messages — Debit/Credit Totals » pour les totaux
  séparés débit/crédit du file trailer (non implémentés dans ce lot).
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

# Utilitaires de format réutilisés depuis le générateur Visa (même logique Luhn,
# date julienne, et formatage numérique pour le DE-31 ARD Mastercard).
from visa_clearing_generator import _luhn_check_digit, _julian_yddd, numeric

# MTI / function codes
MTI_PRESENTMENT = "1240"      # First Presentment
MTI_CHARGEBACK = "1442"      # Chargeback (second presentment / reprocessing)
MTI_FILE_CONTROL = "1644"    # File Header / Trailer (Advice)
FUNC_PRESENTMENT = "200"     # DE24 — First Presentment, full
FUNC_REVERSAL = "202"        # DE24 — Reversal
FUNC_CHARGEBACK = "200"      # DE24 — Chargeback (même fonction qu'un présentment)
FUNC_FILE_HEADER = "697"     # DE24 — File header
FUNC_FILE_TRAILER = "695"    # DE24 — File trailer

# DE-48 PDS tags (numeric, 4 digits). Names per Mastercard_Parsing decoding.
PDS_TERMINAL_TYPE = "0023"    # Terminal Type
PDS_TXN_ENV = "0165"          # transaction environment / settlement indicator
PDS_TCC = "0052"              # *Transaction Category indicator — VERIFY vs spec
PDS_REVERSAL = "0025"         # Return/Reversal Indicator — "R" pour un reversal


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

    When `is_reversal=True`, PDS 0025 (Return/Reversal Indicator) is set to "R".
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
# DE-31 ARD — IPM Clearing Formats spec (conforme juin 2019)
# Format : n-23, 5 sous-champs : MixedUse(1) + BIN(6) + Julian(4) + Seq(11) + Luhn(1)
# Logique identique au build_arn() Visa (1+6+4+11+1, Luhn mod-10 sur 22 premiers).
# --------------------------------------------------------------------------- #
# Mode d'emploi des sous-champs :
#   1. Mixed Use = "0" (convention simulateur documentée)
#   2. Acquirer's BIN = 6 derniers chiffres de l'acquirer_id
#   3. Julian Processing Date = date julienne YDDD du timestamp created
#   4. Acquirer's Sequence Number = STAN de la transaction, justifié à droite / zéro-filled
#   5. Check Digit = Luhn mod-10 calculé sur les 22 positions précédentes
# --------------------------------------------------------------------------- #
def build_de31_ard(acquirer_id: str | None, stan: str | None, dt: datetime) -> str:
    mixed = "0"
    acq_digits = "".join(ch for ch in (acquirer_id or "") if ch.isdigit())
    bin6 = numeric(acq_digits[-6:], 6)
    julian = _julian_yddd(dt)
    seq = numeric(stan, 11)
    body = mixed + bin6 + julian + seq
    return body + _luhn_check_digit(body)


# --------------------------------------------------------------------------- #
# DE-33 — Forwarding Institution ID Code (n-11 LLVAR)
# Convention simulateur : dérivé de l'acquirer_id (derniers 11 chiffres).
# --------------------------------------------------------------------------- #
def build_de33(acquirer_id: str | None) -> str:
    digits = "".join(ch for ch in (acquirer_id or "") if ch.isdigit())
    return digits[-11:] if digits else "0"


# --------------------------------------------------------------------------- #
# Conversion pays numérique → alpha-3 pour DE-43 (sous-champ 6).
# Map minimal pour les tests ; étendre si nécessaire.
# --------------------------------------------------------------------------- #
NUMERIC_TO_ALPHA3: dict[str, str] = {
    "788": "TUN",  # Tunisie
    "840": "USA",  # États-Unis
    "250": "FRA",  # France
    "826": "GBR",  # Royaume-Uni
    "124": "CAN",  # Canada
    "276": "DEU",  # Allemagne
    "380": "ITA",  # Italie
    "724": "ESP",  # Espagne
}


# --------------------------------------------------------------------------- #
# DE-43 — Card Acceptor Name/Location (ans-99 LLVAR).
# 6 sous-champs, format cardutil : NAME\ADDRESS\CITY\POSTCODE(10)STATE(3)COUNTRY(3)
# Les sous-champs 1 (Name), 3 (City), 6 (Country) sont obligatoires.
# Country est en ISO alpha-3 (converti depuis merchant_country numérique).
#
# NOTE conformité (audit DE-43 vs spec IPM p.356-360) :
#  - Sous-champ 1 (Card Acceptor Name, ans-22, gauche, terminé par '\') : CONFORME.
#  - Sous-champ 6 (Country, ISO alpha-3) : CONFORME dans son principe (mapping
#    NUMERIC_TO_ALPHA3 limité aux pays de test, à étendre si besoin).
#  - Sous-champs 2-5 (adresse, ville, code postal, région) : conditionnels, non remplis
#    dans le cas d'usage actuel ; leur mécanique d'assemblage n'a pas été auditée champ
#    par champ.
#  - L'encodage interne suit la convention cardutil (séparateurs backslash) ; le round-trip
#    cardutil est validé. Conforme sur les sous-champs obligatoires émis par l'acquéreur.
# --------------------------------------------------------------------------- #
def build_de43(card_acceptor_name: str, merchant_country: str, *,
               city: str = "", street: str = "",
               postcode: str = "", region: str = "") -> str:
    country_alpha3 = NUMERIC_TO_ALPHA3.get(merchant_country, merchant_country)
    name = card_acceptor_name[:22] if card_acceptor_name else " "
    addr = street[:22] if street else " "
    cty = city[:13] if city else " "
    pc = postcode[:10]
    st = region[:3]
    return f"{name}\\{addr}\\{cty}\\{pc:10s}{st:3s}{country_alpha3}"


# --------------------------------------------------------------------------- #
# Message builders
# --------------------------------------------------------------------------- #
def build_presentment(row: dict[str, Any], pan: str, msg_number: int, *,
                      terminal_type: str, tcc: str, txn_env: str,
                      created: datetime,
                      is_reversal: bool = False) -> dict[str, Any]:
    """Build one MTI 1240 First Presentment message dict for cardutil.

    When `is_reversal=True`, PDS 0025 = "R" is injected into DE-48 and the
    Function Code (DE-24) changes to FUNC_REVERSAL.
    """
    if not (pan.isdigit() and 13 <= len(pan) <= 19):
        raise ValueError(f"invalid PAN length for STAN={row.get('stan')}")

    ts = row.get("transmission_ts") or created
    mcc = (row.get("mcc") or "0000")[:4].rjust(4, "0")
    de43 = build_de43(row.get("acceptor_name_loc", ""), row.get("merchant_country", "788"))
    originator_id = build_de33(row.get("acquirer_id"))
    pan_bin = pan[:6] if pan.isdigit() else "000000"

    # DE-4 amount : si is_reversal ET row a reversal_amount, on utilise le
    # montant partiel ; sinon le montant original (full reversal ou présentment).
    _raw_amt = row.get("reversal_amount") if is_reversal else None
    if _raw_amt is not None:
        if int(_raw_amt) > int(row["txn_amount"]):
            raise ValueError(
                f"reversal_amount ({_raw_amt}) exceeds original "
                f"txn_amount ({row['txn_amount']}) for STAN={row.get('stan')}")
    de4 = int(_raw_amt) if _raw_amt is not None else int(row["txn_amount"])

    msg: dict[str, Any] = {
        "MTI": MTI_PRESENTMENT,
        "DE2": pan,                                   # PAN (LLVAR)
        "DE3": (row.get("processing_code") or "000000")[:6].rjust(6, "0"),
        "DE4": de4,                                   # minor units, no decimal point
        "DE12": ts,                                   # datetime → cardutil formatte en YYMMDDhhmmss
        "DE24": FUNC_REVERSAL if is_reversal else FUNC_PRESENTMENT,
        "DE26": mcc,                                  # MCC (n-4)
        "DE31": build_de31_ard(row.get("acquirer_id"), row.get("stan"), created),
        "DE33": build_de33(row.get("acquirer_id")),   # forwarding institution (n-11 LLVAR)
        "DE43": de43,                                 # card acceptor name/location (ans-99 LLVAR)
        "DE49": (row.get("txn_currency") or "000")[:3].rjust(3, "0"),
        "DE71": msg_number,                           # sequential message number
        "DE93": pan_bin,                              # destination institution (issuer BIN, n-11 LLVAR)
        "DE94": originator_id,                        # originator institution (acquirer, n-11 LLVAR)
    }
    # DE-48 private data (rolled up from PDS keys by cardutil)
    extra_pds = {PDS_REVERSAL: "R"} if is_reversal else None
    msg.update(build_de48(terminal_type=terminal_type, tcc=tcc, txn_env=txn_env,
                          extra_pds=extra_pds))
    # DE-54 (Additional Amounts) — requis par IPM pour DE-3 s1=09 (Purchase with
    # Cash Back). Si la row contient un champ txn_cashback (ou de54), on l'injecte ;
    # sinon on ne l'ajoute pas.
    #
    # Réserve : on injecte ici le montant cashback brut. La structure complète du
    # DE-54 (Additional Amounts : account type, amount type, sign, devise, montant)
    # n'a pas été auditée champ par champ contre la spec IPM — à affiner dans un
    # lot ultérieur, comme le DE-43.
    raw_cb = row.get("de54") or row.get("txn_cashback")
    if raw_cb is not None:
        msg["DE54"] = str(int(raw_cb))
    # NOTE conformité — champs système-provided non fournis ici (volontairement) : DE-5/DE-6/DE-9
    # (montants convertis en devise de réconciliation/billing) et PDS 0002/0003 (identifiants produit
    # GCMS) sont fournis ou enrichis par le système de clearing, pas par l'acquéreur originateur
    # (usage Org = O ou •, Dst = M/C). Les inclure en dur serait incorrect. Le présentment fournit
    # donc tous les champs M côté Org. Réf. IPM Clearing Formats, tables d'usage par DE.
    return msg


# --------------------------------------------------------------------------- #
# Chargeback (MTI 1442 — second presentment / reprocessing)
# --------------------------------------------------------------------------- #
def build_chargeback(row: dict[str, Any], pan: str, msg_number: int, *,
                     terminal_type: str, tcc: str, txn_env: str,
                     created: datetime,
                     chargeback_reason: str = "00") -> dict[str, Any]:
    """Build one MTI 1442 Chargeback message dict for cardutil.

    Squelette : reprend la structure du présentment (mêmes champs DE) avec :
      - MTI = 1442
      - DE-24 = FUNC_CHARGEBACK (200)
      - DE-72 = chargeback_reason (Data Record — n-3 LLVAR)
    Le PDS 0025 n'est PAS positionné (un chargeback n'est pas un reversal).

    NOTE : un chargeback nécessite une transaction originale liée (DE-56
    Original Data Elements) et un reason code valide. Les données de test
    actuelles ne contiennent ni l'un ni l'autre ; cette fonction est un
    squelette prêt à être complété quand le schéma et les données seront
    disponibles. Voir IPM Clearing Formats §8.2.
    """
    if not (pan.isdigit() and 13 <= len(pan) <= 19):
        raise ValueError(f"invalid PAN length for STAN={row.get('stan')}")

    ts = row.get("transmission_ts") or created
    mcc = (row.get("mcc") or "0000")[:4].rjust(4, "0")
    de43 = build_de43(row.get("acceptor_name_loc", ""), row.get("merchant_country", "788"))
    originator_id = build_de33(row.get("acquirer_id"))
    pan_bin = pan[:6] if pan.isdigit() else "000000"

    msg: dict[str, Any] = {
        "MTI": MTI_CHARGEBACK,
        "DE2": pan,
        "DE3": (row.get("processing_code") or "000000")[:6].rjust(6, "0"),
        "DE4": int(row["txn_amount"]),
        "DE12": ts,
        "DE24": FUNC_CHARGEBACK,
        "DE26": mcc,
        "DE31": build_de31_ard(row.get("acquirer_id"), row.get("stan"), created),
        "DE33": build_de33(row.get("acquirer_id")),
        "DE43": de43,
        "DE49": (row.get("txn_currency") or "000")[:3].rjust(3, "0"),
        "DE71": msg_number,
        "DE72": chargeback_reason[:3].rjust(3, "0"),  # Reason code (n-3 LLVAR)
        "DE93": pan_bin,
        "DE94": originator_id,
    }
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


# NOTE conformité (sens crédit/débit) : le sens d'une transaction est dérivé du DE-3 par le
# réseau (voir §5, documenté plus haut). Les TOTAUX débit/crédit séparés en réconciliation
# (PDS 0390 Debits / 0391 Credits) appartiennent aux messages Financial Position Detail/1644
# (DE-24=685) et Settlement Position Detail/1644 (DE-24=688), une couche de réconciliation NON
# implémentée ici. Ce file trailer (695) porte un checksum de contrôle de fichier (PDS0301),
# pas des totaux de position signés. L'implémentation des messages 685/688 est un chantier
# futur optionnel.
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
                                       terminal_type=terminal_type, tcc=tcc, txn_env=txn_env,
                                       created=created))
        amount_total += int(row["txn_amount"])
    count = len(rows)
    seq += 1
    writer.write(build_file_trailer(                  # MTI 1644 trailer (recon PDS)
        seq, count, amount_total, created=created,
        file_type=file_type, processor_id=processor_id, file_seq=file_seq))
    writer.close()                                    # zero-length terminator + final block

    return buf.getvalue(), count, amount_total


def generate_reversal_ipm_bytes(rows: list[dict[str, Any]], key: bytes, *,
                                terminal_type: str, tcc: str, txn_env: str,
                                created: datetime | None = None,
                                blocked: bool = True,
                                file_type: str = "000",
                                processor_id: str = "00000000000",
                                file_seq: str = "00001",
                                ) -> tuple[bytes, int, int]:
    """rows -> (ipm_bytes, reversal_count, reversal_total).

    Parallèle à generate_ipm_bytes : génère un fichier IPM complet dont chaque
    présentment porte is_reversal=True (DE-24=202, PDS0025="R"). Le montant de
    chaque reversal peut être partiel via row.get("reversal_amount").
    """
    created = created or datetime.now(timezone.utc)
    buf = io.BytesIO()
    amount_total = 0
    seq = 1

    writer = IpmWriter(buf, blocked=blocked)
    writer.write(build_file_header(seq, created))
    for row in rows:
        seq += 1
        pan = decrypt_pan(row["pan_enc"], key)
        writer.write(build_presentment(row, pan, seq,
                                       terminal_type=terminal_type, tcc=tcc,
                                       txn_env=txn_env,
                                       created=created,
                                       is_reversal=True))
        amt = row.get("reversal_amount")
        amount_total += int(amt) if amt is not None else int(row["txn_amount"])
    count = len(rows)
    seq += 1
    writer.write(build_file_trailer(
        seq, count, amount_total, created=created,
        file_type=file_type, processor_id=processor_id, file_seq=file_seq))
    writer.close()

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
