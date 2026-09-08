# Backend Structure Cleanup Revision

## Summary

Apply two small follow-up cleanups after the backend modularization. Keep this revision intentionally narrow and behavior-preserving.

## Changes

### 1. Make the shared RPC error generic

In:

```text
server/src/server/core/database.py
```

update the fallback error raised by `rpc_result()`.

Current behavior:

```python
raise RuntimeError("Household RPC returned an invalid response")
```

Change it to:

```python
raise RuntimeError("RPC returned an invalid response")
```

Reason: `rpc_result()` is now shared by more than the household module, including cookbooks.

Do not change:

- response validation logic
- returned data shape
- HTTP status mappings in feature services
- Supabase RPC behavior

This is only a correctness/clarity cleanup for the shared infrastructure error message.

---

### 2. Move health into the feature-module structure

Move:

```text
server/src/server/api/health.py
```

to:

```text
server/src/server/modules/health/router.py
```

Target structure:

```text
server/src/server/modules/
├── health/
│   ├── __init__.py
│   └── router.py
├── cookbooks/
├── households/
├── notifications/
└── recipes/
```

Update the import in:

```text
server/src/server/main.py
```

from:

```python
from server.api.health import router as health_router
```

to:

```python
from server.modules.health.router import router as health_router
```

Preserve the existing registration:

```python
app.include_router(
    health_router,
    prefix="/api/v1",
)
```

so the public endpoint remains unchanged.

Do not change:

- the health endpoint path
- response shape
- status code
- route prefix
- health-check semantics

After the move, remove the old `server/api/health.py`. If `server/api/` becomes empty apart from `__init__.py`, remove the obsolete `api/` package as well.

---

## Tests

Run the existing backend test suite after the cleanup.

At minimum verify:

```text
/api/v1/health
```

still returns the same successful response.

Also verify that cookbook and household RPC tests still pass, since both depend on the shared RPC-result helper.

No new regression suite is required for this revision unless moving the health module exposes an existing missing application-level health test.

---

## Definition of Done

- `rpc_result()` raises a generic invalid-RPC-response error.
- No shared infrastructure error message incorrectly refers specifically to households.
- Health routing lives under `server.modules.health`.
- `server.main` imports health from the new module path.
- `/api/v1/health` remains backward compatible.
- Obsolete `server/api/` code is removed if no longer used.
- Existing backend tests pass.
- No product behavior, API contract, Supabase authorization behavior, or database logic changes.
