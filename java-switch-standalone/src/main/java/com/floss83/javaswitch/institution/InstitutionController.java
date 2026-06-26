package com.floss83.javaswitch.institution;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin REST endpoints for {@link FinancialInstitution} management.
 *  Routes are automatically protected by AdminSecurityConfig (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/institutions")
public class InstitutionController {

    private static final Set<String> VALID_ROLES = Set.of("ACQUIRER", "ISSUER", "BOTH");

    private final FinancialInstitutionRepository repository;

    public InstitutionController(FinancialInstitutionRepository repository) {
        this.repository = repository;
    }

    @GetMapping(produces = "application/json")
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String role) {
        return repository.findAll().stream()
                .filter(fi -> role == null || role.isBlank()
                        || role.equalsIgnoreCase(fi.getRole()))
                .map(this::toRow)
                .toList();
    }

    @PostMapping(produces = "application/json")
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        // --- field presence validation ---
        String bin = str(body, "bin");
        String name = str(body, "name");
        String country = str(body, "country");
        String network = str(body, "network");
        String role = str(body, "role");

        if (bin == null || name == null || country == null || network == null || role == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Missing required fields: bin, name, country, network, role"));
        }

        // --- role validation ---
        if (!VALID_ROLES.contains(role.toUpperCase())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid role '" + role + "'; must be one of: " + VALID_ROLES));
        }
        role = role.toUpperCase();

        // --- acquirer_id required for ACQUIRER / BOTH ---
        String acquirerId = str(body, "acquirer_id");
        if (!"ISSUER".equals(role) && (acquirerId == null || acquirerId.isBlank())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "acquirer_id is required when role is " + role));
        }

        // --- duplicate bin check ---
        if (repository.findByBin(bin).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "Institution with bin '" + bin + "' already exists"));
        }

        // --- persist ---
        FinancialInstitution entity = FinancialInstitution.builder()
                .bin(bin)
                .name(name)
                .country(country)
                .network(network)
                .role(role)
                .acquirerId(acquirerId)
                .createdAt(Instant.now())
                .build();

        FinancialInstitution saved = repository.save(entity);

        return ResponseEntity.status(HttpStatus.CREATED).body(toRow(saved));
    }

    @PutMapping(value = "/{id}", produces = "application/json")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        FinancialInstitution entity = repository.findById(id).orElse(null);
        if (entity == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "Institution " + id + " not found"));
        }

        // bin is NOT modifiable — silently ignore if present
        // (no 400 error to avoid breaking clients that echo the field)

        String name = str(body, "name");
        String country = str(body, "country");
        String network = str(body, "network");
        String role = str(body, "role");

        if (name == null || country == null || network == null || role == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Missing required fields: name, country, network, role"));
        }

        if (!VALID_ROLES.contains(role.toUpperCase())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid role '" + role + "'; must be one of: " + VALID_ROLES));
        }
        role = role.toUpperCase();

        String acquirerId = str(body, "acquirer_id");
        if (!"ISSUER".equals(role) && (acquirerId == null || acquirerId.isBlank())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "acquirer_id is required when role is " + role));
        }

        entity.setName(name);
        entity.setCountry(country);
        entity.setNetwork(network);
        entity.setRole(role);
        entity.setAcquirerId(acquirerId);

        FinancialInstitution saved = repository.save(entity);

        return ResponseEntity.ok(toRow(saved));
    }

    // -- helpers ----------------------------------------------------------

    private Map<String, Object> toRow(FinancialInstitution fi) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", fi.getId());
        m.put("bin", fi.getBin());
        m.put("name", fi.getName());
        m.put("country", fi.getCountry());
        m.put("network", fi.getNetwork());
        m.put("role", fi.getRole());
        m.put("acquirer_id", fi.getAcquirerId());
        m.put("created_at", String.valueOf(fi.getCreatedAt()));
        return m;
    }

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return (v instanceof String s && !s.isBlank()) ? s.trim() : null;
    }
}
