#!/usr/bin/env python3
"""Seed une institution financière dans la table financial_institution.
Usage:  source ~/flossx83_env.sh && python3 seed_institution.py
        python3 seed_institution.py --bin 400100 --name "Acquirer Bank" --country 788 --network VISA --role ACQUIRER --acquirer-id 40010001234

Sans args, crée deux institutions par défaut : un ACQUIRER (DE-32 40010001234) et un ISSUER (bin 411111).
"""
import argparse, os, sys
import psycopg2

def _conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=os.environ.get("PGPORT", "5432"),
        dbname=os.environ.get("PGDATABASE", "flossx83"),
        user=os.environ.get("PGUSER", os.environ.get("USER")),
        password=os.environ.get("PGPASSWORD", ""),
    )

SQL_UPSERT = """
INSERT INTO financial_institution (bin, name, country, network, role, acquirer_id)
VALUES (%(bin)s, %(name)s, %(country)s, %(network)s, %(role)s, %(acquirer_id)s)
ON CONFLICT (bin) DO UPDATE SET
    name        = EXCLUDED.name,
    country     = EXCLUDED.country,
    network     = EXCLUDED.network,
    role        = EXCLUDED.role,
    acquirer_id = EXCLUDED.acquirer_id
RETURNING id
"""

DEFAULTS = [
    dict(bin="400100", name="Acquirer Bank", country="788", network="VISA",
         role="ACQUIRER", acquirer_id="40010001234"),
    dict(bin="411111", name="Test Issuer Bank", country="788", network="VISA",
         role="ISSUER", acquirer_id=None),
]

def seed(bin: str, name: str, country: str, network: str,
         role: str, acquirer_id: str | None = None) -> int:
    if role not in ("ACQUIRER", "ISSUER", "BOTH"):
        sys.exit(f"error: invalid role {role!r}; must be ACQUIRER, ISSUER, or BOTH")
    if acquirer_id and role == "ISSUER":
        print("warning: ISSUER with acquirer_id set (acquirer_id will be ignored)")
    conn = _conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(SQL_UPSERT, dict(
                    bin=bin, name=name, country=country,
                    network=network, role=role, acquirer_id=acquirer_id,
                ))
                row = cur.fetchone()
                inst_id = row[0] if row else -1
        return inst_id
    finally:
        conn.close()

def main() -> None:
    p = argparse.ArgumentParser(description="Seed financial_institution table")
    p.add_argument("--bin", default=None, help="BIN/IIN (6-8 chiffres)")
    p.add_argument("--name", default=None, help="Nom de l'institution")
    p.add_argument("--country", default=None, help="ISO numérique pays (3 car.)")
    p.add_argument("--network", default=None, choices=["VISA", "MASTERCARD"],
                   help="Réseau")
    p.add_argument("--role", default=None, choices=["ACQUIRER", "ISSUER", "BOTH"],
                   help="Rôle")
    p.add_argument("--acquirer-id", default=None, help="DE-32 acquirer identifier")
    args = p.parse_args()

    if args.bin:
        if not all([args.name, args.country, args.network, args.role]):
            sys.exit("error: --bin requires --name --country --network --role")
        inst_id = seed(args.bin, args.name, args.country, args.network,
                       args.role, args.acquirer_id)
        print(f"OK: financial_institution id={inst_id} bin={args.bin} role={args.role}")
    else:
        print("Seeding default institutions ...")
        for d in DEFAULTS:
            inst_id = seed(**d)
            print(f"  id={inst_id} bin={d['bin']:>6} role={d['role']:<9} "
                  f"name={d['name']}")
        print("Done.")

if __name__ == "__main__":
    main()
