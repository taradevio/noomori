# Recipe Handoff After Household Restoration

Status: deferred until `solo-owner-household-join-and-restore-plan.md` is
implemented.

This document is an implementation addendum to
`noomori-recipe-handoff-spec.md`. The existing specification remains the
authority for snapshot contents, owner review, Keep/Remove behavior, isolation,
and acceptance criteria.

## 1. Executive Summary

**Problem statement:** Leaving currently removes a member's recipe shares
immediately. Once a member may have a parked owned household, leave must also
restore that household without allowing the old household's later decisions to
affect the member's original recipes.

**Proposed solution:** Prepare isolated recipe snapshots, copy their assets,
then atomically finalize the handoff and either restore
`parked_household_id` or remove the membership. The old owner reviews only
the isolated snapshots.

**Success criteria:**

- Every recipe shared by the departing member is snapshotted at one coherent
  leave boundary.
- Membership changes only after all required snapshots and image copies are
  ready.
- The departing user keeps every original recipe and immediately reaches their
  restored household or onboarding.
- Keep and Remove are idempotent and cannot mutate the original recipe.
- Only the current owner of the outgoing household can view or resolve pending
  handoffs.

## 2. User Experience and Functionality

**User personas:** A departing household member and the owner of the household
being left.

**User stories:**

- As a member, I want to leave without losing my recipes or waiting for owner
  review.
- As a member with a parked household, I want that household restored after I
  leave.
- As the old household owner, I want to keep or remove isolated copies of the
  recipes the member shared.

**Acceptance criteria:**

- The leave confirmation shows the number of shared recipes that will enter
  review and states that the member's originals remain theirs.
- Zero shared recipes creates no handoff.
- A successful leave navigates to the restored Household tab or onboarding.
- The owner can inspect each pending snapshot, Keep or Remove it, and apply
  Keep all or Remove all.
- Failed resolution leaves the item pending and retryable.
- Remove all requires destructive confirmation.

**Non-goals:** General ownership transfer, household-owned recipes, recipe
merging, synchronization with originals, automatic expiry, member approval,
and owner-initiated removal.

## 3. AI System Requirements

Not applicable.

## 4. Technical Specifications

### Architecture overview

Use the existing FastAPI household module, Supabase RPC pattern, recipe model,
and Storage helpers.

1. `prepare_recipe_handoff` locks and snapshots the outgoing membership and
   every currently shared recipe into a `preparing` handoff. Membership and
   active shares remain unchanged.
2. The API copies each referenced image to a handoff-owned path. Existing image
   cleanup must preserve objects referenced by a preparing handoff.
3. `finalize_recipe_handoff` verifies that every required asset is isolated,
   removes the originals' outgoing share rows, and changes membership in one
   database transaction:
   - with `parked_household_id`, restore that household and role `owner`;
   - without it, delete membership and clear onboarding completion.
4. Finalization changes the handoff to `pending`. Only then may it appear in
   the old owner's review list.
5. Failed preparation or asset copying leaves membership and shares intact.
   Retry reuses the same preparing handoff; abandoned copied assets are safe to
   clean up later.

### Data model

- `recipe_handoffs`: household, departed user where still available, display
  name snapshot, `preparing | pending | resolved` status, timestamps.
- `recipe_handoff_items`: handoff, source recipe UUID as provenance without a
  cascading dependency, schema version `1`, complete JSONB recipe snapshot,
  isolated image path, `pending | keep | remove` decision, decision actor and
  timestamps.
- Enforce one item per source recipe per handoff and immutable final decisions.
- RLS exposes pending handoffs and items only to the household's current owner.
  Preparing rows remain server-only.

### APIs and integration points

- Extend `DELETE /household` to orchestrate preparation, asset copy, and final
  leave. Its result keeps `RESTORED | LEFT` and adds
  `handoff_created` and `handoff_recipe_count`.
- Add owner-only list/detail endpoints under
  `/household/recipe-handoffs`.
- Add idempotent item Keep/Remove and bulk Keep all/Remove all endpoints.
- Keep creates a new ordinary recipe owned by the current household owner,
  preserves provenance, and shares it with the same household.
- Remove deletes only the snapshot and its isolated asset.
- Household and recipe caches are invalidated only after confirmed mutations.

### Security and privacy

- Derive the outgoing household, departed user, current owner, and destination
  owner from authenticated database state.
- Never accept an owner ID, household ID, or source recipe owner from the
  client as authorization.
- The departed user cannot read or resolve the old household's handoff.
- Profile or original-recipe deletion must not invalidate snapshot content,
  attribution text, or copied assets.

## 5. Risks and Roadmap

**Phased rollout:**

1. Implement the solo-owner join and restoration plan.
2. Add handoff schema, preparation/finalization RPCs, asset isolation, and
   authorization tests.
3. Add leave confirmation counts and owner review UI.
4. Enable handoff-backed leave and monitor preparation/finalization failures.

**Technical risks:** Storage cannot participate in a PostgreSQL transaction,
so the preparing state is required. Image mutation and deletion paths must
respect preparing references. Finalization must lock membership and handoff
rows so retries cannot duplicate snapshots, membership changes, or kept
recipes.
