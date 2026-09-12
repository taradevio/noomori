# Minimal Backend Sentry Configuration — Revision

## Summary

Configure the existing `sentry-sdk==2.68.0` dependency for the FastAPI backend only.

The backend should:

- Capture 100% of automatically reported error events.
- Capture 10% of production traces.
- Profile approximately 1% of production requests by using a `0.1` profile sample rate relative to the `0.1` trace sample rate.
- Send warning-or-higher application logs to Sentry Logs.
- Convert error-or-higher application logs into Sentry error events.
- Collect automatic FastAPI request performance telemetry.
- Attach authenticated Supabase user IDs to request-scoped Sentry events.

Following Ponytail, do not add:

- New dependencies.
- Custom Sentry middleware.
- Permanent Sentry test endpoints.
- Observability wrapper/service classes.
- Manual domain metrics.
- Manual spans.
- Per-handler `capture_exception()` calls.
- Per-handler Sentry instrumentation.

The goal is minimal production observability with strong privacy defaults and no observability-specific architecture.

---

## Implementation Changes

### 1. Backend Settings

Extend:

`server/src/server/config.py`

with the following settings:

```python
SENTRY_DSN: SecretStr | None = None
SENTRY_RELEASE: str | None = None
SENTRY_TRACES_SAMPLE_RATE: float = 0.1
SENTRY_PROFILES_SAMPLE_RATE: float = 0.1
```

Requirements:

- `SENTRY_DSN` must be optional.
- `SENTRY_RELEASE` must be optional.
- `SENTRY_TRACES_SAMPLE_RATE` must validate within `0..1`.
- `SENTRY_PROFILES_SAMPLE_RATE` must validate within `0..1`.
- Keep production defaults at:
  - trace sample rate: `0.1`
  - profile sample rate: `0.1`

Because `profiles_sample_rate` is relative to sampled transactions:

```text
0.1 trace sample rate
×
0.1 profile sample rate
=
~0.01 of total requests profiled
```

Therefore production profiling should cover approximately 1% of all backend requests.

When passing `SENTRY_DSN` to the SDK, unwrap the `SecretStr` explicitly:

```python
settings.sentry_dsn.get_secret_value()
```

Do not pass the `SecretStr` object directly.

---

### 2. Sentry Initialization

Add one private Sentry initializer in:

`server/src/server/main.py`

Invoke it once before the module-level FastAPI application is created.

Example structure:

```python
def _initialize_sentry(settings: Settings) -> None:
    ...
```

Initialization rules:

- Initialize Sentry only when `APP_ENV` is exactly:
  - `staging`
  - `production`
- Do not initialize Sentry in:
  - development
  - test
  - local environments
- If the environment is `staging` or `production` but no Sentry DSN is configured:
  - log a startup warning;
  - continue application startup;
  - do not fail deployment.

Pass:

- `dsn`
- `environment`
- `release`
- `traces_sample_rate`
- `profiles_sample_rate`

Keep Sentry's normal error-event sampling at its default `1.0`.

Do not configure a separate error-event sample rate unless a future production-volume problem requires it.

---

### 3. Logging Integration

Configure `LoggingIntegration` explicitly:

```python
LoggingIntegration(
    level=logging.WARNING,
    event_level=logging.ERROR,
    sentry_logs_level=logging.WARNING,
    capture_sentry_logs=True,
)
```

Expected behavior:

```text
INFO
└── normal application logging only

WARNING
└── Sentry Log

ERROR / CRITICAL
├── Sentry Log
└── Sentry error event / issue
```

For the pinned `sentry-sdk==2.68.0`, use `capture_sentry_logs=True` for stdlib log forwarding.

Do not rely on `enable_logs=True` as the mechanism for enabling Sentry Logs in this pinned SDK version.

---

### 4. Error Capture Semantics

Do not describe the configuration as capturing "all errors."

Instead, the intended guarantee is:

> Capture 100% of error events that are automatically reported to Sentry.

This includes:

- Unhandled FastAPI / Starlette exceptions captured by the SDK integration.
- `ERROR` and `CRITICAL` log records promoted to Sentry events by `LoggingIntegration`.

It does not guarantee capture of exceptions that application code intentionally catches and silently handles.

Example:

```python
try:
    do_something()
except SomeError:
    return fallback
```

If the exception is neither re-raised nor logged, Sentry should not be expected to receive it.

Do not add manual `capture_exception()` calls throughout the codebase solely to force handled errors into Sentry.

---

### 5. Privacy Configuration

Initialize Sentry with:

```python
send_default_pii=False
include_local_variables=False
max_request_body_size="never"
```

Purpose:

- Prevent default PII collection.
- Prevent stack-frame local variables from being attached to events.
- Prevent backend request bodies from being sent to Sentry.

This is especially important for Noomori because request bodies may contain:

- Recipe ingredients.
- Recipe instructions.
- Recipe notes.
- Pasted recipe text.
- Imported content.
- URLs supplied by users.
- Household-related information.

Keep Sentry's server-side default data scrubbing enabled.

Do not attach:

- Authorization headers.
- Supabase access tokens.
- Refresh tokens.
- Service-role keys.
- Passwords.
- Household invite codes.
- Raw recipe/import content.
- Full request payloads.
- Email addresses.
- IP addresses.
- Display names.
- Profile data.

---

### 6. Logging Privacy Rules

Request-body protection does not protect against sensitive data deliberately written into application logs.

Existing and future warning/error logs must not contain:

- Authentication credentials.
- Bearer tokens.
- Raw recipe text.
- Imported HTML.
- Arbitrary request payloads.
- Household invite codes.
- Other user-supplied sensitive content.

Avoid:

```python
logger.warning(
    "Recipe parsing failed: %s",
    pasted_text,
)
```

Prefer structured metadata that describes the failure without reproducing user content:

```python
logger.warning(
    "Recipe parsing failed",
    extra={
        "source_type": "text",
        "input_length": len(pasted_text),
    },
)
```

No additional log-scrubbing wrapper is required in this revision.

If production usage later shows that application logs regularly contain unsafe fields, add centralized filtering at that point.

---

### 7. FastAPI Integration

Rely on the Sentry SDK's automatic FastAPI / Starlette integration.

Do not add:

- Custom exception middleware.
- Custom transaction middleware.
- Manual request spans.
- Manual route-level instrumentation.
- Sentry-specific decorators.

Automatic integration should provide request tracing and performance telemetry such as:

- Request duration.
- Endpoint/route context.
- HTTP status.
- Failure rates.
- Transaction traces.
- Profiles for sampled transactions.

Do not describe these as custom "Application Metrics."

Use terminology such as:

> automatic request performance telemetry

or:

> trace-derived latency and failure aggregates

Explicit Sentry metric APIs are out of scope for this revision.

---

### 8. Authenticated User Identity

After successful authentication in:

`server/src/server/core/auth.py`

set the request-scoped Sentry user:

```python
sentry_sdk.set_user(
    {
        "id": str(user.id),
    }
)
```

Only attach the verified Supabase user UUID.

Do not attach:

- Email.
- Username.
- Display name.
- IP address.
- JWT.
- Bearer token.
- Profile metadata.

The identity must only be attached after Supabase authentication succeeds.

Expected flow:

```text
Authorization header
        ↓
Supabase verifies token
        ↓
verified user returned
        ↓
Sentry user.id attached
        ↓
remaining request execution
```

Failed authentication must not attach a user identity.

Do not decode an unverified JWT merely to populate Sentry user context.

---

## Environment Configuration

Document the following variables in:

- `.env.example`
- Backend README

Variables:

```dotenv
SENTRY_DSN=
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

### Staging

Use:

```dotenv
SENTRY_TRACES_SAMPLE_RATE=1.0
SENTRY_PROFILES_SAMPLE_RATE=1.0
```

Purpose:

- Capture all staging traces.
- Profile all sampled staging transactions.
- Make observability behavior easy to validate before production.

### Production

Use:

```dotenv
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

This should result in:

- Approximately 10% of production requests being traced.
- Approximately 1% of production requests being profiled.

Set:

```dotenv
SENTRY_RELEASE=<deployed-commit-sha>
```

The release value should correspond to the exact backend deployment revision.

---

## Test Plan

### Configuration Tests

Verify:

- Development never initializes Sentry, even if a DSN exists.
- Test environment never initializes Sentry, even if a DSN exists.
- Staging initializes Sentry when a DSN exists.
- Production initializes Sentry when a DSN exists.
- Missing staging/production DSN emits a warning.
- Missing staging/production DSN does not block application creation.
- Trace sample values below `0` fail validation.
- Trace sample values above `1` fail validation.
- Profile sample values below `0` fail validation.
- Profile sample values above `1` fail validation.

---

### Initialization Tests

Verify initialization uses:

```text
environment
release
traces_sample_rate
profiles_sample_rate
send_default_pii=False
include_local_variables=False
max_request_body_size="never"
```

Verify logging integration uses:

```text
level=WARNING
event_level=ERROR
sentry_logs_level=WARNING
capture_sentry_logs=True
```

Keep error-event sampling at the SDK default.

---

### Authentication Tests

Verify successful authentication attaches exactly:

```python
{
    "id": "<supabase-user-uuid>"
}
```

Verify:

- The UUID is converted to a string.
- Email is not attached.
- IP address is not attached.
- Bearer token is not attached.
- Profile data is not attached.
- Failed authentication attaches no Sentry user identity.

---

### Logging Tests

Verify:

```text
INFO
→ not sent to Sentry Logs

WARNING
→ sent to Sentry Logs

ERROR
→ sent to Sentry Logs
→ creates a Sentry error event
```

Review representative warning/error log statements and ensure they do not emit:

- Recipe contents.
- Imported text.
- JWTs.
- Authorization headers.
- Raw request bodies.
- Household invite codes.
- Other sensitive user content.

---

### Regression Tests

Preserve:

- Existing route contracts.
- Existing authentication behavior.
- Existing exception behavior.
- Existing logging behavior outside Sentry forwarding.

Run the complete backend test suite after implementation.

No application behavior should depend on Sentry being available.

---

## Staging Verification

Perform one temporary staging smoke test after deployment.

Do not add a permanent test endpoint.

### Error Event

Trigger one controlled exception and verify the event contains:

```text
environment = staging
release = deployed commit SHA
```

For an authenticated request, verify:

```text
user.id = Supabase UUID
```

Verify absence of:

```text
request body
Authorization header
access token
refresh token
email
IP address
stack-frame local variables
raw recipe/import content
```

---

### Logs

Emit or exercise an existing warning.

Verify it appears under Sentry Logs.

Exercise an existing error log or controlled error path.

Verify:

- The log appears under Sentry Logs.
- The error also creates an issue/event.

---

### Tracing

Exercise representative backend routes and confirm requests generate transactions/traces containing:

- Route information.
- Duration.
- HTTP status.
- Failure state where applicable.

---

### Profiling

Confirm sampled staging transactions produce profiles.

Because staging uses:

```text
traces_sample_rate = 1.0
profiles_sample_rate = 1.0
```

representative requests should be easy to inspect.

---

### Performance Telemetry

Confirm Sentry exposes request-level performance information derived from traces, including:

- Latency.
- Throughput where available.
- Failure/error information.
- Transaction performance.

Do not add manual metric calls for this verification.

---

## Explicit Non-Goals

This revision does not add:

- Recipe-import success/failure counters.
- Notification metrics.
- CRUD metrics.
- Household metrics.
- Business KPIs.
- Custom dashboards.
- Custom alerts beyond basic Sentry usage.
- Manual performance spans.
- Manual Sentry breadcrumbs.
- `capture_exception()` calls in handlers.
- Sentry-specific route decorators.
- Custom middleware.
- Observability abstractions.
- A permanent `/sentry-test` route.

These may be added later only when observed production needs justify them.

---

## Assumptions

- Staging and production share one backend Sentry project.
- Environments are separated using the Sentry `environment` field.
- `SENTRY_RELEASE` is set to the deployed backend commit SHA.
- The Sentry account/project has tracing, profiling, Logs, and relevant performance features enabled.
- Quotas are sufficient for the configured sampling rates.
- Sentry's default server-side data scrubbing remains enabled.
- Authenticated Supabase UUIDs are acceptable as pseudonymous operational identifiers.
- Noomori application logs follow the privacy rules defined above.
- Custom domain instrumentation will be introduced only after real production evidence shows a need.

---

## Acceptance Criteria

The revision is complete when:

1. Sentry initializes only in staging and production when configured.
2. Missing DSN never prevents backend startup.
3. Automatically reported errors are retained at the SDK's full error-event sample rate.
4. Production tracing is sampled at 10%.
5. Production profiling covers approximately 1% of all requests.
6. Warning-or-higher logs appear in Sentry Logs.
7. Error-or-higher logs also create Sentry issues/events.
8. Authenticated events contain only the verified Supabase UUID as user identity.
9. Request bodies and stack-frame locals are absent from Sentry events.
10. Sensitive authentication and recipe/import content are not emitted through application logs.
11. FastAPI tracing and profiling work without custom middleware or per-handler instrumentation.
12. Existing backend behavior and the complete backend test suite remain green.
