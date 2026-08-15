# Noomori API

The FastAPI service is a small modular monolith. `server.app` composes only
implemented modules; currently that is the health endpoint. Add a product
module alongside its first real endpoint instead of creating placeholder code.

## Run locally

```bash
uv sync
uv run server
```

The health endpoint is available at `GET /api/v1/health` and returns:

```json
{"status":"ok"}
```

See the repository-level `ARCHITECTURE.md` for module ownership and dependency
rules.
