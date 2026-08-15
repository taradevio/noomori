# Noomori Architecture

Noomori is a modular monolith optimized for one developer. The mobile app and
API deploy separately, but both group code by product feature and add structure
only when implemented behavior needs it.

## Mobile

```text
src/
├── app/          Expo Router files
├── navigation/   tab navigation
├── modules/      product features
└── shared/       design system, reusable UI, and platform helpers
```

Current route ownership:

| Route | Screen |
|---|---|
| `/` | `modules/recipes/recipes-screen.tsx` |
| `/explore` | `modules/households/household-screen.tsx` |
| `/activity` | `modules/activity/activity-screen.tsx` |
| `/auth` | `modules/auth/auth-screen.tsx` |

Keep code inside its feature. Add a local `components`, `api`, `service`, or
`types` file only when that feature needs it. Move code to `shared` only after a
second feature needs the same behavior.

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
