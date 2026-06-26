package com.floss83.javaswitch.institution;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data JPA repository for {@link FinancialInstitution}.
 *
 * <p>Supports admin CRUD operations. The {@code findByBin} method is used
 * by the controller to detect duplicates before creation (409 Conflict).
 */
public interface FinancialInstitutionRepository
        extends JpaRepository<FinancialInstitution, Long> {

    Optional<FinancialInstitution> findByBin(String bin);
}
