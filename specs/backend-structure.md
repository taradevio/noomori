# Backend Structuring Specification

## Status

Proposed

## Scope

Noomori FastAPI backend under:

```text
server/src/server/
```

This specification defines how the backend should be restructured from the current `main.py`-centric implementation into a feature-oriented modular monolith.

The goal is to improve maintainability, testability, observability, and future feature development without introducing unnecessary architectural abstraction.

---

# 1. Problem Statement

The current backend places most application responsibilities inside:

```text
server/src/server/main.py
```

`main.py` currently owns a mixture of:

- FastAPI application initialization
- CORS configuration
- application lifespan
- background tasks
- authentication
- Supabase client creation
- Supabase admin client creation
- request and response schemas
- recipe CRUD
- recipe image handling
- recipe text parsing
- website recipe import orchestration
- cookbook CRUD
- household management
- household activity
- household join codes
- household RPC handling
- recipe sharing
- push notification orchestration
- notification-device management
- storage access
- database access
- error translation
- logging and performance instrumentation

This has created a god module where HTTP transport, business logic, persistence, integrations, schemas, and application lifecycle are tightly coupled.

The codebase has already begun forming natural module boundaries through files such as:

```text
api/health.py
push_notifications.py
recipe_url_import.py
```

The backend should continue in this direction using a modular-monolith architecture.

---

# 2. Goals

The restructuring must:

1. Reduce `main.py` to an application composition root.
2. Organize backend code by business capability.
3. Separate FastAPI routing from non-trivial business logic.
4. Centralize authentication and Supabase client creation.
5. Preserve existing API behavior.
6. Preserve existing RLS behavior.
7. Preserve existing HTTP routes unless explicitly changed by another feature.
8. Preserve existing request and response shapes.
9. Preserve current synchronous `supabase-py` behavior.
10. Keep existing regression coverage functional throughout the migration.
11. Improve the ability to add logging, Sentry, tracing, and performance instrumentation.
12. Avoid unnecessary enterprise-style abstractions.
13. Keep the architecture appropriate for a solo-developer modular monolith.

---

# 3. Non-Goals

This restructuring must NOT:

- convert the backend into microservices
- introduce event-driven architecture
- introduce CQRS
- introduce dependency-injection frameworks
- introduce repository interfaces solely for architectural purity
- introduce domain entities disconnected from existing Pydantic models
- replace Supabase
- replace FastAPI
- replace PostgreSQL RPCs
- change existing RLS policies
- redesign database tables
- redesign existing endpoints
- move business transactions out of PostgreSQL without a concrete need
- rewrite working parser logic unnecessarily
- combine this refactor with unrelated product changes

The refactor should primarily be structural.

---

# 4. Architecture

Use a feature-oriented modular monolith.

Target structure:

```text
server/src/server/
├── __init__.py
├── main.py
├── config.py
│
├── core/
│   ├── __init__.py
│   ├── auth.py
│   ├── database.py
│   └── lifespan.py
│
├── modules/
│   ├── __init__.py
│   │
│   ├── health/
│   │   ├── __init__.py
│   │   └── router.py
│   │
│   ├── recipes/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── images.py
│   │   └── imports/
│   │       ├── __init__.py
│   │       ├── text.py
│   │       ├── website.py
│   │       └── extractor.py
│   │
│   ├── households/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   └── join_codes.py
│   │
│   ├── cookbooks/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   └── notifications/
│       ├── __init__.py
│       ├── router.py
│       ├── schemas.py
│       ├── service.py
│       └── worker.py
│
└── integrations/
    ├── __init__.py
    └── expo.py
```

This is the target boundary, not a requirement to create every file before it contains meaningful behavior.

Do not create empty abstraction layers simply to satisfy the directory layout.

---

# 5. Architectural Rules

## 5.1 Group by business capability first

Prefer:

```text
modules/
├── recipes/
├── households/
└── cookbooks/
```

over:

```text
routers/
services/
schemas/
repositories/
```

The primary ownership boundary should be the product domain.

A developer working on recipe behavior should mostly work under:

```text
modules/recipes/
```

---

## 5.2 `main.py` is the composition root

`main.py` must only be responsible for application assembly.

It may contain:

- `create_app()`
- FastAPI initialization
- middleware registration
- router registration
- top-level app instance
- CLI/Uvicorn entrypoint

It must not contain:

- Supabase queries
- recipe parsing
- household RPC logic
- storage operations
- HMAC logic
- cookbook CRUD
- push notification business logic
- Pydantic product schemas

Target:

```python
def create_app() -> FastAPI:
    app = FastAPI(
        title="Noomori API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(...)

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(recipe_router)
    app.include_router(household_router)
    app.include_router(cookbook_router)
    app.include_router(notification_router)

    return app


app = create_app()
```

---

# 6. Core Infrastructure

## 6.1 `core/database.py`

Move shared Supabase client creation here.

Responsibilities:

```python
get_supabase()
get_admin_supabase()
```

Rules:

- request-scoped Supabase clients must continue using the authenticated JWT
- the regular Supabase client must not bypass RLS
- service-role access must remain explicit
- admin access must not silently replace request-scoped access
- missing credentials should retain equivalent HTTP/server failure behavior

No product-specific queries belong here.

---

## 6.2 `core/auth.py`

Move authentication concerns here.

Responsibilities:

```python
AuthContext
security
get_current_user()
```

`AuthContext` should continue grouping:

```text
verified user
+
request-scoped Supabase client
```

This ensures authenticated route handlers cannot accidentally operate as anonymous users.

Example:

```python
@dataclass
class AuthContext:
    user: object
    supabase: Client
```

`get_current_user()` must:

1. extract the Bearer token
2. create a Supabase client using the token
3. validate the user through Supabase Auth
4. attach the JWT to PostgREST
5. return `AuthContext`

Existing 401 semantics must be preserved.

---

## 6.3 `core/lifespan.py`

Move application-level background lifecycle logic here.

Initial responsibility:

```python
push_receipt_loop()
lifespan()
```

The lifespan module may depend on notification infrastructure but must not contain notification domain behavior itself.

---

# 7. Health Module

Move the current health router into:

```text
modules/health/router.py
```

The existing endpoint behavior must remain unchanged.

Do not add unnecessary service or schema files for health unless future behavior requires them.

---

# 8. Cookbook Module

Cookbooks should be the first product module extracted because the existing behavior is cohesive and relatively isolated.

Target:

```text
modules/cookbooks/
├── router.py
├── schemas.py
└── service.py
```

## 8.1 Schemas

Move:

```python
CookbookTitle
CreateCookbook
ReplaceCookbookRecipes
```

into:

```text
modules/cookbooks/schemas.py
```

Validation semantics must remain unchanged.

## 8.2 Service

Move cookbook-specific operations such as:

```python
execute_cookbook_rpc()
get_owned_cookbook()
cookbook_member_recipe_ids()
cookbook_summary_rows()
cookbook_detail()
```

into:

```text
modules/cookbooks/service.py
```

The service may use `AuthContext` directly for now.

Do not introduce a repository layer yet.

## 8.3 Router

Move endpoints for:

```text
GET    /cookbooks
POST   /cookbooks
GET    /cookbooks/{cookbook_id}
PUT    /cookbooks/{cookbook_id}
PUT    /cookbooks/{cookbook_id}/recipes
DELETE /cookbooks/{cookbook_id}
```

into:

```text
modules/cookbooks/router.py
```

Router handlers should primarily:

1. accept HTTP inputs
2. resolve dependencies
3. call cookbook services
4. translate service/domain failures only where necessary
5. return HTTP responses

Avoid substantial query composition directly inside routers.

---

# 9. Household Module

Target:

```text
modules/households/
├── router.py
├── schemas.py
├── service.py
└── join_codes.py
```

## 9.1 Schemas

Move:

```python
CreateHousehold
HouseholdJoinCodeRequest
HouseholdActivityRead
```

into:

```text
modules/households/schemas.py
```

## 9.2 Join codes

Move join-code-specific logic into:

```text
modules/households/join_codes.py
```

Including:

```python
HOUSEHOLD_JOIN_CODE_CONTEXT
household_join_code_digest()
```

This file should own join-code normalization/crypto concerns, not general household persistence.

## 9.3 Service

Move household operations including:

```python
household_rpc_result()
database_error_code()
raise_household_rpc_error()
execute_household_rpc()
```

and household workflows into:

```text
modules/households/service.py
```

The module must preserve current PostgreSQL RPC semantics.

## 9.4 Router

Move endpoints for:

```text
GET    /household
POST   /household
DELETE /household

GET    /household/activity
PUT    /household/activity/read

POST   /household/invite
DELETE /household/invite

POST   /household/join/preview
POST   /household/join
```

into:

```text
modules/households/router.py
```

---

# 10. Notification Module

Target:

```text
modules/notifications/
├── router.py
├── schemas.py
├── service.py
└── worker.py
```

## 10.1 Schemas

Move:

```python
NotificationDeviceRegistration
NotificationDeviceRemoval
```

into:

```text
modules/notifications/schemas.py
```

Push-token validation must remain equivalent.

## 10.2 Router

Move:

```text
PUT    /notifications/device
DELETE /notifications/device
```

into:

```text
modules/notifications/router.py
```

## 10.3 Service

Move notification orchestration such as:

```python
deliver_household_recipe_notification()
queue_household_recipe_notification()
```

into:

```text
modules/notifications/service.py
```

Recipe persistence must remain authoritative.

Push notification delivery must continue to be best-effort.

Failure to send push notifications must not roll back recipe writes or household activity.

## 10.4 Worker

Move periodic Expo receipt handling into:

```text
modules/notifications/worker.py
```

Including:

```python
push_receipt_loop()
```

---

# 11. Expo Integration

The existing Expo-specific HTTP/integration behavior should eventually live under:

```text
integrations/expo.py
```

This may include functionality currently found in:

```text
push_notifications.py
```

The integration file should own external Expo API details.

The notification module should own Noomori-specific notification behavior.

Desired dependency:

```text
recipe service
    ↓
notification service
    ↓
Expo integration
```

not:

```text
recipe router
    ↓
raw Expo implementation
```

---

# 12. Recipe Module

Recipes have the largest blast radius and should be migrated after smaller modules.

Target:

```text
modules/recipes/
├── router.py
├── schemas.py
├── service.py
├── images.py
└── imports/
    ├── text.py
    ├── website.py
    └── extractor.py
```

---

# 13. Recipe Schemas

Move recipe Pydantic models into:

```text
modules/recipes/schemas.py
```

Including:

```python
RecipeIngredient
RecipeIngredientGroup
RecipeInstruction
RecipeInstructionGroup
RecipeNutrition
CreateRecipe
RecipeImageUpdate
ImportRecipeTextRequest
ImportRecipeUrlRequest
ImportedRecipeTextDraft
```

Validation behavior must remain unchanged.

Do not alter existing request or response structures during this refactor.

---

# 14. Recipe Service

Move recipe persistence and business workflows into:

```text
modules/recipes/service.py
```

Candidate responsibilities:

```python
get_owned_recipe()
get_readable_recipe()
recipe_with_share_state()
recipe_with_signed_image()
signed_recipe_image_urls()
recipes_with_signed_images()

list_recipes()
list_household_recipes()
create_recipe()
update_recipe()
delete_recipe()
set_recipe_shared()
```

The exact internal naming may change, but ownership must stay cohesive.

For now, recipe services may directly use the request-scoped Supabase client from `AuthContext`.

---

# 15. Recipe Images

Move recipe-image-specific logic into:

```text
modules/recipes/images.py
```

Candidate responsibilities:

```python
valid_recipe_image_path()
activate_recipe_image()
remove_recipe_image()
signed URL helpers
storage cleanup
image validation
```

Constants such as:

```python
RECIPE_IMAGE_BUCKET
RECIPE_IMAGE_MAX_BYTES
```

should live with the recipe-image module unless they become global infrastructure settings.

Storage deletion should remain best-effort where it currently behaves that way.

---

# 16. Recipe Text Import

Move deterministic recipe-text parsing into:

```text
modules/recipes/imports/text.py
```

Candidate responsibilities include:

```python
parse_recipe_text()
```

and text-parser-specific:

- regex constants
- unit aliases
- quantity parsing
- duration parsing
- metadata extraction
- ingredient parsing
- nutrition parsing
- instruction parsing
- section parsing

Do not rewrite the parser while moving it.

The first migration should be behavior-preserving.

Any parser simplification or redesign should be handled in a separate change.

---

# 17. Recipe Website Import

Move website import orchestration into:

```text
modules/recipes/imports/website.py
```

The current endpoint performs multiple stages:

```text
fetch HTML
→ primary recipe-scrapers extraction
→ normalization
→ core-field validation
→ group enrichment
→ nutrition enrichment
→ DOM fallback
→ metadata restoration
→ error normalization
→ observability logging
```

These stages should belong to website-import logic rather than the route handler.

Candidate responsibilities:

```python
normalize_imported_website_recipe()
_draft_core_counts()
_missing_primary_reason()
_enrich_dom_nutrition()
_enrich_primary_groups()
import_recipe_from_url()
```

The HTTP route should become thin.

Example target:

```python
@router.post("/recipes/import/url")
def import_recipe_url(
    payload: ImportRecipeUrlRequest,
    auth: AuthContext = Depends(get_current_user),
):
    return website_import_service.import_recipe(str(payload.url))
```

HTTP error mapping may stay in the router or in a small transport helper.

---

# 18. Existing `recipe_url_import.py`

The existing:

```text
server/recipe_url_import.py
```

already owns low-level extraction behavior.

Do not force-move all logic at once.

It may initially be reused as-is.

Later, once the main structural migration is stable, move it to:

```text
modules/recipes/imports/extractor.py
```

if doing so improves ownership and imports.

Behavior preservation is more important than directory purity.

---

# 19. Router Prefixes

API routes must remain backward compatible.

Do not silently introduce new URL prefixes as part of this refactor.

Current routes such as:

```text
/recipes
/household
/cookbooks
/notifications/device
```

must continue working unless another approved API versioning change explicitly modifies them.

If `/api/v1` is adopted globally later, treat that as a separate migration.

---

# 20. Error Handling

The refactor should preserve existing status codes and error detail strings where frontend behavior or tests depend on them.

Examples:

```text
401 Invalid Authentication
404 Recipe not found
409 Unshare recipe before deleting
422 recipe_not_found
```

Do not normalize every exception into one global application exception hierarchy yet.

A shared error abstraction should only be introduced once repeated patterns justify it.

---

# 21. Supabase and RLS Rules

The refactor must not weaken authorization.

Rules:

1. authenticated user database calls must continue using the user's JWT
2. RLS remains the primary database authorization boundary
3. service-role access must only be used by explicitly privileged workflows
4. admin Supabase clients must not leak into ordinary recipe/household/cookbook services
5. moving code between files must not change query ownership filters
6. current `.eq("owner_user_id", auth.user.id)` checks must remain where they currently provide defense in depth
7. PostgreSQL RPC-based authorization must remain intact

---

# 22. Synchronous Supabase Calls

`supabase-py` is currently synchronous.

Regular route handlers using Supabase should remain regular:

```python
def handler(...):
```

rather than:

```python
async def handler(...):
```

unless the implementation is changed to a truly asynchronous database client.

This allows FastAPI to execute synchronous I/O in its thread pool rather than blocking the event loop.

Do not mechanically convert existing handlers to `async def`.

---

# 23. Repository Layer Policy

Do not create repository classes/interfaces during the initial restructuring.

Preferred current dependency:

```text
router
   ↓
service
   ↓
Supabase
```

A future repository layer may be introduced if one or more of these become true:

- persistence logic is reused across multiple services
- query construction becomes difficult to reason about
- Supabase is replaced or multiple persistence backends are required
- database behavior requires meaningful isolation in tests
- repository methods provide genuine semantic value beyond wrapping `.table()`

Avoid methods that merely transform:

```python
supabase.table("recipes").select(...)
```

into:

```python
recipe_repository.get_recipes()
```

without reducing complexity.

---

# 24. Dependency Direction

Preferred dependency direction:

```text
main
 ↓
routers
 ↓
services
 ↓
core infrastructure / integrations
```

Product modules may depend on core infrastructure.

Core infrastructure must not import product modules except where application lifespan registration explicitly requires a worker hook.

Avoid circular dependencies.

In particular:

```text
recipes
    ↓
notifications
```

may be acceptable for notification orchestration, but:

```text
notifications
    ↓
recipes
    ↓
notifications
```

must be avoided.

Use small data parameters instead of importing full product modules where necessary.

---

# 25. Testing Strategy

The current tests import many symbols directly from:

```python
server.main
```

This makes `main.py` an accidental internal public API.

The migration must update test imports alongside each extracted module.

Example:

Before:

```python
from server.main import (
    CreateCookbook,
    create_cookbook,
)
```

After:

```python
from server.modules.cookbooks.schemas import CreateCookbook
from server.modules.cookbooks.router import create_cookbook
```

or preferably test through HTTP when appropriate.

---

# 26. Test Categories

Preserve current categories:

## Unit-level tests

For:

- schema validation
- join-code hashing
- parser behavior
- helper behavior
- error mapping

## Functional HTTP tests

Use the FastAPI application and dependency overrides where appropriate.

Prefer:

```python
from server.main import app
```

or:

```python
from server.main import create_app
```

only for application-level tests.

Product-specific unit tests should not import unrelated symbols from `main.py`.

## Live authorization tests

Preserve live Supabase/RLS tests.

Structural refactoring must not replace real authorization coverage with mocks.

---

# 27. Migration Strategy

Use incremental extraction rather than a big-bang rewrite.

Recommended order:

```text
Phase 1
core/auth.py
core/database.py

Phase 2
modules/cookbooks/

Phase 3
modules/households/

Phase 4
modules/notifications/

Phase 5
modules/recipes/schemas.py
modules/recipes/service.py
modules/recipes/images.py

Phase 6
modules/recipes/imports/text.py
modules/recipes/imports/website.py

Phase 7
main.py cleanup
architecture docs
test import cleanup
```

Each phase should keep the test suite green before continuing.

---

# 28. Phase 1 — Core Extraction

Move:

```python
AuthContext
security
get_supabase()
get_admin_supabase()
get_current_user()
```

out of `main.py`.

Acceptance criteria:

- application boots successfully
- authentication behaves identically
- RLS-backed requests behave identically
- no endpoint path changes
- existing auth tests pass

---

# 29. Phase 2 — Cookbook Pilot Module

Extract cookbooks first.

Reason:

- cohesive behavior
- relatively isolated dependencies
- lower regression risk than recipe import
- good validation of the new modular pattern

Acceptance criteria:

- all cookbook endpoints retain existing behavior
- cookbook tests import from cookbook modules
- no cookbook-specific implementation remains in `main.py`

---

# 30. Phase 3 — Household Module

Extract:

- schemas
- RPC helpers
- join codes
- activity
- household CRUD
- invite/join routes

Acceptance criteria:

- household join-code behavior unchanged
- HTTP status codes unchanged
- owner/member authorization unchanged
- household activity behavior unchanged
- existing household tests pass

---

# 31. Phase 4 — Notification Module

Extract:

- notification schemas
- device registration
- notification orchestration
- Expo receipt worker

Acceptance criteria:

- recipe saves remain independent of push delivery
- missing Expo secrets still fail/skip in the same semantic places
- receipt loop still starts and stops with application lifespan
- notification tests pass

---

# 32. Phase 5 — Recipe Core Module

Extract:

- schemas
- CRUD
- sharing
- image operations
- signed image helpers

Acceptance criteria:

- recipe API behavior unchanged
- idempotent recipe creation behavior unchanged
- image Storage behavior unchanged
- ownership rules unchanged
- share/unshare behavior unchanged
- recipe tests pass

---

# 33. Phase 6 — Recipe Import Modules

Extract deterministic text parsing and website import orchestration.

This phase must be especially conservative.

Do not modify parser semantics unless required to preserve behavior.

Acceptance criteria:

- existing text-import regression tests pass
- URL-import tests pass
- cross-site fixtures pass
- nutrition extraction behavior unchanged
- group-enrichment behavior unchanged
- website fallback behavior unchanged
- HTTP status mappings unchanged
- image proxy behavior unchanged

---

# 34. Phase 7 — Composition Root Cleanup

Once modules are extracted, reduce `main.py` to:

- FastAPI construction
- middleware
- lifespan
- router registration
- app instance
- local Uvicorn entrypoint

Target:

```text
main.py ≈ 50–100 lines
```

This is a guideline, not an enforced line-count rule.

Correct responsibility boundaries matter more than exact size.

---

# 35. Observability Requirements

The new structure should make observability ownership clearer.

Logging should use module-level loggers:

```python
logger = logging.getLogger(__name__)
```

Examples:

```text
server.modules.recipes.service
server.modules.recipes.imports.website
server.modules.households.service
server.modules.notifications.service
```

This allows future log filtering by capability.

---

# 36. Performance Instrumentation

Preserve existing performance timing around:

- recipe listing
- recipe save/update/delete
- website import
- image import
- signed URL generation where relevant

Future Sentry or tracing instrumentation should be able to distinguish operations such as:

```text
recipe.import.website.fetch
recipe.import.website.primary_extract
recipe.import.website.dom_fallback
recipe.save
recipe.image.sign
household.rpc
notification.send
```

Do not require tracing as part of this structural refactor unless observability work is being implemented in the same approved change.

---

# 37. App Factory

The final application should expose:

```python
create_app()
```

and:

```python
app = create_app()
```

This improves:

- testing
- application setup isolation
- future middleware setup
- Sentry initialization
- environment-specific configuration

Example:

```python
def create_app() -> FastAPI:
    app = FastAPI(
        title="Noomori API",
        version="0.1.0",
        lifespan=lifespan,
    )

    configure_middleware(app)
    configure_routes(app)

    return app
```

Avoid over-splitting `configure_middleware()` and `configure_routes()` unless they actually improve readability.

---

# 38. Uvicorn Entry Point

The project script may continue to resolve to:

```toml
server = "server.main:main"
```

during the migration.

The local `main()` function may continue using:

```python
uvicorn.run(
    "server.main:app",
    host="0.0.0.0",
    port=8000,
    reload=True,
)
```

Production deployment configuration should control `reload=False`.

Do not make deployment architecture part of this refactor unless explicitly included.

---

# 39. `ARCHITECTURE.md`

Update `ARCHITECTURE.md` after the migration to match implementation.

It should describe:

```text
server.main.create_app()
```

as the composition root and document the feature-oriented modular monolith.

Do not leave architectural documentation describing paths/modules that do not exist.

---

# 40. Definition of Done

The restructuring is complete when:

- `main.py` is only application composition and entrypoint logic
- authentication is in `core/auth.py`
- Supabase construction is in `core/database.py`
- lifespan/background receipt scheduling is outside `main.py`
- recipes have a dedicated module
- households have a dedicated module
- cookbooks have a dedicated module
- notifications have a dedicated module
- health lives under the module structure
- product-specific Pydantic schemas no longer live in `main.py`
- substantial Supabase query logic no longer lives in `main.py`
- website parser/import orchestration no longer lives in `main.py`
- existing endpoint URLs remain compatible
- existing request/response shapes remain compatible
- existing RLS behavior remains compatible
- test imports are migrated away from `server.main` except application-level tests
- the full backend test suite passes
- live authorization tests pass
- `ARCHITECTURE.md` matches the final implementation

---

# 41. Guardrails for Future Backend Development

After this migration:

### Do not add new product endpoints directly to `main.py`.

New endpoints must belong to their owning module.

### Do not add shared helpers to `core/` unless they are genuinely cross-cutting.

Feature-specific helpers belong to the feature module.

### Do not introduce new layers automatically.

Add abstractions only when they reduce real complexity.

### Keep routers thin.

Router code should focus on HTTP concerns.

### Keep feature behavior colocated.

Recipe-specific code should stay under recipes unless it is truly shared infrastructure.

### Preserve RLS as a primary authorization boundary.

Application checks are defense in depth, not a replacement.

---

# 42. Expected Result

Before:

```text
request
   ↓
main.py
   ├── auth
   ├── parser
   ├── Supabase
   ├── recipes
   ├── cookbooks
   ├── household
   ├── notifications
   ├── storage
   └── background workers
```

After:

```text
                         main.py
                     composition root
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
      recipes           households        cookbooks
       router              router            router
          │                 │                 │
          ▼                 ▼                 ▼
       service            service           service
          │                 │                 │
          └─────────────┬───┴─────────────────┘
                        │
                        ▼
                 core/auth + Supabase
```

With external dependencies:

```text
recipes
   │
   └── notifications
           │
           ▼
       Expo integration
```

And recipe imports:

```text
recipes/router
      │
      ▼
recipes/imports/website
      │
      ├── recipe-scrapers
      ├── DOM enrichment
      └── deterministic fallback
```

The final backend should remain a single deployable FastAPI application while gaining clear module ownership and significantly lower coupling.
