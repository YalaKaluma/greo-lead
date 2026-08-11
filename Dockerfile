FROM node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS frontend-builder

WORKDIR /app/frontend
RUN corepack enable
COPY app/frontend/package.json app/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY app/frontend/ ./
RUN pnpm build


FROM python:3.11-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    useradd --create-home --uid 10001 alfred

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt && \
    pip uninstall -y pip setuptools wheel

COPY --chown=alfred:alfred app/ ./app
COPY --chown=alfred:alfred alembic.ini ./alembic.ini
COPY --chown=alfred:alfred alembic/ ./alembic/
COPY --from=frontend-builder --chown=alfred:alfred /static/ ./static/

USER alfred
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
