package com.floss83.javaswitch.issuer;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA mapping for the {@code cardholder_account} table (STAGE 2 — Issuer role).
 *
 * <p>Read-only in this lot (authorization checks balance but does not modify it;
 * the clearing posting updates the balance later via the Python batch).
 *
 * <p>The {@link #panEnc} column contains the real PAN encrypted with AES-256-GCM
 * ({@code iv(12) || ciphertext+tag}), matching the same scheme used by
 * {@link com.floss83.javaswitch.clearing.ClearingPanCipher}.
 *
 * <p>Lookup is done by full decrypted PAN (scan + decrypt), NOT by
 * {@link #panToken}, because TKN+4 is collision-prone. See the Python
 * {@code issuer_posting.py} module doc for the rationale.
 */
@Entity
@Table(name = "cardholder_account")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CardholderAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "issuer_id", nullable = false)
    private Long issuerId;

    @Column(name = "pan_token", nullable = false, length = 64)
    private String panToken;

    @Column(name = "pan_enc", nullable = false)
    private byte[] panEnc;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "balance", nullable = false)
    private Long balance;

    @Column(name = "credit_limit", nullable = false)
    private Long creditLimit;

    @Column(name = "status", nullable = false, length = 12)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
