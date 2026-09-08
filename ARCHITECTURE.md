# Noomori Architecture

Noomori is optimized for one developer. The mobile app and API deploy
separately, and both add structure only when implemented behavior needs it.

## Mobile

```text
src/
├── app/          Expo Router routes and route controllers
├── routes/       tab navigation adapters
└── shared/       components, types, design system, and platform helpers
```

Current route ownership:

| Route                | Screen                                   |
| -------------------- | ---------------------------------------- |
| `/`                  | `app/(tabs)/index.tsx`                   |
| `/cookbooks`         | `app/(tabs)/cookbooks.tsx`               |
| `/account`           | `app/(tabs)/account.tsx`                 |
| `/auth` and `/login` | `shared/components/auth/auth-screen.tsx` |
| `/onboarding/*`      | `app/onboarding/`                        |

Keep route composition in `app`. Group reusable product UI by feature under
`shared/components`, and keep shared model types in `shared/types.ts`. Keep
cross-cutting design-system, hook, provider, and platform code in their existing
`shared` folders.

## API

`server.main.create_app()` is the composition root. It configures middleware and
lifespan handling, registers the existing health router at `/api/v1/health`, and
registers the unversioned product routers without changing their public paths.

```text
server/src/server/
├── main.py                 application composition and Uvicorn entrypoint
├── core/                   authentication, Supabase clients, and lifespan
├── modules/
│   ├── cookbooks/          cookbook routes and persistence workflows
│   ├── households/         household routes, RPCs, and join codes
│   ├── notifications/      device routes and notification orchestration
│   └── recipes/            recipe routes, schemas, images, and imports
├── push_notifications.py   Expo push transport
└── recipe_url_import.py    safe fetching and low-level website extraction
```

Feature services use the authenticated request-scoped Supabase client so RLS
remains authoritative. Admin access stays explicit in notification workflows.
Supabase-backed handlers remain synchronous, and optional push delivery and
Storage cleanup remain best-effort.

Add repositories, queues, caches, or separate services only after a concrete
feature or measured load requires them. The modular monolith remains the
default architecture as Noomori grows.
