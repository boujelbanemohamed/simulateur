package com.floss83.javaswitch.clearing;

import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Encrypts the real PAN for storage in {@code clearing_transaction.pan_enc}
 * (STAGE 1, option A: PAN encrypted at rest, independent of the HSM).
 * <p>
 * This is deliberately <b>not</b> the {@code HsmSimulator}: that one derives a
 * JVM-specific {@code SHA1PRNG} key that cannot be reproduced in Python. Here we
 * use a plain, portable scheme so the Python clearing batch can decrypt with the
 * same Base64 key:
 * <ul>
 *   <li>AES-256-GCM (authenticated encryption)</li>
 *   <li>fresh random 12-byte IV per record</li>
 *   <li>output bytes = {@code iv(12) || ciphertext || gcmTag(16)}</li>
 * </ul>
 * The key comes from {@code clearing.pan-encryption-key} (Base64 of 32 bytes)
 * and is shared with the batch via the {@code CLEARING_PAN_KEY} env var.
 * <p>
 * Note: this protects the PAN <em>at rest</em> in the lab DB. It is not a
 * substitute for a real KMS/HSM in a production / PCI setting.
 */
@Component
public class ClearingPanCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;       // 96-bit nonce, GCM standard
    private static final int TAG_BITS = 128;    // 16-byte auth tag

    private final SecretKeySpec key;
    private final SecureRandom rng = new SecureRandom();

    public ClearingPanCipher(@Value("${clearing.pan-encryption-key}") String base64Key) {
        byte[] raw = Base64.getDecoder().decode(base64Key.trim());
        if (raw.length != 32) {
            throw new IllegalStateException(
                "clearing.pan-encryption-key must decode to 32 bytes (AES-256); got " + raw.length);
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    /**
     * @param pan raw PAN (13-19 digits)
     * @return {@code iv(12) || ciphertext+tag}, ready for the {@code pan_enc} BYTEA column
     */
    public byte[] encrypt(String pan) {
        try {
            byte[] iv = new byte[IV_LEN];
            rng.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = cipher.doFinal(pan.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return out;
        } catch (Exception e) {
            throw new RuntimeException("Clearing PAN encryption failed", e);
        }
    }

    /** Inverse of {@link #encrypt(String)} — provided for unit tests / symmetry. */
    public String decrypt(byte[] blob) {
        try {
            byte[] iv = new byte[IV_LEN];
            byte[] ct = new byte[blob.length - IV_LEN];
            System.arraycopy(blob, 0, iv, 0, IV_LEN);
            System.arraycopy(blob, IV_LEN, ct, 0, ct.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ct), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Clearing PAN decryption failed", e);
        }
    }
}
