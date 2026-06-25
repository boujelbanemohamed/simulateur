#!/usr/bin/env python3
"""
Flossx83 clearing — STAGE 2: Issuer inbound parsing (pure read, no debit).

Ce module lit les fichiers de clearing générés par l'acquéreur (Visa CTF .dat
et Mastercard IPM .ipm) et produit une liste normalisée de ClearingMovement.

Ce lot est UNIQUEMENT le parsing. Le rapprochement (pan → cardholder_account)
et le débit effectif viendront dans un lot ultérieur (Émetteur-3).
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ClearingMovement:
    """Vue normalisée d'un enregistrement de clearing lu par l'émetteur.

    Un movement représente une transaction élémentaire extraite d'un fichier
    de clearing — présentment, reversal, ou autre enregistrement pertinent.

    Attributes:
        network:     'VISA' ou 'MASTERCARD'
        mti_or_tc:   MTI (Mastercard) ou TC (Visa), p.ex. "1240" ou "05"
        pan:         PAN en clair extrait de l'enregistrement
        processing_code: DE-3 processing code (Mastercard) ou None (Visa CTF)
        amount:      Montant en minor units (entier, toujours positif)
        currency:    Code devise ISO numérique (3 car.) ou None si non trouvé
        kind:        'presentment' | 'reversal' | 'other'
        raw_ref:     ARN/STAN si disponible, None sinon
    """
    network: str
    mti_or_tc: str
    pan: str
    amount: int
    kind: str = "other"
    processing_code: str | None = None
    currency: str | None = None
    raw_ref: str | None = None


# --------------------------------------------------------------------------- #
# Mastercard IPM
# --------------------------------------------------------------------------- #

def parse_mastercard_ipm(data: bytes, *, blocked: bool = True) -> list[ClearingMovement]:
    """Parse a Mastercard IPM file (blocked or unblocked) into ClearingMovements.

    Utilise cardutil.mciipm.IpmReader pour dérouler chaque enregistrement.
    Les enregistrements MTI=1644 (header/trailer) sont ignorés.
    """
    from cardutil.mciipm import IpmReader

    movements: list[ClearingMovement] = []
    reader = IpmReader(io.BytesIO(data), blocked=blocked)

    for record in reader:
        mti: str = record.get("MTI", "")

        # Ignorer les enregistrements de contrôle (header/trailer)
        if mti == "1644":
            continue

        kind: str = "other"
        mti_or_tc: str = mti

        if mti == "1240":
            de24 = str(record.get("DE24", ""))
            if de24 == "200":
                kind = "presentment"
            elif de24 == "202":
                kind = "reversal"
            else:
                kind = "other"

        pan: str = str(record.get("DE2", "")).strip()
        processing_code: str | None = str(record.get("DE3", "")) if record.get("DE3") is not None else None
        raw_amount = record.get("DE4", "0")
        amount: int = int(raw_amount) if raw_amount is not None else 0
        currency: str | None = str(record.get("DE49", "")) if record.get("DE49") is not None else None
        raw_ref: str | None = str(record.get("DE31", "")) if record.get("DE31") is not None else None

        movements.append(ClearingMovement(
            network="MASTERCARD",
            mti_or_tc=mti_or_tc,
            pan=pan,
            amount=amount,
            kind=kind,
            processing_code=processing_code,
            currency=currency if currency else None,
            raw_ref=raw_ref if raw_ref else None,
        ))

    return movements


# --------------------------------------------------------------------------- #
# Visa CTF (Base II, 168-caractères par enregistrement, positions fixes)
# --------------------------------------------------------------------------- #

# Positions fixes Visa CTF (1-indexées → 0-indexées) :
#   TC (1-2), PAN main (5-20, 16 car.), PAN extension (21-23, 3 car.),
#   Source Amount (77-88), Source Currency (89-91).
# Le PAN complet = main + extension ; extension = "000" → PAN ≤ 16 car.
_CTF_TC_START = 0
_CTF_TC_END = 2
_CTF_PAN_START = 4
_CTF_PAN_END = 20
_CTF_PAN_EXT_START = 20
_CTF_PAN_EXT_END = 23
_CTF_AMOUNT_START = 76
_CTF_AMOUNT_END = 88
_CTF_CURRENCY_START = 88
_CTF_CURRENCY_END = 91

TC_PRESENTMENT = frozenset({"05", "06", "07"})
TC_REVERSAL = frozenset({"25", "26", "27"})
TC_CONTROL = frozenset({"90", "91", "92"})


def parse_visa_ctf(text: str) -> list[ClearingMovement]:
    """Parse a Visa Base II CTF text file into ClearingMovements.

    Input est le contenu texte complet (avec séparateurs \\r\\n ou \\n).
    Les enregistrements de contrôle (TC 90/91/92) et les lignes mal-formées
    (longueur != 168) sont ignorés.
    """
    movements: list[ClearingMovement] = []

    for line in text.splitlines():
        # Nettoyer le line end
        line = line.rstrip("\r\n ")

        if len(line) != 168:
            continue

        tc: str = line[_CTF_TC_START:_CTF_TC_END]

        # Ignorer les enregistrements de contrôle
        if tc in TC_CONTROL:
            continue

        pan_main: str = line[_CTF_PAN_START:_CTF_PAN_END].strip()
        pan_ext: str = line[_CTF_PAN_EXT_START:_CTF_PAN_EXT_END].strip()
        # PAN extension "000" → PAN ≤ 16 car. (pas d'extension réelle)
        pan: str = pan_main if pan_ext == "000" else pan_main + pan_ext
        raw_amount: str = line[_CTF_AMOUNT_START:_CTF_AMOUNT_END].strip()
        currency: str = line[_CTF_CURRENCY_START:_CTF_CURRENCY_END].strip()

        amount: int = int(raw_amount) if raw_amount.isdigit() else 0

        if tc in TC_PRESENTMENT:
            kind = "presentment"
        elif tc in TC_REVERSAL:
            kind = "reversal"
        else:
            kind = "other"

        movements.append(ClearingMovement(
            network="VISA",
            mti_or_tc=tc,
            pan=pan,
            amount=amount,
            kind=kind,
            processing_code=None,
            currency=currency if currency else None,
            raw_ref=None,
        ))

    return movements


# --------------------------------------------------------------------------- #
# File-level dispatcher
# --------------------------------------------------------------------------- #

def read_clearing_file(path: str) -> list[ClearingMovement]:
    """Dispatcher selon l'extension du fichier.

    *.ipm  → lit en binaire + parse_mastercard_ipm
    *.dat  → lit en texte + parse_visa_ctf
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".ipm":
        with open(path, "rb") as f:
            data = f.read()
        return parse_mastercard_ipm(data)

    elif ext == ".dat":
        with open(path, "r", encoding="ascii") as f:
            text = f.read()
        return parse_visa_ctf(text)

    else:
        raise ValueError(
            f"Unknown clearing file extension: {ext!r}. "
            f"Expected .ipm (Mastercard) or .dat (Visa CTF)."
        )
