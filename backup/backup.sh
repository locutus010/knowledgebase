#!/bin/sh
# Tägliche Sicherung: Datenbank (pg_dump) und Anhänge (tar) nach /backups/<datum>/.
# Aufruf ohne Argument: läuft dauerhaft und sichert jeden Tag um KB_BACKUP_TIME (Vorgabe 02:30).
# Aufruf mit "now": sichert sofort einmal und endet.
set -eu

KEEP_DAYS="${KB_BACKUP_KEEP_DAYS:-14}"
AT="${KB_BACKUP_TIME:-02:30}"

run_backup() {
	stamp=$(date +%Y-%m-%d_%H%M)
	dir="/backups/$stamp"
	tmp="/backups/.tmp-$stamp"
	mkdir -p "$tmp"
	echo "Sicherung $stamp beginnt"
	pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$tmp/kb.dump"
	tar -czf "$tmp/uploads.tar.gz" -C /uploads .
	mv "$tmp" "$dir"
	echo "Sicherung fertig: $dir ($(du -sh "$dir" | cut -f1))"
	find /backups -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
}

if [ "${1:-}" = "now" ]; then
	run_backup
	exit 0
fi

echo "Backup-Dienst aktiv: täglich um $AT, Aufbewahrung $KEEP_DAYS Tage"
last=""
while true; do
	today=$(date +%Y-%m-%d)
	if [ "$(date +%H:%M)" = "$AT" ] && [ "$last" != "$today" ]; then
		run_backup || echo "Sicherung fehlgeschlagen" >&2
		last="$today"
	fi
	sleep 30
done
