#!/bin/sh
# Idempotent: start Postgres + Mailpit, migrate, seed, run API on :3000. Safe to re-run.
set -e
cd "$(dirname "$0")/../../backend"
# reuse native Postgres/Mailpit if already listening
nc -z 127.0.0.1 5434 || docker compose --profile dev up -d --wait --quiet-pull postgres
nc -z 127.0.0.1 1025 || docker compose --profile dev up -d --quiet-pull mailpit
npx prisma migrate deploy >/dev/null
npx prisma generate >/dev/null
npm run seed >/dev/null 2>&1 || true   # seed is no-op if admin exists
curl -sf localhost:3000/readyz >/dev/null && { echo "api already up"; exit 0; }
nohup npm run dev > /tmp/tnp-api.log 2>&1 &
for i in $(seq 30); do curl -sf localhost:3000/readyz >/dev/null && { echo "api up :3000"; exit 0; }; sleep 1; done
echo "api failed, see /tmp/tnp-api.log"; exit 1
