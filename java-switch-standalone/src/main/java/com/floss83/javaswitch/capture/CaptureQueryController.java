package com.floss83.javaswitch.capture;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.floss83.javaswitch.clearing.ClearingTransactionRepository;

/**
 * Read-only view of captured transactions (no PAN). Handy to verify what the
 * POS / ISO 8583 endpoint has stored:  GET http://localhost:8080/api/capture
 */
@RestController
@RequestMapping("/api/capture")
public class CaptureQueryController {

    private final ClearingTransactionRepository repository;

    public CaptureQueryController(ClearingTransactionRepository repository) {
        this.repository = repository;
    }

    @GetMapping(produces = "application/json")
    public List<Map<String, Object>> list() {
        return repository.findAll().stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("network", t.getNetwork());
            m.put("stan", t.getStan());
            m.put("amount_minor", t.getTxnAmount());
            m.put("currency", t.getTxnCurrency());
            m.put("status", t.getStatus());
            return m;
        }).toList();
    }
}
