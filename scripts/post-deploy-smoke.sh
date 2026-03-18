#!/bin/sh

set -eu

APP_URL="${APP_URL:-http://127.0.0.1:3001}"
EMAIL="${PEPA_SMOKE_EMAIL:-admin@pepa.local}"
PASSWORD="${PEPA_SMOKE_PASSWORD:-demo123}"
COOKIE_JAR="$(mktemp)"

cleanup() {
  rm -f "$COOKIE_JAR"
}

trap cleanup EXIT

check_status() {
  url="$1"
  expected="${2:-200}"
  status="$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$APP_URL$url")"
  if [ "$status" != "$expected" ]; then
    echo "Falha em $url: esperado $expected, recebido $status" >&2
    exit 1
  fi
  echo "OK $url -> $status"
}

echo "Smoke PEPA em $APP_URL"

check_status "/api/health" "200"
check_status "/demo" "200"
check_status "/login" "200"

login_status="$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$APP_URL/api/auth/login")"

if [ "$login_status" != "200" ]; then
  echo "Falha no login demo: status $login_status" >&2
  exit 1
fi

echo "OK /api/auth/login -> $login_status"

check_status "/api/auth/session" "200"
check_status "/cotacoes-pepa" "200"
check_status "/validacao-compra-pepa" "200"
check_status "/pedido-final-pepa" "200"
check_status "/logs-pepa" "200"
check_status "/api/pepa/snapshot" "200"
check_status "/api/pepa/history" "200"

echo "Smoke PEPA concluido com sucesso."
