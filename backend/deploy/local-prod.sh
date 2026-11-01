#!/bin/sh
# Run the production stack on a laptop at https://localhost: self-signed cert, generated secrets, mail to a host Mailpit on :1025.
# usage: deploy/local-prod.sh up|seed|e2e|down|reset
set -eu
cd "$(dirname "$0")/.."
WEB_DIR=${WEB_CONTEXT:-../frontend}
dc() {
  if [ -f deploy/local.env ]; then set -- --env-file .env --env-file deploy/local.env "$@"; fi
  docker compose --profile prod "$@"
}

up() {
  if [ ! -f deploy/certs/fullchain.pem ] || [ ! -f deploy/certs/privkey.pem ]; then
    install -d deploy/certs
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj /CN=localhost \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
      -keyout deploy/certs/privkey.pem -out deploy/certs/fullchain.pem 2>/dev/null
  fi
  if [ ! -f deploy/local.env ]; then
    umask 077
    cat > deploy/local.env <<EOF
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
OTP_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SMTP_HOST=host.docker.internal
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
CORS_ORIGIN=https://localhost
EOF
    umask 022
  fi
  install -d data/uploads
  dc up -d --build
  i=0
  until curl -fsk https://localhost/readyz >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -le 90 ] || { echo "https://localhost/readyz not ready after 3 min" >&2; dc logs --tail 50 app >&2; exit 1; }
    sleep 2
  done
  dc exec -T app npx prisma db seed
  echo "up: https://localhost"
}

case "${1:-}" in
  up) up ;;
  seed) (cd "$WEB_DIR" && API=https://localhost/api/v1 NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-demo.mjs) ;;
  e2e)
    cd "$WEB_DIR"
    for s in e2e e2e-ops e2e-auth; do
      WEB=https://localhost NODE_TLS_REJECT_UNAUTHORIZED=0 E2E_TIMEOUT=${E2E_TIMEOUT:-30000} node "scripts/$s.mjs"
    done
    ;;
  down) dc down ;;
  reset) dc down -v ;;
  *) echo "usage: $0 up|seed|e2e|down|reset" >&2; exit 2 ;;
esac
