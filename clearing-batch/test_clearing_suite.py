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
import unittest
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from claim_clearing import decrypt_pan, IV_LEN, load_key
import visa_clearing_generator as visa
import mastercard_clearing_generator as mc

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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 2)
        self.assertEqual(len(data) % 1014, 0)

    def test_roundtrip_record_count(self):
        rows = sample_rows(["5413330089020011", "2223000048400011", "5555444433332222"])
        data, count, _ = mc.generate_ipm_bytes(
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        n_records, first_mti = mc.verify_ipm(data, blocked=True)
        self.assertEqual(n_records, count + 2)
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
        self.assertIn("PDS0023", presentment)
        self.assertEqual(int(presentment["DE4"]), 1000)

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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
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
            rows, KEY, terminal_type="  Z", tcc="T", txn_env="0",
            created=DT, blocked=True)
        self.assertEqual(count, 1)
        recs = list(IpmReader(io.BytesIO(data), blocked=True))
        presentment = next(r for r in recs if r.get("MTI") == "1240")
        self.assertEqual(presentment["DE3"], "090000")
        self.assertNotIn("DE54", presentment)

    def test_cashback_with_de54(self):
        """Cashback avec row.de54 → DE-54 présent dans le présentment."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        rows[0]["de54"] = 500
        msg = mc.build_presentment(rows[0], "5413330089020011", 2,
                                   terminal_type="  Z", tcc="T", txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE3"], "090000")
        self.assertEqual(msg["DE54"], "500")
        self.assertEqual(int(msg["DE4"]), 1500)

    def test_cashback_with_txn_cashback(self):
        """Cashback avec row.txn_cashback → DE-54 présent."""
        rows = sample_rows(["5413330089020011"])
        rows[0]["processing_code"] = "090000"
        rows[0]["txn_amount"] = 1500
        rows[0]["txn_cashback"] = 750
        msg = mc.build_presentment(rows[0], "5413330089020011", 2,
                                   terminal_type="  Z", tcc="T", txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE3"], "090000")
        self.assertEqual(msg["DE54"], "750")
        self.assertEqual(int(msg["DE4"]), 1500)

    def test_build_presentment_reversal_has_pds0025(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   terminal_type="  Z", tcc="T", txn_env="0",
                                   created=DT, is_reversal=True)
        self.assertEqual(msg["DE24"], mc.FUNC_REVERSAL)
        self.assertEqual(msg.get("PDS0025"), "R")
        self.assertEqual(msg["MTI"], mc.MTI_PRESENTMENT)

    def test_build_presentment_no_reversal(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_presentment(row, "5413330089020011", 2,
                                   terminal_type="  Z", tcc="T", txn_env="0",
                                   created=DT)
        self.assertEqual(msg["DE24"], mc.FUNC_PRESENTMENT)
        self.assertNotIn("PDS0025", msg)

    def test_build_chargeback_skeleton(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_chargeback(row, "5413330089020011", 2,
                                  terminal_type="  Z", tcc="T", txn_env="0",
                                  created=DT)
        self.assertEqual(msg["MTI"], mc.MTI_CHARGEBACK)
        self.assertEqual(msg["DE24"], mc.FUNC_CHARGEBACK)
        self.assertEqual(msg["DE72"], "000")
        self.assertEqual(int(msg["DE4"]), 1000)
        self.assertNotIn("PDS0025", msg)

    def test_build_chargeback_custom_reason(self):
        row = sample_rows(["5413330089020011"])[0]
        msg = mc.build_chargeback(row, "5413330089020011", 2,
                                  terminal_type="  Z", tcc="T", txn_env="0",
                                  created=DT,
                                  chargeback_reason="41")
        self.assertEqual(msg["DE72"], "041")


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
