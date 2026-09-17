# Solo Owner Household Join and Restore — Revised

> [Inference]
>
> This revision preserves the original plan's core behavior:
>
> - a solo household owner may join exactly one other household as a member;
> - the owned solo household remains stored but parked;
> - the user continues to have exactly one active `household_members` row;
> - the joined household becomes active;
> - leaving the joined household restores the parked owned household;
> - ordinary members without a parked household still leave to onboarding;
> - recipe handoff and owner-initiated member removal remain separate features.
>
> The main revisions harden authorization, concurrency, idempotency, parked-household invariants, and rollout safety before recipe handoff is layered on top.

---

# 1. Summary

Allow a solo household owner to join one other household as a member while preserving their owned household.

The user must continue to have exactly one active membership row.

When the user joins another household:

```text
owned solo household
→ parked

target household
→ active
```

When the user later leaves the joined household:

```text
if previous_household_id exists
→ restore parked household as owner
→ return RESTORED

otherwise
→ remove membership
→ return LEFT
```

Recipe handoff remains deferred in this implementation.

However, the leave API must already be hardened so that retries cannot accidentally leave the restored household or a newly joined household.

---

# 2. Domain Model

The feature introduces the distinction between:

```text
active household
```

and:

```text
parked owned household
```

A parked household still exists in `households`, and its recipes/shares remain stored, but it is not the user's active household while the user is a member elsewhere.

---

# 3. Core Invariants

## 3.1 Exactly one active membership per user

Preserve the existing uniqueness rule:

```text
one user
→ at most one household_members row
```

The row is moved between households instead of creating a second active membership.

Example:

```text
before:

user = Tara
household_id = H1
role = owner
previous_household_id = NULL
```

After joining H2:

```text
user = Tara
household_id = H2
role = member
previous_household_id = H1
```

There must never be:

```text
H1 owner row
+
H2 member row
```

for the same user at the same time.

---

## 3.2 `previous_household_id` is not generic history

Although the column is named:

```text
previous_household_id
```

its domain meaning is specifically:

```text
parked_owned_household_id
```

It is not an arbitrary previous-membership pointer.

It may exist only when:

```text
current role = member
```

and the referenced household is the user's own parked solo household.

---

## 3.3 Parked household is inactive

When the user is active in H2 and H1 is parked:

```text
H1
→ stored
→ inaccessible as active household
→ cannot be managed through ordinary household-owner APIs
```

The user must not be treated as actively owning H1 merely because:

```text
households.created_by = user.id
```

`created_by` is provenance/history, not active authorization.

---

## 3.4 Active authorization comes from current membership

For ordinary household operations, authorization must derive from the active `household_members` row.

Do not authorize household actions solely through:

```text
households.created_by
```

Example:

```text
Tara created H1
Tara currently member of H2
H1 is parked
```

Expected:

```text
Tara can manage H2 according to member permissions
Tara cannot manage H1 while it is parked
```

---

## 3.5 Parked household may temporarily have no active owner membership row

The previous invariant:

```text
every household always has an owner membership row
```

is no longer universally true.

The new rule is:

```text
every active household has exactly one owner

a parked solo household may temporarily have
no active household_members row
```

This state is intentional and must be supported by queries, authorization logic, and tests.

---

# 4. Schema Change

Add:

```sql
previous_household_id uuid null
```

to `household_members`.

Reference:

```text
households(id)
```

---

# 5. Column Constraints

Enforce:

```text
previous_household_id IS NULL
OR role = 'member'
```

and:

```text
previous_household_id IS NULL
OR previous_household_id <> household_id
```

Also enforce through RPC/domain validation that:

```text
previous_household_id
must reference a household owned/created by the same user
```

Do not allow arbitrary UUID assignment.

---

# 6. Foreign Key Delete Semantics

Recommended:

```text
previous_household_id
REFERENCES households(id)
ON DELETE RESTRICT
```

A parked household must not silently disappear while referenced.

Avoid:

```text
ON DELETE SET NULL
```

because that can silently convert a future:

```text
RESTORED
```

outcome into:

```text
LEFT
```

without an explicit product action.

---

# 7. Join Eligibility

A user may use **Join another household** only if all of the following are true:

```text
1. user currently has one membership;
2. current role = owner;
3. current household contains exactly one membership;
4. that membership belongs to the current user;
5. previous_household_id IS NULL;
6. target household differs from current household.
```

This is the definition of a solo owner for this feature.

---

# 8. Reject Non-Solo Owners

If the current owned household has another member:

```text
member_count > 1
```

reject:

```text
HOUSEHOLD_HAS_MEMBERS
```

Do not park a household that would leave another active member without an owner.

---

# 9. Reject Joining Own Household

If the target invite resolves to the same household as the current owned household:

```text
target_household_id = current_household_id
```

reject.

Reuse the most appropriate existing domain error or add a specific one if required.

Do not process this as a switch.

---

# 10. Existing-Member Behavior

Users who are already ordinary members must retain current:

```text
ALREADY_MEMBER
```

recovery behavior.

Do not broaden this feature into:

```text
H1 member
→ H2 member
```

switching.

The feature is specifically:

```text
solo owner
→ member of one other household
```

---

# 11. Join Transaction

The solo-owner switch must be atomic.

Conceptually:

```text
BEGIN

1. lock current user's membership row
2. lock source household / relevant membership state
3. lock source household active invite state
4. resolve and lock target invite as required
5. revalidate current user is still solo owner
6. verify source household member_count = 1
7. verify target != source household
8. verify target invite remains valid
9. revoke source household active invite
10. consume/record target invite behavior
11. update same membership row:
       household_id = target
       role = member
       previous_household_id = source household
12. reset household-specific activity state
13. preserve source household recipes and source household recipe shares

COMMIT
```

If any step fails:

```text
ROLLBACK
```

---

# 12. Concurrency Protection

The check:

```text
source household has only owner
```

must occur under the same transaction/locking boundary as the switch.

Do not:

```text
check solo state
→ release transaction
→ later switch membership
```

Otherwise a concurrent invite acceptance could produce:

```text
parked household with another member
but no active owner
```

This state must be impossible.

---

# 13. Concurrent Invite Acceptance

The source household invite must be serialized against the switch.

Example race to prevent:

```text
T0 Tara starts switching H1 → H2
T1 backend confirms H1 is solo
T2 Budi accepts H1 invite
T3 Tara membership moves to H2
```

Invalid result:

```text
H1:
Budi = member
owner = none
```

The join/switch transaction and invite-accept path must contend on compatible locks or authoritative state so only one operation can succeed.

---

# 14. Parked Household Invite Behavior

When a solo owner successfully joins another household:

```text
revoke the parked household's active invite
```

Reason:

```text
parked household has no active owner available
to manage new members
```

While parked:

```text
no new active invite may be generated
```

unless/until the household is restored.

---

# 15. Parked Household Access Restrictions

While H1 is parked, the user must not be able to use ordinary active-household owner actions against H1.

At minimum block:

```text
update H1 settings
rename H1
generate invite for H1
revoke/regenerate H1 invite manually
delete H1
manage H1 membership
perform owner-only H1 operations
```

unless a future product feature explicitly supports parked-household management.

---

# 16. Parked Household Read Semantics

The parked household may remain internally discoverable for restore logic.

However, ordinary active-household APIs should not return it as current.

Example:

```text
GET current household
→ H2

not H1
```

`previous_household_id` is restoration metadata, not a second current household.

---

# 17. Recipes While Household Is Parked

Preserve:

```text
owned household H1
recipes
recipe shares to H1
```

unchanged while the owner is active in H2.

Example:

```text
R1 owned by Tara

R1 → H1 share
```

After joining H2:

```text
R1 → H1 share remains stored
```

The parked H1 share is not deleted merely because H1 is inactive.

---

# 18. Sharing Recipe To Joined Household

While Tara is active as a member in H2, ordinary recipe-sharing behavior may allow:

```text
R1 → H2
```

This must be a distinct sharing relationship from:

```text
R1 → H1
```

Result:

```text
R1
├── H1 share
└── H2 share
```

The two household relationships must remain independently mutable.

---

# 19. Leave Command Must Be Explicitly Targeted

This is a P0 correctness requirement.

Do not define leave semantics as:

> leave whatever household is current when the request executes.

The request must mean:

> leave this specific outgoing household exactly once.

This is required even before recipe handoff.

---

# 20. Preferred Leave API

Preferred:

```http
POST /household/leave
Idempotency-Key: <UUID>
Content-Type: application/json
```

Request:

```json
{
  "household_id": "<outgoing-household-id>"
}
```

The backend must validate:

```text
authenticated user currently belongs to this outgoing household
```

for the first execution.

---

# 21. Why Explicit Leave Identity Is Required

Example:

```text
Tara active in H2
previous_household_id = H1
```

First request:

```text
leave H2
→ RESTORED to H1
```

If response is lost and the client retries a generic:

```http
DELETE /household
```

the user's current household is now H1.

Without command identity, retry could accidentally:

```text
leave H1
```

This must be impossible.

---

# 22. Leave Idempotency

A logical leave operation must use stable identity.

Recommended:

```text
Idempotency-Key
+
user_id
+
outgoing_household_id
```

Retrying the same command must return the same logical result:

```text
RESTORED
```

or:

```text
LEFT
```

without executing another leave against a newly current household.

---

# 23. Leave With Parked Household

If:

```text
previous_household_id IS NOT NULL
```

the leave operation must:

```text
1. target only outgoing active household
2. remove outgoing-household-specific state
3. restore same membership row to previous household
4. set role = owner
5. clear previous_household_id
6. keep onboarding complete
7. return RESTORED
```

---

# 24. Leave Without Parked Household

If:

```text
previous_household_id IS NULL
```

retain ordinary member-leave behavior:

```text
1. remove outgoing-household-specific state
2. delete membership
3. clear onboarding completion
4. return LEFT
```

---

# 25. Recipe Behavior Before Handoff Exists

Until the recipe-handoff feature is implemented:

```text
leave outgoing household
→ remove departing user's recipe shares
  only from outgoing household
```

Never remove parked-household shares.

Example:

```text
R1
├── H1 share
└── H2 share
```

Leaving H2:

```text
remove R1 → H2
preserve R1 → H1
```

Then restore H1.

---

# 26. Handoff Compatibility Boundary

Future recipe handoff will replace only this part:

```text
remove outgoing H2 recipe shares immediately
```

with:

```text
snapshot H2-shared recipes
→ isolate/copy handoff assets
→ remove H2 shares
→ restore H1 / leave
→ H2 owner reviews snapshots
```

The parked H1 relationship remains untouched.

This implementation should therefore make outgoing-household scoping explicit now.

---

# 27. Restoration Transaction

Restoration must be atomic.

Conceptually:

```text
BEGIN

1. validate leave command identity
2. lock current active membership
3. verify active household = requested outgoing household
4. verify previous_household_id exists
5. verify parked household still exists
6. remove only outgoing-household state
7. update same membership row:
       household_id = previous_household_id
       role = owner
       previous_household_id = NULL
8. preserve onboarding completion
9. return restored household payload

COMMIT
```

---

# 28. Parked Household Existence

A referenced parked household must continue to exist until restoration.

Database constraints and application flows must prevent its deletion while referenced.

If an impossible/corrupt state is encountered:

```text
previous_household_id references no valid restorable household
```

do not silently degrade to LEFT.

Return a domain/internal consistency error and preserve recoverable state.

---

# 29. Restoration Authorization

Restoration is not a general:

```text
become owner of previous_household_id
```

operation.

It is permitted only because the active membership row already contains the authoritative parked-owned-household pointer created during the original solo-owner switch.

Do not accept a client-supplied restoration household ID.

---

# 30. Onboarding Semantics

On successful RESTORED leave:

```text
onboarding remains complete
```

On ordinary LEFT leave:

```text
onboarding completion cleared
```

Preserve existing ordinary-member behavior.

---

# 31. Join Endpoint

Reuse the existing authenticated join flow/route.

The backend may keep current successful response shape if no additional client data is required.

The important behavioral distinction is internal:

```text
no household
→ normal join

solo owner
→ switch + park

ordinary member
→ existing ALREADY_MEMBER behavior
```

---

# 32. Expo Routing

Add:

```text
/household/join
```

to the authenticated Expo Router stack.

Reuse the existing join screen.

Use SDK 56-compatible Expo Router APIs.

Do not rely on unversioned `latest` documentation where behavior differs.

---

# 33. Household Settings CTA

Show:

```text
Join another household
```

only when:

```text
current role = owner
AND current household member_count = 1
AND previous_household_id IS NULL
```

Do not show the CTA to:

```text
ordinary members
owners with additional members
users already temporarily joined elsewhere
```

---

# 34. Join UX Copy

Explain clearly:

```text
Your current household will be saved while you join another household.

When you leave the joined household, your saved household will be restored.
```

Do not imply two active households.

---

# 35. Join Success Cache Invalidation

After successful solo-owner join, invalidate:

```text
current household
household settings
household activity
household recipe list
recipe sharing state
invite state
other caches keyed by household identity
```

Avoid leaving stale H1 data rendered as though H1 were still active.

Then:

```text
router.replace('/household')
```

or the existing equivalent target.

---

# 36. Restore Cache Invalidation

After:

```text
status = RESTORED
```

invalidate:

```text
current household
household settings
household activity
household recipes
recipe sharing state
invite state
```

Then replace settings/current joined-household route with:

```text
/household
```

using SDK 56-compatible `router.replace`.

---

# 37. Ordinary LEFT Navigation

After:

```text
status = LEFT
```

retain existing ordinary-member navigation to onboarding/setup.

Do not change this behavior as part of parked-household support.

---

# 38. Leave Response

Replace the old empty `204` with explicit domain result.

RESTORED:

```json
{
  "status": "RESTORED",
  "household": {
    "id": "...",
    "name": "..."
  }
}
```

LEFT:

```json
{
  "status": "LEFT",
  "household": null
}
```

Future hardened API may also include command/idempotency metadata internally without exposing unnecessary implementation details.

---

# 39. Frontend Type

Add:

```text
LeaveHouseholdResult
```

representing:

```text
RESTORED | LEFT
```

Use a discriminated union where practical.

Example conceptual shape:

```ts
type LeaveHouseholdResult =
  | {
      status: "RESTORED";
      household: HouseholdSummary;
    }
  | {
      status: "LEFT";
      household: null;
    };
```

---

# 40. Database Authorization Audit

Before or alongside this feature, audit all household authorization queries for assumptions like:

```text
household.created_by = auth.uid()
→ therefore current owner
```

That assumption becomes unsafe once households can be parked.

Active authorization should generally derive from:

```text
household_members
```

for the active household.

---

# 41. Query Audit Checklist

Audit at minimum:

```text
current household fetch
household settings
invite creation
invite revocation
household update
household delete
member list
member management
household recipe list
household recipe sharing
activity access
notification settings
owner-only actions
```

Each must distinguish:

```text
active household membership
```

from:

```text
historical creator / parked owner
```

---

# 42. Invite Authorization While Parked

A parked household must not accidentally accept or create active invite operations through stale authorization.

Tests must confirm:

```text
owner is away
→ cannot create/regenerate parked H1 invite
→ stale H1 invite is revoked
→ stale invite cannot be used successfully after switch
```

---

# 43. Retry Join Safety

Retrying the same successful solo-owner join must not:

```text
overwrite previous_household_id
create a second parked household
consume another invite unexpectedly
create another membership
```

The same membership row must remain authoritative.

---

# 44. Joining A Third Household

State:

```text
active = H2
previous_household_id = H1
role = member
```

The user may not use the solo-owner switch flow to join H3.

Expected:

```text
ALREADY_MEMBER
```

or equivalent existing behavior.

There is no stack:

```text
H1 → H2 → H3
```

and no multi-level household history.

---

# 45. Failed Join Atomicity

If switching fails at any point:

```text
membership must remain H1 owner
previous_household_id remains NULL
H1 invite state must remain consistent
target invite must not be half-consumed
household-specific activity state must not be partially reset
```

The user must not land in an intermediate state.

---

# 46. Failed Leave Atomicity

If RESTORED leave fails:

```text
user remains active in outgoing household
previous_household_id remains intact
parked household remains parked
outgoing shares/state remain consistent
```

Do not partially restore.

---

# 47. Database Test Plan

Add/retain tests for:

## Solo-owner join

```text
1. solo owner can preview target household
2. solo owner can join target household
3. same membership row is reused
4. membership role becomes member
5. previous_household_id stores owned household
6. original household remains stored
7. original household recipes remain stored
8. original household recipe shares remain stored
9. source invite is revoked
```

## Rejections

```text
10. owner with another member gets HOUSEHOLD_HAS_MEMBERS
11. ordinary member cannot use solo-owner switch
12. own invite cannot be used
13. already-switched user cannot join H3
14. previous_household_id cannot reference arbitrary household
```

## Authorization

```text
15. parked household is not returned as active
16. created_by does not grant active parked-household access
17. parked household settings cannot be mutated
18. parked household invite cannot be regenerated
19. parked household cannot be deleted while referenced
```

## Concurrency

```text
20. concurrent source invite acceptance cannot create ownerless active household
21. switch and invite acceptance serialize safely
22. retry join does not overwrite previous_household_id
23. failed join leaves source membership/invite atomic
```

## Leave / restore

```text
24. leaving joined household restores parked household
25. restored role = owner
26. previous_household_id cleared
27. onboarding remains complete
28. active household query returns restored household
29. ordinary member without previous household returns LEFT
30. ordinary LEFT clears onboarding
```

## Leave idempotency

```text
31. explicit outgoing household required
32. identical leave retry returns same result
33. retry after RESTORED does not leave restored H1
34. stale retry after joining another household does not leave new household
35. mismatched target household is rejected
```

## Recipe scope before handoff

```text
36. leaving H2 removes only H2 recipe shares
37. parked H1 recipe shares remain
38. same recipe shared to H1 + H2 loses only H2 relationship
39. restoring H1 exposes preserved H1 shares correctly
```

---

# 48. Backend Tests

Cover:

```text
join response mapping
HOUSEHOLD_HAS_MEMBERS mapping
ALREADY_MEMBER behavior
RESTORED leave response
LEFT leave response
explicit leave target
idempotency replay
mismatched target rejection
parked-household authorization enforcement
```

---

# 49. Frontend Tests

Cover:

```text
solo-owner Join another household visibility
hidden CTA for owner with members
hidden CTA for ordinary member
authenticated /household/join routing
join explanatory copy
join error copy
join cache invalidation
successful joined-household navigation
RESTORED cache refresh
RESTORED /household navigation
ordinary LEFT onboarding navigation
duplicate leave tap/retry safety
```

---

# 50. Deployment Strategy

Use additive rollout rather than assuming backend-first is always safe.

Preferred order:

```text
1. additive database migration
2. backend
3. Expo client
4. cleanup/deprecation
```

---

# 51. Migration Phase

First deploy schema that is backward compatible:

```text
previous_household_id
constraints
indexes
new RPC/function versions if required
```

Do not remove or break old backend dependencies in this step.

---

# 52. Backend Phase

Deploy backend support for:

```text
solo-owner switch
RESTORED | LEFT
explicit targeted leave
leave idempotency
parked-household authorization
```

The backend should remain compatible with the currently released Expo client where possible.

---

# 53. Expo Phase

Then deploy:

```text
Join another household CTA
authenticated join route
new leave-result handling
RESTORED navigation
cache invalidation changes
```

---

# 54. RPC Migration Caveat

If changing an existing RPC's signature or return shape would break the currently deployed backend, split migration:

```text
Migration A:
add schema + new RPC name/version

Deploy backend:
use new RPC

Migration B:
deprecate/replace old RPC later
```

Do not create backend/schema version skew.

---

# 55. Recipe Handoff Compatibility

This feature should be implemented so recipe handoff can later extend leave without redesigning membership restoration.

Future flow:

```text
Tara active H2
previous H1 parked

leave H2
    │
    ├── snapshot H2-shared recipes
    ├── copy handoff assets
    ├── remove only H2 shares
    ├── restore Tara → H1
    └── create H2 owner review
```

The membership lifecycle remains:

```text
RESTORED | LEFT
```

while recipe handoff handles only outgoing-household content.

---

# 56. Non-Goals

Do not add as part of this feature:

```text
household selector
multiple active memberships
multiple parked households
nested previous household history
ordinary member → another household switching
owner-initiated member removal
recipe handoff
general recipe ownership transfer
parked-household management UI
household ownership transfer
```

---

# 57. Acceptance Criteria

The feature is complete only when:

### Membership

- [ ] User always has at most one active membership row.
- [ ] Solo owner may join one other household.
- [ ] Same membership row is reused.
- [ ] `previous_household_id` stores only the user's parked owned household.
- [ ] Owner with another member cannot switch.
- [ ] User cannot stack H1 → H2 → H3.

### Parked household

- [ ] Parked household remains stored.
- [ ] Parked recipes remain stored.
- [ ] Parked recipe shares remain stored.
- [ ] Parked household is not returned as active.
- [ ] `created_by` does not grant active parked-household authorization.
- [ ] Parked invite is revoked.
- [ ] No new parked invite may be generated.
- [ ] Parked household cannot be deleted while referenced.

### Concurrency

- [ ] Solo-owner eligibility is checked inside the switch transaction.
- [ ] Concurrent invite acceptance cannot leave a member behind without an owner.
- [ ] Failed switch is atomic.
- [ ] Retry switch is safe.

### Leave

- [ ] Leave explicitly targets outgoing household.
- [ ] Leave has stable idempotency identity.
- [ ] RESTORED returns the parked household.
- [ ] LEFT retains ordinary behavior.
- [ ] Retry after RESTORED cannot leave restored household.
- [ ] Old retry cannot leave a newly joined household.

### Recipes

- [ ] Leaving joined household removes only outgoing-household shares.
- [ ] Parked-household shares remain untouched.
- [ ] Restored household sees its preserved recipe state.
- [ ] Design remains compatible with future recipe handoff.

### Rollout

- [ ] Schema can be deployed additively.
- [ ] Backend/client version skew is handled safely.
- [ ] Expo changes deploy only after backend support exists.

---

# 58. Final Domain Rule

The feature can be summarized as:

> A user who is the sole owner-member of a household may temporarily park that owned household and join one other household as a member. Noomori continues to store only one active membership row for the user. The active membership moves to the joined household while `previous_household_id` records the parked owned household. The parked household remains stored, keeps its recipes and recipe shares, has its invite revoked, and is not manageable as an active household while the owner is away. Leaving the joined household is an explicitly targeted and idempotent command: it either restores the same membership row to the parked household as owner and returns `RESTORED`, or removes membership and returns `LEFT` when no parked household exists. Outgoing-household recipe cleanup must affect only the outgoing household, preserving parked-household shares and providing a clean boundary for the later recipe-handoff workflow.
