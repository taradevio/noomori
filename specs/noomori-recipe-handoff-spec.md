# Noomori — Recipe Handoff on Household Leave

> [Inference]
>
> This specification defines the proposed behavior for recipes shared by a household member when that member leaves the household.
>
> The design intentionally preserves Noomori's current ownership model:
>
> - one user can belong to only one household at a time;
> - every active recipe has exactly one user owner;
> - Noomori does **not** introduce general-purpose recipe ownership transfer;
> - Noomori does **not** introduce household-owned recipes;
> - ownership reassignment exists only as the final result of this specific leave-household handoff flow.

---

## 1. Summary

When a household member leaves a household, recipes that the member previously shared with that household must **not** immediately disappear and must **not** remain coupled to the departing member.

Instead, Noomori must:

1. identify every recipe owned by the departing member that is currently shared with the household being left;
2. create an isolated snapshot of each shared recipe at the moment of leaving;
3. remove the departing member's original recipe from the old household's active shared scope;
4. place the snapshots into a temporary **recipe handoff / review** state associated with the old household;
5. remove the user's membership from the old household immediately;
6. allow the old household owner to review the isolated recipe snapshots;
7. allow the household owner to:
   - keep individual recipes;
   - remove individual recipes;
   - keep all recipes; or
   - remove all recipes;
8. when a recipe is kept, assign the snapshot to the current household owner and make it an ordinary active recipe belonging to that owner and shared with that household;
9. when a recipe is removed, delete or soft-delete only the isolated handoff snapshot;
10. guarantee that any action performed against the handoff snapshot cannot affect:
    - the departing user's original recipe;
    - the departing user's future household;
    - any later copy or share of that recipe.

The core boundary is:

```text
Departing user's recipe lifecycle
            !=
Old household handoff recipe lifecycle
```

Once the leave operation succeeds, the two sides are independent.

---

# 2. Product Goal

The feature exists to solve the following problem:

> A member may contribute useful recipes to a household. If the member later leaves, the household should have a chance to decide which of those contributions are worth retaining without taking control of, mutating, or deleting the departing member's personal data.

The system therefore needs to protect both parties:

### Departing member

The departing member must retain their recipes and must be free to:

- remain solo;
- create another household if supported by the current product flow;
- join another household;
- edit their recipes;
- delete their recipes;
- share the recipes to another household later.

None of those actions may affect the old household's handoff copies.

### Old household

The old household must not immediately lose recipes only because a member leaves.

Its owner must be able to decide whether each previously shared recipe should:

- remain in the household; or
- be discarded from the household.

The old household must never gain authority over the departing member's original recipe.

---

# 3. Terminology

## 3.1 Original recipe

The recipe row owned by the departing member before and after leaving.

Example:

```text
recipe_id = R1
owner_user_id = Tara
```

This row remains the departing user's recipe.

It must never be reassigned during the leave flow.

---

## 3.2 Shared recipe

An original recipe that is currently visible or available within the member's current household.

This specification does not require changing the current sharing model before leave.

---

## 3.3 Handoff snapshot

A new recipe snapshot created when the member leaves.

Example:

```text
original:
R1
owner_user_id = Tara

handoff snapshot:
R2
source_recipe_id = R1
handoff_status = pending
```

R2 must contain a complete copy of the recipe state as it existed at the leave boundary.

R2 is independent from R1 after creation.

---

## 3.4 Recipe handoff

The review workflow created for the old household after a member leaves.

A handoff groups the recipes awaiting a household-owner decision.

Example:

```text
Recipe Handoff
Departed member: Tara
Household: H1

Items:
- Rendang
- Soto Betawi
- Ayam Bakar
```

---

## 3.5 Household owner

The current owner-role member of the household.

The household owner is the only actor permitted to resolve handoff items for MVP.

---

# 4. Core Domain Invariants

These rules must remain true regardless of implementation details.

## 4.1 One active user owner per active recipe

Every ordinary active recipe must have exactly one user owner.

```text
active recipe
→ owner_user_id IS NOT NULL
```

Noomori does not introduce household-owned recipes in this feature.

---

## 4.2 Leaving does not transfer the original recipe

A member leaving a household must never modify:

```text
original_recipe.owner_user_id
```

Example:

```text
Before leave:
R1.owner_user_id = Tara

After leave:
R1.owner_user_id = Tara
```

This remains true whether the old household keeps or removes its handoff snapshot.

---

## 4.3 Handoff snapshots are independent

After snapshot creation:

```text
R1 != R2
```

Changes to either side must never propagate to the other.

Examples:

- edit R1 → R2 unchanged;
- delete R1 → R2 unchanged;
- edit R2 after keep → R1 unchanged;
- delete R2 → R1 unchanged.

---

## 4.4 Leaving membership is not blocked by review

The departing member must be removed from the household immediately after the leave transaction succeeds.

The user must **not** wait for the household owner to review recipes.

Incorrect:

```text
member requests leave
→ waits for owner review
→ membership remains active
```

Correct:

```text
member leaves
→ membership removed
→ household owner reviews later
```

---

## 4.5 Old-household actions cannot affect future households

If the departing member later joins Household B:

```text
Household A handoff snapshot = R2
Departing user's original recipe = R1
```

Then Household A deleting R2 must have no effect on R1 or Household B.

---

## 4.6 Review operates on the leave-time state

The owner must review the recipe exactly as it existed when the member left.

Therefore, handoff snapshots must be created during the leave operation.

The system must not defer copying until the owner presses **Keep**.

Otherwise edits made by the departed user after leaving could incorrectly appear in the old household's review.

---

## 4.7 Handoff is not general ownership transfer

This feature must not introduce:

- manual "transfer recipe ownership";
- owner-to-owner recipe transfer;
- arbitrary member-to-member transfer;
- household ownership transfer logic.

Ownership reassignment occurs only when the household owner explicitly keeps a handoff snapshot.

---

# 5. High-Level Lifecycle

```text
Member owns recipe R1
        │
        │ shares R1 to Household A
        ▼
Household A can access R1
        │
        │ member leaves
        ▼
┌─────────────────────────────────────┐
│ Leave transaction                   │
│                                     │
│ 1. snapshot R1 → R2                 │
│ 2. create handoff item for R2       │
│ 3. remove R1 from Household A scope │
│ 4. remove membership                │
└─────────────────────────────────────┘
        │
        ▼
R1 remains with departing user

R2 becomes pending handoff for Household A
        │
        ├────────── Keep ──────────┐
        │                          │
        │                          ▼
        │                 R2 becomes active
        │                 owner = Household A owner
        │                 visible in Household A
        │
        └──────── Remove ──────────┐
                                   │
                                   ▼
                            R2 deleted /
                            soft-deleted
```

---

# 6. Detailed Leave Flow

Assume:

```text
Household H1

Budi
role = owner

Tara
role = member
```

Tara owns:

```text
R1 = Rendang
R2 = Soto Betawi
R3 = Ayam Bakar
```

All three are shared with H1.

Tara chooses:

```text
Leave household
```

The backend must execute the following as one business operation.

---

## 6.1 Validate membership

Confirm that:

```text
current_user is a member of H1
```

If not:

```text
404 or domain-appropriate error
```

No handoff should be created.

---

## 6.2 Reject unsupported owner-leave path

This specification applies to a **member leaving a household**.

If the current user is the household owner, the request must follow the existing/future owner-leave behavior.

Do not silently apply member handoff semantics to a household owner.

Example:

```text
role = owner
→ return explicit domain error / route to owner-specific flow
```

---

## 6.3 Resolve recipes requiring handoff

Select recipes satisfying all of the following:

```text
recipe.owner_user_id = departing_user_id
AND
recipe is currently shared with H1
AND
recipe is active / not deleted
```

Do not include:

- recipes not shared with H1;
- recipes owned by other users;
- already deleted recipes;
- stale sharing records;
- recipes from another household;
- previously created handoff snapshots.

---

## 6.4 Create one handoff record

Create a handoff associated with:

```text
household_id = H1
departed_user_id = Tara
status = pending
```

Also snapshot display information required for historical UI.

Recommended:

```text
departed_user_display_name_snapshot
```

Do not rely exclusively on access to the departed user's live profile for rendering historical attribution.

---

## 6.5 Snapshot every affected recipe

For every affected original recipe:

```text
original R1
→ snapshot RH1
```

The snapshot must preserve all user-visible recipe data available at the leave moment.

At minimum, copy fields relevant to the current Noomori recipe model, including where applicable:

```text
title
description
image
ingredients
instructions
servings
prep time
cook time
total time
nutrition
source type
source URL
other recipe metadata
```

The exact field list must follow the current recipe schema.

The important rule is:

> The snapshot must be self-contained enough to survive independent deletion or modification of the original recipe.

---

# 7. Provenance Fields

Every handoff snapshot should retain origin metadata.

Recommended conceptual fields:

```text
source_recipe_id
original_owner_user_id
originally_shared_by_user_id
originally_shared_by_name_snapshot
handoff_id
```

These fields are provenance only.

They must **not** be used as authorization for the kept recipe after handoff resolution.

---

# 8. Image and Asset Isolation

Recipe data isolation is incomplete if the snapshot still depends on storage owned exclusively by the departed user.

Example problem:

```text
R1.image_url
→ users/tara/recipes/rendang.jpg

handoff snapshot R2
→ same storage object
```

Later:

```text
Tara deletes R1
→ storage object deleted
→ R2 image breaks
```

This must not happen.

## Required behavior

Any asset whose lifecycle would otherwise follow the original recipe must be isolated for the handoff snapshot.

Possible implementation strategies:

### Preferred MVP strategy

Copy the asset during snapshot creation.

Example:

```text
original:
users/{departing_user_id}/recipes/{original_recipe_id}/image.jpg

handoff:
recipe-handoffs/{handoff_id}/{snapshot_recipe_id}/image.jpg
```

After **Keep**, the asset may remain at that stable location or move to the destination owner's normal recipe path.

### Alternative

Reference-counted shared assets.

This is more complex and is not recommended unless Noomori already has this abstraction.

---

# 9. Remove Original Recipe From Old Household Scope

After successful snapshot creation, the original departing-user recipe must stop being shared with the old household.

Conceptually:

```text
R1
owner = Tara

before:
shared with H1

after:
not shared with H1
```

This guarantees that the old household no longer depends on R1.

The household sees only the isolated handoff representation.

---

# 10. Remove Membership

Only after all required handoff snapshots have been successfully created should the system remove the member from the household.

Conceptually:

```text
DELETE household_members
WHERE household_id = H1
AND user_id = Tara
```

The leave operation is then complete for Tara.

Tara must not retain household access merely because H1 has unresolved recipe reviews.

---

# 11. Transaction Boundary

The critical leave operation must be atomic.

Conceptually:

```text
BEGIN

1. Lock/revalidate household membership.
2. Resolve shared recipes owned by departing member.
3. Create handoff.
4. Create snapshot for every affected recipe.
5. Isolate/copy required assets.
6. Remove original recipe sharing relationships from old household.
7. Remove household membership.

COMMIT
```

If any required operation fails:

```text
ROLLBACK
```

Examples that must not occur:

```text
membership deleted
but snapshots missing
```

or:

```text
half of recipes snapshotted
half still attached to original user
```

The system must leave the domain in either:

```text
A. member still belongs to household and no leave handoff occurred
```

or:

```text
B. member fully left and all affected recipes are isolated
```

Never an intermediate partial state.

---

# 12. No Shared Recipes Edge Case

If the member leaves but has no recipes currently shared with the household:

```text
affected_recipe_count = 0
```

Then:

- do not create an empty handoff unless there is a concrete product reason to preserve leave history;
- remove membership normally;
- complete the leave operation.

Recommended MVP:

```text
0 affected recipes
→ no handoff record
```

---

# 13. Handoff State

Recommended handoff states:

```text
pending
resolved
```

Avoid introducing unnecessary states unless implementation requires them.

A handoff becomes:

```text
resolved
```

when every handoff item has a final decision.

---

# 14. Handoff Item State

Recommended item decisions:

```text
pending
keep
remove
```

Example:

```text
handoff H123

Rendang      keep
Soto         pending
Ayam Bakar   remove
```

Until every item is resolved:

```text
handoff.status = pending
```

Once all items are resolved:

```text
handoff.status = resolved
handoff.resolved_at = now()
```

---

# 15. Review Authorization

For MVP:

```text
only the current owner of the household
can resolve handoff items
```

Do not authorize based solely on:

```text
handoff.initial_owner_user_id
```

The resolving actor should be determined from the household's **current owner role**.

This prevents stale authorization if household ownership mechanics change in the future.

Even though Noomori does not currently support ownership transfer, authorization should still derive from current household state rather than a duplicated permission field where possible.

---

# 16. Keep Behavior

When the household owner chooses **Keep** for a handoff snapshot:

## 16.1 Validate

Confirm:

```text
requesting user is current household owner
handoff belongs to that household
item.status = pending
```

---

## 16.2 Assign recipe ownership

The handoff snapshot becomes an ordinary active recipe.

Example:

```text
before:

snapshot.owner_user_id = NULL or temporary handoff representation
snapshot.handoff_status = pending
```

After Keep:

```text
snapshot.owner_user_id = household_owner_user_id
snapshot.status = active
```

The recipe must now behave exactly like an ordinary recipe owned by the household owner.

---

## 16.3 Share with the same household

The kept recipe must become available to the old household again under its new owner.

Example:

```text
R2
owner = Budi
shared with H1
```

---

## 16.4 Preserve provenance

Keep must not overwrite:

```text
originally_shared_by_user_id
originally_shared_by_name_snapshot
source_recipe_id
```

The UI may later display:

```text
Originally shared by Tara
```

while the current owner remains Budi.

---

## 16.5 No effect on original

Keep must never mutate:

```text
R1.owner_user_id
R1.household association outside current user state
R1.recipe data
```

---

# 17. Remove Behavior

When the household owner chooses **Remove**:

```text
only the handoff snapshot is discarded
```

The original departing-user recipe remains untouched.

Example:

```text
Tara:
R1 Rendang ✅

Household H1 handoff:
R2 Rendang ❌
```

Recommended MVP:

- use soft-delete if Noomori already has a deletion abstraction suitable for this;
- otherwise hard-delete the isolated snapshot and its isolated assets.

Whichever approach is chosen, the deletion must not cascade to:

- `source_recipe_id`;
- departing user's storage assets;
- departing user's future household;
- unrelated recipe copies.

---

# 18. Bulk Actions

The owner review screen must support:

```text
Keep all
Remove all
```

and individual decisions.

Recommended interaction:

```text
Recipes from Tara

[✓] Rendang
[✓] Soto Betawi
[ ] Ayam Bakar

Keep selected
Remove selected

Keep all
Remove all
```

Alternatively, each row may expose explicit Keep/Remove controls.

The final UX can differ, but backend semantics must support both per-item and bulk resolution.

---

# 19. Bulk Keep Semantics

`Keep all` must:

1. resolve only `pending` items;
2. assign each pending snapshot to the current household owner;
3. make each snapshot active;
4. ensure each is shared with the household;
5. preserve provenance;
6. mark each item as `keep`;
7. resolve the handoff if no pending items remain.

The operation should be atomic where practical.

---

# 20. Bulk Remove Semantics

`Remove all` must:

1. resolve only `pending` items;
2. remove/soft-delete each pending snapshot;
3. clean up isolated snapshot assets where safe;
4. mark each item as `remove`;
5. resolve the handoff if no pending items remain.

It must not touch original recipes.

---

# 21. Idempotency

Resolution endpoints must be safe against duplicate client submissions.

Examples:

```text
user taps Keep twice
network retries request
mobile reconnects and retries mutation
```

Expected:

```text
first request:
pending → keep

second identical request:
must not clone again
must not duplicate sharing
must not create another recipe
```

Recommended behavior:

- final decisions are immutable for MVP; or
- repeated identical decisions return the current resource state.

Do not perform destructive duplicate side effects.

---

# 22. Decision Mutability

Recommended MVP:

```text
pending → keep
pending → remove
```

but not:

```text
keep → remove through handoff API
remove → keep
```

After Keep, the recipe is now an ordinary recipe.

If the owner later wants to delete it, use ordinary recipe deletion.

This keeps the handoff workflow one-way and auditable.

---

# 23. Pending Review Default

If the owner does nothing:

```text
recipe remains pending
```

Do not auto-delete.

Destructive action must never be the silent default.

For MVP, do not require automatic expiry.

Future product versions may introduce:

```text
auto-keep after N days
```

but this should not be implemented without an explicit product decision.

---

# 24. Departing User UX

Before leaving, show impact explicitly.

Suggested copy:

```text
Leave {Household Name}?

You shared {N} recipes with this household.

Your recipes will remain in your account. The household
owner will review copies of the recipes you shared and
decide which ones should remain in the household.

Their decision will not affect your recipes.

Cancel
Leave household
```

If:

```text
N = 0
```

the recipe paragraph can be omitted or simplified.

---

# 25. Household Owner UX

After a member leaves and a handoff exists, notify or surface the review.

Suggested UI:

```text
Tara left the household

They shared 8 recipes with this household.
Review which recipes should remain.

Review recipes
```

Review page:

```text
Recipes from Tara

8 recipes need review.

Rendang
Soto Betawi
Ayam Bakar
...

Keep all
Remove all
```

Each recipe should be inspectable before decision if practical.

---

# 26. Attribution UX

If the owner keeps a recipe, preserve historical attribution.

Possible display:

```text
Originally shared by Tara
```

Do not imply that Tara still belongs to the household.

Do not make the attribution a live profile link unless the departed user's privacy/access model explicitly permits it.

Use a display-name snapshot for stable historical rendering where appropriate.

---

# 27. Data Model Direction

The exact schema should follow the current Noomori implementation, but conceptually the feature requires separate handoff records.

Recommended shape:

```sql
recipe_handoffs
---------------
id uuid primary key
household_id uuid not null
departed_user_id uuid
departed_user_display_name_snapshot text
status text not null
created_at timestamptz not null
resolved_at timestamptz null
```

Recommended constraints:

```text
status IN ('pending', 'resolved')
```

---

## 27.1 Handoff items

```sql
recipe_handoff_items
--------------------
id uuid primary key
handoff_id uuid not null
snapshot_recipe_id uuid not null
source_recipe_id uuid null
decision text not null
decided_at timestamptz null
decided_by_user_id uuid null
created_at timestamptz not null
```

Recommended constraint:

```text
decision IN ('pending', 'keep', 'remove')
```

Recommended uniqueness:

```text
UNIQUE(handoff_id, snapshot_recipe_id)
```

Potential additional protection:

```text
UNIQUE(handoff_id, source_recipe_id)
```

where compatible with nullable semantics and the chosen database design.

---

# 28. Snapshot Representation Options

Two implementation approaches are acceptable.

## Option A — snapshot is already a recipe row

Create a new `recipes` row at leave time.

While pending:

```text
owner_user_id = NULL
handoff-only state
```

Then on Keep:

```text
owner_user_id = current household owner
recipe becomes active
```

This is straightforward if the recipe schema can temporarily represent a recipe with no ordinary owner.

However, it may violate the current invariant that every recipe must have an owner.

---

## Option B — dedicated handoff snapshot payload

Store copied recipe data in:

```text
recipe_handoff_items.snapshot
```

or a dedicated snapshot table.

On Keep:

```text
create a new ordinary recipe row
from immutable snapshot data
```

This preserves:

```text
every recipe row always has an owner
```

If Noomori's current database strongly requires `recipes.owner_user_id NOT NULL`, **Option B is safer**.

---

# 29. Recommended Schema Strategy

Given the stated domain goal:

```text
every active recipe has one user owner
```

the cleanest approach is:

```text
original recipe
→ remains ordinary recipe owned by departing user

handoff snapshot
→ stored outside ordinary active recipes while pending

Keep
→ creates ordinary recipe owned by household owner

Remove
→ deletes handoff snapshot
```

This avoids temporarily introducing ownerless recipe rows.

Conceptually:

```text
recipe_handoff_items
- id
- handoff_id
- source_recipe_id
- snapshot_payload jsonb
- snapshot_image_path
- decision
- decided_at
- decided_by_user_id
```

On Keep:

```text
snapshot_payload
→ CreateRecipe
→ new recipe row
→ owner_user_id = household owner
→ shared with old household
```

This also makes the isolation boundary extremely explicit.

---

# 30. Snapshot Payload Requirements

If using JSON/JSONB snapshot storage, snapshot data must be versionable.

Recommended:

```text
snapshot_schema_version = 1
```

Example conceptual payload:

```json
{
  "schema_version": 1,
  "title": "Rendang",
  "description": "...",
  "ingredients": [],
  "instructions": [],
  "servings": 4,
  "prep_time_minutes": 30,
  "cook_time_minutes": 180,
  "total_time_minutes": 210,
  "source_type": "manual",
  "source_url": null
}
```

Do not store only partial display data.

The payload must contain enough information to recreate the kept recipe independently.

---

# 31. Source Metadata

When a kept recipe is materialized, preserve relevant import/source metadata where safe.

Example:

```text
source_type
source_url
```

But distinguish:

```text
recipe content source
```

from:

```text
handoff provenance
```

Do not overload `source_type` with handoff semantics.

Use separate provenance fields where needed.

---

# 32. API Direction

Exact route names may follow Noomori's current conventions.

Conceptual endpoints:

```text
POST /household/leave
GET  /household/recipe-handoffs
GET  /household/recipe-handoffs/{handoff_id}
POST /household/recipe-handoffs/{handoff_id}/items/{item_id}/keep
POST /household/recipe-handoffs/{handoff_id}/items/{item_id}/remove
POST /household/recipe-handoffs/{handoff_id}/keep-all
POST /household/recipe-handoffs/{handoff_id}/remove-all
```

Do not expose the departed user's original recipe mutation through these endpoints.

---

# 33. Leave Response

The leave response may include:

```json
{
  "left_household": true,
  "handoff_created": true,
  "handoff_recipe_count": 3
}
```

For zero shared recipes:

```json
{
  "left_household": true,
  "handoff_created": false,
  "handoff_recipe_count": 0
}
```

The client should not require handoff resolution to continue onboarding/navigation.

---

# 34. Permissions

## Departing member

After leave:

```text
can access original recipe        = yes
can edit original recipe          = yes
can delete original recipe        = yes

can access old household          = no
can resolve old handoff           = no
can edit old handoff snapshot     = no
can delete old handoff snapshot   = no
```

---

## Current old-household owner

```text
can list pending handoffs       = yes
can inspect handoff snapshots   = yes
can keep                        = yes
can remove                      = yes
can keep all                    = yes
can remove all                  = yes
```

---

## Other household member

Recommended MVP:

```text
can resolve handoff             = no
```

Whether they may view pending handoff content is a product decision.

Safer MVP:

```text
only household owner sees pending review
```

Kept recipes become normally visible according to existing household rules.

---

# 35. Security Requirements

Authorization must be checked server-side for every resolution request.

Never trust client-supplied:

```text
owner_user_id
household_id
departed_user_id
destination owner
```

The backend must derive:

```text
current user
current household membership
current household owner
handoff household
```

from authenticated and authoritative database state.

---

# 36. RLS Requirements

If Supabase RLS protects these tables, policies must ensure:

### Handoff

Only authorized household users may read according to the chosen UX.

Recommended MVP:

```text
household owner → select
others          → no select
```

### Handoff mutation

Only the current household owner may resolve.

### Departed user

The departed user must not regain visibility merely because:

```text
departed_user_id = auth.uid()
```

That field is provenance, not authorization.

---

# 37. Race Conditions

## 37.1 Member edits recipe while leaving

The leave transaction must establish a deterministic snapshot point.

Recommended:

- lock/re-read recipe rows during leave; or
- rely on transaction isolation appropriate to the current backend/database.

The snapshot must reflect one coherent committed recipe state.

---

## 37.2 Member deletes recipe concurrently with leave

The transaction must resolve deterministically.

Acceptable outcomes:

```text
A. delete commits first
→ deleted recipe is not handed off
```

or:

```text
B. leave snapshot commits first
→ snapshot survives independently
→ later original delete does not affect snapshot
```

Do not allow partial/corrupt snapshot data.

---

## 37.3 Owner resolves while another owner action retries

Resolution must be idempotent.

Only one final decision should win.

---

# 38. User Joins Another Household Immediately

This must be supported.

Example:

```text
T0 Tara leaves H1
T1 Tara joins H2
T2 Budi reviews H1 handoff
```

At T2:

```text
Budi Keep/Delete
```

must not inspect or mutate H2.

The handoff is permanently scoped to:

```text
old household H1
```

---

# 39. Same Recipe Shared Again

Suppose Tara leaves H1, then later somehow rejoins H1 and shares the original recipe again.

The old handoff copy and newly shared recipe must be treated as separate lineage events.

Do not automatically merge them.

Future deduplication can be considered separately.

---

# 40. Multiple Leave/Rejoin Cycles

Each leave event should generate a distinct handoff if there are affected recipes.

Example:

```text
handoff HOFF1
created on first leave

handoff HOFF2
created on second leave
```

Do not append new snapshots into an already resolved historical handoff.

---

# 41. Deleted User Account

If the departed user deletes their account before the old owner resolves the handoff:

```text
handoff must remain valid
```

This is another reason to snapshot:

- recipe content;
- display name/provenance where desired;
- assets.

Do not require the original user account to exist in order to keep the recipe.

Foreign-key behavior must account for this.

Possible strategy:

```text
departed_user_id nullable / ON DELETE SET NULL
originally_shared_by_name_snapshot retained
```

Exact FK policy should follow Noomori's account-deletion model.

---

# 42. Original Recipe Deleted Before Review

Example:

```text
Tara leaves H1
snapshot created

Tara deletes R1
```

Expected:

```text
handoff snapshot remains intact
```

Owner can still:

```text
Keep
or
Remove
```

No dependency on R1 is allowed after leave commit.

---

# 43. Kept Recipe Deleted Later

After owner keeps R2:

```text
R2 becomes ordinary recipe owned by Budi
```

Any later deletion must use the normal recipe deletion flow.

The handoff record remains historical and should not attempt to recreate R2.

---

# 44. Owner Leaves Before Review

Noomori currently does not implement general ownership transfer according to the current product assumptions.

Therefore this edge case should follow whatever owner-leave behavior the app already supports or will define separately.

Do not build speculative ownership-transfer logic into this feature.

The only requirement here is:

> handoff authorization must derive from authoritative current household ownership state rather than assuming the original owner forever.

---

# 45. Notification Direction

When a handoff is created, the household owner may receive an activity/push notification.

Suggested semantic event:

```text
household_recipe_handoff_created
```

Suggested copy:

```text
Tara left your household
Review 8 recipes they shared.
```

Notification failure must not fail the leave transaction.

Notification is side-effect delivery, not core data consistency.

---

# 46. Activity Feed Direction

If Noomori exposes household activity:

Possible event:

```text
Tara left the household.
8 shared recipes need review.
```

Do not expose private data beyond existing household activity rules.

---

# 47. Analytics / Observability

Recommended events/logs:

```text
household_leave_started
household_leave_completed
recipe_handoff_created
recipe_handoff_item_kept
recipe_handoff_item_removed
recipe_handoff_resolved
recipe_handoff_failed
```

Useful metadata:

```text
household_id
handoff_id
recipe_count
decision counts
```

Avoid logging full recipe content.

---

# 48. Failure Handling

## Snapshot creation failure

Result:

```text
leave fails
membership remains
```

The user should receive a retryable error.

---

## Asset-copy failure

If the asset is required for an independent snapshot:

```text
leave transaction must fail
```

unless Noomori deliberately supports snapshot creation without the asset.

Do not silently create a broken handoff recipe.

---

## Notification failure

Result:

```text
leave still succeeds
handoff still succeeds
notification may retry independently
```

---

# 49. UI Loading / Error States

Owner handoff screen should handle:

```text
loading
empty
loaded
partial decisions
error
```

If a resolution mutation fails:

- keep the item in its prior state;
- show retry feedback;
- do not optimistically mark it final unless rollback is reliable.

---

# 50. Confirmation for Remove All

Because `Remove all` is destructive, show confirmation.

Example:

```text
Remove all 8 recipes?

These copies will be removed from this household.
This will not delete Tara's recipes.

Cancel
Remove all
```

---

# 51. Confirmation for Keep All

Keep All is not destructive to the departing user.

A confirmation is optional.

If ownership reassignment has meaningful implications for the current owner's library, the UI should explain that the recipes will become part of the owner's recipes for this household.

---

# 52. Expected Recipe Ownership After Keep

Example:

Before:

```text
Tara owns R1
R1 shared with H1
```

After Tara leaves:

```text
Tara owns R1

handoff snapshot S1
pending for H1
```

Budi keeps S1:

```text
Tara owns R1

Budi owns R2
R2 created from S1
R2 shared with H1
```

Important:

```text
R1.id != R2.id
```

and:

```text
R1 lifecycle != R2 lifecycle
```

---

# 53. Expected Recipe State After Remove

Before:

```text
Tara owns R1
handoff snapshot S1 pending
```

Budi removes S1:

```text
Tara owns R1
S1 deleted/archived
no retained recipe in H1
```

No mutation of R1.

---

# 54. Regression Requirements

This feature must not break:

- ordinary recipe creation;
- personal recipe editing;
- recipe deletion;
- sharing while user is still a member;
- household recipe visibility;
- join-household flow;
- solo-user behavior;
- import-from-text;
- import-from-URL;
- manually created recipes;
- recipe images;
- existing idempotency behavior;
- notification behavior unrelated to handoff.

---

# 55. Backend Test Matrix

At minimum, implement tests for the following.

## Leave behavior

```text
1. member leaves with zero shared recipes
2. member leaves with one shared recipe
3. member leaves with many shared recipes
4. non-member cannot leave arbitrary household
5. owner does not accidentally enter member-leave flow
```

## Snapshot integrity

```text
6. snapshot copies all required fields
7. snapshot preserves ingredients
8. snapshot preserves instructions
9. snapshot preserves times
10. snapshot preserves servings
11. snapshot preserves source metadata
12. snapshot preserves attribution
13. snapshot asset remains valid after original deletion
```

## Isolation

```text
14. editing original after leave does not change snapshot
15. deleting original after leave does not delete snapshot
16. keeping snapshot does not mutate original
17. deleting kept copy does not mutate original
18. removing snapshot does not mutate original
```

## Authorization

```text
19. household owner can review
20. ordinary member cannot resolve
21. departed member cannot resolve
22. unrelated user cannot read/resolve
23. unrelated household owner cannot resolve
```

## Keep

```text
24. keep creates active recipe for current household owner
25. kept recipe is visible in correct household
26. kept recipe preserves provenance
27. keep is idempotent
28. repeated keep does not duplicate recipe
```

## Remove

```text
29. remove deletes only snapshot
30. remove does not delete source recipe
31. remove is idempotent
```

## Bulk

```text
32. keep all resolves every pending item
33. remove all resolves every pending item
34. bulk actions do not reprocess resolved items
35. mixed individual + bulk decisions behave correctly
```

## Handoff status

```text
36. handoff remains pending while one item is pending
37. handoff resolves when all items resolved
38. resolved handoff cannot create duplicate recipes
```

## Cross-household isolation

```text
39. departed user joins H2 before H1 review
40. H1 keep does not affect H2
41. H1 remove does not affect H2
42. original recipe can be shared in H2 independently
```

## Failure/transaction

```text
43. snapshot failure rolls back membership deletion
44. asset-copy failure rolls back leave if required
45. partial snapshot creation rolls back
46. notification failure does not roll back successful leave
```

---

# 56. Frontend Test Matrix

At minimum:

```text
1. leave confirmation shows shared recipe count
2. leave with zero recipes renders correct copy
3. successful leave navigates user out of old household state
4. owner sees pending review entry
5. review screen lists correct recipes
6. owner can inspect recipe before deciding
7. keep one updates item correctly
8. remove one updates item correctly
9. keep all works
10. remove all shows destructive confirmation
11. resolved handoff disappears from pending list
12. network failure keeps item retryable
13. duplicate taps do not create duplicate visible recipes
```

---

# 57. Acceptance Criteria

The feature is complete only when all of the following are true.

### Departing member

- [ ] Can leave immediately without waiting for owner review.
- [ ] Keeps all original recipes.
- [ ] Can modify/delete originals after leaving.
- [ ] Can join/use another household independently.
- [ ] Is never affected by old-household handoff decisions.

### Old household

- [ ] Does not instantly lose previously shared recipes without review.
- [ ] Receives isolated recipe snapshots.
- [ ] Owner can keep/remove recipes individually.
- [ ] Owner can keep all.
- [ ] Owner can remove all.
- [ ] Kept recipes become active recipes owned by the household owner.
- [ ] Removed snapshots disappear only from the old household workflow.
- [ ] Historical attribution can be preserved.

### Data integrity

- [ ] Snapshot is captured at leave time.
- [ ] Snapshot survives original recipe deletion.
- [ ] Snapshot assets do not depend on departing-user deletion.
- [ ] Leave operation is atomic.
- [ ] No partial handoff can result from transaction failure.
- [ ] Resolution is idempotent.
- [ ] Cross-household mutation is impossible.

---

# 58. Non-Goals

Do **not** add the following as part of this feature:

- general recipe ownership transfer;
- household-owned recipes;
- recipe co-ownership;
- multi-owner recipes;
- automatic synchronization after leave;
- recipe merging;
- automatic deduplication;
- cross-household recipe links;
- owner-approval requirement before a member may leave;
- automatic destructive expiry of pending handoffs;
- arbitrary member ability to claim another member's recipe.

---

# 59. Recommended Naming

Internally, prefer:

```text
Recipe Handoff
Recipe Handoff Item
Pending Handoff
```

or:

```text
Recipe Retention Review
```

Avoid:

```text
Recipe Request
```

because the household owner is not requesting the original recipe from the departed user.

The owner is reviewing an already-isolated household snapshot.

---

# 60. Final Domain Rule

The feature can be summarized by this rule:

> When a household member leaves, every recipe they currently share with that household is snapshotted at the leave boundary and isolated from the departing user's original recipe. The user's membership is removed immediately. The old household owner may later keep or remove each isolated snapshot. Keeping creates an ordinary recipe owned by the household owner and available to the old household. Removing discards only the isolated snapshot. Neither decision may modify, delete, or otherwise affect the departing user's original recipe or any household the departing user subsequently joins.

Short form:

```text
Leave
→ Snapshot
→ Isolate
→ Remove membership
→ Owner reviews
   ├── Keep   → new owner = old household owner
   └── Remove → discard isolated snapshot
```

The most important invariant is:

```text
Old household decision
        NEVER
mutates departing user's recipe.
```
