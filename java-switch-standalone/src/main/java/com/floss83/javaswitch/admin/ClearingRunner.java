package com.floss83.javaswitch.admin;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Runs the Python clearing orchestrator (clearing_orchestrator.py) as a
 * subprocess for the dashboard's "Générer les fichiers" button.
 * <p>
 * The command and its arguments are fixed (no user input is interpolated), and
 * the DB credentials + PAN key are injected explicitly into the child env so
 * the result does not depend on how the JVM was launched.
 */
@Service
public class ClearingRunner {

    private final String batchDir;
    private final String python;
    private final String outboundRoot;
    private final String panKey;
    private final String pgHost, pgPort, pgDatabase, pgUser, pgPassword;

    public ClearingRunner(
            @Value("${clearing.batch-dir}") String batchDir,
            @Value("${clearing.python}") String python,
            @Value("${clearing.outbound-root}") String outboundRoot,
            @Value("${clearing.pan-encryption-key}") String panKey,
            @Value("${clearing.pg-host}") String pgHost,
            @Value("${clearing.pg-port}") String pgPort,
            @Value("${clearing.pg-database}") String pgDatabase,
            @Value("${clearing.pg-user}") String pgUser,
            @Value("${clearing.pg-password}") String pgPassword) {
        this.batchDir = batchDir;
        this.python = python;
        this.outboundRoot = outboundRoot;
        this.panKey = panKey;
        this.pgHost = pgHost;
        this.pgPort = pgPort;
        this.pgDatabase = pgDatabase;
        this.pgUser = pgUser;
        this.pgPassword = pgPassword;
    }

    public String outboundRoot() {
        return outboundRoot;
    }

    public Result run() {
        File dir = new File(batchDir).getAbsoluteFile();
        File py = new File(python).getAbsoluteFile();
        String pythonCmd = py.exists() ? py.getPath() : "python3";

        ProcessBuilder pb = new ProcessBuilder(
                pythonCmd, "clearing_orchestrator.py",
                "--outbound-root", outboundRoot,
                "--include-today");
        pb.directory(dir);
        pb.redirectErrorStream(true);

        Map<String, String> env = pb.environment();
        env.put("CLEARING_PAN_KEY", panKey);
        env.put("PGHOST", pgHost);
        env.put("PGPORT", pgPort);
        env.put("PGDATABASE", pgDatabase);
        env.put("PGUSER", pgUser);
        env.put("PGPASSWORD", pgPassword);

        StringBuilder out = new StringBuilder();
        try {
            Process p = pb.start();
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) out.append(line).append('\n');
            }
            boolean finished = p.waitFor(180, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return new Result(-1, out + "\n[TIMEOUT after 180s]");
            }
            return new Result(p.exitValue(), out.toString());
        } catch (Exception e) {
            return new Result(-1, out + "\n[ERROR] " + e.getMessage()
                    + "\n(check clearing.batch-dir / clearing.python in application.properties)");
        }
    }

    public record Result(int exitCode, String output) {
        public boolean ok() {
            return exitCode == 0;
        }
    }
}
