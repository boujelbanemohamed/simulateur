package com.floss83.javaswitch.issuer;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data JPA repository for {@link CardholderAccount}.
 *
 * <p>Only {@code findAll()} is used for authorization (the matching is done
 * by full decrypted PAN, not by pan_token). No query-by-token method is
 * provided — see {@code issuer_posting.py} for the rationale (TKN+4 collisions).
 */
public interface CardholderAccountRepository
        extends JpaRepository<CardholderAccount, Long> {
}
