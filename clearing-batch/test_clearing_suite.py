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
  * Visa reversals: TC 25/26/27 + Usage Code = "2".
  * Mastercard reversals: PDS 0025 = "R", DE-24 = 202.
  * Mastercard chargeback skeleton: MTI 1442.
  * AES key rotation: version prefix v1|, v2|, etc.
"""

import os
import tempfile
import unittest
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from claim_clearing import decrypt_pan, IV_LEN, load_key
import visa_clearing_generator as visa
import mastercard_clearing_generator as mc
import issuer_chargeback as icb
from issuer_reception import aggregate_results
from issuer_posting import build_movement_ref

KEY = os.urandom(32)
DT = datetime(2026, 6, 15, 10, 30, 0, tzinfo=timezone.utc)


def java_style_encrypt(pan: str, key: bytes = KEY) -> bytes:
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
        self.assertEqual(len(blob), IV_LEN + 16 + 16)

    def test_tampered_blob_is_rejected(self):
        blob = bytearray(java_style_encrypt("5413330089020011"))
        blob[-1] ^= 0x01
        with self.assertRaises(InvalidTag):
            decrypt_pan(bytes(blob), KEY)


class TestVisaCtf(unittest.TestCase):
    def test_every_record_is_168_chars(self):
        rows = sample_rows(["4111111111111111", "4999888877776666555", "4532015112830366"])
        lines, count, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 3)
        self.assertEqual(len(lines), 1 + 3 + 1 + 1)
        self.assertEqual(debit_total, 1000 + 1001 + 1002)
        self.assertEqual(credit_total, 0)
        for i, ln in enumerate(lines):
            self.assertEqual(len(ln), visa.RECORD_LEN, f"record {i} not 168 chars")

    def test_tc91_batch_trailers_and_totals(self):
        rows = sample_rows(["4111111111111111", "4532015112830366",
                             "4999888877776666555", "4111111111111111"])
        for r, amt in zip(rows, (100, 200, 300, 400)):
            r["txn_amount"] = amt
        lines, count, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT, batch_size=2)
        tc91 = [ln for ln in lines if ln[:2] == visa.BATCH_TC]
        tc92 = [ln for ln in lines if ln[:2] == visa.TRAILER_TC]
        self.assertEqual(len(tc91), 2)
        self.assertEqual(len(tc92), 1)
        self.assertEqual(debit_total, 1000)
        self.assertEqual(credit_total, 0)
        self.assertEqual(int(tc91[0][15:30]), 300)
        self.assertEqual(int(tc91[1][15:30]), 700)
        self.assertEqual(int(tc92[0][15:30]), debit_total - credit_total)
        self.assertEqual(int(tc92[0][42:48]), 2)
        for ln in lines:
            self.assertEqual(len(ln), visa.RECORD_LEN)

    def test_file_length_is_multiple_of_168(self):
        rows = sample_rows(["4111111111111111", "4532015112830366"])
        lines, _, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "".join(lines)
        self.assertEqual(len(payload) % visa.RECORD_LEN, 0)

    def test_amount_lands_at_exact_offset(self):
        rows = sample_rows(["4111111111111111"])
        rows[0]["txn_amount"] = 1550
        lines, _, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        tc05 = lines[1]
        self.assertEqual(tc05[61:73], "000000001550")
        self.assertEqual(tc05[4:20], "4111111111111111")

    def test_tc06_refund(self):
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "200000"
        rows[0]["txn_amount"] = 5000
        lines, count, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        tc = lines[1][:2]
        self.assertEqual(tc, "06")
        self.assertEqual(debit_total, 0)
        self.assertEqual(credit_total, 5000)
        self.assertEqual(len(lines[1]), visa.RECORD_LEN)
        self.assertEqual(lines[1][61:73], "000000005000")

    def test_tc07_withdrawal(self):
        rows = sample_rows(["4111111111111111"])
        rows[0]["processing_code"] = "010000"
        rows[0]["txn_amount"] = 3000
        lines, count, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        self.assertEqual(debit_total, 3000)
        self.assertEqual(credit_total, 0)
        tc = lines[1][:2]
        self.assertEqual(tc, "07")
        self.assertEqual(len(lines[1]), visa.RECORD_LEN)
        self.assertEqual(lines[1][61:73], "000000003000")

    def test_cash_advance_processing_code_tc07(self):
        """Cash Advance (DE-3 prefix 12) produit TC 07 côté Visa."""
        rows = sample_rows(["4111111111111111"])
        rows[0]["processing_code"] = "120000"
        rows[0]["txn_amount"] = 2500
        lines, count, debit_total, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        tc = lines[1][:2]
        self.assertEqual(tc, "07")
        self.assertEqual(debit_total, 2500)

    def test_mixed_tc05_tc06_tc07_in_same_file(self):
        rows = sample_rows(["4111111111111111", "5413330089020011", "4532015112830366"])
        rows[0]["processing_code"] = "000000"
        rows[0]["txn_amount"] = 1000
        rows[1]["processing_code"] = "200000"
        rows[1]["txn_amount"] = 500
        rows[2]["processing_code"] = "010000"
        rows[2]["txn_amount"] = 200
        lines, count, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 3)
        self.assertEqual(lines[1][:2], "05")
        self.assertEqual(lines[2][:2], "06")
        self.assertEqual(lines[3][:2], "07")
        self.assertEqual(debit_total, 1200)
        self.assertEqual(credit_total, 500)
        for ln in lines[1:4]:
            self.assertEqual(len(ln), visa.RECORD_LEN)

    def test_build_reversal_sale(self):
        row = sample_rows(["4111111111111111"])[0]
        row["txn_amount"] = 1550
        rev = visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                  original_txn_type="purchase")
        self.assertEqual(len(rev), visa.RECORD_LEN)
        self.assertEqual(rev[:2], "25")
        self.assertEqual(rev[146:147], "2")
        self.assertEqual(rev[61:73], "000000001550")
        self.assertEqual(rev[4:20], "4111111111111111")

    def test_build_reversal_refund(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 500
        rev = visa.build_reversal(row, "5413330089020011", merchant_country="788",
                                  original_txn_type="refund")
        self.assertEqual(rev[:2], "26")
        self.assertEqual(rev[146:147], "2")

    def test_build_reversal_withdrawal(self):
        row = sample_rows(["4532015112830366"])[0]
        row["txn_amount"] = 200
        rev = visa.build_reversal(row, "4532015112830366", merchant_country="788",
                                  original_txn_type="withdrawal")
        self.assertEqual(rev[:2], "27")
        self.assertEqual(rev[146:147], "2")

    def test_build_reversal_custom_reason_code(self):
        row = sample_rows(["4111111111111111"])[0]
        rev = visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                  reason_code="01")
        self.assertEqual(rev[147:149], "01")

    def test_build_reversal_usage_code_is_2(self):
        row = sample_rows(["4111111111111111"])[0]
        rev = visa.build_reversal(row, "4111111111111111", merchant_country="788")
        self.assertEqual(rev[146:147], "2")
        norm = visa.build_tc05(row, "4111111111111111", merchant_country="788")
        self.assertEqual(norm[146:147], "1")

    def test_net_total_in_mixed_trailer(self):
        rows = sample_rows(["4111111111111111", "5413330089020011"])
        rows[0]["processing_code"] = "000000"
        rows[0]["txn_amount"] = 1000
        rows[1]["processing_code"] = "200000"
        rows[1]["txn_amount"] = 300
        lines, _, debit_total, credit_total = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        tc92 = [ln for ln in lines if ln[:2] == visa.TRAILER_TC][0]
        net = int(tc92[15:30])
        self.assertEqual(net, debit_total - credit_total)
        self.assertEqual(net, 700)

    def test_build_reversal_partial_zero_raises(self):
        """reversal_amount=0 → ValueError."""
        row = sample_rows(["4111111111111111"])[0]
        row["txn_amount"] = 1000
        with self.assertRaises(ValueError):
            visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                reversal_amount=0)

    def test_build_reversal_partial_negative_raises(self):
        """reversal_amount=-100 → ValueError."""
        row = sample_rows(["4111111111111111"])[0]
        row["txn_amount"] = 1000
        with self.assertRaises(ValueError):
            visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                reversal_amount=-100)

    def test_build_reversal_partial_amount(self):
        """reversal_amount < txn_amount → montant partiel dans le TCR."""
        row = sample_rows(["4111111111111111"])[0]
        row["txn_amount"] = 1000
        rev = visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                  reversal_amount=400)
        self.assertEqual(rev[61:73], "000000000400")

    def test_build_reversal_partial_exceeds_original_raises(self):
        """reversal_amount > txn_amount → ValueError."""
        row = sample_rows(["4111111111111111"])[0]
        row["txn_amount"] = 1000
        with self.assertRaises(ValueError):
            visa.build_reversal(row, "4111111111111111", merchant_country="788",
                                reversal_amount=1500)

    def test_reversal_ctf_full(self):
        """generate_reversal_ctf_lines produit un TC 25 avec le montant full."""
        rows = sample_rows(["4111111111111111"])
        rows[0]["txn_amount"] = 1550
        lines, count, total, _ = visa.generate_reversal_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        self.assertEqual(total, 1550)
        tc = lines[1][:2]
        self.assertEqual(tc, visa.REVERSAL_SALE_TC)
        self.assertEqual(lines[1][61:73], "000000001550")
        self.assertEqual(len(lines), 1 + 1 + 1 + 1)
        for ln in lines:
            self.assertEqual(len(ln), visa.RECORD_LEN)

    def test_reversal_ctf_partial(self):
        """reversal_amount < txn_amount → montant partiel."""
        rows = sample_rows(["4532015112830366"])
        rows[0]["txn_amount"] = 2000
        rows[0]["reversal_amount"] = 800
        lines, count, total, _ = visa.generate_reversal_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        self.assertEqual(total, 800)
        self.assertEqual(lines[1][:2], visa.REVERSAL_SALE_TC)
        self.assertEqual(lines[1][61:73], "000000000800")

    def test_reversal_ctf_refund_and_cash(self):
        """refund → TC 26, withdrawal → TC 27 dans un fichier reversals."""
        rows = sample_rows(["5413330089020011", "4999888877776666555"])
        rows[0]["processing_code"] = "200000"
        rows[0]["txn_amount"] = 500
        rows[1]["processing_code"] = "010000"
        rows[1]["txn_amount"] = 300
        lines, count, total, _ = visa.generate_reversal_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 2)
        self.assertEqual(total, 800)
        self.assertEqual(lines[1][:2], visa.REVERSAL_REFUND_TC)
        self.assertEqual(lines[2][:2], visa.REVERSAL_CASH_TC)

    def test_reversal_ctf_multiple_batches(self):
        """Multi-batch reversals avec bons totaux."""
        rows = sample_rows(["4111111111111111"] * 4)
        for i, r in enumerate(rows):
            r["txn_amount"] = (i + 1) * 100
        lines, count, total, _ = visa.generate_reversal_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT, batch_size=2)
        tc91 = [ln for ln in lines if ln[:2] == visa.BATCH_TC]
        tc92 = [ln for ln in lines if ln[:2] == visa.TRAILER_TC]
        self.assertEqual(len(tc91), 2)
        self.assertEqual(int(tc91[0][15:30]), 300)
        self.assertEqual(int(tc91[1][15:30]), 700)
        self.assertEqual(int(tc92[0][15:30]), 1000)

    def test_build_count_trailer_net_negative_with_credits(self):
        trailer = visa.build_count_trailer(
            visa.TRAILER_TC, 2, debit_total=100, credit_total=300,
            processing=DT)
        net = int(trailer[15:30])
        self.assertEqual(net, 200)  # unsigned: abs(-200) in the field


class TestMastercardIpm(unittest.TestCase):
    def test_blocked_size_multiple_of_1014(self):
        rows = sample_rows(["5413330089020011", "2223000048400011"])
        data, count, total = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 2)
        self.assertEqual(len(data) % 1014, 0)

    def test_roundtrip_record_count(self):
        rows = sample_rows(["5413330089020011", "2223000048400011", "5555444433332222"])
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        n_records, first_mti = mc.verify_ipm(data, blocked=True)
        self.assertEqual(n_records, count + 2)
        self.assertEqual(first_mti, "1240")

    def test_de48_pds_present_after_roundtrip(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertIn("PDS0023", presentment)
        self.assertEqual(int(presentment["DE4"]), 1000)

    def test_pds0052_absent_for_non_ecommerce(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        for rec in recs:
            self.assertNotIn("PDS0052", rec, f"PDS0052 should not be present in MTI {rec.get('MTI')}")

    def test_pds0052_emitted_for_ecommerce(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["pos_entry_mode"] = "810"
        rows[0]["ucaf_level"] = "1"
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment.get("PDS0052"), "111")

    def test_pds0052_default_ucaf(self):
        """810 e-commerce sans ucaf_level → PDS0052 sf3 = "0"."""
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["pos_entry_mode"] = "810"
        rows[0].pop("ucaf_level", None)
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment.get("PDS0052"), "110")

    def test_pds0052_coherence(self):
        """Si PDS0052 présent alors PDS0023="CT6" (conséquence round-trippable de sf7=S).
        DE22_s7 n'est pas round-trippé par cardutil — testé dans test_presentment_de22_sf7_from_row."""
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["pos_entry_mode"] = "810"
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertIn("PDS0052", presentment)
        self.assertEqual(presentment["PDS0023"], "CT6")

    def test_trailer_reconciliation_pds(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011", "2223000048400011"])
        for r, amt in zip(rows, (1550, 250000)):
            r["txn_amount"] = amt
        data, count, total = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0", created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        trailer = next(r for r in recs if r.get("MTI") == "1644" and r.get("DE24") == "695")
        self.assertNotIn("DE4", trailer)
        self.assertEqual(int(trailer["PDS0306"]), count)
        self.assertEqual(int(trailer["PDS0301"]), total)
        self.assertEqual(len(trailer["PDS0105"]), 25)

    def test_de31_ard_format(self):
        import io
        from cardutil.mciipm import IpmReader
        from visa_clearing_generator import _luhn_check_digit

        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")

        ard = presentment.get("DE31", "")
        self.assertEqual(len(ard), 23)
        self.assertTrue(ard.isdigit())
        self.assertEqual(ard[0], "0")
        self.assertEqual(ard[1:7], "001234")
        self.assertEqual(ard[22], _luhn_check_digit(ard[:22]))

    def test_de12_datetime_format(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        import datetime as dt_mod
        de12 = presentment.get("DE12")
        self.assertIsInstance(de12, dt_mod.datetime)
        self.assertEqual(de12.strftime("%y%m%d%H%M%S"), "260615103000")

    def test_de26_mcc_format(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        mcc = presentment.get("DE26")
        self.assertEqual(mcc, 5999)

    def test_de33_forwarding_id(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        de33 = presentment.get("DE33", "")
        self.assertTrue(de33.isdigit())
        self.assertLessEqual(len(de33), 11)
        self.assertEqual(de33, "40010001234")

    def test_de43_acceptor_name_location(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")

        self.assertIn("DE43", presentment)
        de43 = presentment["DE43"]
        self.assertGreater(len(de43), 20)
        self.assertIn("DE43_NAME", presentment)
        self.assertEqual(presentment["DE43_NAME"], "TEST MERCHANT")
        self.assertIn("DE43_COUNTRY", presentment)
        self.assertEqual(presentment["DE43_COUNTRY"], "TUN")

    def test_de93_de94_institution_ids(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment["DE93"], "541333")
        self.assertEqual(presentment["DE94"], "40010001234")

    def test_all_mandatory_de_present_after_roundtrip(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        mandatory = {2, 3, 4, 12, 24, 26, 31, 33, 43, 49, 71, 93, 94}
        for bit in mandatory:
            self.assertIn(f"DE{bit}", presentment, f"DE{bit} missing from round-trip")

    def test_refund_processing_code(self):
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "200000"
        rows[0]["txn_amount"] = 5000
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 1)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment["DE3"], "200000")
        self.assertEqual(int(presentment["DE4"]), 5000)

    def test_cash_advance_processing_code_mc(self):
        """Cash Advance (DE-3 prefix 12) passe tel quel côté Mastercard."""
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "120000"
        rows[0]["txn_amount"] = 2500
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 1)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment["DE3"], "120000")
        self.assertEqual(int(presentment["DE4"]), 2500)

    def test_cashback_processing_code_and_no_de54_by_default(self):
        """Cashback (DE-3 prefix 09) passe tel quel ; DE-54 absent sans row.de54."""
        import io
        from cardutil.mciipm import IpmReader
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 1)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment["DE3"], "090000")
        self.assertNotIn("DE54", presentment)

    def test_cashback_with_de54(self):
        """Cashback avec row.de54 → DE-54 complet 20-car."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        rows[0]["de54"] = 500
        msg = mc.build_presentment(rows[0], "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE3"], "090000")
        self.assertEqual(len(msg["DE54"]), 20)
        self.assertEqual(msg["DE54"][2:4], "40")
        self.assertEqual(msg["DE54"][8:20], "000000000500")
        self.assertEqual(int(msg["DE4"]), 1500)

    def test_cashback_with_txn_cashback(self):
        """Cashback avec row.txn_cashback → DE-54 complet 20-car."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        rows[0]["txn_cashback"] = 750
        msg = mc.build_presentment(rows[0], "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE3"], "090000")
        self.assertEqual(len(msg["DE54"]), 20)
        self.assertEqual(msg["DE54"][2:4], "40")
        self.assertEqual(msg["DE54"][8:20], "000000000750")
        self.assertEqual(int(msg["DE4"]), 1500)

    def test_cashback_with_txn_cashback_and_currency(self):
        """DE-54 utilise la devise de DE-49."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        rows[0]["txn_cashback"] = 300
        rows[0]["txn_currency"] = "840"
        msg = mc.build_presentment(rows[0], "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE54"][4:7], "840")

    def test_build_presentment_reversal_has_pds0025(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT, is_reversal=True)
        self.assertEqual(msg["DE24"], mc.FUNC_REVERSAL)
        self.assertEqual(msg.get("PDS0025"), "R")
        self.assertEqual(msg["MTI"], mc.MTI_PRESENTMENT)

    def test_build_presentment_no_reversal(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE24"], mc.FUNC_PRESENTMENT)
        self.assertNotIn("PDS0025", msg)

    def test_build_presentment_reversal_amount_partial(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 2000
        row["reversal_amount"] = 800
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT, is_reversal=True)
        self.assertEqual(msg["DE24"], mc.FUNC_REVERSAL)
        self.assertEqual(int(msg["DE4"]), 800)

    def test_build_presentment_reversal_partial_zero_raises(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 1000
        row["reversal_amount"] = 0
        with self.assertRaises(ValueError):
            mc.build_presentment(row, "5413330089020011", 2,
                                 txn_env="0",
                                 created=DT, is_reversal=True)

    def test_build_presentment_reversal_partial_negative_raises(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 1000
        row["reversal_amount"] = -100
        with self.assertRaises(ValueError):
            mc.build_presentment(row, "5413330089020011", 2,
                                 txn_env="0",
                                 created=DT, is_reversal=True)

    def test_build_chargeback_skeleton(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_chargeback(row, "5413330089020011", 2,
                                  txn_env="0",
                                  created=DT)
        self.assertEqual(msg["MTI"], mc.MTI_CHARGEBACK)
        self.assertEqual(msg["DE24"], mc.FUNC_CHARGEBACK)
        self.assertEqual(msg["DE72"], "000")
        self.assertEqual(int(msg["DE4"]), 1000)
        self.assertNotIn("PDS0025", msg)

    def test_build_chargeback_custom_reason(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_chargeback(row, "5413330089020011", 2,
                                  txn_env="0",
                                  created=DT,
                                  chargeback_reason="41")
        self.assertEqual(msg["DE72"], "041")

    def test_map_pos_entry_de22_sf7(self):
        cases = [
            ("051", "C", "chip contact"),
            ("071", "M", "contactless"),
            ("901", "B", "magstripe full"),
            ("011", "1", "manual"),
            ("810", "S", "e-commerce"),
            ("", "0", "empty string"),
            (None, "0", "None"),
            ("999", "0", "unknown code"),
            ("05", "C", "2-digit chip prefix w/o 3rd digit"),
        ]
        for inp, expected, label in cases:
            with self.subTest(case=label):
                self.assertEqual(mc.map_pos_entry_to_de22_sf7(inp), expected)

    def test_presentment_de22_sf7_from_row(self):
        row = sample_rows(["5413330089020011"])[0]
        row["pos_entry_mode"] = "810"
        msg = mc.build_presentment(row, "5413330089020011", 1,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE22_s7"], "S", "810 → e-commerce → S")

        row["pos_entry_mode"] = "051"
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE22_s7"], "C", "051 → chip contact → C")

    def test_second_presentment_de22_sf7_derived(self):
        row = sample_rows(["5413330089020011"])[0]
        # sample_rows has pos_entry_mode="051" → "C"
        msg = mc.build_second_presentment(
            row, "5413330089020011", 5,
            txn_env="0",
            created=DT, reason_code="2002")
        self.assertEqual(msg["DE22_s7"], "C", "second presentment derives from row pos_entry_mode")

        row["pos_entry_mode"] = "810"
        msg = mc.build_second_presentment(
            row, "5413330089020011", 6,
            txn_env="0",
            created=DT, reason_code="2003")
        self.assertEqual(msg["DE22_s7"], "S", "810 → S in second presentment")

    def test_map_de22_sf7_to_terminal_type(self):
        cases = [
            ("S", "CT6", "e-commerce forces CT6"),
            ("C", "POI", "chip contact → POI"),
            ("M", "POI", "contactless → POI"),
            ("B", "POI", "magstripe → POI"),
            ("1", "MAN", "manual → MAN"),
            ("0", "NA ", "unknown → NA "),
            ("X", "NA ", "unrecognised → NA "),
            ("", "NA ", "empty → NA "),
        ]
        for inp, expected, label in cases:
            with self.subTest(case=label):
                val = mc.map_de22_sf7_to_terminal_type(inp)
                self.assertEqual(val, expected)
                self.assertEqual(len(val), 3, "all terminal types must be exactly 3 chars")

    def test_presentment_terminal_type_ecommerce(self):
        row = sample_rows(["5413330089020011"])[0]
        row["pos_entry_mode"] = "810"
        msg = mc.build_presentment(row, "5413330089020011", 1,
                                   txn_env="0", created=DT)
        sf7 = msg["DE22_s7"]
        pds23 = msg.get("PDS0023")
        self.assertEqual(sf7, "S", "e-commerce → DE22_s7=S")
        self.assertEqual(pds23, "CT6", "e-commerce → PDS0023=CT6 (spec p.526)")

    def test_presentment_terminal_type_chip(self):
        row = sample_rows(["5413330089020011"])[0]
        row["pos_entry_mode"] = "051"
        msg = mc.build_presentment(row, "5413330089020011", 1,
                                   txn_env="0", created=DT)
        self.assertEqual(msg["DE22_s7"], "C")
        self.assertEqual(msg.get("PDS0023"), "POI")

    def test_presentment_terminal_type_default_na(self):
        row = sample_rows(["5413330089020011"])[0]
        row.pop("pos_entry_mode", None)
        msg = mc.build_presentment(row, "5413330089020011", 1,
                                   txn_env="0", created=DT)
        self.assertEqual(msg["DE22_s7"], "0")
        self.assertEqual(msg.get("PDS0023"), "NA ")

    def test_presentment_no_zz_spaces_emitted(self):
        """Aucune valeur '  Z' ou tout-espaces n'est plus émise dans PDS0023."""
        for mode in ("051", "071", "901", "011", "810", "", None):
            row = sample_rows(["5413330089020011"])[0]
            if mode is None:
                row.pop("pos_entry_mode", None)
            else:
                row["pos_entry_mode"] = mode
            msg = mc.build_presentment(row, "5413330089020011", 1,
                                       txn_env="0", created=DT)
            pds = msg.get("PDS0023", "")
            self.assertNotEqual(pds.strip(), "", f"PDS0023 must not be all-spaces for mode={mode!r}")
            self.assertEqual(len(pds), 3, f"PDS0023 must be exactly 3 chars for mode={mode!r}")


class TestFeeCollection(unittest.TestCase):
    """MTI 1740 Fee Collection (Retrieval Fee Billing) — builder unit tests."""

    def test_build_fee_collection_mti_and_codes(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_fee_collection(row, "5413330089020011", 2,
                                      txn_env="0",
                                      created=DT)
        self.assertEqual(msg["MTI"], mc.MTI_FEE_COLLECTION)
        self.assertEqual(msg["DE3"], mc.PC_FEE_COLLECTION)
        self.assertEqual(msg["DE24"], mc.FUNC_FEE_COLLECTION)
        self.assertEqual(msg["DE25"], mc.FEE_REASON_RETRIEVAL)

    def test_fee_collection_fields_present(self):
        row = sample_rows(["4532015112830366"])[0]
        row["txn_amount"] = 500
        row["original_amount"] = 1550
        msg = mc.build_fee_collection(row, "4532015112830366", 3,
                                      txn_env="0",
                                      created=DT)
        self.assertEqual(int(msg["DE4"]), 500)
        self.assertEqual(msg["DE30"], "000000001550")
        self.assertEqual(msg["DE73"], DT.strftime("%y%m%d"))
        self.assertIn("MTI", msg)
        self.assertEqual(msg["DE2"], "4532015112830366")

    def test_fee_collection_no_original_amount(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_fee_collection(row, "5413330089020011", 4,
                                      txn_env="0",
                                      created=DT)
        self.assertEqual(msg["DE30"], "0" * 12)


class TestSecondPresentment(unittest.TestCase):
    """MTI 1240 Second Presentment (DE-24 205 full / 282 partial)."""

    def test_second_presentment_full(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_second_presentment(
            row, "5413330089020011", 5,
            txn_env="0",
            created=DT, reason_code="2002")
        self.assertEqual(msg["MTI"], mc.MTI_PRESENTMENT)
        self.assertEqual(msg["DE24"], mc.FUNC_SECOND_PRESENTMENT_FULL)
        self.assertEqual(msg["DE3"], "000000")
        self.assertEqual(msg["DE25"], "2002")
        self.assertEqual(int(msg["DE4"]), 1000)
        self.assertEqual(msg["DE30"], "000000001000")
        self.assertIn("DE22_s7", msg)

    def test_second_presentment_partial(self):
        row = sample_rows(["4532015112830366"])[0]
        row["txn_amount"] = 2000
        msg = mc.build_second_presentment(
            row, "4532015112830366", 6,
            txn_env="0",
            created=DT, reason_code="2003",
            partial=True, second_amount=800)
        self.assertEqual(msg["DE24"], mc.FUNC_SECOND_PRESENTMENT_PARTIAL)
        self.assertEqual(int(msg["DE4"]), 800)
        self.assertEqual(msg["DE30"], "000000002000")

    def test_second_presentment_partial_zero_raises(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 1000
        with self.assertRaises(ValueError):
            mc.build_second_presentment(
                row, "5413330089020011", 7,
                txn_env="0",
                created=DT, reason_code="2002",
                partial=True, second_amount=0)

    def test_second_presentment_partial_exceeds_raises(self):
        row = sample_rows(["5413330089020011"])[0]
        row["txn_amount"] = 1000
        with self.assertRaises(ValueError):
            mc.build_second_presentment(
                row, "5413330089020011", 8,
                txn_env="0",
                created=DT, reason_code="2002",
                partial=True, second_amount=1500)

    def test_second_presentment_no_system_fields(self):
        row = sample_rows(["4111111111111111"])[0]
        msg = mc.build_second_presentment(
            row, "4111111111111111", 9,
            txn_env="0",
            created=DT, reason_code="2004")
        for unwanted in ("DE5", "DE6", "DE9", "DE10", "DE93", "DE94"):
            self.assertNotIn(unwanted, msg,
                             f"{unwanted} should not appear (system-provided)")


class TestDe54Cashback(unittest.TestCase):
    """DE-54 Additional Amounts — cashback structure unit tests."""

    def test_de54_cashback_structure(self):
        result = mc.build_de54_cashback(500, "788")
        self.assertEqual(len(result), 20)
        self.assertEqual(result[0:2], "00")    # s1 Account Type
        self.assertEqual(result[2:4], "40")    # s2 Amount, Cash Back
        self.assertEqual(result[4:7], "788")   # s3 Currency
        self.assertEqual(result[7:8], "D")     # s4 Debit sign
        self.assertEqual(result[8:20], "000000000500")  # s5 Amount

    def test_de54_cashback_zero_raises(self):
        with self.assertRaises(ValueError):
            mc.build_de54_cashback(0, "788")

    def test_de54_cashback_negative_raises(self):
        with self.assertRaises(ValueError):
            mc.build_de54_cashback(-100, "788")

    def test_de54_cashback_custom_account_type(self):
        result = mc.build_de54_cashback(999, "788", account_type="10")
        self.assertEqual(result[0:2], "10")


class TestKeyRotation(unittest.TestCase):
    def test_decrypt_no_prefix_with_key(self):
        pan = "4111111111111111"
        blob = java_style_encrypt(pan)
        self.assertEqual(decrypt_pan(blob, KEY), pan)

    def test_decrypt_with_v1_prefix(self):
        v1_key = os.urandom(32)
        os.environ["CLEARING_PAN_KEY_V1"] = __import__("base64").b64encode(v1_key).decode()
        try:
            pan = "4111111111111111"
            raw = java_style_encrypt(pan, v1_key)
            blob = b"v1|" + raw
            self.assertEqual(decrypt_pan(blob), pan)
        finally:
            os.environ.pop("CLEARING_PAN_KEY_V1", None)

    def test_decrypt_v1_prefix_strips_prefix(self):
        v1_key = os.urandom(32)
        wrong_key = os.urandom(32)
        os.environ["CLEARING_PAN_KEY_V1"] = __import__("base64").b64encode(v1_key).decode()
        try:
            pan = "4111111111111111"
            raw = java_style_encrypt(pan, v1_key)
            blob = b"v1|" + raw
            self.assertEqual(decrypt_pan(blob, wrong_key), pan)
        finally:
            os.environ.pop("CLEARING_PAN_KEY_V1", None)

    def test_decrypt_v1_prefix_missing_env_raises(self):
        os.environ.pop("CLEARING_PAN_KEY_V1", None)
        raw = java_style_encrypt("4111111111111111")
        blob = b"v1|" + raw
        with self.assertRaises(RuntimeError):
            decrypt_pan(blob)

    def test_load_key_with_version(self):
        v1_key = os.urandom(32)
        b64 = __import__("base64").b64encode(v1_key).decode()
        os.environ["CLEARING_PAN_KEY_V1"] = b64
        try:
            loaded = load_key(version="v1")
            self.assertEqual(loaded, v1_key)
        finally:
            os.environ.pop("CLEARING_PAN_KEY_V1", None)

    def test_decrypt_v2_prefix(self):
        v2_key = os.urandom(32)
        os.environ["CLEARING_PAN_KEY_V2"] = __import__("base64").b64encode(v2_key).decode()
        try:
            pan = "4999888877776666555"
            raw = java_style_encrypt(pan, v2_key)
            blob = b"v2|" + raw
            self.assertEqual(decrypt_pan(blob), pan)
        finally:
            os.environ.pop("CLEARING_PAN_KEY_V2", None)


class TestIssuerInbound(unittest.TestCase):
    """DB-free: issuer-side parsing — round-trip génération → lecture."""

    def test_parse_mastercard_roundtrip(self):
        """Génère un IPM présentment → le parse → vérifie kind/pan/amount."""
        import io
        from cardutil.mciipm import IpmReader
        from issuer_inbound import parse_mastercard_ipm
        rows = sample_rows(["5413330089020011"])
        data, count, total = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 1)
        movements = parse_mastercard_ipm(data, blocked=True)
        self.assertEqual(len(movements), 1)
        m = movements[0]
        self.assertEqual(m.network, "MASTERCARD")
        self.assertEqual(m.kind, "presentment")
        self.assertEqual(m.pan, "5413330089020011")
        self.assertEqual(m.amount, 1000)
        self.assertEqual(m.mti_or_tc, "1240")
        self.assertEqual(m.processing_code, "000000")
        self.assertEqual(m.currency, "788")

    def test_parse_visa_roundtrip(self):
        """Génère un CTF présentment → le parse → vérifie TC/pan/amount."""
        from issuer_inbound import parse_visa_ctf
        rows = sample_rows(["4111111111111111"])
        lines, count, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        payload = "\r\n".join(lines) + "\r\n"
        movements = parse_visa_ctf(payload)
        presentments = [m for m in movements if m.kind == "presentment"]
        self.assertEqual(len(presentments), 1)
        m = presentments[0]
        self.assertEqual(m.network, "VISA")
        self.assertEqual(m.mti_or_tc, "05")
        self.assertEqual(m.pan, "4111111111111111")
        self.assertEqual(m.amount, 1000)
        self.assertEqual(m.currency, "788")
        self.assertIsNone(m.processing_code)

    def test_parse_ignores_headers_trailers(self):
        """Les enregistrements 1644 / TC 90/91/92 ne produisent pas de movement."""
        from issuer_inbound import parse_mastercard_ipm, parse_visa_ctf
        rows = sample_rows(["5413330089020011"])
        data, _, _ = mc.generate_ipm_bytes(
            rows, KEY, txn_env="0",
            created=DT, blocked=True)
        movements = parse_mastercard_ipm(data, blocked=True)
        for m in movements:
            self.assertNotEqual(m.mti_or_tc, "1644")
        self.assertEqual(len(movements), 1)

        rows2 = sample_rows(["4111111111111111"])
        lines, _, _, _ = visa.generate_ctf_lines(
            rows2, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "\r\n".join(lines) + "\r\n"
        vmovements = parse_visa_ctf(payload)
        for m in vmovements:
            self.assertNotIn(m.mti_or_tc, ("90", "91", "92"))
        self.assertEqual(len(vmovements), 1)

    def test_parse_visa_reversal_kind(self):
        """Un fichier CTF reversal (TC 25) → kind='reversal'."""
        from issuer_inbound import parse_visa_ctf
        rows = sample_rows(["4111111111111111"])
        lines, _, _, _ = visa.generate_reversal_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "\r\n".join(lines) + "\r\n"
        movements = parse_visa_ctf(payload)
        reversals = [m for m in movements if m.kind == "reversal"]
        self.assertEqual(len(reversals), 1)
        m = reversals[0]
        self.assertEqual(m.mti_or_tc, "25")
        self.assertEqual(m.network, "VISA")
        self.assertEqual(m.pan, "4111111111111111")
        self.assertEqual(m.amount, 1000)

    def test_parse_visa_pan_with_extension(self):
        """PAN 19 chiffres → le parsing reconstitue le PAN complet (main+extension)."""
        from issuer_inbound import parse_visa_ctf
        pan_19 = "4999888877776666555"
        rows = sample_rows([pan_19])
        lines, count, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        self.assertEqual(count, 1)
        # Vérifie que le CTF porte bien l'extension non-nulle en position 21-23
        tc05_line = lines[1]
        pan_slice = tc05_line[4:20].strip()
        pan_ext_slice = tc05_line[20:23].strip()
        self.assertEqual(pan_slice, "4999888877776666")
        self.assertEqual(pan_ext_slice, "555")
        # Round-trip complet
        payload = "\r\n".join(lines) + "\r\n"
        movements = parse_visa_ctf(payload)
        presentments = [m for m in movements if m.kind == "presentment"]
        self.assertEqual(len(presentments), 1)
        m = presentments[0]
        self.assertEqual(m.pan, pan_19)

    def test_parse_visa_extracts_arn(self):
        """L'ARN extrait des positions 27-49 est non vide et cohérent."""
        from issuer_inbound import parse_visa_ctf
        rows = sample_rows(["4111111111111111"])
        lines, _, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "\r\n".join(lines) + "\r\n"
        movements = parse_visa_ctf(payload)
        presentments = [m for m in movements if m.kind == "presentment"]
        self.assertEqual(len(presentments), 1)
        m = presentments[0]
        self.assertIsNotNone(m.raw_ref)
        self.assertEqual(len(m.raw_ref), 23)
        # Vérifie que raw_ref correspond exactement aux positions 27-49 de la ligne TC05
        tc05_line = lines[1]
        arn_from_positions = tc05_line[26:49].strip()
        self.assertEqual(m.raw_ref, arn_from_positions)

    def test_parse_visa_distinct_arn_same_amount(self):
        """Deux transactions de même montant ont des ARN différents (STAN distincts)."""
        from issuer_inbound import parse_visa_ctf
        # sample_rows génère des STAN 100000+i, donc deux rows ont des STAN différents
        rows = sample_rows(["4111111111111111", "5413330089020011"])
        # Forcer le même montant pour les deux
        rows[0]["txn_amount"] = 5000
        rows[1]["txn_amount"] = 5000
        lines, _, _, _ = visa.generate_ctf_lines(
            rows, KEY, sending_id="400100", receiving_id="000000",
            merchant_country="788", created=DT)
        payload = "\r\n".join(lines) + "\r\n"
        movements = parse_visa_ctf(payload)
        presentments = [m for m in movements if m.kind == "presentment"]
        self.assertEqual(len(presentments), 2)
        self.assertEqual(presentments[0].amount, presentments[1].amount)
        self.assertIsNotNone(presentments[0].raw_ref)
        self.assertIsNotNone(presentments[1].raw_ref)
        self.assertNotEqual(presentments[0].raw_ref, presentments[1].raw_ref,
                            "Deux transactions de même montant doivent avoir des raw_ref distincts")


class TestIssuerPosting(unittest.TestCase):
    """DB-free: vérifie la règle de sens (sense_for_movement). Pas de DB."""

    def _mc_movement(self, kind: str, pc: str, amount: int = 1000) -> "ClearingMovement":
        from issuer_inbound import ClearingMovement
        return ClearingMovement(
            network="MASTERCARD", mti_or_tc="1240", pan="4111111111111111",
            amount=amount, kind=kind, processing_code=pc, currency="788")

    def _visa_movement(self, kind: str, tc: str, amount: int = 1000) -> "ClearingMovement":
        from issuer_inbound import ClearingMovement
        return ClearingMovement(
            network="VISA", mti_or_tc=tc, pan="4111111111111111",
            amount=amount, kind=kind, processing_code=None, currency="788")

    def test_sense_mc_purchase_debit(self):
        from issuer_posting import sense_for_movement
        m = self._mc_movement("presentment", "000000")
        self.assertEqual(sense_for_movement(m), "debit")

    def test_sense_mc_refund_credit(self):
        from issuer_posting import sense_for_movement
        m = self._mc_movement("presentment", "200000")
        self.assertEqual(sense_for_movement(m), "credit")

    def test_sense_visa_tc05_debit(self):
        from issuer_posting import sense_for_movement
        m = self._visa_movement("presentment", "05")
        self.assertEqual(sense_for_movement(m), "debit")

    def test_sense_visa_tc06_credit(self):
        from issuer_posting import sense_for_movement
        m = self._visa_movement("presentment", "06")
        self.assertEqual(sense_for_movement(m), "credit")

    def test_sense_reversal_inverts(self):
        from issuer_posting import sense_for_movement
        mc_rev_purchase = self._mc_movement("reversal", "000000")
        self.assertEqual(sense_for_movement(mc_rev_purchase), "credit",
                         "MC reversal of purchase → credit")

        mc_rev_refund = self._mc_movement("reversal", "200000")
        self.assertEqual(sense_for_movement(mc_rev_refund), "debit",
                         "MC reversal of refund → debit")

        visa_rev_sale = self._visa_movement("reversal", "25")
        self.assertEqual(sense_for_movement(visa_rev_sale), "credit",
                         "Visa TC 25 reversal of sale → credit")

        visa_rev_refund = self._visa_movement("reversal", "26")
        self.assertEqual(sense_for_movement(visa_rev_refund), "debit",
                         "Visa TC 26 reversal of refund → debit")


class TestIssuerAuthorization(unittest.TestCase):
    """DB-free: moteur de décision pur (decide_authorization). Pas de DB."""

    def test_auth_approved_within_limit(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=800, sense="debit",
                                 balance=500, credit_limit=500)
        self.assertTrue(d.approved)
        self.assertEqual(d.response_code, "00")
        self.assertEqual(d.available_before, 1000)

    def test_auth_declined_insufficient(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=1501, sense="debit",
                                 balance=500, credit_limit=1000)
        self.assertFalse(d.approved)
        self.assertEqual(d.response_code, "51")
        self.assertEqual(d.available_before, 1500)

    def test_auth_declined_blocked(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=100, sense="debit",
                                 balance=5000, credit_limit=2000,
                                 status="BLOCKED")
        self.assertFalse(d.approved)
        self.assertEqual(d.response_code, "57")
        self.assertEqual(d.account_status, "BLOCKED")

    def test_auth_refund_always_approved(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=5000, sense="credit",
                                 balance=0, credit_limit=0)
        self.assertTrue(d.approved)
        self.assertEqual(d.response_code, "00")

    def test_auth_amount_zero_declined(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=0, sense="debit",
                                 balance=1000, credit_limit=500)
        self.assertFalse(d.approved)

    def test_auth_exact_available_approved(self):
        from issuer_authorization import decide_authorization
        d = decide_authorization(amount=1500, sense="debit",
                                 balance=500, credit_limit=1000)
        self.assertTrue(d.approved)
        self.assertEqual(d.response_code, "00")
        self.assertEqual(d.available_before, 1500)

    def test_from_processing_code_sense(self):
        from issuer_authorization import AuthorizationRequest
        r = AuthorizationRequest.from_processing_code(
            "4111111111111111", 1000, "788", "200000")
        self.assertEqual(r.sense, "credit")
        r2 = AuthorizationRequest.from_processing_code(
            "4111111111111111", 1000, "788", "000000")
        self.assertEqual(r2.sense, "debit")
        r3 = AuthorizationRequest.from_processing_code(
            "4111111111111111", 1000, "788", "120000")
        self.assertEqual(r3.sense, "debit")


class TestFilePrefixes(unittest.TestCase):
    """DB-free: vérifie que write_ctf_file / write_ipm_file acceptent le préfixe."""

    def test_write_ctf_file_custom_prefix(self):
        lines = ["dummy"]
        with tempfile.TemporaryDirectory() as td:
            path, _ = visa.write_ctf_file(lines, td, "abc123", prefix="VISA_REVERSAL")
            basename = os.path.basename(path)
            self.assertTrue(basename.startswith("VISA_REVERSAL_"),
                            f"expected VISA_REVERSAL_ prefix, got {basename}")
            self.assertTrue(basename.endswith(".dat"))

    def test_write_ipm_file_custom_prefix(self):
        data = b"\0" * 1014
        with tempfile.TemporaryDirectory() as td:
            path, _ = mc.write_ipm_file(data, td, "def456", prefix="MC_REVERSAL")
            basename = os.path.basename(path)
            self.assertTrue(basename.startswith("MC_REVERSAL_"),
                            f"expected MC_REVERSAL_ prefix, got {basename}")
            self.assertTrue(basename.endswith(".ipm"))


class TestIssuerChargeback(unittest.TestCase):
    """MTI 1442 First Chargeback (issuer-side) — builder unit tests."""

    def _req(self, dispute_amount=None, **kw):
        return icb.ChargebackRequest(
            pan=kw.pop("pan", "5413330089020011"),
            original_amount=kw.pop("original_amount", 1000),
            dispute_amount=dispute_amount,
            currency=kw.pop("currency", "788"),
            original_stan=kw.pop("original_stan", "654321"),
            original_date=kw.pop("original_date", DT),
            reason_code=kw.pop("reason_code", "4900"),
            original_processing_code=kw.pop("original_processing_code", "000000"),
            **kw,
        )

    def test_first_chargeback_full(self):
        """dispute_amount=None → DE-24=450, DE-4=original_amount."""
        req = self._req(dispute_amount=None)
        msg = icb.build_first_chargeback(req, msg_number=1, created=DT)
        self.assertEqual(msg["MTI"], icb.MTI_CHARGEBACK)
        self.assertEqual(msg["DE24"], icb.FUNC_FIRST_CB_FULL)
        self.assertEqual(int(msg["DE4"]), 1000)

    def test_first_chargeback_partial(self):
        """dispute_amount < original → DE-24=453, DE-4=dispute_amount."""
        req = self._req(dispute_amount=400)
        msg = icb.build_first_chargeback(req, msg_number=2, created=DT)
        self.assertEqual(msg["DE24"], icb.FUNC_FIRST_CB_PARTIAL)
        self.assertEqual(int(msg["DE4"]), 400)

    def test_first_chargeback_partial_equals_full(self):
        """dispute_amount == original → DE-24=450 (full)."""
        req = self._req(dispute_amount=1000)
        msg = icb.build_first_chargeback(req, msg_number=3, created=DT)
        self.assertEqual(msg["DE24"], icb.FUNC_FIRST_CB_FULL)
        self.assertEqual(int(msg["DE4"]), 1000)

    def test_first_chargeback_amount_exceeds_raises(self):
        """dispute_amount > original → ValueError."""
        req = self._req(dispute_amount=1500)
        with self.assertRaises(ValueError):
            icb.build_first_chargeback(req, msg_number=4, created=DT)

    def test_first_chargeback_amount_zero_raises(self):
        """dispute_amount=0 → ValueError."""
        req = self._req(dispute_amount=0)
        with self.assertRaises(ValueError):
            icb.build_first_chargeback(req, msg_number=5, created=DT)

    def test_first_chargeback_reason_and_link(self):
        """reason_code et original_stan présents dans le message."""
        req = self._req(dispute_amount=None, reason_code="4834",
                        original_stan="999888")
        msg = icb.build_first_chargeback(req, msg_number=6, created=DT)
        self.assertEqual(msg["DE25"], "4834")
        # DE-30 (Original Amount)
        self.assertEqual(msg["DE30"], "000000001000")
        # PDS0099 carries stan + date
        pds_val = msg.get(f"PDS{icb.PDS_ORIG_TXN_REF}", "")
        self.assertIn("999888", pds_val)
        self.assertIn(DT.strftime("%y%m%d"), pds_val)

    def test_first_chargeback_no_pds0025(self):
        """PDS0025 absent du message (pas un reversal)."""
        req = self._req(dispute_amount=None)
        msg = icb.build_first_chargeback(req, msg_number=7, created=DT)
        self.assertNotIn("PDS0025", msg)

    def test_first_chargeback_invalid_pan_raises(self):
        """PAN non numérique → ValueError."""
        req = self._req(pan="ABCDEF123456", dispute_amount=None)
        with self.assertRaises(ValueError):
            icb.build_first_chargeback(req, msg_number=8, created=DT)

    def test_first_chargeback_pan_too_short_raises(self):
        """PAN < 13 chiffres → ValueError."""
        req = self._req(pan="123456789012", dispute_amount=None)
        with self.assertRaises(ValueError):
            icb.build_first_chargeback(req, msg_number=9, created=DT)

    def test_first_chargeback_mandatory_fields_present(self):
        """Tous les champs obligatoires sont dans le message."""
        req = self._req(dispute_amount=None)
        msg = icb.build_first_chargeback(req, msg_number=10, created=DT)
        for de in ("DE2", "DE3", "DE4", "DE12", "DE24", "DE25",
                   "DE30", "DE31", "DE33", "DE43", "DE49", "DE71"):
            self.assertIn(de, msg, f"{de} missing from chargeback")

    def test_first_chargeback_de30_matches_original(self):
        """DE-30 porte le montant original, pas le montant contesté."""
        req = self._req(dispute_amount=300)
        msg = icb.build_first_chargeback(req, msg_number=11, created=DT)
        self.assertEqual(msg["DE30"], "000000001000")  # original=1000
        self.assertEqual(int(msg["DE4"]), 300)          # dispute=300

    def test_first_chargeback_original_processing_code(self):
        """DE-3 porte le processing code original."""
        req = self._req(dispute_amount=None,
                        original_processing_code="090000")
        msg = icb.build_first_chargeback(req, msg_number=12, created=DT)
        self.assertEqual(msg["DE3"], "090000")

    def test_first_chargeback_no_system_fields(self):
        """DE-93/DE-94 absents (système-provided)."""
        req = self._req(dispute_amount=None)
        msg = icb.build_first_chargeback(req, msg_number=13, created=DT)
        self.assertNotIn("DE93", msg)
        self.assertNotIn("DE94", msg)


class TestMovementRef(unittest.TestCase):
    """build_movement_ref — pure function, no DB needed."""

    def _make_movement(self, raw_ref=None, **kw):
        from issuer_inbound import ClearingMovement
        return ClearingMovement(
            network=kw.pop("network", "MASTERCARD"),
            mti_or_tc=kw.pop("mti_or_tc", "1240"),
            pan=kw.pop("pan", "5413330089020011"),
            amount=kw.pop("amount", 1000),
            kind=kw.pop("kind", "presentment"),
            processing_code=kw.pop("processing_code", "000000"),
            currency=kw.pop("currency", "788"),
            raw_ref=raw_ref,
        )

    def test_with_raw_ref(self):
        m = self._make_movement(raw_ref="123456789012345")
        ref = build_movement_ref(m, account_id=42)
        self.assertEqual(ref, "123456789012345")

    def test_without_raw_ref_deterministic(self):
        m = self._make_movement(raw_ref=None)
        ref1 = build_movement_ref(m, account_id=42)
        ref2 = build_movement_ref(m, account_id=42)
        self.assertEqual(ref1, ref2)
        self.assertIsInstance(ref1, str)
        self.assertEqual(len(ref1), 16)

    def test_without_raw_ref_no_clear_pan(self):
        m = self._make_movement(raw_ref=None)
        ref = build_movement_ref(m, account_id=42)
        # Must not contain the clear PAN (the full 16-digit PAN should not appear)
        self.assertNotIn("5413330089020011", ref)
        # Must not contain more than 4 consecutive digit-only characters (masked pan is "****0011")
        # The fallback uses mask_pan which only shows last 4 digits as plain text.
        segments = ref.replace(":", " ").replace("-", " ").split()
        for seg in segments:
            if seg.isdigit() and len(seg) > 4:
                self.fail(f"ref segment contains {len(seg)} consecutive digits — possible PAN leak: {seg!r}")

    def test_different_account_different_ref(self):
        m = self._make_movement(raw_ref=None)
        ref_a = build_movement_ref(m, account_id=1)
        ref_b = build_movement_ref(m, account_id=2)
        self.assertNotEqual(ref_a, ref_b)

    def test_different_amount_different_ref(self):
        m1 = self._make_movement(raw_ref=None, amount=500)
        m2 = self._make_movement(raw_ref=None, amount=1000)
        ref1 = build_movement_ref(m1, account_id=42)
        ref2 = build_movement_ref(m2, account_id=42)
        self.assertNotEqual(ref1, ref2)


class TestIssuerReception(unittest.TestCase):
    """aggregate_results — pure function, no DB needed."""

    def _result(self, status: str) -> dict:
        return {"status": status, "pan_masked": "****1111"}

    def test_empty_no_files(self):
        s = aggregate_results([])
        self.assertEqual(s["files"], 0)
        self.assertEqual(s["applied"], 0)
        self.assertEqual(s["no_account"], 0)
        self.assertEqual(s["rejected"], 0)
        self.assertEqual(s["total_movements"], 0)

    def test_empty_file(self):
        s = aggregate_results([[]])
        self.assertEqual(s["files"], 1)
        self.assertEqual(s["total_movements"], 0)

    def test_all_applied(self):
        s = aggregate_results([
            [self._result("APPLIED"), self._result("APPLIED")],
            [self._result("APPLIED")],
        ])
        self.assertEqual(s["files"], 2)
        self.assertEqual(s["applied"], 3)
        self.assertEqual(s["no_account"], 0)
        self.assertEqual(s["rejected"], 0)
        self.assertEqual(s["total_movements"], 3)

    def test_mixed_statuses(self):
        s = aggregate_results([
            [
                self._result("APPLIED"),
                self._result("NO_ACCOUNT"),
                self._result("APPLIED"),
                self._result("REJECTED_STATUS"),
            ],
        ])
        self.assertEqual(s["files"], 1)
        self.assertEqual(s["applied"], 2)
        self.assertEqual(s["no_account"], 1)
        self.assertEqual(s["rejected"], 1)
        self.assertEqual(s["total_movements"], 4)

    def test_multiple_files_mixed(self):
        s = aggregate_results([
            [self._result("APPLIED")],
            [self._result("NO_ACCOUNT"), self._result("REJECTED_STATUS")],
            [self._result("APPLIED"), self._result("APPLIED")],
        ])
        self.assertEqual(s["files"], 3)
        self.assertEqual(s["applied"], 3)
        self.assertEqual(s["no_account"], 1)
        self.assertEqual(s["rejected"], 1)
        self.assertEqual(s["total_movements"], 5)

    def test_unknown_status_ignored(self):
        s = aggregate_results([
            [self._result("APPLIED"), self._result("UNKNOWN_STATUS")],
        ])
        self.assertEqual(s["applied"], 1)
        self.assertEqual(s["total_movements"], 2)

    def test_already_posted_counted(self):
        s = aggregate_results([
            [self._result("APPLIED"), self._result("ALREADY_POSTED")],
            [self._result("ALREADY_POSTED")],
        ])
        self.assertEqual(s["applied"], 1)
        self.assertEqual(s["already_posted"], 2)
        self.assertEqual(s["total_movements"], 3)

    def test_mixed_with_already_posted(self):
        s = aggregate_results([
            [
                self._result("APPLIED"),
                self._result("NO_ACCOUNT"),
                self._result("ALREADY_POSTED"),
                self._result("REJECTED_STATUS"),
                self._result("ALREADY_POSTED"),
            ],
        ])
        self.assertEqual(s["applied"], 1)
        self.assertEqual(s["no_account"], 1)
        self.assertEqual(s["rejected"], 1)
        self.assertEqual(s["already_posted"], 2)
        self.assertEqual(s["total_movements"], 5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
