# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install Node 22.23.2 and Bun 1.3.14. Node is pinned in `.node-version`.

2. Install dependencies

   ```bash
   bun install
   ```

3. Start the app

   ```bash
   bunx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

Expo Router routes and route controllers live in `src/app`. Reusable product UI
is grouped by feature under `src/shared/components`, while shared model types
live in `src/shared/types.ts`. This project uses
[file-based routing](https://docs.expo.dev/router/introduction).

## Architecture

Noomori contains an Expo app and a separately deployable FastAPI modular
monolith. Read [ARCHITECTURE.md](./ARCHITECTURE.md) before adding a new feature
or dependency.

## Tests

Install Python 3.12 and uv, then create the backend environment with:

```bash
uv sync --project server --frozen
```

Use the smallest command that covers the behavior being changed:

```bash
# TypeScript
bun run typecheck

# One frontend file, watch mode, or the deterministic frontend suite
bun run test:fe -- library.functional.test.tsx
bun run test:fe:watch
bun run test:functional:fe

# Full offline backend suite
bun run test:be

# Complete offline verification
bun run typecheck && bun run test:functional:fe && bun run test:be
```

Run one backend module, class, or test without running the full suite:

```bash
cd server
.venv/bin/python -m unittest tests.test_recipe_text_import -v
.venv/bin/python -m unittest tests.test_recipe_text_import.RecipeTextParserTest -v
.venv/bin/python -m unittest tests.test_recipe_text_import.RecipeTextParserTest.test_imports_case_fixture -v
```

## Authorization tests

The fast backend suite uses mocked Supabase clients. Run the real PostgreSQL
RLS, RPC, Storage, and bearer-token checks against the local Supabase stack:

```bash
bunx supabase start -x studio,imgproxy,realtime,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta
bunx supabase db reset
bun run test:auth
```

Policy, grant, RPC, and authorization bug changes start with a failing allow or
deny assertion. The SQL suite rolls back its fixtures; the API suite deletes
its local Auth users and household.

## Get a fresh project

When you're ready, run:

```bash
bun run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `bunx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
