# Prevent Duplicate Recipes Within a Household

## Summary

Enforce recipe-core uniqueness when recipes are shared into a household. The first semantic copy shared wins, regardless of owner, recipe ID, import source, or handoff lineage.

## Implementation

- Read the Expo 56 documentation as required before making code changes; no Expo changes are expected.
- Add a follow-on database migration with a `BEFORE INSERT` trigger on `household_recipe_shares`, covering both normal sharing and handoff retention.
- Reuse `private.normalize_recipe_core_json` to compare normalized title, ingredients, and instructions.
- Serialize competing shares using a household-and-normalized-core advisory lock, then reject a matching recipe already shared with that household using SQLSTATE `NM002`.
- Exclude the same recipe ID so repeated sharing remains idempotent.
- Map `NM002` to the existing `409` response: “This recipe is already shared with this household.” No API shape or mobile UI changes are needed.
- Preserve existing duplicates; only new shares are blocked. Unsharing the existing copy allows another equivalent recipe to be shared.

## Tests

- Two owners with equivalent recipes: first share succeeds, second returns the duplicate conflict.
- Different recipe IDs and handoff lineages still collide when their normalized cores match.
- The same recipe can be shared repeatedly without error.
- Equivalent recipes can be shared to different households.
- After unsharing the first copy, the other copy can be shared.
- Handoff Keep/Keep All cannot introduce a duplicate.
- Differing title, ingredient order/content, or instruction order/content remains shareable.
- Run database, backend, frontend regression, typecheck, and lint suites.

## Assumptions

- Enforcement is share-time only; edits to already-shared recipes are unchanged.
- The existing normalization rules define recipe identity.
- Ponytail guided placing one guard at the shared table boundary, avoiding duplicate checks in each caller.
