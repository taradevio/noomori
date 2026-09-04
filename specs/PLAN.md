# Household Join Codes Using Existing Tables

## Summary

Reuse the existing `household_members` and `household_join_codes` tables.

```text
Owner generates code
→ server stores only its HMAC digest
→ owner copies/shares plaintext once
→ invitee previews household
→ atomic RPC inserts Member and deletes code
```

No invite-history table, lifecycle columns, cleanup job, approval queue, or multi-code management. Revocation and consumption simply delete the single household code row.

## Database Migration and RPCs

Add `supabase/migrations/202608270001_secure_household_join_codes.sql`:

- Delete every existing plaintext `household_join_codes` row. Owners must generate new codes.
- Rename `code` to `code_digest`.
- Make `expires_at` required.
- Add a check requiring a 64-character lowercase hexadecimal SHA-256 digest.
- Keep:
  - `household_id` as primary key, enforcing one code per household.
  - digest uniqueness, preventing two households from having the same live credential.
  - existing profile and household foreign keys.
- Add a preflight duplicate-membership check, then create a unique index on `household_members(user_id)` to enforce one household per account.
- Remove existing join-code RLS policies, enable RLS, and revoke direct table access from `anon` and `authenticated`.
- Add `household_join_rate_limits`, keyed by `profiles.id`, with failure count, window start, and lock expiry. No direct client access.
- Add one private rate-limit helper shared by Preview and Join:
  - create the per-user row with `INSERT ... ON CONFLICT DO NOTHING`;
  - lock it with `SELECT ... FOR UPDATE` before checking or updating it, so concurrent requests cannot bypass the threshold;
  - 10 failed credentials within 10 minutes;
  - lock for 10 minutes;
  - successful credential validation clears failures;
  - expected invalid/expired and rate-limited failures return statuses rather than raising database exceptions, so limiter writes are committed.

Add authenticated public RPCs:

- `get_household_settings()`
  - Returns household ID/name, caller role, member count, and active-code expiry.
  - Returns invite metadata only when the caller is Owner.
- `replace_household_join_code(p_code_digest)`
  - Verifies `auth.uid()` is Owner.
  - Upserts the household’s single code and sets `created_at = now()` and `expires_at = now() + interval '10 minutes'`.
  - A digest collision rolls back the statement, preserving the previous code.
- `revoke_household_join_code()`
  - Verifies Owner and deletes the household’s code row.
- `preview_household_join_code(p_code_digest)`
  - Requires authentication.
  - Checks the caller’s membership before the limiter or code lookup; existing membership returns `ALREADY_MEMBER`.
  - Acquires the shared concurrency-safe rate-limit row before code lookup.
  - Validates digest and database expiry.
  - Returns only household name, Owner display name, and member count.
  - Does not delete the code or create membership.
- `join_household_with_code(p_code_digest)`
  - Locks the caller’s `profiles` row first to serialize concurrent Join attempts for that account.
  - Checks `household_members` before limiter/code lookup.
  - If membership exists, returns `ALREADY_MEMBER` with canonical household/membership data without claiming that the submitted code matched.
  - Otherwise acquires the shared rate-limit row, then locks and revalidates the matching unexpired code row.
  - Inserts `household_members.role = 'member'`.
  - Updates the existing profile onboarding timestamp.
  - Deletes the code row in the same transaction.
  - Clears limiter failures and returns `JOINED`.

The unique index on `household_members(user_id)` remains the final one-household race-condition backstop. A committed Join followed by a lost HTTP response is recovered by the membership-first `ALREADY_MEMBER` result because the consumed code row no longer exists.

Every public RPC uses `security definer set search_path = ''`, schema-qualified relations, `auth.uid()`, execution revocation from `public`/`anon`, and an explicit grant to `authenticated`.

## Backend APIs

Add `HOUSEHOLD_JOIN_CODE_HMAC_KEY` as a required server-only setting containing at least 32 cryptographically random bytes.

Use only Python standard-library security primitives:

```text
secrets.randbelow(1_000_000)
→ zero-pad to six digits
→ HMAC-SHA256(secret, "noomori:household-join-code:v1:" + canonical code)
→ pass digest to RPC
```

Retry generation up to five times when digest uniqueness reports a collision. Never log plaintext, digest, or secret.

HMAC-key rotation deliberately invalidates every outstanding code. The production runbook is:

```text
temporarily stop Generate, Preview, Join, and Revoke
→ delete every household_join_codes row
→ replace the key on every FastAPI instance
→ restart/deploy all instances with the same key
→ re-enable invite operations
```

Never run old-key and new-key instances simultaneously. On suspected compromise, immediately delete all code rows, rotate and remove the old secret, and restart every instance. Key versions, dual-key verification, grace periods, and zero-downtime preservation of outstanding codes are deferred.

Extend the existing singular Household API:

- `GET /household`
  - Returns household settings and role-aware active-code metadata.
- `POST /household/invite`
  - No request body.
  - Returns `{ "code": "483921", "expires_at": "…" }`.
- `DELETE /household/invite`
  - Returns `204`.
- `POST /household/join/preview`
  - Request: `{ "code": "483921" }`.
  - Returns safe household preview.
- `POST /household/join`
  - Request: `{ "code": "483921" }`.
  - Returns household and Member membership with status `JOINED` or membership-first recovery status `ALREADY_MEMBER`.

HTTP mapping:

- `400`: invalid, expired, revoked, or consumed code.
- `403`: caller is not Owner.
- `409`: invariant conflict that cannot be recovered as the caller’s canonical existing membership.
- `422`: input cannot normalize to six digits.
- `429`: throttled, with `Retry-After`.
- `503`: five generation collisions.

## Client Changes

- Make Account’s Household row navigate to one protected Household Settings screen.
- All members see household name, member count, and textual role.
- Only Owners see `Invite member`; Members do not see disabled owner controls.
- Owner states:
  - No active code: `Generate join code`.
  - Newly generated: formatted code, expiry, single-use explanation, Copy, Share, Generate new, and Revoke.
  - Existing active code after reopening Settings: show expiry but not plaintext; offer Generate new or Revoke.
- Generating a replacement or revoking uses native `Alert.alert` confirmation.
- Use Expo 56 `expo-clipboard` for Copy and React Native `Share.share` for native text sharing.
- Keep plaintext code only in local screen state. Do not put it in TanStack Query, storage, logs, or route parameters.
- Show accessible inline `Code copied` feedback; do not add a toast/snackbar system.
- Replace the Join screen fixture:
  - Continue calls Preview.
  - Preview remains same-screen.
  - Join calls the atomic endpoint.
  - Pending operations disable duplicate submission.
  - Generic credential copy remains: `This invite code is invalid or has expired. Ask the household owner for a new code.`
  - Success invalidates `["household"]` and `["profile"]`, then calls `refreshUserState()`.
  - `ALREADY_MEMBER` also invalidates canonical household/profile state and calls `refreshUserState()`; it does not claim that the submitted code matched the deleted credential.

Update `specs.md` to document deletion-based revocation/consumption, one-row-per-household storage, plaintext invalidation, role-aware Settings, and the non-recoverable code display.

## Test Plan

- Migration:
  - Existing plaintext codes are removed.
  - Migration fails clearly if a user currently has multiple memberships.
  - Duplicate `user_id` membership is rejected afterward.
- RPC:
  - Owner can generate/revoke; Member and anonymous callers cannot.
  - Replacing a code leaves one row and invalidates the old digest.
  - Collision preserves the previous code.
  - Expired code cannot preview or join.
  - Preview does not delete the row.
  - Successful Join inserts exactly one Member and deletes the row atomically.
  - Concurrent Join admits only one user.
  - Failed membership insertion preserves the code.
  - Household deletion removes its code.
  - Parallel failed Preview/Join calls are serialized against the same limiter row and cannot bypass the threshold.
  - The eleventh failed attempt is rate-limited.
  - Ten failures use a 10-minute window and create a 10-minute lock.
  - Expected invalid/expired results commit their limiter increments.
  - Join checks membership before code lookup and recovers after a committed/lost response.
  - Concurrent Join attempts by one account are serialized by the profile lock.
- Backend `unittest`:
  - Leading zeroes, input normalization, HMAC determinism, five-retry collision limit, HTTP status mapping, and credential-free logging.
- Client:
  - Owner/member visibility, Copy/Share, regenerate/revoke confirmations, plaintext disappearance after unmount, input/preview/back behavior, loading states, screen-reader announcements, Dynamic Type, and 48dp targets.
- Run migration checks against a Supabase branch/staging database, backend tests, `bun x tsc --noEmit`, Prettier, and available lint checks.

## Assumptions and Deferred Work

- Existing code rows may be invalidated.
- One user may belong to only one household.
- Codes remain six-digit, single-use, and valid for 10 minutes using database time.
- Deleting a code is sufficient; invite audit history is not required.
- HMAC rotation invalidates all outstanding codes; mixed-key rollout is not supported.
- Deferred: HMAC key versions/dual-key grace periods, invite history, recipient targeting, multi-use codes, multi-household switching, approval queues, deep links, QR codes, email/SMS delivery, realtime refresh, analytics, and background cleanup.
