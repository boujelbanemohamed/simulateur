package com.floss83.javaswitch.clearing;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA mapping for the {@code clearing_transaction} table (STAGE 1).
 * <p>
 * One row = one approved (DE-39 = "00") financial transaction captured at the
 * controller trust boundary, ready to be picked up by the Python clearing
 * batch. The real PAN is held only in {@link #panEnc} (AES-256-GCM), never in
 * clear and never logged.
 * <p>
 * Lifecycle of {@link #status}: {@code APPROVED} → {@code EXPORTING} (claimed
 * by a batch run) → {@code EXPORTED} (file written + checksummed). A crash
 * between the two leaves the row in {@code EXPORTING}; the batch's housekeeping
 * step reverts stale ones to {@code APPROVED}.
 */
@Entity
@Table(
    name = "clearing_transaction",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_capture",
        columnNames = {"stan", "transmission_ts", "acquirer_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClearingTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mti", nullable = false, length = 4)
    private String mti;

    @Column(name = "stan", nullable = false, length = 6)
    private String stan;

    @Column(name = "rrn", length = 12)
    private String rrn;

    /** HSM token (the PCI-safe view kept by the switch). */
    @Column(name = "pan_token", nullable = false, length = 64)
    private String panToken;

    /** Real PAN encrypted at rest: AES-256-GCM, stored as {@code iv(12) || ciphertext+tag}. */
    @Column(name = "pan_enc", nullable = false)
    private byte[] panEnc;

    @Column(name = "processing_code", nullable = false, length = 6)
    private String processingCode;

    /** DE-4 transaction amount, in minor units (no decimal point). */
    @Column(name = "txn_amount", nullable = false)
    private Long txnAmount;

    @Column(name = "txn_currency", nullable = false, length = 3)
    private String txnCurrency;

    @Column(name = "transmission_ts", nullable = false)
    private Instant transmissionTs;

    @Column(name = "local_txn_date", length = 4)
    private String localTxnDate;

    @Column(name = "local_txn_time", length = 6)
    private String localTxnTime;

    @Column(name = "mcc", length = 4)
    private String mcc;

    @Column(name = "merchant_country", length = 3)
    private String merchantCountry;

    @Column(name = "acquirer_id", length = 11)
    private String acquirerId;

    @Column(name = "terminal_id", length = 8)
    private String terminalId;

    @Column(name = "acceptor_id", length = 15)
    private String acceptorId;

    @Column(name = "acceptor_name_loc", length = 40)
    private String acceptorNameLoc;

    @Column(name = "pos_entry_mode", length = 3)
    private String posEntryMode;

    @Column(name = "network", nullable = false, length = 10)
    private String network;

    @Column(name = "response_code", nullable = false, length = 2)
    private String responseCode;

    @Column(name = "auth_id_response", length = 6)
    private String authIdResponse;

    /** APPROVED | EXPORTING | EXPORTED. */
    @Column(name = "status", nullable = false, length = 12)
    private String status;

    @Column(name = "export_batch_id", length = 40)
    private String exportBatchId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "exported_at")
    private Instant exportedAt;
}
