#!/usr/bin/env python3
"""
Flossx83 clearing — STAGE 4 conformance suite.

Run with either::

    python3 -m unittest test_clearing_suite -v
    pytest test_clearing_suite.py -v

These tests are DB-free: they exercise the pure builder functions and the PAN
crypto contract, so they run in CI without PostgreSQL.

Covered:
  * Visa CTF: every record is exactly 168 chars (file = N * 168).
  * Mastercard IPM: blocked file size is an exact multiple of 1014 bytes.
  * PAN crypto: the Java ClearingPanCipher layout (AES-256-GCM, iv||ct+tag)
    round-trips through the Python decrypt_pan without corruption, for 16- and
    19-digit PANs, and a tampered blob is rejected (GCM auth).
"""

import os
import unittest
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from claim_clearing import decrypt_pan, IV_LEN
import visa_clearing_generator as visa
import mastercard_clearing_generator as mc

KEY = os.urandom(32)
DT = datetime(2026, 6, 15, 10, 30, 0, tzinfo=timezone.utc)


def java_style_encrypt(pan: str, key: bytes = KEY) -> bytes:
    """Mirror of Java ClearingPanCipher.encrypt: iv(12) || ciphertext+tag."""
    iv = os.urandom(IV_LEN)
    return iv + AESGCM(key).encrypt(iv, pan.encode("utf-8"), None)


def sample_rows(pans):
    rows = []
    for i, pan in enumerate(pans):
        rows.append(dict(
            transmission_ts=DT, txn_amount=1000 + i, txn_currency="788",
            processing_code="000000", local_txn_date="0615", stan=f"{100000 + i}",
            acquirer_id="40010001234", acceptor_name_loc="TEST MERCHANT",
            mcc="5999", merchant_country="788", auth_id_response="A1B2C3",
            pos_entry_mode="051", pan_enc=java_style_encrypt(pan),
        ))
    return rows


class TestPanCrypto(unittest.TestCase):
    def test_roundtrip_16_and_19_digits(self):
        for pan in ("4111111111111111", "4999888877776666555"):
            blob = java_style_encrypt(pan)
            self.assertEqual(decrypt_pan(blob, KEY), pan)

    def test_iv_is_prepended_12_bytes(self):
        blob = java_style_encrypt("5413330089020011")
        # 12 (iv) + 16 (pan) + 16 (gcm tag) = 44
        self.assertEqual(len(blob), IV_LEN + 16 + 16)

    def test_tampered_blob_is_rejected(self):
        blob = bytearray(java_style_encrypt("5413330089020011"))
        blob[-1] ^= 0x01  # flip a bit in the tag/ciphertext
        with self.assertRaises(InvalidTag):
            decrypt_pan(bytes(blob), KEY)


class TestVisaCtf(unittest.TestCase):
    def test_every_record_is_168_chars(self):
        rows = sample_rows(["4111111111111111", "4999888877776666555", "4532015112830366"])
        lines, count, hash_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 3)                       # 3 TC05
        self.assertEqual(len(lines), 1 + 3 + 1 + 1)      # header + 3 TC05 + TC91 + TC92
        for i, ln in enumerate(lines):
            self.assertEqual(len(ln), visa.RECORD_LEN, f"record {i} not 168 chars")

    def test_tc91_batch_trailers_and_totals(self):
        rows = sample_rows(["4111111111111111", "4532015112830366",
                             "4999888877776666555", "4111111111111111"])
        for r, amt in zip(rows, (100, 200, 300, 400)):
            r["txn_amount"] = amt
        lines, count, file_hash = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT, batch_size=2)
        tc91 = [ln for ln in lines if ln[:2] == visa.BATCH_TC]
        tc92 = [ln for ln in lines if ln[:2] == visa.TRAILER_TC]
        self.assertEqual(len(tc91), 2)                   # 4 rows / batch_size 2 = 2 batches
        self.assertEqual(len(tc92), 1)
        self.assertEqual(int(tc91[0][15:30]), 300)       # batch1 hash 100+200
        self.assertEqual(int(tc91[1][15:30]), 700)       # batch2 hash 300+400
        self.assertEqual(int(tc92[0][15:30]), file_hash)  # file hash
        self.assertEqual(int(tc92[0][42:48]), 2)         # Batch Number = nb batches
        for ln in lines:
            self.assertEqual(len(ln), visa.RECORD_LEN)

    def test_file_length_is_multiple_of_168(self):
        rows = sample_rows(["4111111111111111", "4532015112830366"])
        lines, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "".join(lines)                         # records only, no separators
        self.assertEqual(len(payload) % visa.RECORD_LEN, 0)

    def test_amount_lands_at_exact_offset(self):
        rows = sample_rows(["4111111111111111"])
        rows[0]["txn_amount"] = 1550
        lines, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        tc05 = lines[1]
        self.assertEqual(tc05[61:73], "000000001550")    # DE-4 -> pos 62, len 12
        self.assertEqual(tc05[4:20], "4111111111111111")  # PAN -> pos 5, len 16

    def test_tc06_refund(self):
        """Refund (DE-3 prefix 20) produces TC 06, same 168-byte layout."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "200000"
        rows[0]["txn_amount"] = 5000
        lines, count, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        tc = lines[1][:2]                                # pos 1-2 = Transaction Code
        self.assertEqual(tc, "06")
        self.assertEqual(len(lines[1]), visa.RECORD_LEN)
        self.assertEqual(lines[1][61:73], "000000005000")  # amount unchanged

    def test_tc07_withdrawal(self):
        """Withdrawal (DE-3 prefix 01) produces TC 07, same 168-byte layout."""
        rows = sample_rows(["4111111111111111"])
        rows[0]["processing_code"] = "010000"
        rows[0]["txn_amount"] = 3000
        lines, count, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        tc = lines[1][:2]
        self.assertEqual(tc, "07")
        self.assertEqual(len(lines[1]), visa.RECORD_LEN)
        self.assertEqual(lines[1][61:73], "000000003000")

    def test_mixed_tc05_tc06_tc07_in_same_file(self):
        """Achat + remboursement + retrait dans le même fichier."""
        rows = sample_rows(["4111111111111111", "5413330089020011", "4532015112830366"])
        rows[0]["processing_code"] = "000000"              # purchase  -> TC 05
        rows[0]["txn_amount"] = 1000
        rows[1]["processing_code"] = "200000"              # refund    -> TC 06
        rows[1]["txn_amount"] = 500
        rows[2]["processing_code"] = "010000"              # withdrawal -> TC 07
        rows[2]["txn_amount"] = 200
        lines, count, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 3)
        self.assertEqual(lines[1][:2], "05")               # TC 05
        self.assertEqual(lines[2][:2], "06")               # TC 06
        self.assertEqual(lines[3][:2], "07")               # TC 07
        for ln in lines[1:4]:
            self.assertEqual(len(ln), visa.RECORD_LEN)


class TestMastercardIpm(unittest.TestCase):
    def test_blocked_size_multiple_of_1014(self):
        rows = sample_rows(["5413330089020011", "2223000048400011"])
        data, count, total = mc.generate_ipm_bytes(
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 2)
        self.assertEqual(len(data) % 1014, 0, "blocked IPM not a multiple of 1014 bytes")

    def test_roundtrip_record_count(self):
        rows = sample_rows(["5413330089020011", "2223000048400011", "5555444433332222"])
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        n_records, first_mti = mc.verify_ipm(data, blocked=True)
        self.assertEqual(n_records, count + 2)           # header + presentments + trailer
        self.assertEqual(first_mti, "1240")

    def test_de48_pds_present_after_roundtrip(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertIn("PDS0023", presentment)            # terminal type
        self.assertEqual(int(presentment["DE4"]), 1000)  # amount preserved

    def test_trailer_reconciliation_pds(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011", "2223000048400011"])
        for r, amt in zip(rows, (1550, 250000)):
            r["txn_amount"] = amt
        data, count, total = mc.generate_ipm_bytes(
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0", created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        trailer = next(r for r in recs if r.get("MTI") == "1644" and r.get("DE24") == "695")
        # Control totals now live in DE-48 PDS, not DE-4/DE-71.
        self.assertNotIn("DE4", trailer)
        self.assertEqual(int(trailer["PDS0306"]), count)      # message count
        self.assertEqual(int(trailer["PDS0301"]), total)      # amount checksum
        self.assertEqual(len(trailer["PDS0105"]), 25)         # file identification


if __name__ == "__main__":
    unittest.main(verbosity=2)
