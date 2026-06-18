package com.floss83.javaswitch.clearing;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Persistence port for {@link ClearingTransaction} (STAGE 1).
 * <p>
 * The Java side only ever <em>writes</em> rows (capture). Reading/claiming for
 * export is owned by the standalone Python batch, so no custom read methods are
 * needed here yet.
 */
public interface ClearingTransactionRepository
        extends JpaRepository<ClearingTransaction, Long> {
}
