"""
Issuer-side First Chargeback (MTI 1442) generator.

Per IPM Clearing Formats p.134, the First Chargeback is ALWAYS initiated by
the issuer ("the sender is always the issuer"). This module therefore belongs
to the issuer role, NOT the acquirer generator.

The chargeback contests a specific original presentment (MTI 1240) and carries:
  - DE-24: 450 (full) or 453 (partial)
  - DE-25: Message Reason Code
  - DE-30: Original Amount (from the contested presentment)

Original transaction reference:
  DE-56 (Original Data Elements) is an ISO 8583 AUTHORIZATION field; it does NOT
  exist in either clearing spec (Mastercard IPM nor Visa Base II — verified).
  In IPM clearing, the reference to the original transaction is carried by DE-31
  (Acquirer Reference Data, mandatory), which this builder emits via
  build_de31_ard(). PDS0099 additionally carries the original STAN and date for
  extra traceability (optional complement, not a substitute for a missing field).
  This is conformant: no DE-56 is expected in an IPM chargeback.

Reference: IPM Clearing Formats §8.2 (First Chargeback).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from mastercard_clearing_generator import (
    build_de31_ard,
    build_de33,
    build_de43,
    build_de48,
)

MTI_CHARGEBACK = "1442"
FUNC_FIRST_CB_FULL = "450"
FUNC_FIRST_CB_PARTIAL = "453"

# PDS tag for original transaction reference (simulator convention)
# Format: STAN(6) + YYMMDD(6) = 12 chars
PDS_ORIG_TXN_REF = "0099"


@dataclass
class ChargebackRequest:
    """Parameters for building a First Chargeback message.

    Attributes:
        pan: Cardholder PAN (cleartext, 13-19 digits).
        original_amount: Amount of the original presentment (minor units).
        dispute_amount: Amount being disputed. None = full chargeback.
        currency: Currency code (n-3, e.g. "788").
        original_stan: STAN of the original presentment.
        original_date: Date/time of the original presentment.
        reason_code: Mastercard chargeback reason code (n-4).
        original_mti: MTI of the original presentment (default "1240").
        original_processing_code: Processing code (DE-3) of the original.
    """
    pan: str
    original_amount: int
    dispute_amount: int | None = None
    currency: str = "788"
    original_stan: str = ""
    original_date: datetime | None = None
    reason_code: str = "0000"
    original_mti: str = "1240"
    original_processing_code: str = "000000"


def build_orig_ref_pds(*, stan: str, dt: datetime) -> str:
    """Build the PDS0099 value: STAN(6) + YYMMDD(6)."""
    s = stan.rjust(6, "0")[:6] if stan else "000000"
    d = dt.strftime("%y%m%d") if dt else "000000"
    return s + d


def build_first_chargeback(
    req: ChargebackRequest, *,
    msg_number: int = 1,
    acquirer_id: str = "40010001234",
    acceptor_name_loc: str = "MERCHANT",
    acceptor_city: str = "",
    merchant_country: str = "788",
    terminal_type: str = "  Z",
    tcc: str = "T",
    txn_env: str = "0",
    created: datetime | None = None,
) -> dict[str, Any]:
    """Build one MTI 1442 First Chargeback message dict for cardutil.

    Validates:
      - PAN length 13-19 digits.
      - If dispute_amount is provided, it must be > 0 and <= original_amount.
      - If dispute_amount is None or == original_amount, full chargeback
        (DE-24 = 450). If < original_amount, partial chargeback (DE-24 = 453).

    Fields per IPM Clearing Formats §8.2 (First Chargeback):
      DE-2, DE-3 (= original processing code), DE-4 (disputed amount),
      DE-12 (datetime), DE-24 (450/453), DE-25 (reason code),
      DE-30 (original amount), DE-31 (ARD), DE-33 (forwarding inst),
      DE-43 (acceptor name/location), DE-48 (PDS), DE-49 (currency),
      DE-71 (message number).

    Champs système-provided (Org=•, NE PAS émettre) :
      DE-93, DE-94 — fournis par le clearing, pas par l'émetteur.
    """
    if not (req.pan.isdigit() and 13 <= len(req.pan) <= 19):
        raise ValueError(f"invalid PAN length: {len(req.pan)} digits")

    if req.dispute_amount is not None:
        if req.dispute_amount <= 0:
            raise ValueError(
                f"dispute_amount ({req.dispute_amount}) must be > 0")
        if req.dispute_amount > req.original_amount:
            raise ValueError(
                f"dispute_amount ({req.dispute_amount}) exceeds "
                f"original_amount ({req.original_amount})")
        is_partial = req.dispute_amount < req.original_amount
    else:
        is_partial = False

    func_code = FUNC_FIRST_CB_PARTIAL if is_partial else FUNC_FIRST_CB_FULL
    de4 = req.dispute_amount if req.dispute_amount is not None else req.original_amount

    created = created or datetime.now(timezone.utc)
    ts = req.original_date or created
    mcc = "0000"

    de43 = build_de43(acceptor_name_loc, merchant_country, city=acceptor_city)
    originator_id = build_de33(acquirer_id)

    # Original transaction reference (PDS0099 complement to DE-31)
    orig_ref_pds = build_orig_ref_pds(
        stan=req.original_stan,
        dt=req.original_date or created,
    )

    msg: dict[str, Any] = {
        "MTI": MTI_CHARGEBACK,
        "DE2": req.pan,
        "DE3": req.original_processing_code[:6].rjust(6, "0"),
        "DE4": de4,
        "DE12": ts,
        "DE24": func_code,
        "DE25": req.reason_code[:4].rjust(4, "0"),
        "DE30": str(req.original_amount).rjust(12, "0"),
        "DE31": build_de31_ard(acquirer_id, req.original_stan, created),
        "DE33": build_de33(acquirer_id),
        "DE43": de43,
        "DE49": req.currency[:3].rjust(3, "0"),
        "DE71": msg_number,
        f"PDS{PDS_ORIG_TXN_REF}": orig_ref_pds,
    }
    msg.update(build_de48(
        terminal_type=terminal_type, txn_env=txn_env))
    return msg
