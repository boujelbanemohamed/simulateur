# Flossx83 — Terminal POS + Supervision (React + Vite)

One app, two tabs:

- **Terminal** — a payment terminal that encodes a purchase as a real ISO 8583
  message and posts it to the switch (`POST /api/iso8583`). The right panel
  shows the exact wire message and the switch's decoded response.
- **Supervision** — an admin dashboard (login required): lists captured
  transactions with filters, shows totals per network, runs the clearing batch
  on demand, and lets you download the generated `.dat` / `.ipm` files.

## Prerequisites
- Node 18+ and npm
- The updated **java-switch-standalone** on http://localhost:8080
  (now exposes `/api/iso8583`, `/api/auth/*`, `/api/admin/*`)
- For "Générer les fichiers": the Python `clearing-batch` with its `.venv`,
  reachable from the switch (paths in the switch's application.properties).

## Run
```bash
npm install
npm run dev        # http://localhost:5173
```
A Vite dev proxy forwards /api/* to :8080 (no CORS change). Override with
SWITCH_URL=http://host:port npm run dev.

## Dashboard login
Default lab credentials: admin / flossx83 (ADMIN_USER / ADMIN_PASSWORD on the
switch). Lab-only auth: one shared account, in-memory token, no expiry.

## End-to-end
1. Switch on :8080, POS on :5173.
2. Terminal tab -> key an amount, pick a card, press Payer -> captured.
3. Supervision tab -> log in -> see the transaction -> "Générer les fichiers de
   clearing" -> download the Visa .dat / Mastercard .ipm.
