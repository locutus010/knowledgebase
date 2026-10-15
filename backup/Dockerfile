FROM postgres:17-alpine
COPY backup.sh /usr/local/bin/kb-backup
COPY restore.sh /usr/local/bin/kb-restore
RUN chmod +x /usr/local/bin/kb-backup /usr/local/bin/kb-restore
ENTRYPOINT ["kb-backup"]
