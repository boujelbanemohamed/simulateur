package com.floss83.javaswitch.admin;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Tiny in-memory token store for the dashboard's lab login.
 * <p>
 * NOT production auth: no expiry, no persistence, single shared admin account.
 * Tokens are random opaque strings mapped to a username; they live only for the
 * lifetime of the JVM.
 */
@Component
public class TokenStore {

    private final ConcurrentHashMap<String, String> tokens = new ConcurrentHashMap<>();

    public String issue(String username) {
        String token = UUID.randomUUID().toString().replace("-", "");
        tokens.put(token, username);
        return token;
    }

    public boolean isValid(String token) {
        return token != null && tokens.containsKey(token);
    }

    public String username(String token) {
        return tokens.get(token);
    }

    public void revoke(String token) {
        if (token != null) tokens.remove(token);
    }
}
