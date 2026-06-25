#!/usr/bin/env python3
"""
Flossx83 clearing batch — STAGE 4: nightly orchestrator.

Designed to be invoked by a cron job. It runs the full chain, sequentially and
defensively:

    A. Housekeeping FIRST  -> requeue_stale(): any row stuck in EXPORTING from a
       crash the night before is reverted to APPROVED so it is not lost.
    B. Visa                -> visa_clearing_generator.run(dated_dir): claim VISA
       rows, write the .dat (+ .sha256), then Temps 2 (EXPORTED) on success.
    C. Mastercard          -> mastercard_clearing_generator.run(dated_dir): claim
       MASTERCARD rows, write the binary .ipm (+ .sha256), then Temps 2.
    D. Visa reversals     -> visa_clearing_generator.run_reversals(dated_dir):
       claim CANCELLED VISA rows, write TC 25/26/27 CTF, then Temps 2.
    E. Mastercard reversals -> mastercard_clearing_generator.run_reversals(dated_dir):
       claim CANCELLED MASTERCARD rows, write DE-24=202 IPM, then Temps 2.

Each generator's run() already encapsulates claim -> generate -> verify ->
confirm, so the orchestrator just sequences them, isolates failures (one scheme
failing must not abort the other), and routes output into a date-structured
folder.

Output layout
-------------
    /outbound/clearing/<YYYY-MM-DD>/VISA_CTF_<YYYYMMDD>_<HHMMSS>_<batch>.dat
    /outbound/clearing/<YYYY-MM-DD>/VISA_CTF_<YYYYMMDD>_<HHMMSS>_<batch>.dat.sha256
    /outbound/clearing/<YYYY-MM-DD>/MC_IPM_<YYYYMMDD>_<HHMMSS>_<batch>.ipm
    /outbound/clearing/<YYYY-MM-DD>/MC_IPM_<YYYYMMDD>_<HHMMSS>_<batch>.ipm.sha256
    /outbound/clearing/<YYYY-MM-DD>/VISA_REVERSAL_<YYYYMMDD>_<HHMMSS>_<batch>.dat
    /outbound/clearing/<YYYY-MM-DD>/VISA_REVERSAL_<YYYYMMDD>_<HHMMSS>_<batch>.dat.sha256
    /outbound/clearing/<YYYY-MM-DD>/MC_REVERSAL_<YYYYMMDD>_<HHMMSS>_<batch>.ipm
    /outbound/clearing/<YYYY-MM-DD>/MC_REVERSAL_<YYYYMMDD>_<HHMMSS>_<batch>.ipm.sha256

Exit code is 0 only if every phase that ran succeeded; non-zero otherwise, so
cron / a scheduler can alert.

Cron example (02:30 every night)::

    30 2 * * *  CLEARING_PAN_KEY=... PGHOST=... \
        /usr/bin/python3 /opt/flossx83/clearing-batch/clearing_orchestrator.py \
        >> /var/log/flossx83/clearing.log 2>&1
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback
from datetime import datetime, timezone

from claim_clearing import connect, load_key, requeue_stale, ensure_writable_dir
import visa_clearing_generator as visa
import mastercard_clearing_generator as mc
from issuer_reception import issuer_reception

DEFAULT_OUTBOUND_ROOT = os.environ.get("CLEARING_OUTBOUND_ROOT", "/outbound/clearing")
DEFAULT_STALE_MINUTES = int(os.environ.get("CLEARING_STALE_MINUTES", "720"))  # 12h


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    print(f"[{ts}] [ORCH] {msg}", flush=True)


def housekeeping(stale_minutes: int) -> None:
    """Step A: requeue stale EXPORTING rows before anything else."""
    conn = connect()
    try:
        n = requeue_stale(conn, stale_minutes)
        _log(f"housekeeping: requeued {n} stale EXPORTING row(s) (> {stale_minutes} min)")
    finally:
        conn.close()


def dated_output_dir(root: str, when: datetime | None = None) -> str:
    when = when or datetime.now(timezone.utc)
    path = os.path.join(root, when.strftime("%Y-%m-%d"))
    os.makedirs(path, exist_ok=True)
    return path


def _run_phase(name: str, fn) -> bool:
    """Run one generator phase, isolating any failure. Returns True on success."""
    _log(f"--- {name}: start ---")
    try:
        rc = fn()
        ok = (rc == 0)
        _log(f"--- {name}: {'OK' if ok else f'FAILED (rc={rc})'} ---")
        return ok
    except Exception as exc:  # noqa: BLE001 - we want to keep going to the next scheme
        _log(f"--- {name}: EXCEPTION: {exc} ---")
        traceback.print_exc()
        return False


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    _log(f"clearing run starting | outbound_root={args.outbound_root}")

    # Step A — housekeeping (must run even if the rest is skipped).
    try:
        housekeeping(args.stale_minutes)
    except Exception as exc:  # noqa: BLE001
        _log(f"housekeeping FAILED: {exc} (continuing)")
        traceback.print_exc()

    out_dir = dated_output_dir(args.outbound_root)
    _log(f"output directory: {out_dir}")

    # Step 3 — fail fast if the target dir is not writable, BEFORE any claim.
    if not ensure_writable_dir(out_dir):
        _log(f"ALERT: output directory not writable: {out_dir} — aborting before claim")
        return 1

    # Step B — Visa
    visa_ok = _run_phase("VISA", lambda: visa.run(
        out_dir,
        sending_id=args.visa_sending_id,
        receiving_id=args.visa_receiving_id,
        merchant_country=args.merchant_country,
        include_today=args.include_today,
        confirm=True,
    ))

    # Step C — Mastercard
    mc_ok = _run_phase("MASTERCARD", lambda: mc.run(
        out_dir,
        terminal_type=args.mc_terminal_type,
        tcc=args.mc_tcc,
        txn_env=args.mc_txn_env,
        include_today=args.include_today,
        blocked=True,
        confirm=True,
    ))

    # Step D — Visa reversals
    visa_rev_ok = _run_phase("VISA-REVERSAL", lambda: visa.run_reversals(
        out_dir,
        sending_id=args.visa_sending_id,
        receiving_id=args.visa_receiving_id,
        merchant_country=args.merchant_country,
        include_today=args.include_today,
        confirm=True,
    ))

    # Step E — Mastercard reversals
    mc_rev_ok = _run_phase("MASTERCARD-REVERSAL", lambda: mc.run_reversals(
        out_dir,
        terminal_type=args.mc_terminal_type,
        tcc=args.mc_tcc,
        txn_env=args.mc_txn_env,
        include_today=args.include_today,
        blocked=True,
        confirm=True,
    ))

    # Step F — Issuer reception: consume generated files and post to accounts
    recv_ok = _run_phase("ISSUER-RECEPTION",
                         lambda: issuer_reception(out_dir, load_key()))

    all_ok = visa_ok and mc_ok and visa_rev_ok and mc_rev_ok and recv_ok
    _log(f"clearing run complete | visa={'OK' if visa_ok else 'FAIL'} "
         f"mastercard={'OK' if mc_ok else 'FAIL'} "
         f"visa-rev={'OK' if visa_rev_ok else 'FAIL'} "
         f"mc-rev={'OK' if mc_rev_ok else 'FAIL'} "
         f"issuer-reception={'OK' if recv_ok else 'FAIL'}")
    return 0 if all_ok else 1


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Flossx83 nightly clearing orchestrator (Stage 4)")
    p.add_argument("--outbound-root", default=DEFAULT_OUTBOUND_ROOT)
    p.add_argument("--stale-minutes", type=int, default=DEFAULT_STALE_MINUTES)
    p.add_argument("--include-today", action="store_true",
                   help="Also export today's not-yet-closed transactions")
    # Visa knobs
    p.add_argument("--visa-sending-id", default=os.environ.get("VISA_SENDING_ID", "000000"))
    p.add_argument("--visa-receiving-id", default=os.environ.get("VISA_RECEIVING_ID", "000000"))
    p.add_argument("--merchant-country", default=os.environ.get("CLEARING_MERCHANT_COUNTRY", "788"),
                   help="Fallback ISO numeric country when DE-19 was not captured")
    # Mastercard knobs
    p.add_argument("--mc-terminal-type", default=os.environ.get("MC_TERMINAL_TYPE", "  Z"))
    p.add_argument("--mc-tcc", default=os.environ.get("MC_TCC", "T"))
    p.add_argument("--mc-txn-env", default=os.environ.get("MC_TXN_ENV", "0"))
    return p.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
