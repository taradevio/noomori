# Noomori TDD Readiness Hardening

## Goal

Make Noomori's existing test stack fast, deterministic, and suitable for a
normal RED → GREEN → REFACTOR loop. Keep Jest, React Native Testing Library,
Python `unittest`, the real FastAPI ASGI boundary, and local Supabase database
tests.

## Non-goals

- No new test framework, dependency-injection layer, or production abstraction.
- No rewrite or rename of historical regression tests.
- No global coverage threshold, broad snapshots, or new end-to-end suite.
- No attempt to make FakeSupabase reproduce PostgreSQL, PostgREST, or RLS.

## Required changes

### Runtime

Node 22.23.2 is the canonical development and CI runtime. It satisfies React
Native Testing Library 14 and the current Supabase JS support policy, provides
the native WebSocket used by Supabase Realtime, and remains above Expo SDK 56's
Node 20.19.x minimum.

- Store the exact version in `.node-version`.
- Declare `node >=22.23.2 <23` in `package.json`.
- Install that version explicitly in CI before installing dependencies.

### Frontend tests

- Await React Native Testing Library 14's asynchronous `render`, `rerender`,
  `act`, and `fireEvent` calls.
- Promises intentionally captured to model concurrent input may remain
  unawaited temporarily, but must be awaited before the test finishes.
- Discover both existing functional tests and new unit tests with
  `tests/frontend/**/*.test.ts?(x)`.
- Remove global `console.error` suppression. Unexpected errors remain visible;
  they do not automatically fail Jest.
- A test that intentionally produces an error may suppress it locally only
  while asserting the expected message.
- Expected high-volume `console.debug` diagnostics may be suppressed locally.

### Commands

Keep the existing deterministic commands and add only:

```json
{
  "typecheck": "tsc --noEmit",
  "test:fe": "jest --config tests/frontend/jest.config.js",
  "test:fe:watch": "jest --config tests/frontend/jest.config.js --watch"
}
```

Examples:

```bash
bun run test:fe -- library.functional.test.tsx
bun run test:fe:watch
bun run test:functional:fe
bun run typecheck
bun run test:be
```

### CI

Use the existing job and cleanup behavior. Run gates in this order:

1. Install Node, Bun, Python, and uv.
2. Install frontend and backend dependencies.
3. Typecheck.
4. Run the deterministic frontend suite.
5. Run offline backend tests.
6. Start and reset local Supabase.
7. Run database and authorization tests.
8. Stop Supabase even when a later integration step fails.

Supabase must not start after a failed offline gate.

## Test ownership

| Behavior | Owning test layer |
| --- | --- |
| Pure transforms, parsing, sorting, and state helpers | Focused unit test |
| Rendered state, interaction, navigation intent, accessibility | React Native Testing Library |
| Status codes, validation, response shapes, authentication | FastAPI ASGI test |
| RLS, constraints, indexes, RPCs, PostgREST semantics | Local Supabase integration |
| Keyboard animation, permissions, push delivery, gestures, OS lifecycle | Device/release validation |

Mock external and native boundaries, not the implementation under test. Keep
offline fixtures deterministic and leave live websites and devices outside the
inner loop.

## TDD workflow

For new deterministic behavior and bug fixes:

1. Add the smallest test that fails for the intended reason.
2. Run only that test.
3. Make the smallest correct change.
4. Refactor after the test passes.
5. Run nearby regressions, then the relevant full suite.

Do not rewrite existing production behavior merely to make its history appear
test-driven.

## Acceptance

- `node --version` reports `v22.23.2`.
- Audit confirms no unintentionally unawaited RNTL 14 async calls (`render`,
  `rerender`, `act`, or `fireEvent`), excluding
  promises deliberately captured and awaited later.
- `bun run typecheck` passes.
- A single frontend file and frontend watch mode run without the full suite.
- The complete frontend suite passes without global `console.error`
  suppression.
- Both `*.functional.test.ts(x)` and plain `*.test.ts(x)` are discoverable.
- The complete offline backend suite passes without live Supabase.
- Local Supabase database and authorization tests pass.
- CI runs typecheck, frontend tests, and backend tests before Supabase startup.
- No test framework, production abstraction, coverage gate, or broad snapshot
  suite is added.
