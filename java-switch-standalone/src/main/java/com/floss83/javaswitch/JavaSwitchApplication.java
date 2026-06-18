package com.floss83.javaswitch;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Standalone capture harness for the Flossx83 clearing engine.
 * <p>
 * This is NOT the full Flossx83 switch — it is a minimal Spring Boot app that
 * exercises the validated clearing components (encrypt PAN, persist approved
 * transactions) against PostgreSQL, exposing a local HTTP endpoint so you can
 * inject test transactions and watch them land in clearing_transaction, ready
 * for the Python clearing batch. When you later integrate into the real
 * Flossx83 repo, drop the clearing/ classes there and wire the hook into the
 * real IsoMessageController instead of this harness.
 */
@SpringBootApplication
public class JavaSwitchApplication {
    public static void main(String[] args) {
        SpringApplication.run(JavaSwitchApplication.class, args);
    }
}
