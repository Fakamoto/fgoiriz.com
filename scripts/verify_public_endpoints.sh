#!/usr/bin/env bash
set -euo pipefail

base="${1:-https://fgoiriz.com}"
missing="agent-readiness-check-$(date +%s)"

expect_status() {
    local expected="$1"
    local url="$2"
    local actual
    actual="$(curl -sS -o /dev/null -w '%{http_code}' "$url")"
    test "$actual" = "$expected" || { echo "$url: expected $expected, got $actual" >&2; exit 1; }
}

for path in / /about /contact /privacy /llms.txt /profile.md /robots.txt /sitemap.xml /FacundoGoirizCV.pdf; do
    expect_status 200 "$base$path"
done
expect_status 404 "$base/$missing"

headers="$(curl -sSI -H 'Accept: text/markdown' "$base/")"
grep -Eiq '^content-type: text/markdown; charset=utf-8' <<<"$headers"
grep -Eiq '^vary:.*accept' <<<"$headers"

missing_headers="$(curl -sSI -H 'Accept: text/markdown' "$base/$missing")"
grep -Eq '^HTTP/[^ ]+ 404' <<<"$missing_headers"
grep -Eiq '^content-type: text/markdown; charset=utf-8' <<<"$missing_headers"
curl -fsS -H 'Accept: text/markdown' "$base/" | grep -q 'Facundo Goiriz'

echo "Public agent-readiness checks passed for $base"
