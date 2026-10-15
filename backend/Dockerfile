FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    KB_UPLOAD_DIR=/data/uploads

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY alembic.ini ./
COPY alembic ./alembic
COPY kb ./kb
# Editierbar installiert: kb/migrate.py findet alembic.ini über den Pfad des Pakets.
RUN uv sync --frozen --no-dev

RUN useradd --uid 1000 --create-home kb && mkdir -p /data/uploads && chown -R kb:kb /data
USER kb
VOLUME /data/uploads
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=3).status == 200 else 1)"]

CMD ["python", "-m", "kb", "serve"]
