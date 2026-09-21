#!/usr/bin/env bash
# Contrôle en une commande l'environnement de recette ClickToPay.
# Usage : bash docs/verifier-environnement.sh
# Code de retour : 0 si tout est en place, 1 si au moins un contrôle échoue.
# N'arrête rien, ne modifie rien : lecture seule.

PGUSER_CT=clicktopay
PGPASS_CT=clicktopay
PGHOST_CT=127.0.0.1
PGPORT_CT=5432
BASES_ATTENDUES=(clicktopay clicktopay_recette_back clicktopay_recette_back2 clicktopay_test)
PORTS_RESERVES=(4011 4012 4021)
CHROMIUM=/opt/pw-browsers/chromium

ECHECS=0
AVERTS=0

if [ -t 1 ]; then VERT=$'\033[32m'; ROUGE=$'\033[31m'; JAUNE=$'\033[33m'; GRAS=$'\033[1m'; RAZ=$'\033[0m'
else VERT=''; ROUGE=''; JAUNE=''; GRAS=''; RAZ=''; fi

ok()    { printf '  %sOK%s    %s\n' "$VERT" "$RAZ" "$1"; }
ko()    { printf '  %sECHEC%s %s\n' "$ROUGE" "$RAZ" "$1"; ECHECS=$((ECHECS+1)); }
avert() { printf '  %sAVERT%s %s\n' "$JAUNE" "$RAZ" "$1"; AVERTS=$((AVERTS+1)); }
titre() { printf '\n%s%s%s\n' "$GRAS" "$1" "$RAZ"; }

psql_ct() { PGPASSWORD="$PGPASS_CT" psql -h "$PGHOST_CT" -p "$PGPORT_CT" -U "$PGUSER_CT" "$@"; }

# Renvoie le PID qui écoute sur le port, ou une chaîne vide.
# ss et netstat ne sont pas installés sur cette machine : lsof uniquement.
qui_ecoute() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

# Port d'une instance API, lu dans /proc/<pid>/environ : la ligne de commande
# 'node src/index.js' ne porte jamais le port.
var_proc() { tr '\0' '\n' < "/proc/$1/environ" 2>/dev/null | sed -n "s/^$2=//p" | head -1; }

printf '%sVerification de l environnement de recette ClickToPay%s\n' "$GRAS" "$RAZ"
printf 'Machine : %s   Date : %s\n' "$(hostname 2>/dev/null)" "$(date '+%Y-%m-%d %H:%M:%S')"

# ---------------------------------------------------------------- outils
titre '1. Outils requis'
for outil in lsof curl psql node; do
  if command -v "$outil" >/dev/null 2>&1; then ok "$outil present"
  else ko "$outil absent (indispensable)"; fi
done
command -v ss >/dev/null 2>&1 || printf '  %sINFO%s  ss/netstat absents : utiliser lsof pour tout controle de port\n' "$JAUNE" "$RAZ"

# ---------------------------------------------------------------- postgres
titre '2. PostgreSQL'
if psql_ct -d postgres -tAc 'select 1' >/dev/null 2>&1; then
  ok "connexion $PGUSER_CT@$PGHOST_CT:$PGPORT_CT etablie"
else
  ko "connexion $PGUSER_CT@$PGHOST_CT:$PGPORT_CT impossible"
fi

titre '3. Bases de donnees'
for base in "${BASES_ATTENDUES[@]}"; do
  if ! psql_ct -d postgres -tAc "select 1 from pg_database where datname='$base'" 2>/dev/null | grep -q 1; then
    ko "base $base absente"
    continue
  fi
  tables=$(psql_ct -d "$base" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null)
  tables=${tables:-0}
  if [ "$tables" -eq 0 ]; then
    ko "base $base presente mais vide (0 table) - amorcer : DATABASE_URL=postgres://$PGUSER_CT:$PGPASS_CT@$PGHOST_CT:$PGPORT_CT/$base npm run db:seed"
  else
    utilisateurs=$(psql_ct -d "$base" -tAc 'select count(*) from users' 2>/dev/null); utilisateurs=${utilisateurs:-?}
    mcc=$(psql_ct -d "$base" -tAc 'select count(*) from mcc_codes' 2>/dev/null); mcc=${mcc:-?}
    demandes=$(psql_ct -d "$base" -tAc 'select count(*) from affiliation_requests' 2>/dev/null); demandes=${demandes:-?}
    ok "base $base : $tables tables, $utilisateurs utilisateurs, $mcc MCC, $demandes demandes"
    [ "$utilisateurs" = "0" ] && avert "base $base sans utilisateur : reamorcage conseille"
  fi
done

# ---------------------------------------------------------------- demonstration
titre '4. Application de demonstration (ne jamais arreter)'
pid_api=$(qui_ecoute 4000)
if [ -z "$pid_api" ]; then
  ko 'API 4000 : aucun processus a l ecoute'
else
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:4000/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then
    base_api=$(var_proc "$pid_api" DATABASE_URL); base_api=${base_api##*/}; base_api=${base_api:-'clicktopay (defaut)'}
    ok "API 4000 repond 200 (pid $pid_api, base $base_api)"
  else
    ko "API 4000 : processus $pid_api present mais /api/health repond '$code'"
  fi
fi

pid_web=$(qui_ecoute 5173)
if [ -z "$pid_web" ]; then
  ko 'Interface 5173 : aucun processus a l ecoute'
else
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:5173/ 2>/dev/null)
  if [ "$code" = "200" ]; then ok "Interface 5173 repond 200 (pid $pid_web)"
  else ko "Interface 5173 : processus $pid_web present mais la page repond '$code'"; fi
fi

# ---------------------------------------------------------------- ports reserves
titre '5. Ports reserves aux agents'
declare -A PROPRIETAIRE=( [4011]='agent 3' [4012]='agent 6' [4021]='agent 4' )
for port in "${PORTS_RESERVES[@]}"; do
  pid=$(qui_ecoute "$port")
  if [ -z "$pid" ]; then
    ok "port $port libre (${PROPRIETAIRE[$port]})"
  else
    base_p=$(var_proc "$pid" DATABASE_URL); base_p=${base_p##*/}; base_p=${base_p:-'clicktopay (defaut) !'}
    avert "port $port deja occupe par le pid $pid, base $base_p (${PROPRIETAIRE[$port]}) - ne pas tuer sans verifier a qui il appartient"
  fi
done

# ---------------------------------------------------------------- chromium
titre '6. Chromium / Playwright'
cible=$(readlink -f "$CHROMIUM" 2>/dev/null)
if [ -x "$CHROMIUM" ] || { [ -n "$cible" ] && [ -x "$cible" ]; }; then
  version=$("$CHROMIUM" --version 2>/dev/null | head -1)
  ok "chromium executable : ${version:-$cible}"
else
  ko "chromium introuvable ou non executable ($CHROMIUM)"
fi
SCRATCH=/tmp/claude-0/-home-user-simulateur/2c840da0-0f37-50d2-9c7b-03919fb5b7eb/scratchpad
if [ -d "$SCRATCH/node_modules/playwright" ]; then ok "module playwright present dans le scratchpad"
else avert "module playwright absent de $SCRATCH/node_modules (tests front automatises indisponibles)"; fi

# ---------------------------------------------------------------- hygiene
titre '7. Hygiene du depot'
DEPOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [ -f "$DEPOT/server/.env" ]; then
  ko "$DEPOT/server/.env existe : il s appliquerait a TOUTES les instances, demonstration comprise. Le supprimer."
else
  ok 'aucun server/.env (les instances restent isolees par leurs variables)'
fi

# ---------------------------------------------------------------- bilan
titre 'Bilan'
if [ "$ECHECS" -eq 0 ]; then
  printf '  %sEnvironnement conforme%s (%d avertissement(s))\n\n' "$VERT" "$RAZ" "$AVERTS"
  exit 0
else
  printf '  %s%d controle(s) en echec%s, %d avertissement(s)\n' "$ROUGE" "$ECHECS" "$RAZ" "$AVERTS"
  printf '  Consulter docs/recette-coordination.md avant toute action corrective.\n\n'
  exit 1
fi
