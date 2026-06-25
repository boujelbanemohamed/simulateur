package com.floss83.javaswitch.issuer;

import java.util.List;

import org.springframework.stereotype.Service;

import com.floss83.javaswitch.clearing.ClearingPanCipher;

/**
 * Issuer-side authorization engine — decides DE-39 response code based on
 * the real account state.
 *
 * <p>TRANSCRIPTION EXACTE de {@code issuer_authorization.py} (Python référence).
 * Toute divergence entre ce service et le module Python est un bug.
 *
 * <p>Découplage clé : ce service NE modifie PAS le solde du compte.
 * L'autorisation (ce service) décide en amont si la transaction peut avoir
 * lieu ; le débit effectif se fait a posteriori via le clearing posting
 * (batch Python issuer_posting.py).
 *
 * <p>Mode hybride : si aucun compte ne correspond au PAN (ou si le déchiffrement
 * échoue), retourne {@code null} — l'appelant conserve le DE-39 entrant.
 */
@Service
public class IssuerAuthorizationService {

    static final String AUTH_APPROVED = "00";
    static final String AUTH_DECLINED_FUNDS = "51";
    static final String AUTH_DECLINED_ACCOUNT = "57";

    private final CardholderAccountRepository accountRepository;
    private final ClearingPanCipher panCipher;

    public IssuerAuthorizationService(CardholderAccountRepository accountRepository,
                                      ClearingPanCipher panCipher) {
        this.accountRepository = accountRepository;
        this.panCipher = panCipher;
    }

    /**
     * Décide si la transaction est autorisée du point de vue émetteur.
     *
     * @param pan             PAN en clair (DE-2).
     * @param amount          Montant en minor units (DE-4).
     * @param currencyTxn     Devise de la transaction (DE-49).
     * @param processingCode  Processing code (DE-3).
     * @return code DE-39 ("00", "51", "57") si un compte correspond,
     *         {@code null} si aucun compte trouvé (mode hybride).
     */
    public String authorize(String pan, long amount, String currencyTxn,
                            String processingCode) {
        String sense = deriveSense(processingCode);
        List<CardholderAccount> accounts = accountRepository.findAll();

        for (CardholderAccount account : accounts) {
            String clearPan;
            try {
                clearPan = panCipher.decrypt(account.getPanEnc());
            } catch (Exception e) {
                // Échec de déchiffrement : on ignore ce compte et on continue
                continue;
            }
            if (pan.equals(clearPan)) {
                return decide(amount, sense,
                              account.getBalance(), account.getCreditLimit(),
                              account.getStatus(), account.getCurrency(),
                              currencyTxn);
            }
        }
        // Aucun compte correspondant → mode hybride (l'appelant garde le DE-39 entrant)
        return null;
    }

    // ------------------------------------------------------------------ //
    // Décision pure (réplique decide_authorization d'issuer_authorization.py)
    // ------------------------------------------------------------------ //

    /**
     * Règle de décision (référence : Python {@code decide_authorization()}).
     *
     * <ul>
     *   <li>amount ≤ 0 → "57"</li>
     *   <li>status ≠ ACTIVE → "57"</li>
     *   <li>credit (refund) → "00" (pas de vérification de fonds)</li>
     *   <li>débit ≤ disponible (balance + credit_limit) → "00"</li>
     *   <li>débit &gt; disponible → "51"</li>
     *   <li>devise différente : NON bloquant (conversion réseau)</li>
     * </ul>
     */
    private static String decide(long amount, String sense,
                                  long balance, long creditLimit,
                                  String status, String currencyAccount,
                                  String currencyTxn) {
        if (amount <= 0) {
            return AUTH_DECLINED_ACCOUNT;
        }

        String st = (status != null ? status.trim() : "").toUpperCase();
        if (!"ACTIVE".equals(st)) {
            return AUTH_DECLINED_ACCOUNT;
        }

        // Devise : différence non bloquante (la conversion relève du réseau)
        // (pas d'action — on continue)

        if ("credit".equals(sense)) {
            return AUTH_APPROVED;
        }

        long available = balance + creditLimit;
        if (amount <= available) {
            return AUTH_APPROVED;
        }

        return AUTH_DECLINED_FUNDS;
    }

    /**
     * Dérive le sens de la transaction depuis le DE-3 processing code.
     *
     * <p>Règle (identique à {@code issuer_posting._base_sense} et
     * {@code issuer_authorization.AuthorizationRequest.from_processing_code}) :
     * préfixe "20" → refund → credit ; sinon → debit.
     */
    static String deriveSense(String processingCode) {
        String prefix = (processingCode != null && processingCode.length() >= 2)
                ? processingCode.substring(0, 2) : "00";
        return "20".equals(prefix) ? "credit" : "debit";
    }
}
