package com.floss83.javaswitch.admin;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lab login: a single admin account from config. Returns an opaque token the
 * dashboard sends as "Authorization: Bearer &lt;token&gt;" on /api/admin calls.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final TokenStore tokens;
    private final String adminUser;
    private final String adminPassword;

    public AuthController(TokenStore tokens,
                          @Value("${admin.username}") String adminUser,
                          @Value("${admin.password}") String adminPassword) {
        this.tokens = tokens;
        this.adminUser = adminUser;
        this.adminPassword = adminPassword;
    }

    @PostMapping(value = "/login", produces = "application/json")
    public ResponseEntity<?> login(@RequestBody Credentials creds) {
        if (creds != null
                && adminUser.equals(creds.username)
                && adminPassword.equals(creds.password)) {
            String token = tokens.issue(creds.username);
            return ResponseEntity.ok(Map.of("token", token, "username", creds.username));
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Identifiants invalides"));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader(value = "Authorization", required = false) String auth) {
        tokens.revoke(stripBearer(auth));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    static String stripBearer(String header) {
        if (header == null) return null;
        return header.regionMatches(true, 0, "Bearer ", 0, 7) ? header.substring(7).trim() : header.trim();
    }

    public static class Credentials {
        public String username;
        public String password;
    }
}
