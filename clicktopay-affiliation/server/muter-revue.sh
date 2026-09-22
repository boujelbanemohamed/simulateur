#!/bin/bash
# Harnais de mutation (revue) : retire une garde, rejoue un fichier de tests, remet la garde.
set -u
SRV=/home/user/simulateur/clicktopay-affiliation/server
export TEST_DATABASE_URL="postgres://clicktopay:clicktopay@127.0.0.1:5432/revue_lot1_test"
LIB="$1"; TESTFILE="$2"; PY="$3"; ETIQ="$4"
cp "$SRV/$LIB" /tmp/muter.bak
python3 - "$SRV/$LIB" <<PYEOF
import sys,io
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
$PY
open(p,'w',encoding='utf-8').write(s)
PYEOF
if diff -q /tmp/muter.bak "$SRV/$LIB" >/dev/null; then
  echo "MUTATION NON APPLIQUEE : $ETIQ"; cp /tmp/muter.bak "$SRV/$LIB"; exit 9
fi
cd "$SRV" && node --test --test-concurrency=1 "$TESTFILE" > /tmp/muter.log 2>&1
RES=$?
cp /tmp/muter.bak "$SRV/$LIB"
if [ $RES -ne 0 ]; then
  echo "ROUGE   : $ETIQ  ->  $(grep -m3 '^# fail' /tmp/muter.log | head -1)"
  grep -m2 'not ok' /tmp/muter.log | sed 's/^/          /'
else
  echo "VERT !! : $ETIQ  (le test passe SANS la garde)"
fi
