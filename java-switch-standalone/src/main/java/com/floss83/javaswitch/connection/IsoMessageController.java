package com.floss83.javaswitch.connection;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.floss83.javaswitch.clearing.ClearingCaptureService;
import com.floss83.javaswitch.clearing.ClearingTransactionRepository;
import com.floss83.javaswitch.iso8583.Iso8583Message;
import com.floss83.javaswitch.iso8583.Iso8583ParseException;
import com.floss83.javaswitch.iso8583.Iso8583Parser;

/**
 * Real ISO 8583 entry point for the standalone harness.
 * <p>
 * Parses the ASCII ISO 8583 message sent by the POS terminal (same wire format
 * as the Flossx83 switch), then runs the clearing capture: approved
 * (DE-39 = "00") Visa/Mastercard transactions are encrypted and persisted to
 * clearing_transaction. The response echoes the parsed fields (PAN tokenized)
 * and whether a clearing row was captured.
 * <p>
 * This mirrors the patch that would be applied to the real Flossx83
 * IsoMessageController; here the PAN token is computed inline (the standalone
 * has no HSM/TokenizationService).
 */
@RestController
@RequestMapping("/api/iso8583")
public class IsoMessageController {

    private static final int FIELD_PAN = 2;

    private final Iso8583Parser parser = new Iso8583Parser();
    private final ClearingCaptureService clearingCaptureService;
    private final ClearingTransactionRepository repository;

    public IsoMessageController(ClearingCaptureService clearingCaptureService,
                                ClearingTransactionRepository repository) {
        this.clearingCaptureService = clearingCaptureService;
        this.repository = repository;
    }

    @PostMapping(produces = "application/json")
    public ResponseEntity<?> receiveIsoMessage(@RequestBody String isoMessage) {
        try {
            Iso8583Message parsed = parser.parse(isoMessage);
            Map<Integer, String> fields = new TreeMap<>(parsed.getMutableDataElements());

            String rawPan = fields.get(FIELD_PAN);
            String panToken = (rawPan == null || rawPan.length() < 4)
                    ? null
                    : "TKN" + rawPan.substring(rawPan.length() - 4);

            // Clearing capture (only approved Visa/Mastercard are stored).
            long before = repository.count();
            try {
                clearingCaptureService.capture(parsed, rawPan, panToken);
            } catch (Exception captureEx) {
                System.err.println("[CLEARING] capture failed (non-fatal): " + captureEx.getMessage());
            }
            boolean captured = repository.count() > before;

            // Build response: PAN tokenized, other fields as parsed.
            Map<String, Object> outputFields = new LinkedHashMap<>();
            if (panToken != null) outputFields.put("2_PAN_tokenized", panToken);
            for (Map.Entry<Integer, String> e : fields.entrySet()) {
                if (e.getKey() == FIELD_PAN) continue;
                outputFields.put(String.valueOf(e.getKey()), e.getValue());
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("mti", parsed.getMti());
            result.put("captured", captured);
            result.put("fields", outputFields);
            return ResponseEntity.ok(result);

        } catch (Iso8583ParseException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Parse error: " + ex.getMessage()));
        }
    }
}
