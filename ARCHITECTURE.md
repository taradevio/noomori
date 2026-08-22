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

| Route | Screen |
|---|---|
| `/` | `app/(tabs)/index.tsx` |
| `/explore` | `app/(tabs)/explore.tsx` |
| `/activity` | `app/(tabs)/activity.tsx` |
| `/auth` and `/login` | `shared/components/auth/auth-screen.tsx` |
| `/onboarding/*` | `app/onboarding/` |

Keep route composition in `app`. Group reusable product UI by feature under
`shared/components`, and keep shared model types in `shared/types.ts`. Keep
cross-cutting design-system, hook, provider, and platform code in their existing
`shared` folders.

## API

`server.app.create_app()` is the composition root. It registers implemented
routers under `/api/v1`; currently only `modules.health` exists.

Keep request handling stateless. Create external resources during application
startup and inject them through FastAPI dependencies. When persistence is
needed, begin with one database and keep each module's queries and tables with
that module while sharing connection infrastructure.

Add product modules, caching, queues, workers, or separate services only after
a concrete feature or measured load requires them. The modular monolith remains
the default architecture as Noomori grows.
