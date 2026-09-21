# Recette vague 2 — filière FRONT (agent 2)

Exécution : 2026-09-21 · Interface `http://127.0.0.1:5173` (API 4000, base `clicktopay`).
Périmètre : les cas de `docs/plan-de-tests.md` marqués **FRONT** ou **LES DEUX** (77 cas),
partie interface uniquement pour les cas « LES DEUX » (la partie API est traitée par l'agent 3).
Outillage : Playwright/Chromium, écouteurs `console`, `pageerror` et `requestfailed` branchés sur
chaque page. Données créées préfixées `RECETTE-A2-`.
Captures : `/tmp/claude-0/-home-user-simulateur/2c840da0-0f37-50d2-9c7b-03919fb5b7eb/scratchpad/agent2/captures/`.

> Rédigé au fil de l'eau : chaque ligne est écrite dès le cas exécuté.

## 1. Tableau de synthèse

| Cas | Statut | Gravité | Défaut | Écran / fichier | Observé | Attendu | Capture |
| --- | --- | --- | --- | --- | --- | --- | --- |
