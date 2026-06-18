# simulateur

Application de capture et clearing de transactions monétiques (ISO 8583).

## Structure

- `clearing-batch/` — Batch Python de génération des fichiers de clearing Visa CTF et Mastercard IPM
- `java-switch-standalone/` — Backend Spring Boot (Java 21) : capture ISO 8583, chiffrement PAN, endpoints REST, admin
- `pos/` — Frontend React (Vite) : terminal POS et tableau de bord supervision

## Configuration

Avant de lancer le switch Java **et** le batch Python, exporter la même clé AES-256 :

```bash
export CLEARING_PAN_KEY="$(openssl rand -base64 32)"
```

Cette variable est obligatoire — le switch et le batch l'utilisent pour chiffrer/déchiffrer les PAN. Ils plantent au démarrage si elle est absente.

Un fichier `application.properties.example` est fourni ; copie-le en `application.properties`
et ajuste les autres réglages (DB, chemins) si nécessaire.

## Démarrage rapide

Voir les README de chaque sous-projet pour les détails.
