#!/usr/bin/env python3
"""
Flossx83 clearing — STAGE 2: Issuer-side posting (reconciliation & balance update).

Prend les ClearingMovement du parser (Émetteur-2), retrouve le compte porteur
par PAN COMPLET déchiffré, applique le débit/crédit sur le solde.

RÈGLE DE SENS (du point de vue du COMPTE PORTEUR) :
  * presentment + achat (DE-3 00/12, Visa TC 05/07)       → DÉBIT
  * presentment + refund (DE-3 20, Visa TC 06)             → CRÉDIT
  * reversal d'achat                                       → CRÉDIT (inverse)
  * reversal de refund                                     → DÉBIT (inverse)

Le dépassement de plafond n'est PAS bloqué ici (clearing post-autorisation).
L'autorisation temps-réel sera le Lot Émetteur-4.

NOTE sur le rapprochement
--------------------------
Le rapprochement se fait par PAN COMPLET déchiffré (comparaison du PAN clair extrait
du fichier de clearing avec le PAN déchiffré de chaque cardholder_account).
Le token TKN+4-chiffres n'est PAS utilisé pour le lookup car il n'est pas unique
(collision possible sur les 4 derniers chiffres → risque de débiter le mauvais compte).
C'est pourquoi le parser (issuer_inbound.py) reconstitue le PAN complet (main+extension)
depuis le CTF Visa — pour permettre ce rapprochement fiable.

IDEMPOTENCE (Réception-2) :
  Chaque mouvement imputé est tracé dans la table posted_movement avec une
  contrainte UNIQUE (network, movement_ref, amount, account_id). Avant
  d'appliquer le débit/crédit, apply_movement tente d'INSÉRER une ligne :
    * INSERT réussi → application du solde (atomique dans la même transaction).
    * Violation UNIQUE → mouvement déjà imputé → retourne ALREADY_POSTED
      sans toucher au solde (via SAVEPOINT pour ne pas invalider le batch).
  La référence d'idempotence (movement_ref) est le raw_ref (STAN/ARN) du
  clearing si présent, sinon un hash SHA-256 déterministe dérivé des champs
  du mouvement + account_id (jamais le PAN clair).
  NOTE : si raw_ref est absent (Visa CTF sans STAN), le hash de repli est
  déterministe mais sa stabilité dépend de la qualité des champs disponibles.
"""

from __future__ import annotations

import hashlib
from typing import Any

from psycopg2 import IntegrityError

from claim_clearing import connect, load_key, decrypt_pan, mask_pan

# --------------------------------------------------------------------------- #
# Règle de sens
# --------------------------------------------------------------------------- #

def _base_sense(movement) -> str:
    r"""Sens naturel de l'opération sous-jacente, sans inversion de reversal.

    Pour un reversal (TC 25/26/27 ou DE-24=202), le sens de base est
    celui du présentment original (TC 25 → TC 05 → debit, etc.).
    """
    if movement.network == "MASTERCARD":
        pc = movement.processing_code or ""
        if pc.startswith("20"):
            return "credit"
        return "debit"

    if movement.network == "VISA":
        tc = movement.mti_or_tc
        if tc in ("06", "26"):
            return "credit"
        if tc in ("05", "07", "25", "27"):
            return "debit"
        return "debit"

    return "debit"


def sense_for_movement(movement) -> str:
    """Sens effectif pour le compte porteur : ``'debit'`` ou ``'credit'``.

    Si ``kind='reversal'``, le sens est inversé :
    reversal d'achat → crédite le compte ; reversal de refund → débite.
    """
    base = _base_sense(movement)
    if movement.kind == "reversal":
        return "credit" if base == "debit" else "debit"
    return base


# --------------------------------------------------------------------------- #
# Référence d'idempotence
# --------------------------------------------------------------------------- #

def build_movement_ref(movement, account_id: int) -> str:
    """Référence déterministe pour la déduplication d'imputation.

    - Si ``movement.raw_ref`` est présent (STAN/ARN du clearing), l'utilise tel quel.
    - Sinon, dérive un hash SHA-256 hex (16 premiers caractères) depuis les champs
      du mouvement + account_id. Ne contient JAMAIS de PAN en clair (utilise
      ``mask_pan``). Déterministe : deux appels avec les mêmes arguments produisent
      la même référence.

    La stabilité du fallback dépend de la qualité des champs disponibles côté
    Visa CTF (où raw_ref peut être None). La contrainte UNIQUE inclut account_id
    pour limiter le risque de faux positifs.
    """
    if movement.raw_ref:
        return movement.raw_ref
    pan_masked = mask_pan(movement.pan)
    raw = (
        f"{movement.network}:{movement.mti_or_tc}:{movement.amount}:"
        f"{pan_masked}:{account_id}:{movement.kind}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# --------------------------------------------------------------------------- #
# Application au compte (rapprochement par PAN complet déchiffré)
# --------------------------------------------------------------------------- #

def apply_movement(conn, movement, key: bytes | None = None) -> dict[str, Any]:
    """Applique un clearing movement au compte porteur.

    Le rapprochement se fait par PAN COMPLET déchiffré :
      1. Charge tous les comptes (cardholder_account).
      2. Pour chaque compte, déchiffre pan_enc avec decrypt_pan() et compare
         au movement.pan (égalité stricte du PAN complet).
      3. Si match → applique le sens, met à jour le solde.

    Retourne un dict récapitulatif (status, solde avant/après, sens…).
    En cas d'absence de compte ou de statut bloqué, retourne un statut
    d'erreur sans modifier la base.

    Aucun PAN en clair n'est jamais logué ni retourné (mask_pan partout).
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT id, pan_enc, balance, credit_limit, status, currency "
        "FROM cardholder_account")
    all_accounts = cur.fetchall()

    account_id = None
    balance = 0
    credit_limit = 0
    active_status = None
    currency = None

    for row in all_accounts:
        aid, pan_enc, bal, cl, st, cur_c = row
        try:
            clear_pan = decrypt_pan(bytes(pan_enc), key)
        except Exception:
            continue
        if clear_pan == movement.pan:
            account_id = aid
            balance = bal
            credit_limit = cl
            active_status = st
            currency = cur_c
            break

    if account_id is None:
        return {
            "status": "NO_ACCOUNT",
            "pan_masked": mask_pan(movement.pan),
            "movement_amount": movement.amount,
            "network": movement.network,
            "mti_or_tc": movement.mti_or_tc,
            "error": "No cardholder_account matches the movement PAN",
        }

    active_status = (active_status or "ACTIVE").strip().upper()

    if active_status in ("BLOCKED", "CLOSED"):
        return {
            "status": "REJECTED_STATUS",
            "account_id": account_id,
            "pan_masked": mask_pan(movement.pan),
            "current_balance": balance,
            "account_status": active_status,
            "movement_amount": movement.amount,
            "network": movement.network,
            "mti_or_tc": movement.mti_or_tc,
            "error": f"Account status is {active_status}",
        }

    sense = sense_for_movement(movement)
    amount = movement.amount
    movement_ref = build_movement_ref(movement, account_id)

    # SAVEPOINT : un doublon d'idempotence ne doit pas invalider tout le batch
    cur.execute("SAVEPOINT sp_idempotency")
    try:
        cur.execute(
            "INSERT INTO posted_movement "
            "(account_id, network, mti_or_tc, amount, movement_ref, sense) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (account_id, movement.network, movement.mti_or_tc,
             amount, movement_ref, sense),
        )
    except IntegrityError:
        cur.execute("ROLLBACK TO SAVEPOINT sp_idempotency")
        return {
            "status": "ALREADY_POSTED",
            "account_id": account_id,
            "pan_masked": mask_pan(movement.pan),
            "movement_ref": movement_ref,
            "network": movement.network,
            "mti_or_tc": movement.mti_or_tc,
            "amount": amount,
            "sense": sense,
            "account_status": active_status,
        }

    if sense == "debit":
        new_balance = balance - amount
    else:
        new_balance = balance + amount

    cur.execute(
        "UPDATE cardholder_account SET balance = %s WHERE id = %s",
        (new_balance, account_id))

    return {
        "status": "APPLIED",
        "account_id": account_id,
        "pan_masked": mask_pan(movement.pan),
        "sense": sense,
        "amount": amount,
        "movement_ref": movement_ref,
        "old_balance": balance,
        "new_balance": new_balance,
        "account_status": active_status,
        "network": movement.network,
        "mti_or_tc": movement.mti_or_tc,
        "processing_code": movement.processing_code,
        "currency": movement.currency,
    }


# --------------------------------------------------------------------------- #
# Batch processing
# --------------------------------------------------------------------------- #

def post_clearing_file(path: str, key: bytes | None = None) -> list[dict[str, Any]]:
    """Lit un fichier de clearing et applique tous les movements en transaction.

    Args:
        path:  Chemin du fichier .ipm ou .dat.
        key:   Clé AES-256-GCM pour déchiffrer les PAN des comptes.

    Retourne la liste des récapitulatifs (un par movement).
    """
    from issuer_inbound import read_clearing_file

    movements = read_clearing_file(path)
    results: list[dict[str, Any]] = []

    conn = connect()
    try:
        for movement in movements:
            result = apply_movement(conn, movement, key=key)
            results.append(result)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return results
