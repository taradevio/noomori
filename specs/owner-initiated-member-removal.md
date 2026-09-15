# Owner-Initiated Household Member Removal

Status: deferred until the household restoration and recipe handoff work are
implemented.

## 1. Executive Summary

**Problem statement:** Household owners can invite members but cannot remove
them. Removing a member must revoke access immediately while preserving the
member's parked owned household and following the recipe-handoff rules.

**Proposed solution:** Add an owner-only removal action that invokes the same
tested departure operation as voluntary leave, targeting a member of the
owner's active household.

**Success criteria:**

- Only the active household owner can remove an ordinary member of that
  household.
- The owner cannot remove themselves or another owner through this action.
- Removal and any required recipe handoff complete atomically from the domain's
  perspective.
- A removed member's parked household is restored; otherwise their account
  returns to household onboarding.
- A failed request leaves membership, shares, and member UI unchanged.

## 2. User Experience and Functionality

**User personas:** A household owner managing access and the member being
removed.

**User stories:**

- As an owner, I want to remove a member who should no longer access my
  household.
- As a removed member, I want my original recipes and parked household to
  remain intact.

**Acceptance criteria:**

- Only owner views show **Remove member** on non-owner member rows.
- The confirmation title is `Remove <Name>?` and states that the member will
  lose access and that shared recipe copies will follow the handoff review.
- Cancel performs no mutation.
- Success removes the member from the visible list and reports completion.
- Failure keeps the member visible and provides a retryable error.
- Repeating a completed removal does not create another handoff or alter an
  unrelated membership.

**Non-goals:** Removing the household owner, ownership transfer, banning future
invites, deleting the removed user's account or original recipes, and general
household switching.

## 3. AI System Requirements

Not applicable.

## 4. Technical Specifications

### Architecture overview

- Add `DELETE /household/members/{member_user_id}` to the existing household
  router.
- The public removal RPC validates that the caller is the current owner and the
  target is a `member` in the same active household.
- Route both voluntary leave and owner removal through one private database
  departure operation. It receives the authoritative outgoing membership and
  target user; it does not accept a client-selected household.
- Reuse the handoff preparation and finalization flow from `handoff.md` for the
  target member's shared recipes.
- At finalization, update the target's single membership back to
  `previous_household_id` as `owner`, or delete it and clear onboarding when no
  previous household exists.

### API contract

Successful removal returns:

```json
{
  "status": "REMOVED",
  "member_user_id": "...",
  "handoff_created": true,
  "handoff_recipe_count": 3
}
```

Expected errors are `403` when the caller is not the owner, `404` when the
target is not a member of the active household, and `409` when the target is
the owner or the membership changed during removal.

### Security and privacy

- Lock and revalidate caller and target memberships before snapshotting or
  removal.
- The client supplies only the target user ID. Household, role, recipes,
  previous household, and handoff destination come from database state.
- Direct table mutation remains blocked by RLS; authenticated clients use the
  RPC-backed API.
- Handoff review exposes snapshots only to the current owner after removal.

### Verification

- Database tests cover owner success, non-owner denial, self/owner denial,
  cross-household denial, concurrent leave/removal, retry idempotency, restored
  parked household, and onboarding fallback.
- Handoff tests cover zero, one, and multiple shared recipes and prove that
  owner decisions never affect the removed user's originals or restored
  household.
- Frontend tests cover action visibility, named confirmation, cancellation,
  disabled pending state, success removal, cache invalidation, and retryable
  failure.

## 5. Risks and Roadmap

**Phased rollout:** Implement after `handoff.md`; add the backend and database
authorization first, then expose the settings action.

**Technical risks:** Voluntary leave and forced removal can race. The shared
departure operation must lock the target membership and make one request win;
the loser returns a stable already-removed/not-found result without duplicating
handoffs. A removed user's open app may contain stale cached household data, so
future implementation must clear it on the next membership refresh or
household authorization failure.

