# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.1 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Keep dependency installation cached until the project metadata changes.
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY server/README.md ./README.md
COPY server/src ./src
RUN uv sync --locked --no-dev --no-editable


FROM python:3.12-slim-bookworm AS runtime

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --home-dir /app --shell /usr/sbin/nologin app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv

USER app

EXPOSE 8000

# Railway provides PORT at runtime; 8000 keeps the image convenient locally.
CMD ["/bin/sh", "-c", "exec uvicorn server.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]
