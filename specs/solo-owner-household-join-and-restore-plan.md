# Solo Owner Household Join and Restore

## Summary

Allow a solo household owner to join one other household as a member while
preserving their owned household. Keep exactly one active membership per user.
The joined household becomes active; leaving it restores the owned household
and opens the Household tab.

Owner-initiated member removal and the recipe-handoff workflow are deferred.

## Implementation Changes

- Add nullable `parked_household_id` to `household_members`, referencing
  `households`.
  - It may be set only on a `member` membership.
  - It must differ from the active `household_id`.
  - Preserve the existing unique index enforcing one membership row per user.
- Update household join RPCs:
  - Users without a household continue joining normally.
  - A solo owner, meaning the household contains only their owner membership,
    may preview and join another household.
  - Joining updates the existing membership to the target household with role
    `member`, saves the owned household in `parked_household_id`, resets
    household-specific activity state, and preserves the original household
    and recipe shares.
  - Revoke the parked household's active invite so nobody can join while its
    owner is away.
  - Reject owners whose household has another member with
    `HOUSEHOLD_HAS_MEMBERS`.
  - Reject joining the owner's own invite.
  - Current members retain the existing `ALREADY_MEMBER` recovery behavior.
- Update leave behavior:
  - Continue removing the departing user's shares from the outgoing household
    while recipe handoff is deferred.
  - When `parked_household_id` exists, update the same membership back to
    that household as `owner`, clear the previous pointer, keep onboarding
    complete, and return `RESTORED`.
  - Without a previous household, delete the membership, clear onboarding
    completion, and return `LEFT`.
- Add `/household/join` to the authenticated Expo Router stack and reuse the
  existing join screen.
  - Household Settings shows **Join another household** only for a solo owner.
  - Explain that the owned household remains saved and returns after leaving.
  - On successful join, clear household, activity, household-recipe, and stale
    recipe-sharing caches, then replace the route with `/household`.
  - On restored leave, refresh the same caches and replace settings with
    `/household`, using Expo Router v56's `router.replace` behavior.
  - Ordinary members without a saved household continue through onboarding
    after leaving.

## Interfaces and Documentation

- Change `DELETE /household` from an empty `204` response to one of:

  ```json
  {
    "status": "RESTORED",
    "household": { "id": "...", "name": "..." }
  }
  ```

  ```json
  {
    "status": "LEFT",
    "household": null
  }
  ```

- Add the corresponding frontend `LeaveHouseholdResult` type.
- Keep join request and successful response shapes unchanged.
- Deploy backend support for both leave statuses before applying the database
  migration, then release the mobile changes.

## Test Plan

- Database tests verify:
  - A solo owner can preview and join another household.
  - The user still has exactly one membership, now as a member, with the owned
    household saved.
  - The original household, recipes, and shares remain stored; its invite is
    revoked.
  - An owner with another member, an existing member, and an owner using their
    own invite cannot switch.
  - Leaving restores the owned household, owner role, onboarding state, and
    active household queries.
  - A member without a previous household retains the existing
    leave-to-onboarding behavior.
  - Failed joins and retries leave membership and invite state atomic.
- Backend tests cover new status mapping and the JSON leave response.
- Frontend tests cover solo-owner visibility, authenticated join routing,
  error copy, cache invalidation, restored-household navigation, and ordinary
  leave-to-onboarding.
- Run database authorization tests, backend tests, frontend functional tests,
  typecheck, and lint.

## Assumptions

- "No member" means the household contains only its owner.
- The parked household is stored but inaccessible until restored.
- There is no household selector and no second active membership.
- Recipe handoff and owner-initiated member removal are deferred.
