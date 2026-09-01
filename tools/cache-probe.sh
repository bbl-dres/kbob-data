#!/usr/bin/env bash
# Probes the LINDAS endpoint's server-side cache with the app's own queries.
#
#   bash tools/cache-probe.sh                # against int.lindas.admin.ch
#   bash tools/cache-probe.sh https://other/query
#
# Sends ~10 requests once (sequential, byte-identical to the app's), then
# reads the varnish-post signature (X-Cache/X-Varnish/Age — see
# SwissFederalArchives/lindas-varnish-post) and prints what the numbers
# mean for the app: whether a shared server cache exists, how fast a HIT
# is versus a cold MISS, whether the Accept header is part of the cache
# key, and how much of the first request is TLS handshake.
#
# Needs: node (for the body generator), curl. No installation.

set -u
ENDPOINT="${1:-https://int.lindas.admin.ch/query}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
UA="kbob-data-cache-probe/1 (+https://github.com/bbl-dres/kbob-data)"
ACCEPT="application/sparql-results+json"

node "$HERE/cache-probe-gen.cjs" "$WORK" >/dev/null || {
  echo "body generation failed — run from the repository checkout"; exit 1; }

printf '\nEndpoint: %s\n\n' "$ENDPOINT"
printf '%-22s %-5s %8s %6s %6s %8s %8s  %-6s %-4s %s\n' \
  probe http bytes tls ttfb total eval cache age varnish

FAILED=0

# One request. Timing model: eval = ttfb - tls-done (server think time,
# includes one network RTT); total also covers the transfer.
probe() {
  local name="$1" body="$2" accept="$3" pause="${4:-0.4}"
  local hdr="$WORK/$name.hdr" out
  out=$(curl -sS -m 180 -o "$WORK/$name.json" -D "$hdr" \
    -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
    -H "Accept: $accept" -A "$UA" --compressed \
    --data-binary "@$WORK/$body.body" \
    -w '%{http_code} %{size_download} %{time_appconnect} %{time_starttransfer} %{time_total}' \
    "$ENDPOINT") || { printf '%-22s request failed: %s\n' "$name" "$out"; FAILED=$((FAILED+1)); return 1; }
  local code bytes tls ttfb total
  read -r code bytes tls ttfb total <<< "$out"
  h() { tr -d '\r' < "$hdr" | awk -F': ' -v k="$1" 'tolower($0) ~ "^"k":" {print $2; exit}'; }
  local xcache age varnish
  xcache=$(h x-cache); age=$(h age); varnish=$(h x-varnish)
  printf '%-22s %-5s %8s %6.2f %6.2f %8.2f %8.2f  %-6s %-4s %s\n' \
    "$name" "$code" "$bytes" "$tls" "$ttfb" "$total" \
    "$(awk -v a="$ttfb" -v b="$tls" 'BEGIN{printf "%.2f", a-b}')" \
    "${xcache:--}" "${age:--}" "${varnish:--}"
  eval "R_${name//-/_}_cache='$xcache' R_${name//-/_}_total='$total'"
  sleep "$pause"
}

probe run1-overview-de  overview-de      "$ACCEPT"
probe run2-overview-de  overview-de      "$ACCEPT"
probe accept-variant    overview-de      "$ACCEPT, */*"
probe cold1-overview-de overview-de-bust1 "$ACCEPT"
probe cold2-overview-de overview-de-bust2 "$ACCEPT"
probe run1-detail-room  detail-room-de   "$ACCEPT"
probe run2-detail-room  detail-room-de   "$ACCEPT"
probe values-de         values-de        "$ACCEPT"
probe alldetails-de     alldetails-de    "$ACCEPT"
probe overview-fr       overview-fr      "$ACCEPT"

printf '\n— Reading the results —\n'
if [ "$FAILED" -ge 10 ]; then
  echo '* All requests failed — the endpoint is unreachable from this machine.'
  exit 1
fi
c1="${R_run1_overview_de_cache:-}" c2="${R_run2_overview_de_cache:-}"
if [ -z "$c1$c2" ]; then cat <<'EOT'
* No X-Cache header: this endpoint does not show the varnish-post cache
  signature. Assume every request pays full evaluation; pre-warming would
  be pointless — a client-side cache and cheaper queries are the levers.
EOT
elif [ "$c2" = "HIT" ]; then cat <<'EOT'
* run2 was a cache HIT: the server cache is active and shared. run2's
  "total" is the best case every visitor can get whenever anyone (or a
  pre-warming job) ran the same bytes within the TTL. cold1/cold2 show
  the price of a MISS. If HIT and MISS times are close, the bottleneck
  is the network path, not query evaluation.
EOT
else cat <<'EOT'
* run2 was not a HIT although the body was identical: the cache exists
  (header present) but did not store the entry — check the HTTP status
  (errors are never cached) or whether a proxy in between alters the body.
EOT
fi
case "${R_accept_variant_cache:-}" in
  HIT)  echo '* accept-variant HIT: the Accept header is NOT part of the cache key here.' ;;
  MISS) echo '* accept-variant MISS right after a warm entry: Accept IS hashed — a pre-warmer must send exactly "Accept: application/sparql-results+json".' ;;
esac
cat <<'EOT'
* "tls" is connection setup the first request pays (~ what a <link
  rel="preconnect"> would save); "eval" approximates server think time.
* Age > 0 means the response was served from cache, created Age seconds
  ago. Re-run later and watch Age to estimate the configured TTL.
* Fair use: this script sends ~10 requests once — the same order of
  magnitude as one person opening the app twice.
EOT
