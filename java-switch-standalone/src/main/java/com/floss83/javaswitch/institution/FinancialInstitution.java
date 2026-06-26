package com.floss83.javaswitch.institution;

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
 * JPA mapping for the {@code financial_institution} table (STAGE 3 — unified
 * acquirer + issuer model).
 *
 * <p>A single bank can be an acquirer, an issuer, or both (role =
 * {@code ACQUIRER}, {@code ISSUER}, or {@code BOTH}). The {@link #acquirerId}
 * field carries DE-32 when the role includes acquirer; it is null for pure
 * issuers.
 *
 * <p>This table COEXISTS with the older {@code issuer} table (Stage 2) which
 * is still referenced by {@code cardholder_account.issuer_id}. The switch
 * from issuer to financial_institution will happen in a dedicated migration
 * lot once the unified model is validated and the UI is in place.
 */
@Entity
@Table(name = "financial_institution")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FinancialInstitution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bin", nullable = false, length = 8, unique = true)
    private String bin;

    @Column(name = "name", nullable = false, length = 60)
    private String name;

    @Column(name = "country", nullable = false, length = 3)
    private String country;

    @Column(name = "network", nullable = false, length = 10)
    private String network;

    @Column(name = "role", nullable = false, length = 10)
    private String role;

    @Column(name = "acquirer_id", length = 11)
    private String acquirerId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
