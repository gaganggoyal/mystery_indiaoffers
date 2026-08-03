#!/usr/bin/env bash
#
# End-to-end smoke test for IndiaOffers E-Mystery.
#
#   ./scripts/smoke-test.sh                          # against http://localhost:3100
#   BASE=https://mystery.indiaoffers.in ./scripts/smoke-test.sh
#   ADMIN_EMAIL=you@x.in ADMIN_PASSWORD=... ./scripts/smoke-test.sh   # also test admin
#
# Exercises the real booking → pay → track → report flow. Safe against
# production: it books a Basic (no-purchase) plan and never marks it paid
# unless test payments are explicitly enabled.

set -uo pipefail

BASE="${BASE:-http://localhost:3100}"
PASS=0
FAIL=0
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# check <label> <expected-code> <url> [curl args...]
check() {
  local label="$1" want="$2" url="$3"; shift 3
  local got
  # ${@+"$@"} keeps `set -u` happy with zero extra args on bash 3.2 (macOS).
  got=$(curl -sS -o /dev/null -w '%{http_code}' ${@+"$@"} "$BASE$url" 2>/dev/null)
  if [[ "$got" == "$want" ]]; then ok "$label ($got)"; else bad "$label — expected $want, got $got"; fi
}

head_ "Public pages — $BASE"
for p in / /pricing /how-it-works /sample-report /faq /costs /book /track; do
  check "GET $p" 200 "$p"
done
check "GET /nonexistent (404 page)" 404 /this-page-does-not-exist
check "GET /healthz" 200 /healthz
check "GET /robots.txt" 200 /robots.txt
check "GET /sitemap.xml" 200 /sitemap.xml

head_ "Booking validation (all must be rejected)"
check "book with no fields"        400 /book -X POST -d 'plan_id=full'
check "book with invalid email"    400 /book -X POST -d 'plan_id=full' -d 'client_name=T' -d 'client_email=bad' -d 'brand_url=https://x.com' -d 'accept_cost_policy=1'
check "book with unknown plan"     400 /book -X POST -d 'plan_id=nope' -d 'client_name=T' -d 'client_email=t@x.com' -d 'brand_url=https://x.com'
check "buy plan without policy"    400 /book -X POST -d 'plan_id=full' -d 'client_name=T' -d 'client_email=t@x.com' -d 'brand_url=https://x.com'
check "custom without cart total"  400 /book -X POST -d 'plan_id=custom' -d 'client_name=T' -d 'client_email=t@x.com' -d 'brand_url=https://x.com' -d 'accept_cost_policy=1'

head_ "Booking flow"
# --data-urlencode: a raw "+" in a -d body is decoded back to a space.
LOC=$(curl -sS -i -X POST "$BASE/book" \
  -d 'plan_id=basic' --data-urlencode 'client_name=Smoke Test' \
  --data-urlencode "client_email=smoke-$(date +%s)@example.com" \
  -d 'brand_url=https://smoke-test.example.com' -d 'accept_cost_policy=1' \
  2>/dev/null | grep -i '^location:' | tr -d '\r' | awk '{print $2}')

if [[ "$LOC" == /pay/* ]]; then
  ok "booking created → $LOC"
  CODE="${LOC#/pay/}"; CODE="${CODE%%\?*}"
  TOK="${LOC##*t=}"
  check "pay page with valid token"   200 "$LOC"
  check "pay page with bad token"     404 "/pay/$CODE?t=deadbeef"
  check "order page with bad token"   404 "/order/$CODE?t=deadbeef"
  check "order page with no token"    404 "/order/$CODE"
  check "report hidden before publish" 302 "/report/$CODE?t=$TOK"
else
  bad "booking did not redirect to /pay (got '$LOC')"
  CODE=""; TOK=""
fi

head_ "Access control"
check "GET /admin redirects to login" 302 /admin
check "admin login rejects bad password" 401 /admin/login -X POST -d 'email=admin@localhost' -d 'password=definitely-wrong'
check "payment proofs not publicly served" 404 /uploads/pay-test.jpg
if [[ -n "$CODE" ]]; then
  check "track with wrong email" 200 /track -X POST -d "order_code=$CODE" -d 'email=attacker@evil.com'
fi

head_ "Security headers"
HDRS=$(curl -sSI "$BASE/" 2>/dev/null)
for h in "X-Content-Type-Options" "X-Frame-Options" "Content-Security-Policy" "Referrer-Policy"; do
  grep -qi "^$h:" <<<"$HDRS" && ok "$h present" || bad "$h missing"
done
grep -qi '^x-powered-by:' <<<"$HDRS" && bad "X-Powered-By leaks Express" || ok "X-Powered-By hidden"
if [[ "$BASE" == https://* ]]; then
  grep -qi '^strict-transport-security:' <<<"$HDRS" && ok "HSTS present" || bad "HSTS missing on https"
fi

if [[ -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
  head_ "Admin panel"
  ST=$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" -X POST "$BASE/admin/login" \
    --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" 2>/dev/null)
  if [[ "$ST" == "302" ]]; then
    ok "admin login succeeded"
    for p in /admin /admin/orders; do check "GET $p (authed)" 200 "$p" -b "$JAR"; done
  else
    bad "admin login failed (got $ST)"
  fi
else
  printf '\n  (set ADMIN_EMAIL + ADMIN_PASSWORD to also test the admin panel)\n'
fi

head_ "Result"
printf '  %d passed, %d failed\n\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
