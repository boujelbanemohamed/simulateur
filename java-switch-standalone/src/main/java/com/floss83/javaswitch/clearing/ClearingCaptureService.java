package com.floss83.javaswitch.clearing;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.Year;
import java.time.format.DateTimeFormatter;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.floss83.javaswitch.iso8583.Iso8583Message;

/**
 * Captures approved transactions into {@code clearing_transaction} (STAGE 1).
 * <p>
 * Called from {@code IsoMessageController} once a message has been parsed and
 * the PAN tokenized. Only messages carrying <b>DE-39 = "00"</b> are persisted;
 * everything else is ignored. The real PAN is encrypted via
 * {@link ClearingPanCipher} before it ever touches the database.
 * <p>
 * Capture failures must never break the live switch response, so the caller
 * wraps {@link #capture} in a try/catch and logs only.
 */
@Service
public class ClearingCaptureService {

    private static final String APPROVED = "00";

    // ISO 8583 data elements we read.
    private static final int DE_PAN = 2;
    private static final int DE_PROCESSING_CODE = 3;
    private static final int DE_AMOUNT = 4;
    private static final int DE_TRANSMISSION_DT = 7;
    private static final int DE_STAN = 11;
    private static final int DE_LOCAL_TIME = 12;
    private static final int DE_LOCAL_DATE = 13;
    private static final int DE_MCC = 18;
    private static final int DE_ACQUIRING_COUNTRY = 19;
    private static final int DE_POS_ENTRY = 22;
    private static final int DE_ACQUIRER_ID = 32;
    private static final int DE_RRN = 37;
    private static final int DE_AUTH_ID = 38;
    private static final int DE_RESPONSE_CODE = 39;
    private static final int DE_TERMINAL_ID = 41;
    private static final int DE_ACCEPTOR_ID = 42;
    private static final int DE_ACCEPTOR_NAME_LOC = 43;
    private static final int DE_CURRENCY = 49;

    private static final DateTimeFormatter DE7_FMT = DateTimeFormatter.ofPattern("MMddHHmmss");

    private final ClearingTransactionRepository repository;
    private final ClearingPanCipher panCipher;

    public ClearingCaptureService(ClearingTransactionRepository repository,
                                  ClearingPanCipher panCipher) {
        this.repository = repository;
        this.panCipher = panCipher;
    }

    /**
     * Persist the transaction iff it is approved and routable.
     *
     * @param msg      the parsed ISO 8583 message
     * @param rawPan   the clear PAN (DE-2) as received, before tokenization
     * @param panToken the HSM token already computed by the controller
     */
    public void capture(Iso8583Message msg, String rawPan, String panToken) {
        if (msg == null) {
            return;
        }
        String responseCode = msg.getDataElement(DE_RESPONSE_CODE);
        if (!APPROVED.equals(responseCode)) {
            return; // not approved -> nothing to clear
        }
        if (rawPan == null || rawPan.isBlank()) {
            System.out.println("[CLEARING] skip capture: no PAN present");
            return;
        }

        String network = resolveNetwork(rawPan);
        if (network == null) {
            System.out.println("[CLEARING] skip capture: PAN BIN not VISA/MASTERCARD");
            return; // not a scheme we generate clearing for
        }

        ClearingTransaction txn = ClearingTransaction.builder()
                .mti(msg.getMti())
                .stan(msg.getDataElement(DE_STAN))
                .rrn(msg.getDataElement(DE_RRN))
                .panToken(panToken)
                .panEnc(panCipher.encrypt(rawPan))
                .processingCode(msg.getDataElement(DE_PROCESSING_CODE))
                .txnAmount(parseAmount(msg.getDataElement(DE_AMOUNT)))
                .txnCurrency(msg.getDataElement(DE_CURRENCY))
                .transmissionTs(parseTransmission(msg.getDataElement(DE_TRANSMISSION_DT)))
                .localTxnDate(msg.getDataElement(DE_LOCAL_DATE))
                .localTxnTime(msg.getDataElement(DE_LOCAL_TIME))
                .mcc(msg.getDataElement(DE_MCC))
                .merchantCountry(msg.getDataElement(DE_ACQUIRING_COUNTRY))
                .acquirerId(msg.getDataElement(DE_ACQUIRER_ID))
                .terminalId(msg.getDataElement(DE_TERMINAL_ID))
                .acceptorId(msg.getDataElement(DE_ACCEPTOR_ID))
                .acceptorNameLoc(msg.getDataElement(DE_ACCEPTOR_NAME_LOC))
                .posEntryMode(msg.getDataElement(DE_POS_ENTRY))
                .network(network)
                .responseCode(responseCode)
                .authIdResponse(msg.getDataElement(DE_AUTH_ID))
                .status("APPROVED")
                .createdAt(Instant.now())
                .build();

        try {
            repository.save(txn);
            System.out.printf("[CLEARING] captured %s txn STAN=%s amount=%d%n",
                    network, txn.getStan(), txn.getTxnAmount());
        } catch (DataIntegrityViolationException dup) {
            // uq_capture (stan, transmission_ts, acquirer_id) -> already captured. Idempotent.
            System.out.printf("[CLEARING] duplicate capture ignored STAN=%s%n", txn.getStan());
        }
    }

    /** VISA = BIN starts with 4; MASTERCARD = 51-55 or 2221-2720. */
    static String resolveNetwork(String pan) {
        if (pan == null || pan.length() < 6) {
            return null;
        }
        if (pan.charAt(0) == '4') {
            return "VISA";
        }
        int two = Integer.parseInt(pan.substring(0, 2));
        if (two >= 51 && two <= 55) {
            return "MASTERCARD";
        }
        int four = Integer.parseInt(pan.substring(0, 4));
        if (four >= 2221 && four <= 2720) {
            return "MASTERCARD";
        }
        return null;
    }

    /** DE-4 is fixed 12n in minor units, no decimal point. */
    static long parseAmount(String de4) {
        if (de4 == null || de4.isBlank()) {
            return 0L;
        }
        return Long.parseLong(de4.trim());
    }

    /** DE-7 is MMDDhhmmss in GMT; we attach the current year (best effort for a lab). */
    static Instant parseTransmission(String de7) {
        if (de7 == null || de7.length() != 10) {
            return Instant.now();
        }
        try {
            LocalDateTime ldt = LocalDateTime.parse(
                    Year.now(ZoneOffset.UTC).getValue() + de7,
                    DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
            return ldt.toInstant(ZoneOffset.UTC);
        } catch (Exception e) {
            return Instant.now();
        }
    }
}
