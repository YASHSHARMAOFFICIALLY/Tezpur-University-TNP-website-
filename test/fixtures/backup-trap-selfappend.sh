#!/bin/sh
# FIXTURE, never run: the old deploy/backup.sh trap. After a failed `2>>"$ERR"` step the EXIT trap
# inherits that redirect, so `cat "$ERR" >&2` appends the file to itself until the disk fills.
# Nightly: crontab -e ->  30 2 * * * BACKUP_DIR=/mnt/backup/tnp /srv/tnp/backend/deploy/backup.sh >> /var/log/tnp-backup.log 2>&1
# BACKUP_DIR must be on a different disk/server (ask IT): the run refuses a directory on this server's
# own filesystem unless ALLOW_LOCAL_BACKUP=1. Each run is a folder tnp-<UTC time>/ with db.dump and
# uploads.tgz, written to a staging folder and renamed into place only after both verify, so a failed
# run never replaces a good one. Keeps 14 days. Restore: deploy/restore.sh <that folder>.
# Every run, good or bad, is recorded in backup_runs; GET /admin/system-health shows the latest.
set -eu
cd "$(dirname "$0")/.."
BACKUP_DIR=${BACKUP_DIR:-/mnt/backup/tnp}
PG_SERVICE=${PG_SERVICE:-db}
PG_DB=${PG_DB:-tnp}
UPLOADS=${UPLOADS:-data/uploads}
NAME=tnp-$(date -u +%Y%m%dT%H%M%SZ)
STARTED=$(date -u +%FT%TZ)
ERR=$(mktemp)
STAGE=


pg() { docker compose exec -T "$PG_SERVICE" "$@"; }
# psql variables (:'name') quote the values, so an error message cannot break the SQL.
record() {
  printf "insert into backup_runs (started_at, ok, detail) values (:'started', :'ok', :'detail');\n" |
    pg psql -U tnp -d "$PG_DB" -q -v ON_ERROR_STOP=1 -v started="$STARTED" -v ok="$1" -v detail="$2" >/dev/null
}
on_exit() {
  rc=$?
  [ -n "$STAGE" ] && rm -rf "$STAGE"
  if [ "$rc" -ne 0 ]; then
    cat "$ERR" >&2
    record false "exit $rc: $(tail -c 1500 "$ERR")" || echo "could not record the failed backup in backup_runs" >&2
  fi
  rm -f "$ERR"
}
trap on_exit EXIT
fail() { echo "$1" >>"$ERR"; exit 1; }
mount_of() { df -P "$1" | awk 'NR==2 { print $NF }'; }

[ -d "$BACKUP_DIR" ] || fail "BACKUP_DIR $BACKUP_DIR does not exist (is the backup disk mounted?)"
if [ "${ALLOW_LOCAL_BACKUP:-0}" != 1 ] && [ "$(mount_of "$BACKUP_DIR")" = "$(mount_of .)" ]; then
  fail "BACKUP_DIR $BACKUP_DIR is on this server's own disk ($(mount_of .)); mount the backup disk there, or set ALLOW_LOCAL_BACKUP=1"
fi
[ ! -e "$BACKUP_DIR/$NAME" ] || fail "$BACKUP_DIR/$NAME already exists"
STAGE=$(mktemp -d "$BACKUP_DIR/.staging-$NAME.XXXXXX" 2>>"$ERR")

pg pg_dump -U tnp -Fc "$PG_DB" >"$STAGE/db.dump" 2>>"$ERR"
pg pg_restore --list <"$STAGE/db.dump" >/dev/null 2>>"$ERR"
tar -czf "$STAGE/uploads.tgz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")" 2>>"$ERR"
tar -tzf "$STAGE/uploads.tgz" >/dev/null 2>>"$ERR"
mv "$STAGE" "$BACKUP_DIR/$NAME" 2>>"$ERR"
STAGE=
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 \( -name 'tnp-*' -o -name '.staging-*' \) -mtime +14 -exec rm -rf {} + 2>>"$ERR"
record true "$NAME db.dump $(du -h "$BACKUP_DIR/$NAME/db.dump" | cut -f1 | tr -d " "), uploads.tgz"
echo "backup ok $BACKUP_DIR/$NAME"
