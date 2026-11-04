#!/bin/sh
# Idempotent dev stack for UI work on backend-deploy: Postgres DB tnp_dev on :5434 (docker `tnp-testpg`), API on :3100, Next dev on :3001.
# Leaves the prod stack on :443 alone. Mail goes to the Mailpit on :1025/:8025.
# usage: scripts/dev-stack.sh up|down     (dev-only throwaway credentials: DEV_PASSWORD below)
set -eu
cd "$(dirname "$0")/.."
FE=$(pwd)
BE=$FE/../backend-deploy
DB=postgresql://tnp:tnp@localhost:5434/tnp_dev
DEV_PASSWORD=${DEV_PASSWORD:-Dev-Stack-Pass-2026}
ADMIN=${SEED_ADMIN_EMAIL:-tpo@tezu.ac.in}
LOG=${TMPDIR:-/tmp}/tnp-dev

case "${1:-up}" in
down)
  pkill -f "tsx watch src/server.ts" 2>/dev/null || true
  pkill -f "next dev -p 3001" 2>/dev/null || true
  echo down; exit 0 ;;
esac

mkdir -p "$LOG"
docker start tnp-testpg >/dev/null 2>&1 || docker run -d --name tnp-testpg -p 127.0.0.1:5434:5432 -e POSTGRES_USER=tnp -e POSTGRES_PASSWORD=tnp postgres:16 >/dev/null
until psql "postgresql://tnp:tnp@localhost:5434/postgres" -tc "select 1" >/dev/null 2>&1; do sleep 1; done
psql "postgresql://tnp:tnp@localhost:5434/postgres" -tc "select 1 from pg_database where datname='tnp_dev'" | grep -q 1 ||
  psql "postgresql://tnp:tnp@localhost:5434/postgres" -qc "create database tnp_dev"

export DATABASE_URL=$DB PORT=3100 JWT_SECRET=dev-stack-jwt-secret-0123456789abcdef OTP_SECRET=dev-stack-otp-secret-0123456789abcdef \
  SMTP_HOST=127.0.0.1 SMTP_PORT=1025 CORS_ORIGIN=http://localhost:3001 UPLOAD_DIR=$BE/data/dev-uploads \
  SEED_ADMIN_EMAIL=$ADMIN SEED_ADMIN_PASSWORD=Dev-Seed-Pass-2026
(cd "$BE" && npx prisma migrate deploy >/dev/null && npx tsx prisma/seed.ts >/dev/null)
if ! curl -sf localhost:3100/readyz >/dev/null; then
  (cd "$BE" && nohup npx tsx watch src/server.ts </dev/null >"$LOG/api.log" 2>&1 &)
  i=0; until curl -sf localhost:3100/readyz >/dev/null; do i=$((i+1)); [ $i -lt 60 ] || { tail -20 "$LOG/api.log"; exit 1; }; sleep 1; done
fi
API=http://localhost:3100/api/v1 DEMO_PASSWORD=$DEV_PASSWORD SEED_ADMIN_EMAIL=$ADMIN node scripts/seed-demo.mjs >"$LOG/seed.log" 2>&1 || { tail -20 "$LOG/seed.log"; exit 1; }
if ! curl -sf -o /dev/null localhost:3001/login; then
  (BACKEND_URL=http://localhost:3100 nohup npx next dev -p 3001 </dev/null >"$LOG/web.log" 2>&1 &)
  i=0; until curl -sf -o /dev/null localhost:3001/login; do i=$((i+1)); [ $i -lt 90 ] || { tail -20 "$LOG/web.log"; exit 1; }; sleep 1; done
fi
echo "dev stack up: web http://localhost:3001  api http://localhost:3100  admin $ADMIN  password $DEV_PASSWORD  logs $LOG"
# Drive the dev stack with the UI scripts:  WEB=http://localhost:3001 DEMO_PASSWORD=Dev-Stack-Pass-2026 SEED_ADMIN_EMAIL=tpo@tezu.ac.in node scripts/shot.mjs admin /admin out.png
