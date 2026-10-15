#!/bin/sh
# Stellt eine Sicherung wieder her: kb-restore <ordnername>, z. B. kb-restore 2026-10-15_0230
# Vorher die App anhalten: docker compose stop app web
set -eu
name="${1:?Ordnername der Sicherung angeben, z. B. 2026-10-15_0230 (siehe: ls backups)}"
dir="/backups/$name"
[ -f "$dir/kb.dump" ] || { echo "Keine Sicherung unter $dir" >&2; exit 1; }
echo "Datenbank wird aus $dir/kb.dump wiederhergestellt"
pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner "$dir/kb.dump"
echo "Anhänge werden aus $dir/uploads.tar.gz wiederhergestellt"
find /uploads -mindepth 1 -delete
tar -xzf "$dir/uploads.tar.gz" -C /uploads
echo "Fertig. Jetzt: docker compose start app web"
