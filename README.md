# simulateur

Application de capture et clearing de transactions monétiques (ISO 8583).

## Structure

- `clearing-batch/` — Batch Python de génération des fichiers de clearing Visa CTF et Mastercard IPM
- `java-switch-standalone/` — Backend Spring Boot (Java 21) : capture ISO 8583, chiffrement PAN, endpoints REST, admin
- `pos/` — Frontend React (Vite) : terminal POS et tableau de bord supervision

## Démarrage rapide

Voir les README de chaque sous-projet pour les détails.
