#!/usr/bin/env python3
"""
Flossx83 clearing — STAGE 2: Issuer-side authorization engine (pure, testable).

Distingue bien l'autorisation (ce lot) du clearing posting (issuer_posting.py, Lot 2-3) :

    AUTORISATION (ce lot)         ↔    CLEARING POSTING (Lot 2-3)
    Décide EN AMONT si la txn     ↔    Impute un fait DÉJÀ arrivé
    peut avoir lieu (DE-39).       ↔    (a posteriori).
    Ne modifie PAS le solde.      ↔    Modifie le solde.

L'autorisation est donc la fonction qui détermine le response code DE-39 (00=approuvé,
51=fonds insuffisants, 57=compte non autorisé) côté émetteur.

DÉFINITION du disponible :
    available = balance + credit_limit
    (modèle compte à crédit : le porteur peut dépenser jusqu'à son solde plus son plafond).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from claim_clearing import connect, load_key, decrypt_pan, mask_pan

# --------------------------------------------------------------------------- #
# Codes réponse DE-39 (ISO 8583 — valeurs standard)
# --------------------------------------------------------------------------- #

AUTH_APPROVED = "00"
AUTH_DECLINED_FUNDS = "51"      # insufficient funds
AUTH_DECLINED_ACCOUNT = "57"    # transaction not permitted (compte BLOCKED/CLOSED/inconnu)


# --------------------------------------------------------------------------- #
# Dataclasses
# --------------------------------------------------------------------------- #

@dataclass
class AuthorizationRequest:
    """Requête d'autorisation soumise au moteur de décision.

    Fields:
        pan:     PAN en clair.
        amount:  Montant en minor units (toujours > 0, validé par le moteur).
        currency: Code devise ISO 3 chiffres.
        sense:   'debit' (achat/retrait) ou 'credit' (refund/remboursement).
    """
    pan: str
    amount: int
    currency: str
    sense: str

    @classmethod
    def from_processing_code(
        cls, pan: str, amount: int, currency: str, processing_code: str,
    ) -> AuthorizationRequest:
        """Construit une requête dont le sens est dérivé du processing code.

        Règle (identique à issuer_posting._base_sense) :
          préfixe "20" → refund → credit ; sinon → debit.
        """
        prefix = (processing_code or "000000")[:2]
        sense = "credit" if prefix == "20" else "debit"
        return cls(pan=pan, amount=amount, currency=currency, sense=sense)


@dataclass
class AuthorizationDecision:
    """Décision d'autorisation.

    Fields:
        approved:        True si la transaction est autorisée.
        response_code:   Code DE-39 (00, 51, 57…).
        reason:          Message lisible.
        available_before: Disponible avant transaction (None si non applicable).
        account_status:  Statut du compte (None si compte inconnu).
    """
    approved: bool
    response_code: str
    reason: str
    available_before: int | None = None
    account_status: str | None = None


# --------------------------------------------------------------------------- #
# Moteur de décision PUR (sans DB)
# --------------------------------------------------------------------------- #

def decide_authorization(
    *,
    amount: int,
    sense: str,
    balance: int = 0,
    credit_limit: int = 0,
    status: str = "ACTIVE",
    currency_account: str = "788",
    currency_txn: str = "788",
) -> AuthorizationDecision:
    """Décide si une transaction est autorisée, sans aucun accès DB.

    Arguments :
      amount:         Montant en minor units.
      sense:          'debit' ou 'credit'.
      balance:        Solde actuel du compte.
      credit_limit:   Plafond de crédit.
      status:         Statut du compte (ACTIVE|BLOCKED|CLOSED).
      currency_account: Devise du compte.
      currency_txn:   Devise de la transaction.

    Retourne une AuthorizationDecision toujours (jamais d'exception).
    """
    # Montant invalide
    if amount <= 0:
        return AuthorizationDecision(
            approved=False, response_code=AUTH_DECLINED_ACCOUNT,
            reason=f"Invalid transaction amount: {amount}")

    # Statut du compte
    st = (status or "ACTIVE").strip().upper()
    if st != "ACTIVE":
        return AuthorizationDecision(
            approved=False, response_code=AUTH_DECLINED_ACCOUNT,
            reason=f"Account status is {st}", account_status=st)

    # Devise : en mono-devise simulateur, une différence n'est pas un motif
    # de refus de fonds (la conversion relève du réseau). On approuve et on
    # documente la réserve.
    if currency_txn != currency_account:
        pass  # approuvé (la devise n'engage pas les fonds)

    # Refund (crédit) : toujours approuvé si compte actif
    if sense == "credit":
        return AuthorizationDecision(
            approved=True, response_code=AUTH_APPROVED,
            reason="Credit (refund) approved — no funds check needed",
            account_status=st)

    # Débit : vérifier le disponible
    available = balance + credit_limit
    if amount <= available:
        return AuthorizationDecision(
            approved=True, response_code=AUTH_APPROVED,
            reason=f"Approved — amount {amount} <= available {available}",
            available_before=available, account_status=st)

    return AuthorizationDecision(
        approved=False, response_code=AUTH_DECLINED_FUNDS,
        reason=f"Insufficient funds — amount {amount} > available {available}",
        available_before=available, account_status=st)


# --------------------------------------------------------------------------- #
# Autorisation avec accès DB (retrouve le compte par PAN clair)
# --------------------------------------------------------------------------- #

def authorize_account(conn, request: AuthorizationRequest,
                      key: bytes | None = None) -> AuthorizationDecision:
    """Autorise une transaction en retrouvant le compte par PAN déchiffré.

    Même mécanisme que issuer_posting.apply_movement : scanne tous les comptes,
    déchiffre chaque pan_enc, compare au request.pan.

    NE MODIFIE PAS le solde (l'autorisation est découplée du débit effectif ;
    le clearing posting débitera plus tard).
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT id, pan_enc, balance, credit_limit, status, currency "
        "FROM cardholder_account")
    all_accounts = cur.fetchall()

    for row in all_accounts:
        account_id, pan_enc, balance, credit_limit, status, currency = row
        try:
            clear_pan = decrypt_pan(bytes(pan_enc), key)
        except Exception:
            continue
        if clear_pan == request.pan:
            return decide_authorization(
                amount=request.amount,
                sense=request.sense,
                balance=balance,
                credit_limit=credit_limit,
                status=status,
                currency_account=currency,
                currency_txn=request.currency)

    return AuthorizationDecision(
        approved=False, response_code=AUTH_DECLINED_ACCOUNT,
        reason=f"Unknown account (PAN {mask_pan(request.pan)})",
    )
