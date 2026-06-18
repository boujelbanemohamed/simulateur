# java-switch-standalone — capture harness (ISO 8583 + clearing capture)

A runnable Spring Boot app that now speaks **real ISO 8583** and captures
approved transactions for clearing. It bundles the actual Flossx83 ISO 8583
parser plus the validated clearing classes.

## Endpoints
- `POST /api/iso8583` — accepts a raw ISO 8583 ASCII message (what the POS
  terminal sends). Parses it, and if it is approved (DE-39 = "00") with a
  Visa/Mastercard PAN, encrypts the PAN and stores a clearing_transaction row.
  Returns the parsed fields (PAN tokenized) + `captured` flag.
- `GET /api/capture` — read-only list of captured rows (no PAN), to verify.

## Requirements
- JDK 21 (Spring Boot 3.5 is not reliable on newer JDKs)
- PostgreSQL `flossx83` with `schema.sql` applied
- CLEARING_PAN_KEY identical to the Python batch

## Run
```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
source /tmp/flossx83_env.sh                 # CLEARING_PAN_KEY
export DB_USER=$(whoami) DB_PASSWORD=
mvn clean spring-boot:run                   # http://localhost:8080
```

## End-to-end with the POS
1. Start this app (port 8080).
2. Start the POS: `cd ../../flossx83-pos && npm run dev` (port 5173).
3. In the POS, press **Payer** → message hits `/api/iso8583` → captured.
4. Generate files: `cd ../clearing-batch && python3 clearing_orchestrator.py --outbound-root ./out`
