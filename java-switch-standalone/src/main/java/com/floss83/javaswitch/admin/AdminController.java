package com.floss83.javaswitch.admin;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.floss83.javaswitch.clearing.ClearingTransaction;
import com.floss83.javaswitch.clearing.ClearingTransactionRepository;

/** Dashboard data + actions. All routes here are gated by AdminSecurityConfig. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final ClearingTransactionRepository repository;
    private final ClearingRunner runner;

    public AdminController(ClearingTransactionRepository repository, ClearingRunner runner) {
        this.repository = repository;
        this.runner = runner;
    }

    @GetMapping(value = "/transactions", produces = "application/json")
    public List<Map<String, Object>> transactions(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String network) {
        return repository.findAll().stream()
                .filter(t -> status == null || status.isBlank() || status.equalsIgnoreCase(t.getStatus()))
                .filter(t -> network == null || network.isBlank() || network.equalsIgnoreCase(t.getNetwork()))
                .sorted(Comparator.comparing(ClearingTransaction::getId).reversed())
                .map(this::toRow)
                .toList();
    }

    private Map<String, Object> toRow(ClearingTransaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("network", t.getNetwork());
        m.put("stan", t.getStan());
        m.put("amount_minor", t.getTxnAmount());
        m.put("currency", t.getTxnCurrency());
        m.put("mcc", t.getMcc());
        m.put("status", t.getStatus());
        m.put("created_at", String.valueOf(t.getCreatedAt()));
        return m;
    }

    @GetMapping(value = "/totals", produces = "application/json")
    public Map<String, Object> totals() {
        Map<String, long[]> byNetwork = new LinkedHashMap<>(); // network -> [count, sumMinor, pending]
        for (ClearingTransaction t : repository.findAll()) {
            long[] agg = byNetwork.computeIfAbsent(t.getNetwork(), k -> new long[3]);
            agg[0] += 1;
            agg[1] += t.getTxnAmount() == null ? 0 : t.getTxnAmount();
            if ("APPROVED".equalsIgnoreCase(t.getStatus())) agg[2] += 1;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (var e : byNetwork.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("network", e.getKey());
            m.put("count", e.getValue()[0]);
            m.put("amount_minor", e.getValue()[1]);
            m.put("pending", e.getValue()[2]);
            rows.add(m);
        }
        return Map.of("byNetwork", rows);
    }

    @PostMapping(value = "/clearing/run", produces = "application/json")
    public Map<String, Object> runClearing() {
        ClearingRunner.Result r = runner.run();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", r.ok());
        out.put("exitCode", r.exitCode());
        out.put("output", r.output());
        out.put("files", listFiles());
        return out;
    }

    @GetMapping(value = "/files", produces = "application/json")
    public List<Map<String, Object>> files() {
        return listFiles();
    }

    private List<Map<String, Object>> listFiles() {
        Path root = Paths.get(runner.outboundRoot()).toAbsolutePath().normalize();
        List<Map<String, Object>> result = new ArrayList<>();
        if (!Files.isDirectory(root)) return result;
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile)
                .filter(p -> {
                    String n = p.getFileName().toString();
                    return n.endsWith(".dat") || n.endsWith(".ipm") || n.endsWith(".sha256");
                })
                .sorted(Comparator.comparing((Path p) -> p.toFile().lastModified()).reversed())
                .forEach(p -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", p.getFileName().toString());
                    m.put("path", root.relativize(p).toString());
                    m.put("size", p.toFile().length());
                    m.put("modified", p.toFile().lastModified());
                    result.add(m);
                });
        } catch (IOException ignored) { }
        return result;
    }

    @GetMapping("/files/download")
    public ResponseEntity<Resource> download(@RequestParam String path) throws IOException {
        Path root = Paths.get(runner.outboundRoot()).toAbsolutePath().normalize();
        Path target = root.resolve(path).normalize();
        // Path-traversal guard: the resolved file must stay under the outbound root.
        if (!target.startsWith(root) || !Files.isRegularFile(target)) {
            return ResponseEntity.notFound().build();
        }
        Resource res = new FileSystemResource(target);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + target.getFileName() + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(res);
    }
}
