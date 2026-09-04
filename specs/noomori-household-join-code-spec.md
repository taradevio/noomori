# Noomori — Household Join Code MVP Specification

**Status:** MVP source of truth  
**Feature:** Household invite / join code  
**Product:** Noomori  
**Client:** React Native + Expo Router + TypeScript + TanStack Query  
**Backend:** FastAPI + Python 3.12 + Pydantic v2  
**Auth / DB:** Supabase Auth + Postgres + RLS  
**Invite UX:** 6-digit numeric code  
**Invite semantics:** temporary, single-use, Owner-generated  
**Join result:** Member  
**Invite link:** deferred

---

# 1. Purpose

Noomori Household Join Code allows an existing Household Owner to invite one authenticated user into the Owner's household with a short temporary code.

Required flow:

```text
Owner generates code
        ↓
Owner copies / shares code
        ↓
Invitee enters code
        ↓
Noomori validates invite
        ↓
Household Preview
        ↓
Invitee explicitly confirms
        ↓
Membership is created atomically
        ↓
Invite is consumed
        ↓
Invitee becomes Member
```

A valid code must **never automatically mutate household membership** when the user merely enters or validates it.

---

# 2. MVP Product Decision

Freeze MVP as:

```text
6-digit numeric invite code
single use
10-minute expiry
Owner-generated
preview before join
explicit join confirmation
one active code per household
role after join = Member
```

Example display:

```text
483 921
```

Canonical normalized value:

```text
483921
```

The UI may format the code for readability; backend validation uses the normalized value.

---

# 3. Why Code Instead of Invite Link for MVP

Invite links reduce recipient friction, but a production-quality link introduces platform/linking work that is not necessary to prove household sharing:

```text
Android App Links
iOS Universal Links
domain verification
assetlinks.json
apple-app-site-association
incoming-link routing
logged-out handling
app-not-installed handling
invite persistence across install/authentication
```

Noomori already uses Expo Router, so invite links can be added later without changing household membership rules.

For MVP, code has favorable complexity/value:

```text
code
→ small implementation surface
→ survives app install because it remains in chat/message
→ easy to paste/type/communicate verbally
→ no deferred-deep-link requirement
```

Owner friction stays low because the app can share the code through the native OS share sheet.

---

# 4. Research Basis and Sources

## 4.1 Life360 — Invite Code + Native Sharing

Life360 uses a Circle invitation code and lets the inviter choose a messaging app from the phone. Their documented invite codes expire after 72 hours.

Source:

https://support.life360.com/hc/en-us/articles/23053409850647-Add-a-New-Member-to-My-Circle

Product lesson:

- short temporary codes are established UX for small trusted groups;
- OS sharing removes much of the inviter-side friction;
- expiration is normal for group invitation credentials.

Noomori deliberately uses 10 minutes because household invites are expected to be shared directly while both people are present or actively messaging. An Owner can immediately replace an expired code.

## 4.2 Google Classroom — Human-Enterable Code

Google Classroom supports joining a class after authentication with a 6–8 character class code.

Source:

https://support.google.com/edu/classroom/answer/15605102

Product lesson:

- short manual codes remain practical in mature products;
- code entry is a one-time setup action;
- joining should happen under the correct authenticated account.

Noomori uses six numeric digits for easier mobile entry and verbal sharing.

## 4.3 Honeydew — Recipe Household Invitation

Honeydew is directly relevant to Noomori's domain and supports household invitations through a link or code.

Source:

https://honeydewcook.com/support/en/using-the-app/household-sharing

Product lesson:

```text
household
→ owner
→ members
→ invitation credential
```

is an established model for shared recipe products.

Noomori intentionally starts with code only.

## 4.4 OWASP — Anti-Automation / Throttling

Six numeric digits have only one million possible values, so short-lived code security must include throttling and other controls.

Sources:

https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_and_Anti-Automation_Cheat_Sheet.html

Security lesson:

```text
short code
+
authentication
+
expiration
+
single-use
+
rate limiting
```

is the complete security model.

## 4.5 Expo — Why Invite Links Are Deferred

Expo documents that Android App Links and iOS Universal Links require domain/app association.

Sources:

https://docs.expo.dev/linking/overview/
https://docs.expo.dev/linking/android-app-links/
https://docs.expo.dev/linking/ios-universal-links/

Engineering lesson:

Invite links can later become another way to resolve the same invite domain object without changing the membership transaction.

## 4.6 Python `secrets` — Secure Generation

Python recommends `secrets`, rather than the normal pseudo-random generator, for security-sensitive random values.

Source:

https://docs.python.org/3.12/library/secrets.html

Do not generate invite credentials with `random.randint()`.

---

# 5. Current Noomori Product Rules Remain Authoritative

This feature must preserve the current household model:

```text
Household
├── Owner
└── Members
```

MVP rules:

- one active household membership per account;
- creator becomes Owner through the existing Create Household flow;
- only Owner manages invitations;
- Members do not generate/revoke invite codes;
- joining always creates `role = member`;
- household switching is not introduced;
- transfer ownership is not introduced;
- user with an existing household cannot join another one;
- household administration remains separate from normal recipe collaboration.

---

# 6. Current Codebase Conventions Are Authoritative

Before implementation, inspect the actual current Noomori codebase and reuse the existing equivalents of the following.

## Client

- Expo Router route organization;
- existing onboarding `join_household` flow;
- Account / Household settings structure;
- form/input primitives;
- dialog/sheet primitives;
- button primitives;
- `apiConfig`;
- authenticated API request helper;
- TanStack Query mutation conventions;
- household/profile query keys;
- auth/session context;
- error UI;
- success/navigation behavior.

## Backend

- FastAPI household router organization;
- current Household/Create Household endpoint/service pattern;
- current auth dependency;
- Supabase request/client construction;
- Pydantic schema organization;
- HTTP/error normalization;
- settings/environment conventions;
- migration conventions;
- current transaction/RPC pattern, if any;
- existing rate-limit middleware/infrastructure, if any.

Names shown in this specification are conceptual.

**Do not rename current functions, types, schemas, routes, files, or query keys merely to match examples in this document.**

---

# 7. Implementation Principle

Prefer:

```text
inspect
→ reuse
→ minimally extend
```

over:

```text
parallel household architecture
→ duplicate API/auth
→ unrelated refactor
```

If the codebase already has the equivalent of:

```text
createHousehold()
getCurrentHousehold()
authenticatedRequest()
household mutations
```

reuse their conventions.

---

# 8. Owner Entry Point

Recommended journey:

```text
Account
→ Household
→ Invite member
```

Only Owner sees `Invite member`.

For normal Members:

```text
Invite member
```

must be hidden rather than shown disabled.

Backend authorization remains authoritative regardless of UI visibility.

---

# 9. Generate Invite UX

Suggested UI:

```text
Invite member

Share this code with one person.

        483 921

Valid for 10 minutes.
This code can be used once.

[ Copy code ]   [ Share ]
```

If an active invite already exists and plaintext is no longer available, the Owner can generate a replacement.

Optional actions following current settings conventions:

```text
Generate new code
Revoke code
```

---

# 10. One Active Invite Per Household

MVP supports at most one active invite per household at a time.

Reason:

- no pending-invites management UI;
- no recipient labels;
- no invite list;
- clear regenerate/revoke semantics;
- adequate for small, low-frequency household invitation.

Generating another invite:

```text
active invite exists
        ↓
replace old code row
        ↓
create new invite
```

Old code becomes invalid immediately.

---

# 11. Single-Use Semantics

The invite represents:

> one admission into the household

It is not a household password.

After successful join, delete the matching `household_join_codes` row in the same transaction that creates membership. The same code can then never admit another user.

Another member requires another generated code.

---

# 12. Expiration

MVP lifetime:

```text
10 minutes
```

Use database time:

```text
expires_at = now() + interval '10 minutes'
```

After expiry:

```text
preview ❌
join ❌
```

Viewing/copying the invite does not extend expiration.

Backend/database time is authoritative, not device time.

---

# 13. Revocation

Owner can revoke an active invite by deleting its `household_join_codes` row.

After revoke:

```text
preview ❌
join ❌
```

No revoke-history table, tombstone, or background cleanup job is required for MVP.

---

# 14. Invite Lifecycle

An invite is active only when its row exists and:

```text
expires_at > now()
```

Conceptual states:

```text
ACTIVE
CONSUMED
REVOKED
EXPIRED
```

A dedicated DB enum/status column is not required. `CONSUMED` and `REVOKED` both mean that the row no longer exists; `EXPIRED` may remain until it is replaced or revoked and is treated as inactive.

---

# 15. Persistence Model

Reuse the existing one-row-per-household table:

```text
household_join_codes
household_id
created_by
code_digest
created_at
expires_at
```

Migrate the existing plaintext `code` column to `code_digest`, invalidate existing plaintext rows during that migration, and make `expires_at` required.

Relationship:

```text
household_join_codes.household_id
→ households.id
→ ON DELETE CASCADE
```

`created_by` must reuse the current profile/auth foreign-key convention. The existing primary key on `household_id` enforces one code row per household.

---

# 16. Plaintext Code Must Not Be Canonical DB Data

Treat the plaintext code as a temporary credential.

Recommended flow:

```text
generate plaintext code
        ↓
calculate server-side keyed digest
        ↓
store digest
        ↓
return plaintext once to Owner
```

Digest input:

```text
HMAC-SHA256(server_secret, "noomori:household-join-code:v1:483921")
```

Use standard Python security primitives/current codebase helpers.

Do not invent cryptography.

---

# 17. Why Keyed Digest Instead of Plain SHA-256

A six-digit namespace can be enumerated cheaply if an attacker obtains an ordinary unsalted hash table.

Therefore a server-side secret/pepper should participate in lookup.

This is not password storage and does not require introducing a password subsystem.

Keep the secret in the existing backend settings/environment mechanism.

Conceptual setting only:

```text
HOUSEHOLD_JOIN_CODE_HMAC_KEY
```

Use the project's actual naming convention.

Never expose it via `EXPO_PUBLIC_*`.

## 17.1 HMAC Key Rotation and Invalidation

Use one server-only key with at least 32 cryptographically random bytes. Do not store it in Postgres, Expo configuration, client state, logs, or API responses.

The MVP does not store a key version and does not perform dual-key verification. Therefore every key rotation intentionally invalidates all outstanding join codes.

Production rotation runbook:

```text
1. temporarily stop Generate, Preview, Join, and Revoke operations
2. delete every household_join_codes row
3. replace the HMAC key on every FastAPI instance
4. restart/deploy all instances with the same new key
5. re-enable invite operations
6. Owners generate new codes as needed
```

Do not run old-key and new-key API instances simultaneously. On suspected compromise, immediately delete all join-code rows, rotate the key, remove the old deployment secret, and restart every instance.

Preserving outstanding codes through a zero-downtime rotation would require a persisted `key_version` and temporary dual-key verification. That is explicitly deferred.

---

# 18. Secure Generation

Use cryptographically secure randomness.

Conceptually:

```python
value = secrets.randbelow(1_000_000)
code = f"{value:06d}"
```

Leading zeroes are valid:

```text
000042
483921
901004
```

Do not use predictable sequence generation.

---

# 19. Collision Handling

The namespace has only one million values.

Generation must handle a collision with another currently usable invite digest.

Conceptually:

```text
generate
→ digest
→ insert
→ collision?
   → regenerate
```

Use bounded retries.

Do not fall back to sequential values.

---

# 20. Input Formatting

Display:

```text
483 921
```

Accept:

```text
483921
483 921
483-921
```

Normalize to:

```text
483921
```

Reject anything that does not normalize to exactly six digits.

---

# 21. Join Entry Point

For an authenticated user without household membership:

```text
Onboarding / Household setup
→ Join household
```

Suggested screen:

```text
← Join household

Enter the 6-digit code shared by
 the household owner.

┌────────────────────────────┐
│          483 921           │
└────────────────────────────┘

[ Continue ]
```

Requirements:

- numeric keyboard;
- paste support;
- formatting allowed;
- no auto-submit after sixth digit;
- `Continue` explicitly starts validation;
- mutation pending disables duplicate submission.

---

# 22. Join Eligibility

Only a user with no active household can use normal Join flow.

If a current household already exists:

```text
Join household
```

should not appear in normal UI.

Backend must enforce this independently.

This feature must not add household switching.

---

# 23. Preview Is Read-Only

Code validation must be a separate non-mutating step.

```text
code
 ↓
validate invite
 ↓
resolve household
 ↓
return safe preview
```

No membership insertion.

No invite consumption.

No onboarding completion mutation.

Preview first checks the caller's existing membership. If one exists, return `ALREADY_MEMBER` without checking the limiter or looking up the submitted code. Otherwise Preview acquires the shared concurrency-safe limiter row before code lookup.

---

# 24. Preview API Boundary

Use current FastAPI household route conventions.

Conceptual only:

```http
POST /households/join/preview
```

Request:

```json
{
  "code": "483921"
}
```

Exact route/model naming must follow current code.

Do not create a second household router architecture.

---

# 25. Preview Response

Recommended minimal data:

```json
{
  "household_name": "Rumah Nanda",
  "owner_display_name": "Nanda",
  "member_count": 3
}
```

The client does not need the authoritative household ID merely to join later.

The final Join request should submit the credential again and the backend should resolve the household again.

---

# 26. Preview Privacy

Before membership, expose only enough information to verify the intended household:

```text
household name
Owner display name
member count
```

Do not expose by default:

- emails;
- complete profile records;
- recipe titles;
- household recipes;
- full member list;
- other private household content.

Reason:

A valid code proves invitation possession, not completed membership.

---

# 27. Preview UI

Recommended:

```text
Join "Rumah Nanda"?

Owner
Nanda

3 members

You'll join this household as a Member.

[ Cancel ]   [ Join household ]
```

Use a dedicated screen, sheet, or dialog according to the existing UI/navigation convention.

Do not create a new modal system solely for this feature.

---

# 28. Preview Must Not Consume Invite

Required behavior:

```text
valid code
→ Preview
→ Back / Cancel
```

Result:

```text
membership unchanged
invite still active
```

Consume only when the final membership transaction commits.

---

# 29. Final Join API

Use existing route conventions.

Conceptually:

```http
POST /households/join
```

Request:

```json
{
  "code": "483921"
}
```

Do not trust a client-supplied household ID from preview.

The invite credential is resolved again server-side.

---

# 30. Join Must Revalidate Everything

Preview state may be stale.

Final Join must re-check:

```text
authenticated?
current membership already exists?
code exists?
code active?
not expired?
household exists?
user still has no membership?
```

Never assume Preview guarantees Join success.

---

# 31. Atomic Join Requirement

The following must be one atomic operation:

```text
validate invite
+
validate membership eligibility
+
insert household member
+
delete consumed code
+
apply existing onboarding/profile completion update if required
```

Either all succeed or none succeed.

Do not allow:

```text
member inserted
code row still reusable
```

or:

```text
code row deleted
member insert failed
```

---

# 32. Transaction Alignment With Current Codebase

First inspect the current household multi-write persistence pattern.

Preferred:

```text
existing transaction convention
→ reuse it
```

If the current Supabase Python path does not provide a safe multi-statement transaction boundary, a **small Postgres function/RPC dedicated to atomic household join** is acceptable.

That is a persistence detail, not a new application architecture.

Do not introduce solely for Join Code:

- another ORM;
- another Postgres driver stack;
- another backend service.

---

# 33. Conceptual Join Transaction

Inside one transaction:

```text
1. authenticate with auth.uid()
2. lock the caller's profiles row with SELECT ... FOR UPDATE
3. look up household_members by user_id
4. if membership exists, return ALREADY_MEMBER without looking up the code
5. acquire/check the caller's concurrency-safe rate-limit row
6. locate the unexpired code by code_digest and lock it
7. insert household_members with role = member
8. apply existing onboarding/profile completion update if required
9. delete the consumed household_join_codes row
10. reset the caller's join-code failure counter
11. commit and return JOINED
```

The profile-row lock serializes concurrent Join attempts by the same account. The unique constraint/index on `household_members(user_id)` remains the invariant and final race-condition backstop.

Existing DB constraints remain additional protection.

---

# 34. Concurrency

Single-use semantics must survive race conditions.

Example:

```text
User A submits code ───┐
                       ├─ only one may succeed
User B submits code ───┘
```

Use row locking / conditional transactional update / equivalent DB guarantee.

Do not rely on an application-only check such as:

```python
if code_row_exists:
```

without a transactional guarantee.

---

# 35. Existing One-Household Constraint

If current `household_members` schema already has a unique constraint/index enforcing one household per user:

```text
reuse it
```

Do not remove or weaken it.

Application eligibility provides friendly errors; the DB constraint protects invariants/races.

---

# 36. Role Assignment

Join Code always creates:

```text
role = member
```

Never let client input or invite metadata assign:

```text
owner
admin
editor
viewer
```

Owner semantics remain owned by Create Household / future ownership transfer.

---

# 37. Idempotent Retry

Handle this edge case:

```text
join commits
→ response lost
→ client retries
```

Preferred behavior:

Check membership before code lookup. If the current user already has membership, return:

```text
ALREADY_MEMBER
household_id
role
```

and recover the current membership rather than showing a confusing invalid-code failure. This works after a committed Join because successful consumption deletes the code row.

Do not claim that the retried credential matched the consumed code: MVP deliberately stores no redemption history. The client should refresh canonical household/profile state and continue to the existing household.

Follow current API idempotency convention if one already exists.

---

# 38. Credential Failure Copy

Internally the backend may distinguish:

```text
NOT_FOUND
EXPIRED
REVOKED
CONSUMED
```

User-facing copy should generally combine them:

```text
This invite code is invalid or has expired.
Ask the household owner for a new code.
```

This reduces credential enumeration detail.

---

# 39. Already in Household

If current user already has membership:

```text
You're already part of a household.
```

Do not offer switching from this error.

Do not consume the invite.

---

# 40. Authentication

All of these operations require the current authenticated user:

- Generate;
- Regenerate;
- Revoke;
- Preview;
- Join.

Use the exact current FastAPI authentication dependency.

Do not add:

- another JWT parser;
- another Supabase authentication path;
- client-only authorization.

---

# 41. Owner Authorization

Generate/Regenerate/Revoke must verify server-side:

```text
current user
→ membership in target household
→ role == owner
```

UI capability hiding is not security.

---

# 42. Invite Table Access

Do not give normal authenticated clients broad SELECT access to all invite rows.

Preferred boundary:

```text
Owner actions
→ controlled authenticated backend operation

Invitee resolution
→ controlled authenticated backend operation
```

Do not add a permissive RLS policy merely so the app can query code values directly.

---

# 43. Rate Limiting Is Required

Six digits provide:

```text
1,000,000 possible values
```

Therefore Preview/Join attempts need anti-automation controls.

Use one shared, database-backed limiter row per authenticated user. Preview and Join must consume the same failure budget.

Preview and Join should not provide separate unlimited guessing surfaces.

---

# 44. Rate-Limit Infrastructure Alignment

Before adding a dependency, inspect current deployment/backend infrastructure.

Do not introduce Redis, a token-bucket framework, an IP intelligence service, or a new dependency solely for Join Code.

Use the smallest database table:

```text
household_join_rate_limits
├── user_id uuid primary key
├── window_started_at timestamptz
├── failed_attempts integer
└── locked_until timestamptz nullable
```

Inside Preview and Join, create the row with `INSERT ... ON CONFLICT DO NOTHING`, then read it with `SELECT ... FOR UPDATE`. The row lock makes parallel requests for one account update the counter sequentially instead of bypassing the threshold.

Check an active lock before code lookup. Increment only after an invalid-or-expired lookup. Reset after a valid code. Return expected statuses such as `INVALID_OR_EXPIRED` and `RATE_LIMITED` as function results so the counter update commits; raising a database exception for an expected credential failure would roll it back.

---

# 45. MVP Attempt Policy

MVP policy:

```text
10 failed code attempts
within 10 minutes
per authenticated user
→ lock for 10 minutes
```

Do not add a separate IP limiter until observed multi-account abuse justifies it.

On limit:

```text
HTTP 429
```

User copy:

```text
Too many attempts.
Please try again later.
```

Do not expose exact limiter internals or remaining attempt count.

---

# 46. Generate Double-Submission

Client:

```text
generate mutation pending
→ disable Generate
```

Backend must still be safe against duplicate/concurrent generation.

Generating another code invalidates the previous active invite.

---

# 47. Native Share

MVP Share sends plain text and the code through the platform share sheet.

Example:

```text
Join my household "Rumah Nanda" on Noomori.

Invite code: 483 921

This code can be used once and expires in 10 minutes.
```

Use the existing React Native/Expo-compatible share mechanism.

Do not install a large sharing SDK solely for this.

---

# 48. Share Is Not a Deep Link

MVP does not require:

```text
noomori://join/...
https://noomori.app/join/...
```

Share transports a code.

Future links are deferred.

---

# 49. Copy Code

`Copy code` uses the app's current clipboard dependency/convention if already installed.

No clipboard monitoring/polling.

Copy may use:

```text
483921
```

or:

```text
483 921
```

because Join normalization accepts both.

---

# 50. Generated Plaintext Visibility

Because only a digest is persisted, plaintext should be reveal-on-generation data.

Recommended:

```text
Generate
→ show code
→ Copy / Share
```

If the Owner leaves and later cannot see the original plaintext:

```text
Generate new code
→ previous code row replaced
```

Do not add reversible encrypted credential storage solely to redisplay the old code.

---

# 51. Regenerate Confirmation

If there is an active invite:

```text
Generate a new code?

The current code will stop working.

[ Cancel ] [ Generate ]
```

Reuse the existing confirmation component.

---

# 52. Revoke Confirmation

Recommended:

```text
Revoke invite code?

Anyone who has this code will no longer be able to join.

[ Cancel ] [ Revoke ]
```

Follow existing destructive/confirmation styling.

---

# 53. Client State — Owner

Use TanStack Query mutation state.

Do not add redundant loading booleans if the mutation already exposes pending state.

Generated plaintext may live in screen-local state.

Do not persist raw invite code into global application state or AsyncStorage merely for convenience.

---

# 54. Client State — Join

Minimum conceptual state:

```text
code input
+
preview mutation state/result
+
join mutation state
```

Do not create a generic invite state machine framework.

---

# 55. Preview as Mutation

Although Preview is logically read-only, TanStack Mutation is a good fit because:

- it runs only after explicit `Continue`;
- secret code should not become a long-lived query key;
- preview data is ephemeral;
- it does not represent durable cached server state.

If current code uses a different equivalent validation pattern, follow it.

Do not create:

```text
["invite", code]
```

as a persistent query cache.

---

# 56. Navigation

Use current Expo Router file-based routing.

Required logical flow:

```text
Join Household input
→ Household Preview
→ Join success
→ existing authenticated/main destination
```

Preview may be:

- a route;
- sheet;
- dialog/state in the Join screen;

based on current Noomori conventions.

Do not introduce another navigation system.

---

# 57. Join Success

After successful join:

1. invalidate/refetch existing profile/household membership queries;
2. reuse existing onboarding completion behavior;
3. allow current auth/router guard logic to resolve membership;
4. navigate using current Expo Router convention;
5. do not mirror membership into a second global store.

---

# 58. Onboarding Completion

If current Create Household / Join flow uses:

```text
profiles.onboarding_completed_at
```

or an equivalent field, Join Code must reuse it.

Do not introduce another boolean such as:

```text
hasJoinedHousehold
```

unless that field already exists and is authoritative.

---

# 59. Query Invalidation

Reuse current keys/mutation patterns.

Likely affected conceptual data:

```text
profile
current household
household members
home/recipe household context
```

Exact query keys must be discovered from current code.

Do not add invite-specific canonical household caches.

---

# 60. Membership Is the Source of Access

After join:

```text
household_members
```

is authoritative.

Join-code rows do not grant access and are deleted on successful consumption. Do not infer membership from join-code metadata.

---

# 61. RLS

Existing household/member/recipe RLS remains authoritative after join.

Join Code should simply create the normal `household_members` membership row.

Everything afterward behaves exactly like any other Member.

Do not change recipe authorization solely because admission happened through an invite code.

---

# 62. Activity / Audit

If existing activity/event infrastructure already exists, successful join may emit:

```text
<Display Name> joined the household
```

Do not introduce an Activity subsystem solely for this feature.

Membership success should not be lost because a secondary activity write fails unless current architecture deliberately makes the event transactional.

---

# 63. Logging

Useful internal events:

```text
invite_generated
invite_revoked
invite_preview_success
invite_preview_failure_reason
invite_join_success
invite_join_failure_reason
invite_rate_limited
```

Never log:

```text
raw invite code
code digest
invite secret
```

---

# 64. Analytics

Only if analytics infrastructure already exists:

```text
household_invite_generated
household_invite_shared
household_join_previewed
household_join_confirmed
household_join_failed
```

Do not send the raw code.

Do not introduce a new analytics stack solely for Join Code.

---

# 65. Conceptual Error Categories

Adapt names to current error conventions:

```text
INVALID_INVITE
INVITE_EXPIRED
INVITE_REVOKED
INVITE_CONSUMED
ALREADY_IN_HOUSEHOLD
NOT_HOUSEHOLD_OWNER
RATE_LIMITED
JOIN_CONFLICT
SERVER_ERROR
```

Internal taxonomy may be richer than user-facing copy.

---

# 66. Time Handling

Use backend/database timestamps (`timestamptz` following current Supabase conventions).

Do not calculate validity from device local time.

Client may show `expires_at`; backend decides whether it is valid.

---

# 67. Household Deletion

Invite records must become unusable automatically when the household is deleted.

Prefer FK cascade/current lifecycle convention.

No joinable invite may reference a deleted household.

---

# 68. Member Removal

Removing a member does not reopen their consumed invite.

Consumed is permanent.

If rejoining is supported later, a new invite is required.

---

# 69. No Recipient Reservation

MVP invite is not tied to a specific email/phone/account before redemption.

The first eligible authenticated user who successfully completes Join consumes it.

This keeps MVP small.

Targeted recipient invites may be explored only if misuse appears in real usage.

---

# 70. No Owner Approval Queue

MVP:

```text
Owner generates single-use credential
→ invitee previews
→ invitee confirms
→ Member
```

Do not add:

```text
pending approval
→ Owner approves again
```

The generated single-use credential already expresses Owner intent.

---

# 71. No Join Request Inbox

Do not add for MVP:

- pending requests;
- invitation inbox;
- membership approval queue;
- invite notifications;
- recipient contact management.

---

# 72. No Additional Roles

Role model remains:

```text
Owner
Member
```

No admin/editor/viewer/guest roles are introduced.

---

# 73. No Multi-Household Feature Expansion

Join Code must not trigger implementation of:

- household selector;
- leave-and-switch flow;
- merging;
- ownership migration;
- recipe migration.

One-household MVP remains unchanged.

---

# 74. Future Invite-Link Compatibility

The domain should not be named or designed so narrowly that future link credentials require new membership business logic.

Future conceptual model:

```text
6-digit code ─────┐
                  │
invite-link token ├─→ Household Invite
                  │
QR credential ────┘
                         ↓
                       Preview
                         ↓
                        Join
```

Implement only code now.

---

# 75. Recommended Backend Shape

```text
EXISTING FastAPI Household module/router
│
├── Generate invite
│     ↓
│   existing auth
│     ↓
│   Owner authorization
│     ↓
│   secure 6-digit generation
│     ↓
│   keyed digest
│     ↓
│   replace previous row + persist
│
├── Preview join code
│     ↓
│   existing auth
│     ↓
│   existing-membership check
│     ↓
│   abuse/rate-limit boundary
│     ↓
│   no-household eligibility
│     ↓
│   normalize + digest
│     ↓
│   active invite lookup
│     ↓
│   safe preview DTO
│
└── Join household
      ↓
    existing auth
      ↓
    lock caller profile
      ↓
    membership-first recovery
      ↓
    abuse/rate-limit boundary
      ↓
    normalize + digest
      ↓
    atomic DB operation
      ├── lock/revalidate code row
      ├── insert Member
      ├── existing onboarding update
      └── delete consumed code row
```

Keep this inside the current Household module/service conventions.

---

# 76. Recommended Client Shape

```text
EXISTING Account / Household
        │
        ├── Owner
        │     ↓
        │  Invite member
        │     ↓
        │  generate mutation
        │     ↓
        │  code + Copy / Share
        │
        └── user without household
              ↓
           Join household
              ↓
           code input
              ↓
           preview mutation
              ↓
           Preview UI
              ↓
           join mutation
              ↓
           existing profile/household invalidation
              ↓
           existing authenticated app flow
```

---

# 77. Suggested API Surface (Illustrative Only)

Possible shape:

```http
POST /households/invites
```

Generate/replace active invite.

```http
DELETE /households/invites/current
```

Revoke current invite.

```http
POST /households/join/preview
```

Validate code and return safe preview.

```http
POST /households/join
```

Atomically join.

If current backend uses `/household`, nested routers, or different naming, follow the codebase instead.

---

# 78. Generate Response

Conceptually:

```json
{
  "code": "483921",
  "expires_at": "2026-08-28T11:00:00Z"
}
```

Do not expose `code_digest`.

---

# 79. Schema Constraints

Follow existing migration conventions.

Useful invariants:

```text
household_id NOT NULL
created_by NOT NULL
code_digest NOT NULL
created_at NOT NULL DEFAULT now()
expires_at NOT NULL
```

Keep the existing primary key on `household_id`, add uniqueness/indexing for `code_digest`, and add a unique constraint/index on `household_members(user_id)`.

---

# 80. One Active Invite Enforcement

Avoid overly clever DB logic around `now()` if it complicates current migrations.

Simple robust generation behavior:

```text
transaction
→ upsert one new code row for household
```

An expired row may remain until replaced or revoked.

No cleanup worker is needed for MVP.

---

# 81. Phase 0 — Inspect Current Code

Before editing code, inspect:

## Backend

1. household schema/migrations;
2. `household_members` constraints;
3. profile/onboarding completion logic;
4. Create Household endpoint/service;
5. current Join Household code if any;
6. auth dependency;
7. role authorization pattern;
8. Supabase client construction;
9. transaction/RPC conventions;
10. error handling;
11. settings/environment pattern;
12. rate-limit infrastructure.

## Client

1. onboarding `join_household` route;
2. Create Household flow;
3. Account/Household settings;
4. household API functions/hooks;
5. `apiConfig`;
6. authenticated request helper;
7. TanStack Query keys/mutations;
8. existing dialogs/sheets;
9. clipboard/share dependencies;
10. navigation after household create/join.

Produce a short implementation map before modifying code.

Do not refactor during Phase 0.

---

# 82. Phase 1 — Invite Persistence

Goal:

> Add only the invite lifecycle persistence.

Migrate and reuse `household_join_codes` following current migrations.

Migration scope:

```text
invalidate all existing plaintext household_join_codes rows
→ rename/replace code with code_digest
→ require expires_at
→ keep household_id as the one-row-per-household primary key
→ add unique household_members(user_id)
→ add household_join_rate_limits keyed by user_id
```

Acceptance:

- belongs to household;
- 10-minute expiry works using database time;
- household deletion makes invite unusable;
- digest lookup indexed;
- plaintext is not persisted.

Do not add client UI yet.

---

# 83. Phase 2 — Secure Code Generation

Implement and test:

```text
secure RNG
→ six digits
→ leading-zero preservation
→ normalization
→ keyed digest
→ collision retry
```

Verify raw code does not enter logs.

Configure `HOUSEHOLD_JOIN_CODE_HMAC_KEY` only on the backend. Record and rehearse the coordinated rotation runbook from Section 17.1; rotation deletes all outstanding codes and does not use a mixed-key rollout.

Do not implement Join yet.

---

# 84. Phase 3 — Owner Generate / Revoke API

Implement using existing Household authorization conventions.

Acceptance:

- Owner can generate;
- Member cannot generate;
- Owner can revoke;
- Member cannot revoke;
- generating again replaces the old code row;
- response includes plaintext once + expiry.

---

# 85. Phase 4 — Preview Backend

Implement read-only credential resolution.

Acceptance:

- valid code returns safe preview;
- invalid code fails;
- expired fails;
- revoked/deleted fails;
- consumed/deleted fails;
- user with existing household cannot preview/join normally;
- no membership mutation;
- no invite consumption;
- membership checked before limiter/code lookup;
- shared limiter row locked and updated concurrency-safely;
- 10 failures per 10 minutes causes a 10-minute lock;
- invalid/expired status commits its failure-counter update.

---

# 86. Phase 5 — Atomic Join Backend

Acceptance:

- valid invite creates exactly one `Member` membership;
- consumed code row deleted;
- role always Member;
- expired/deleted codes cannot join;
- existing household cannot join;
- concurrency admits only one user;
- failed membership insert does not delete the code row;
- transaction failure leaves no partial state;
- caller profile locked before membership lookup;
- existing membership returns `ALREADY_MEMBER` before code lookup;
- retry after committed/lost response recovers canonical membership;
- successful join deletes the code row and resets the limiter;
- expected credential statuses are returned, while unexpected transaction failures roll back all membership/profile/code changes.

---

# 87. Phase 6 — Owner Client UI

After backend generation works:

```text
Account
→ Household
→ Invite member
→ Generate
→ Copy / Share
```

Reuse current screen/component/mutation patterns.

No invite link.

---

# 88. Phase 7 — Join Code Input

Implement within current onboarding route.

Acceptance:

- six-digit input;
- numeric keyboard;
- paste;
- human formatting normalization;
- explicit Continue;
- mutation pending disables duplicate submit;
- error preserves input.

---

# 89. Phase 8 — Preview UI

Show:

```text
Join "Household Name"?
Owner: Display Name
N members
You'll join as a Member.
```

Do not show full pre-membership member list.

Cancel/back leaves invite untouched.

---

# 90. Phase 9 — Join Client Mutation

On Join:

```text
join mutation
→ atomic backend join
→ existing profile/household invalidation
→ existing onboarding/auth navigation
```

Do not optimistically create membership client-side.

---

# 91. Phase 10 — Production Hardening

Before production approval:

- rate-limit enabled;
- generic invalid credential responses confirmed;
- secret/code logging audited;
- expiry tested with backend time;
- concurrent redemption tested;
- Owner authorization tested;
- RLS tested;
- physical Android device Copy/Share tested;
- paste/numeric keyboard tested.

---

# 92. Golden Scenario — Happy Path

Owner:

```text
Rumah Nanda
→ Invite member
→ Generate
→ 483 921
→ Share
```

Invitee:

```text
Join Household
→ 483921
→ Continue
```

Preview:

```text
Join "Rumah Nanda"?

Owner
Nanda

3 members

You'll join as a Member.

[ Join household ]
```

Expected transaction:

```text
household_members
user_id = invitee
household_id = Rumah Nanda
role = member

matching household_join_codes row deleted
profile/onboarding state updated
```

---

# 93. Golden Scenario — Preview Then Cancel

```text
valid code
→ Preview
→ Cancel
```

Expected:

```text
membership unchanged
code row remains active
```

---

# 94. Golden Scenario — Single Use

```text
User A joins with 483921
→ success

User B tries 483921
→ generic invalid/expired failure
```

Exactly one membership created.

---

# 95. Golden Scenario — Expired

```text
expires_at = 10:00
attempt = 10:01
```

Expected:

```text
preview fails
join fails
membership unchanged
invite not consumed
```

---

# 96. Golden Scenario — Regenerate

```text
Owner generates 483921
Owner generates new code 124775
```

Expected:

```text
483921 deleted/replaced
124775 active
```

---

# 97. Golden Scenario — Existing Membership

```text
user belongs to Household A
enters invite to Household B
```

Expected:

```text
reject
no switch
no invite consumption
```

---

# 98. Golden Scenario — Concurrent Redemption

Two eligible users submit the same valid code simultaneously.

Expected:

```text
one success
one failure
```

Never two memberships from one invite.

---

# 99. Golden Scenario — Lost Response

```text
join transaction commits
response lost
same user retries
```

Preferred result:

```text
lock profile
→ find current membership before code lookup
→ return ALREADY_MEMBER with canonical membership
```

instead of confusing the user with a hard invalid-code failure.

---

# 100. What Must Not Be Refactored

Join Code must not require changing:

- canonical Household schema semantics beyond adding invite persistence;
- Owner/Member role model;
- recipe ownership model;
- recipe RLS;
- recipe schema;
- Expo Router architecture;
- current auth/session architecture;
- current API client strategy;
- `apiConfig` pattern;
- existing query-key strategy;
- current Create Household semantics;
- normal household recipe collaboration behavior.

If implementation appears to require those changes:

```text
stop
→ inspect coupling
→ adapt Join Code to current architecture
```

---

# 101. Explicit Non-Goals

MVP does not include:

- invite link;
- Universal Links;
- Android App Links;
- deep-link join routing;
- QR invite;
- email/SMS provider integration;
- contact picker;
- recipient reservation;
- Owner approval queue;
- join request inbox;
- multi-use code;
- multi-household switching;
- ownership transfer;
- guest/admin/editor/viewer roles;
- background invite cleanup service;
- CAPTCHA unless observed abuse justifies it.

---

# 102. Acceptance Criteria — Owner

- [ ] Only Owner sees Invite Member.
- [ ] Owner can generate a six-digit code.
- [ ] Secure RNG is used.
- [ ] Code expires after 10 minutes using backend/database time.
- [ ] Code is single-use.
- [ ] One active invite per household.
- [ ] Generating a new invite invalidates the previous one.
- [ ] Owner can revoke.
- [ ] Owner can Copy.
- [ ] Owner can Share via native share UI.
- [ ] Member cannot generate/revoke server-side.
- [ ] Plaintext code is not canonical persisted DB data.

---

# 103. Acceptance Criteria — Invitee

- [ ] Join is normally available only when no household exists.
- [ ] Six-digit input supports paste and human formatting.
- [ ] Input does not auto-submit.
- [ ] Continue explicitly requests preview.
- [ ] Preview shows household name.
- [ ] Preview shows Owner display name.
- [ ] Preview shows member count.
- [ ] Preview does not expose private household content.
- [ ] Preview does not delete the code row.
- [ ] Join requires explicit confirmation.
- [ ] Successful join always assigns Member.

---

# 104. Acceptance Criteria — Transaction

- [ ] Join revalidates after Preview.
- [ ] Membership + invite consumption are atomic.
- [ ] Invite can only be consumed once.
- [ ] Concurrent redemption cannot admit two users.
- [ ] Existing one-household constraint remains enforced.
- [ ] Failed Join does not delete the code row.
- [ ] Successful Join reuses existing onboarding completion logic.
- [ ] Lost-response retry can recover where practical.
- [ ] Final Join locks the caller profile and checks membership before code lookup.
- [ ] `household_members(user_id)` uniqueness remains the race-condition backstop.

---

# 105. Acceptance Criteria — Security

- [ ] Existing authenticated backend dependency used everywhere.
- [ ] Owner authorization enforced server-side.
- [ ] Invite table is not broadly readable by clients.
- [ ] Raw code not logged.
- [ ] Invite secret not exposed to Expo.
- [ ] Preview/Join are rate-limited.
- [ ] Preview/Join share one concurrency-safe per-user failure counter.
- [ ] Limiter updates survive expected invalid/expired responses.
- [ ] Generic credential failure copy avoids unnecessary enumeration detail.
- [ ] Backend/database time controls expiration.
- [ ] Cryptographically secure RNG used.
- [ ] HMAC rotation invalidates all outstanding codes and never mixes active key versions.

---

# 106. Acceptance Criteria — Codebase Alignment

- [ ] Existing Household router/module reused.
- [ ] Existing Supabase/auth convention reused.
- [ ] Existing `apiConfig` reused.
- [ ] Existing authenticated request helper reused.
- [ ] Existing TanStack Query mutation conventions reused.
- [ ] Existing profile/household invalidation reused.
- [ ] Existing Expo Router navigation reused.
- [ ] Existing dialogs/buttons/inputs reused.
- [ ] No new ORM.
- [ ] No new global state system.
- [ ] No invite-link infrastructure.
- [ ] Exact names/types/functions follow actual code, not conceptual examples in this spec.

---

# 107. Final MVP Architecture

```text
                           OWNER
                             │
                    Account → Household
                             │
                       Invite member
                             │
                  EXISTING API convention
                             │
                             ▼
                  EXISTING FastAPI Household
                             │
                      EXISTING auth
                             │
                     Owner permission
                             │
                secure 6-digit generation
                             │
                       keyed digest
                             │
                revoke previous + persist
                             │
                             ▼
                     483 921 returned
                      /             \
                   Copy            Share
                                     │
                                     ▼
                                  Invitee
                                     │
                              Join Household
                                     │
                                  code input
                                     │
                                     ▼
                    EXISTING authenticated API helper
                                     │
                                     ▼
                        Preview join operation
                          ├─ auth
                          ├─ eligibility
                          ├─ concurrency-safe rate limit
                          ├─ normalize code
                          ├─ digest lookup
                          └─ safe preview
                                     │
                                     ▼
                          Household Preview
                        ┌────────────────────┐
                        │ Rumah Nanda        │
                        │ Owner: Nanda       │
                        │ 3 members          │
                        │                    │
                        │ [Cancel] [Join]    │
                        └─────────┬──────────┘
                                  │
                                  ▼
                           join mutation
                                  │
                                  ▼
                     ATOMIC DATABASE OPERATION
                        ├─ lock caller profile
                        ├─ membership-first recovery
                        ├─ lock limiter row
                        ├─ lock/revalidate code row
                        ├─ insert membership
                        │     role = member
                        ├─ existing onboarding update
                        └─ delete consumed code row
                                  │
                                  ▼
                          transaction commit
                                  │
                                  ▼
                    EXISTING query invalidation
                                  │
                                  ▼
                    EXISTING authenticated app flow
```

---

# 108. Final Decision Summary

Noomori MVP Household Invite is:

```text
6-digit numeric code
10-minute expiry
single-use
one active invite per household
Owner-only generation/revocation
Copy + native Share
authenticated invitee
preview before mutation
household name + Owner + member count
explicit Join
atomic consume + Member insertion
concurrency-safe rate limited
membership-first lost-response recovery
rotation invalidates outstanding codes
invite link deferred
```

The invite code is only an **admission credential**.

`household_members` remains the authoritative source of household access.

The implementation should add only the smallest invite lifecycle around the **existing Noomori Household architecture**.
