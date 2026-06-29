"""
Issuer-side reception phase: consume generated clearing files, parse movements,
and post them to cardholder_accounts.

This module is the CONSUMER side of the clearing pipeline — it reads the .dat
(Visa) and .ipm (Mastercard) files produced by the generator phases, parses them
via issuer_inbound.read_clearing_file(), and applies the movements via
issuer_posting.post_clearing_file().

IDEMPOTENCE (Réception-2 — posted_movement table):
  Chaque mouvement imputé est tracé dans posted_movement avec une contrainte
  UNIQUE (network, movement_ref, amount, account_id). La phase est donc
  idempotente : rejouer les mêmes fichiers saute les mouvements déjà vus
  (statut ALREADY_POSTED en agrégation). Voir issuer_posting.apply_movement
  pour le mécanisme SAVEPOINT.
"""

from __future__ import annotations

import glob
import os
from datetime import datetime, timezone
from typing import Any


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    print(f"[{ts}] [ISSUER-RECEPTION] {msg}", flush=True)


def aggregate_results(all_results: list[list[dict[str, Any]]]) -> dict[str, Any]:
    """Pure function: aggregate per-file posting results into summary counters.

    Testable without DB — takes the list of per-file result lists returned by
    post_clearing_file() and produces totals.

    Args:
        all_results: List of results (each being a list of movement result dicts).

    Returns:
        Dict with keys: files, applied, no_account, rejected, already_posted,
        total_movements.
    """
    files = len(all_results)
    applied = 0
    no_account = 0
    rejected = 0
    already_posted = 0
    total_movements = 0

    for file_results in all_results:
        total_movements += len(file_results)
        for r in file_results:
            status = r.get("status", "")
            if status == "APPLIED":
                applied += 1
            elif status == "NO_ACCOUNT":
                no_account += 1
            elif status == "REJECTED_STATUS":
                rejected += 1
            elif status == "ALREADY_POSTED":
                already_posted += 1

    return {
        "files": files,
        "applied": applied,
        "no_account": no_account,
        "rejected": rejected,
        "already_posted": already_posted,
        "total_movements": total_movements,
    }


def issuer_reception(output_dir: str, key: bytes | None = None) -> dict[str, Any]:
    """Consume all clearing files in output_dir and post movements to accounts.

    Scans for ``*.dat`` (Visa CTF) and ``*.ipm`` (Mastercard IPM) files, parses
    each via :func:`issuer_posting.post_clearing_file`, aggregates results.

    Each file is processed in its own try/except — a corrupted file does NOT
    crash the phase (it is logged and skipped).

    Args:
        output_dir: Directory containing the generated clearing files.
        key: AES-256-GCM key for PAN decryption.

    Returns:
        Summary dict from :func:`aggregate_results`.

    Raises:
        FileNotFoundError: If *output_dir* does not exist.
    """
    from issuer_posting import post_clearing_file

    if not os.path.isdir(output_dir):
        raise FileNotFoundError(f"output_dir not found: {output_dir}")

    patterns = ["*.ipm", "*.dat"]
    files: list[str] = []
    for pat in patterns:
        files.extend(sorted(glob.glob(os.path.join(output_dir, pat))))

    # Exclude .sha256 sidecar files
    files = [f for f in files if not f.endswith(".sha256")]

    if not files:
        _log(f"No clearing files found in {output_dir}")
        return aggregate_results([])

    all_results: list[list[dict[str, Any]]] = []

    for fpath in files:
        try:
            results = post_clearing_file(fpath, key=key)
            all_results.append(results)
            appl = sum(1 for r in results if r.get("status") == "APPLIED")
            noac = sum(1 for r in results if r.get("status") == "NO_ACCOUNT")
            rej = sum(1 for r in results if r.get("status") == "REJECTED_STATUS")
            dup = sum(1 for r in results if r.get("status") == "ALREADY_POSTED")
            _log(f"  {os.path.basename(fpath)}: {appl} applied, "
                 f"{noac} no_account, {rej} rejected, "
                 f"{dup} already_posted "
                 f"({len(results)} movements)")
        except Exception as exc:
            _log(f"  ERROR processing {os.path.basename(fpath)}: {exc}")
            # Don't crash: skip the corrupted file
            all_results.append([])

    summary = aggregate_results(all_results)
    _log(f"issuer reception done: {summary['files']} files, "
         f"{summary['applied']} applied, {summary['no_account']} no_account, "
         f"{summary['rejected']} rejected, "
         f"{summary['already_posted']} already_posted "
         f"({summary['total_movements']} total movements)")
    return summary


def reception_succeeded(summary: dict[str, Any]) -> bool:
    """Determine whether the reception phase succeeded.

    The phase succeeds whenever it ran without a Python exception.
    Counters like ``rejected`` (BLOCKED/CLOSED account), ``no_account``
    (unknown cardholder), and ``already_posted`` (idempotent replay)
    are normal business outcomes — NOT phase failures.

    Returns ``True`` if *summary* is a dict (i.e. the phase executed).
    A non-dict or ``None`` signals that the phase did not run at all.

    RÉSERVE conformité : un compte BLOCKED/CLOSED produit ``REJECTED_STATUS``
    localement mais le simulateur n'émet PAS le chargeback de retour réseau
    correspondant (Mastercard First Chargeback/1442 avec reason code DE-25,
    ou rejet Visa Base II). Le rejet est compté, pas renvoyé au réseau.
    À implémenter si le cycle de rejet réseau devient nécessaire.
    """
    return isinstance(summary, dict)
