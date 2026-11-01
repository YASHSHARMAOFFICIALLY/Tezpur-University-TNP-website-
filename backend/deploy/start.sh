#!/bin/sh
# Container entrypoint. Fails at boot, not on the first upload, when UPLOAD_DIR is not writable.
set -eu
UPLOAD_DIR=${UPLOAD_DIR:-./data/uploads}
if [ ! -d "$UPLOAD_DIR" ] || [ ! -w "$UPLOAD_DIR" ]; then
  echo "UPLOAD_DIR $UPLOAD_DIR is not a writable directory for uid $(id -u). On the host run: sudo install -d -o 1000 -g 1000 data/uploads" >&2
  exit 1
fi
# Migrations on start: `migrate deploy` never resets data.
npx prisma migrate deploy
exec node dist/src/server.js
