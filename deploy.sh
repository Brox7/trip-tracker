#!/bin/bash
# Build a clean folder and publish it to Firebase Hosting.
#
# The hosted files contain nothing personal: the trip lives in the database,
# behind Google sign-in. A new device opens the app empty and fills itself
# once someone on the allowlist signs in. The public URL is safe to hand out.
set -e
cd "$(dirname "$0")"

# The real allowlist is gitignored, so a fresh clone will not have it. Say so
# plainly rather than deploying rules that would lock everyone out.
if [ ! -f database.rules.json ]; then
  echo "STOP: database.rules.json is missing."
  echo "      cp database.rules.example.json database.rules.json and put the real addresses in."
  exit 1
fi

rm -rf dist && mkdir dist
cp index.html styles.css app.js pdf-import.js map-data.js firebase-config.js firebase-auth.js firebase-sync.js dist/
mkdir -p dist/vendor && cp vendor/*.js dist/vendor/   # pdf.js, pinned and cached forever
cp manifest.json dist/
mkdir -p dist/icons && cp icons/*.png dist/icons/
sed "s/__BUILD__/$(date +%s)/" sw.js > dist/sw.js

echo "Shipping:"; ls -1 dist | sed 's/^/  /'; echo

# Every script must be in the no-cache list, or a stale copy can strand people
# on an old build. map-data.js is the one file that genuinely never changes.
for f in dist/*.js; do
  n=$(basename "$f" .js)
  [ "$n" = "map-data" ] && continue
  grep -q "$n" firebase.json || { echo "STOP: $n.js is not in firebase.json's no-cache rule"; exit 1; }
done

# Stamp every local asset URL with the deploy time. A browser cannot serve a
# stale copy of a URL it has never seen, so this fixes cache staleness for
# people already holding an old copy — which cache headers alone cannot do.
V=$(date +%s)
echo "{\"v\":\"$V\"}" > dist/version.json
python3 - "$V" <<'STAMP'
import re, sys
v = sys.argv[1]
p = 'dist/index.html'
s = open(p).read()
s = re.sub(r'(href|src)="((?:app|pdf-import|styles|firebase-auth|firebase-sync|firebase-config|map-data)\.(?:js|css))"',
           lambda m: f'{m.group(1)}="{m.group(2)}?v={v}"', s)
open(p, 'w').write(s)
print(f"  stamped assets with ?v={v}")
STAMP

npx --yes firebase-tools@latest deploy --only hosting,database
