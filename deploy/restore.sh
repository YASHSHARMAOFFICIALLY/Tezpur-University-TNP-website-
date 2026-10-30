#!/bin/sh
# Restore one backup folder made by backup.sh:  deploy/restore.sh /mnt/backup/tnp/tnp-20261031T023000Z
# Stops the app, replaces the database in one transaction, swaps in the uploads (the current ones are
# kept as data/uploads.before-restore-<time>), then starts the app again.
set -eu
cd "$(dirname "$0")/.."
SRC=${1:?usage: deploy/restore.sh BACKUP_FOLDER}
PG_SERVICE=${PG_SERVICE:-db}
PG_DB=${PG_DB:-tnp}
UPLOADS=${UPLOADS:-data/uploads}
pg() { docker compose exec -T "$PG_SERVICE" "$@"; }

[ -f "$SRC/db.dump" ] && [ -f "$SRC/uploads.tgz" ] || { echo "$SRC has no db.dump + uploads.tgz" >&2; exit 1; }
pg pg_restore --list <"$SRC/db.dump" >/dev/null
tar -tzf "$SRC/uploads.tgz" >/dev/null

APP=$(docker compose --profile prod ps -aq app)
[ -z "$APP" ] || docker compose --profile prod stop app
pg pg_restore -U tnp -d "$PG_DB" --clean --if-exists --single-transaction <"$SRC/db.dump"

NEW=$(mktemp -d "$(dirname "$UPLOADS")/.restore.XXXXXX")
tar -xzf "$SRC/uploads.tgz" -C "$NEW"
[ ! -e "$UPLOADS" ] || mv "$UPLOADS" "$UPLOADS.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
# The archive holds one folder (the uploads folder at backup time) with its owner and mode.
set -- "$NEW"/*
mv "$1" "$UPLOADS"
rmdir "$NEW"

[ -z "$APP" ] || docker compose --profile prod start app
echo "restored $SRC into $PG_DB and $UPLOADS"
