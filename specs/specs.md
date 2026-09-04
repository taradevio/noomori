# Recipe App — User Journey & Screen Specifications

> This document is implementation-oriented.
>
> It defines user journeys, screen behavior, states, validation, permission-aware actions, and acceptance criteria for the current recipe + household MVP.
>
> Features visible in competitor references are **not** automatically product requirements.

---

# 1. Product Rules

These rules apply across all journeys.

## R1 — Personal-first

A user can use the recipe app without creating or joining a household.

## R2 — Explicit sharing

A personal recipe must not become household-visible without an explicit sharing action.

## R3 — Shared state is visible

A shared recipe must display a textual/icon state such as `Shared` or the household name.

## R4 — Role-aware household UI

Owner-only household administration:

- edit household name;
- generate join code;
- regenerate/revoke join code;
- remove member;
- delete household.

Members must not be presented with these controls as if they were available.

## R5 — Backend authorization

Client-side permission hiding is not authorization. Every protected mutation must be validated server-side.

## R6 — Recipe readability

Ingredients and directions must remain usable at large text sizes and on compact phones.

## R7 — No feature leakage from references

Do not implement:

- AI generation;
- meal planning;
- nutrition journal;
- grocery list;
- social import;
- discovery feed;
- premium screen;

unless they are separately added to product scope.

---

# 2. Permission Matrix

| Capability | Owner | Member |
|---|---:|---:|
| View household | Yes | Yes |
| View members | Yes | Yes |
| View shared recipes | Yes | Yes |
| Add/edit recipes | Yes | Yes |
| Delete recipes | Yes | Yes |
| Create/manage cookbooks | Yes | Yes |
| Edit household name | Yes | No |
| Generate join code | Yes | No |
| Regenerate/revoke join code | Yes | No |
| Remove member | Yes | No |
| Delete household | Yes | No |

The matrix is the source of truth for **screen visibility**, except where a backend-specific ownership rule is still unresolved.

---

# 3. Global Screen States

Every data-backed screen must have:

1. loading;
2. success;
3. empty;
4. recoverable error.

Every async mutation must have:

1. idle;
2. submitting;
3. success;
4. failure.

Do not allow duplicate submissions while submitting.

---

# 4. Navigation Model

Primary bottom navigation:

- Recipes
- Household
- Profile

Global recipe creation:

- FAB `+` → New Recipe

Navigation behavior:

```text
Recipes → Recipe Detail → Edit Recipe
Recipes → Cookbooks → Cookbook Detail → Recipe Detail

Household → Shared Recipes → Recipe Detail
Household → Members
Household → Household Settings [owner only]

Profile → Account / App Settings
```

---

# 5. Journey J01 — First Launch and Authentication

## Goal

The user enters the product with minimal friction.

## Entry conditions

- app installed/opened;
- no valid authenticated session.

## Screens

- S01 Welcome / Authentication.

## Primary path

1. User opens app.
2. Brand and value proposition are shown.
3. User chooses an available sign-in/sign-up method.
4. Authentication succeeds.
5. App creates/loads the account.
6. User lands on S02 Personal Recipe Library.

## UX requirements

- Household setup is **not** mandatory.
- Do not show meal planning, AI, or premium onboarding.
- Keep marketing copy short.
- Authentication method labels must be explicit.
- Loading must occur inside the selected auth action where possible.

## Error states

### Authentication cancelled

- remain on S01;
- no scary error;
- allow retry.

### Authentication failed

Show concise inline message:

`We couldn't sign you in. Try again.`

### Network unavailable

Show:

`You're offline. Connect to the internet and try again.`

## Acceptance criteria

- [ ] User can reach authentication from first launch.
- [ ] Successful authentication lands on Recipes.
- [ ] Household setup is optional.
- [ ] Failed authentication does not navigate away.
- [ ] Buttons cannot be double-submitted.
- [ ] Error state is readable and actionable.

---

# 6. Journey J02 — Browse Personal Recipes

## Goal

The user sees their recipe library and can open a recipe quickly.

## Entry conditions

- authenticated user;
- user opens Recipes tab.

## Screens

- S02 Personal Recipe Library.

## Primary path

1. User opens Recipes.
2. App loads personal recipes.
3. User scrolls recipe cards.
4. User taps a recipe.
5. App opens S05 Recipe Detail.

## Screen layout

```text
Top app bar
  Recipes                         [Profile]

Search recipes

[Recipes] [Cookbooks]

Recipe grid
┌────────────┐ ┌────────────┐
│ image      │ │ image      │
│ title      │ │ title      │
│ metadata   │ │ Shared     │
└────────────┘ └────────────┘

                              [+]
Bottom navigation
```

## Recipe-card content

Required:

- title.

Recommended when available:

- image;
- cooking time;
- shared badge.

Optional:

- cookbook context.

Do not fill missing metadata with fake placeholders.

## Empty state

Headline:

`Your recipes will live here.`

Primary CTA:

`Add your first recipe`

## Loading

Use card skeletons preserving the final grid geometry.

## Failure

Inline full-content-state error:

`Couldn't load your recipes.`

Action:

`Try again`

## Acceptance criteria

- [ ] Recipe list loads without blocking bottom navigation.
- [ ] Recipe card opens the correct recipe.
- [ ] Shared recipe is visibly marked.
- [ ] Empty library provides Add Recipe CTA.
- [ ] Loading uses skeleton or equivalent stable layout.
- [ ] Error state has retry.
- [ ] FAB does not overlap content or navigation.

---

# 7. Journey J03 — Search Personal Recipes

## Goal

The user finds a recipe by text.

## Entry conditions

- user is on S02;
- recipe library may contain zero or more recipes.

## Primary path

1. User focuses search.
2. User enters a query.
3. Results update after a short debounce.
4. User selects a result.
5. Recipe detail opens.

## Search fields

Search at minimum:

- recipe title.

Optional only if backend already supports it:

- ingredients;
- cookbook name.

Do not visually promise full-text fields that are not indexed.

## States

### Query empty

Show normal library.

### No match

Headline:

`No recipes found`

Supporting copy:

`Try a different name or keyword.`

Do not show the empty-library CTA in this state.

### Search failure

Show retry without deleting the user's query.

## Back behavior

When returning from Recipe Detail:

- preserve query;
- preserve scroll position when feasible.

## Acceptance criteria

- [ ] Search input is clearable.
- [ ] Empty query restores normal library.
- [ ] No-result state differs from empty-library state.
- [ ] Opening/returning preserves search context.
- [ ] Search does not fire a request for every keystroke without debounce when remote.

---

# 8. Journey J04 — Browse and Manage Cookbooks

## Goal

The user groups recipes into optional collections.

## Screens

- S03 Cookbooks;
- S04 Cookbook Detail.

## Entry

S02 segmented view → `Cookbooks`.

## Cookbook list

Each card shows:

- cover/collage;
- title;
- recipe count.

System/default collection:

`Uncategorized`

Use it for recipes not assigned to another cookbook if the data model supports that concept.

## Create cookbook

Entry points:

- `+` inside Cookbooks view; or
- overflow/action near Cookbooks heading.

Form:

- cookbook name;
- optional cover behavior generated from member recipe images.

Do not require a separate uploaded cover for MVP.

## Cookbook detail

Contains:

- back;
- title;
- count;
- recipe list/grid;
- search/filter if useful;
- `Add recipe` action.

## Rename

Accessible via overflow.

## Delete

Requires confirmation.

### Unresolved behavior

The source material does not define what happens to recipes when a cookbook is deleted.

The implementation must not silently delete recipes with the cookbook.

Recommended product decision to confirm separately:

- delete the collection only;
- keep recipes in the personal library.

## Acceptance criteria

- [ ] User can switch between Recipes and Cookbooks.
- [ ] User can open a cookbook.
- [ ] Cookbook card displays recipe count.
- [ ] User can create and rename a cookbook.
- [ ] Delete requires confirmation.
- [ ] Recipe data is not implicitly destroyed without an explicit product rule.

---

# 9. Journey J05 — View Recipe Detail

## Goal

The user can understand and cook a recipe comfortably.

## Screens

- S05 Recipe Detail.

## Entry points

- personal recipe card;
- cookbook recipe card;
- household shared recipe card;
- search result.

## Page structure

```text
[Back]                       [More]
┌─────────────────────────────────┐
│          Recipe image           │
└─────────────────────────────────┘

Recipe title

[Shared · Household Name]    optional

Servings · Prep · Cook

[Edit] [Share / Shared]

Ingredients
[-] 4 [+] servings          [Metric]

Ingredient group
  quantity  ingredient
  quantity  ingredient

Directions
1. ...
2. ...
3. ...
```

## Hero

- crop with cover behavior;
- no distortion;
- provide neutral fallback when absent.

## Metadata

Only show known values.

Do not display:

- `0 min`;
- `N/A`;
- empty pill placeholders.

## Shared state

Personal recipe:

- no prominent personal badge required;
- `Share to household` action when household exists and sharing is allowed.

Shared recipe:

- show `Shared`;
- optionally include household name.

## More menu

Potential actions according to capability:

- edit;
- delete;
- cookbook management;
- sharing action.

Avoid duplicating the same action in both the visible row and overflow unless necessary.

## Acceptance criteria

- [ ] Recipe title and image are prominent.
- [ ] Ingredients are readable without entering another page.
- [ ] Directions appear after ingredients.
- [ ] Unknown metadata is omitted.
- [ ] Shared state is explicit.
- [ ] Back returns to previous context.
- [ ] Edit action respects capability.

---

# 10. Journey J06 — Adjust Servings

## Goal

The user changes ingredient quantities for a different serving count.

## Entry conditions

- S05 Recipe Detail;
- recipe has a defined base serving count and scalable quantities.

## Primary path

1. User taps `+` or `-`.
2. Serving count changes.
3. Scalable quantities update immediately.
4. Unit display remains in the currently selected unit mode.
5. User continues reading recipe.

## Rules

### Base model

Each scalable quantity should derive from:

```text
display_quantity =
original_quantity × selected_servings / original_servings
```

The UI must not repeatedly rescale already-rounded display values.

### Non-scalable ingredient text

Examples:

- `salt to taste`;
- `1 pinch`;
- text with no parsed numeric value.

If reliable scaling is not available:

- preserve original text;
- do not invent a converted number.

### Minimum

Default minimum:

`1 serving`

unless the recipe model defines otherwise.

Minus is disabled at minimum.

### Fraction/display formatting

Prefer human-readable output.

Examples:

- `0.5 cup` may render as `1/2 cup` if fraction formatting exists;
- avoid long floating values such as `0.6666667 cup`.

## Error behavior

Scaling is local/display logic and should not require a network mutation.

If stored base data is invalid:

- preserve original ingredient text;
- keep the screen usable.

## Acceptance criteria

- [ ] `+` increases serving count.
- [ ] `-` decreases serving count until minimum.
- [ ] Ingredient quantities derive from original values.
- [ ] Repeated changes do not accumulate rounding error.
- [ ] Unsupported quantities remain readable.
- [ ] Serving control has 48 dp touch targets.

---

# 11. Journey J07 — Convert Units

## Goal

The user reads ingredients in the unit system they understand.

## Screens

- S05 Recipe Detail;
- S06 Unit Selector bottom sheet.

## Primary path

1. User taps unit selector.
2. Bottom sheet opens.
3. Options appear:
   - Original;
   - Metric;
   - Imperial.
4. User selects an option.
5. Sheet closes.
6. Convertible quantities update.

## Original

Means:

`Use the recipe's saved units and wording.`

## Metric

Examples:

- g;
- kg;
- ml;
- l.

## Imperial

Examples:

- oz;
- lb;
- tsp;
- tbsp;
- cup.

## Conversion rules

The UX must distinguish:

- weight;
- volume;
- count/non-convertible quantity.

Do not convert a volume to weight without ingredient density data.

Bad:

`1 cup flour → 236.6 g`

unless the application explicitly has flour-density knowledge.

Safe:

- volume → volume;
- weight → weight;
- count stays count.

## Mixed/free-text ingredient

If a reliable conversion is unavailable:

- preserve original unit/quantity;
- do not hide the ingredient.

## Selection state

Selected option displays:

- check mark;
- stronger label/surface.

## Acceptance criteria

- [ ] Unit selector opens as a bottom sheet.
- [ ] Current selection is visible.
- [ ] Selecting a unit updates convertible rows.
- [ ] Unsupported rows remain unchanged.
- [ ] Conversion never silently converts volume to mass without data.
- [ ] Original restores saved values.

---

# 12. Journey J08 — Add Recipe Manually

## Goal

The user creates a recipe without needing an import or AI workflow.

## Screen

- S07 Recipe Editor.

## Entry points

- Recipes FAB;
- empty-library CTA;
- Cookbook Detail `Add recipe`;
- Household empty shared-library `Add new recipe`, if supported.

## Required minimum data

At least:

- recipe title.

Recommended domain validation:

- require at least one ingredient **or** one direction step before final save;

but do not block drafts unless a draft model exists.

If no draft support exists, define a clear minimum and show errors inline.

## Editor sections

### Photo

- optional;
- add/replace/remove.

### Basic

- title;
- optional description.

### Metadata

- servings;
- prep time;
- cook time.

### Ingredients

Support:

- ingredient row;
- quantity;
- unit;
- ingredient name;
- preparation note;
- optional group heading.

### Directions

- ordered steps;
- add;
- edit;
- delete;
- reorder if available.

### Organization

- cookbook selection.

### Sharing

Default:

`Personal`

If user is in a household:

- allow explicit `Share with household`.

Do not default to shared.

## Save

Primary CTA:

`Save recipe`

While saving:

- disable duplicate save;
- show progress;
- preserve user-entered content on failure.

## Validation

Title missing:

`Add a recipe title.`

Malformed numeric metadata:

Use inline validation.

Ingredient parser failure:

Do not reject a human-readable ingredient solely because it cannot be parsed into structured quantity/unit fields.

## Successful save

1. persist recipe;
2. show `Recipe saved`;
3. navigate to Recipe Detail.

## Acceptance criteria

- [ ] New recipes default to personal.
- [ ] Recipe can be created without AI/import.
- [ ] Save cannot double-submit.
- [ ] Failed save preserves entered content.
- [ ] Field errors are inline.
- [ ] Ingredient free text is not lost because parsing fails.
- [ ] Successful save opens the saved recipe.

---

# 13. Journey J09 — Edit Recipe

## Goal

The user modifies an existing recipe.

## Entry

Recipe Detail → `Edit`.

## Screen

S07 Recipe Editor in edit mode.

## Primary path

1. User opens Edit.
2. Existing data is prefilled.
3. User changes fields.
4. User taps Save.
5. Mutation succeeds.
6. Recipe Detail updates.

## Unsaved changes

If user navigates back after modification:

Dialog:

`Discard changes?`

Actions:

- `Keep editing`;
- `Discard`.

Do not show this dialog when nothing changed.

## Conflict behavior

If concurrent household editing is possible, backend behavior must be defined.

At minimum:

- do not silently overwrite known version conflicts;
- show a recoverable message if server rejects stale data.

## Acceptance criteria

- [ ] Existing values prefill correctly.
- [ ] Save updates detail screen.
- [ ] Back with unsaved changes prompts.
- [ ] Back without changes exits immediately.
- [ ] Failed save preserves edits.
- [ ] Unauthorized edit cannot be submitted successfully.

---

# 14. Journey J10 — Delete Recipe

## Goal

Remove a recipe with explicit confirmation.

## Entry

Recipe Detail → overflow → Delete.

## Confirmation

Title:

`Delete recipe?`

Body must name the consequence.

Actions:

- `Cancel`;
- `Delete`.

## Critical unresolved rule

The provided role matrix says both owner and member can delete recipes, but it does not define the relationship between:

- personal recipe ownership;
- household sharing;
- permanent deletion.

Before backend implementation, choose one:

### Option A — Remove household share

Deleting from Household removes the household association while preserving the creator's personal recipe.

### Option B — Permanent shared deletion

Any authorized household member can permanently delete the shared recipe.

### Option C — Mixed ownership

Members can remove recipes they created; household owner may manage all; other recipes can only be unshared.

Do not silently pick one in data-layer implementation.

## Acceptance criteria

- [ ] Delete requires confirmation.
- [ ] Cancel performs no mutation.
- [ ] Delete shows progress.
- [ ] Failure keeps the recipe accessible.
- [ ] Final behavior matches the explicitly chosen shared-delete rule.

---

# 15. Journey J11 — Create Household

## Goal

The user creates a shared recipe space.

## Entry

Household tab when user has no household → `Create household`.

## Screen

S09 Create Household.

## Fields

- household name.

Validation:

- required;
- trim leading/trailing whitespace;
- length limit defined by backend/product.

## Primary path

1. Enter name.
2. Tap `Create household`.
3. Request succeeds.
4. Current user becomes Owner.
5. Navigate to active Household.
6. Show empty shared recipe state.

## After creation

Offer invitation as a clear next step, but do not force it.

Possible secondary action:

`Invite members`

## Acceptance criteria

- [ ] Create Household is accessible from empty household state.
- [ ] Name is required.
- [ ] Duplicate submissions are prevented.
- [ ] Creator receives Owner UI.
- [ ] User lands in active Household after success.
- [ ] User can defer invitation.

---

# 16. Journey J12 — Join Household

## Goal

The user joins an existing household with an owner-generated code.

## Entry

Household empty state → `Join household`.

## Screen

S10 Join Household.

## Input

- six-digit numeric join code.

Recommended behavior:

- allow typing and paste;
- accept spaces and hyphens, then normalize to exactly six digits;
- preserve leading zeroes;
- show a numeric keyboard;
- do not auto-submit after the sixth digit.

## Primary path

1. Enter code.
2. Tap `Continue`.
3. Server validates the invite without consuming it or creating membership.
4. Show a safe preview containing household name, owner display name, and member count.
5. User verifies the household and taps `Join household`.
6. Server locks the caller profile and checks existing membership before looking up the submitted code.
7. If membership already exists, return the canonical membership so a retry after a lost success response can recover without requiring the deleted code.
8. Otherwise, the server checks the shared concurrency-safe attempt limiter, revalidates the invite, atomically creates Member membership, updates existing profile/onboarding state, and deletes the consumed code row.
9. Expected invalid/expired and rate-limited results commit their limiter updates; they are returned as statuses rather than database exceptions.
10. Refresh household/profile state and navigate to household shared recipes.

Leaving the preview or choosing `Use a different code` must not consume the invite or change membership.

## Error states

### Invalid, expired, revoked, or consumed code

`This invite code is invalid or has expired.`

`Ask the household owner for a new code.`

### Already member

`You're already part of a household.`

The client refreshes canonical household/profile state. It must not claim that the submitted code matched a previously consumed code because MVP stores no redemption history.

## Security and recovery invariants

- Preview and Join share one database-backed limiter row per authenticated user.
- Limiter rows are created with conflict-safe insert behavior and locked for update before checking or incrementing attempts.
- Ten failed lookups within 10 minutes lock further lookups for 10 minutes.
- Join locks the caller profile before its membership-first recovery check.
- The unique constraint/index on `household_members(user_id)` remains the final one-household race backstop.
- Unknown, expired, revoked/deleted, and consumed/deleted codes use the same invalid-or-expired response.

### Generic failure

`Couldn't join the household. Try again.`

Credential failures use the same external copy so the UI does not reveal invite lifecycle details. Eligibility and recoverable service failures may remain specific.

## Acceptance criteria

- [ ] User can paste/type code.
- [ ] Code entry never creates membership or consumes the invite.
- [ ] Continue returns a read-only household preview.
- [ ] Preview exposes only household name, owner display name, and member count.
- [ ] Final Join requires a second explicit action and revalidates through the backend.
- [ ] Back / Use a different code preserves an active invite and does not mutate membership.
- [ ] Credential failures share generic invalid-or-expired copy.
- [ ] Success immediately loads active household.
- [ ] Member does not see owner-only admin controls.

---

# 17. Journey J13 — Browse Household Shared Recipes

## Goal

The household can use one shared recipe collection.

## Screen

S11 Household Shared Recipes.

## Header

Show:

- household name;
- current context `Shared recipes`;
- owner settings action only when applicable.

## Recipe grid

Reuse RecipeCard.

Do not design an entirely different card system.

Optional attribution:

`Added by Maya`

Use only if this metadata is meaningful and available.

## Empty state

Headline:

`No shared recipes yet`

Primary CTA:

`Share a recipe`

Secondary CTA:

`Add new recipe`

If `Share a recipe` opens a picker:

- show eligible personal recipes;
- support search;
- exclude recipes already shared.

## Acceptance criteria

- [ ] Household context is visually explicit.
- [ ] Shared recipes use the normal RecipeCard.
- [ ] Empty state encourages sharing an existing recipe.
- [ ] Member and owner can view shared recipes.
- [ ] Error state offers retry.

---

# 18. Journey J14 — Share a Personal Recipe to Household

## Goal

The user intentionally makes one recipe available in the household.

## Entry points

- Personal Recipe Detail → `Share to household`;
- Household empty state → `Share a recipe`.

## Preconditions

- user belongs to a household;
- recipe is eligible for sharing.

## Primary path from detail

1. User taps `Share to household`.
2. Confirmation/bottom sheet names the household.
3. User confirms.
4. Request succeeds.
5. Recipe displays `Shared`.
6. Household library includes recipe.
7. Snackbar: `Shared with <Household Name>`.

## Primary path from household picker

1. User taps `Share a recipe`.
2. Personal recipe picker opens.
3. User selects a recipe.
4. Confirm if needed.
5. Recipe appears in household library.

## Rules

- sharing must not occur automatically during recipe creation unless user explicitly enables it;
- UI must indicate the target household;
- do not show teal color alone as confirmation.

## Already shared

Replace primary action with a state/action that makes status clear.

Example:

`Shared with Home`

Potential secondary action:

`Manage sharing`

## Unshare

Behavior depends on the unresolved shared ownership model.

If supported, must explicitly state whether household edits remain in the personal recipe and what happens to household access.

## Acceptance criteria

- [ ] Personal recipe is not shared before confirmation.
- [ ] Target household is named.
- [ ] Success updates both detail state and household library.
- [ ] Already-shared recipe cannot be duplicated by repeated action.
- [ ] Failure does not show a false Shared state.

---

# 19. Journey J15 — View Household Members

## Goal

See who belongs to the household and their roles.

## Screen

S12 Household Members.

## List row

Contains:

- avatar or initials;
- display name;
- role:
  - Owner;
  - Member.

## Owner view

May show overflow menu on member rows.

## Member view

No remove/manage control.

## Empty impossible state

An active household should contain at least the owner.

If member list returns empty due to an error:

- treat as data/error state;
- do not render `No members yet` as if valid.

## Acceptance criteria

- [ ] Owner and members can view member list.
- [ ] Role is textually visible.
- [ ] Member cannot see owner-only member-management controls.
- [ ] Error state is distinguishable from valid list.

---

# 20. Journey J16 — Generate and Share Join Code

## Goal

Owner invites another person.

## Role

Owner only.

## Screen

S13 Household Invite / Join Code.

## State A — No active code

Show:

`Invite members`

Primary CTA:

`Generate join code`

## State B — Active code

Show:

- code in large readable text;
- copy button;
- share button if native share exists;
- regenerate;
- revoke.

Helper:

`Valid for 10 minutes. This code can be used once.`

Do not make security claims stronger than backend behavior.

## Copy

Tap → copy to clipboard.

Snackbar:

`Join code copied`

## Regenerate

Requires confirmation because old code becomes invalid.

Dialog:

`Generate a new join code?`

Body:

`The current code will stop working.`

## Revoke

Requires confirmation.

Dialog:

`Revoke join code?`

Body:

`New members won't be able to use this code.`

## Acceptance criteria

- [ ] Only owner can access join-code management.
- [ ] Generated code is readable and copyable.
- [ ] Regenerate warns that old code is invalidated.
- [ ] Revoke requires confirmation.
- [ ] Copy provides immediate feedback.
- [ ] Member API calls are rejected even if endpoint is invoked manually.
- [ ] Backend expiry is exactly 10 minutes from database generation time.
- [ ] Generating again replaces the previous code immediately.
- [ ] Revoking or successfully consuming a code deletes its row.
- [ ] HMAC key rotation invalidates all outstanding codes; old-key and new-key API instances are never active together.

---

# 21. Journey J17 — Edit Household Name

## Goal

Owner renames the household.

## Role

Owner only.

## Entry

Household Settings → Household name.

## Primary path

1. Owner taps Edit.
2. Field prefilled with current name.
3. Owner modifies.
4. Save.
5. Header and settings update.

## Validation

- required;
- trim;
- backend length constraints.

## Acceptance criteria

- [ ] Owner sees edit action.
- [ ] Member does not.
- [ ] Existing name prefilled.
- [ ] Failed save preserves typed value.
- [ ] Success updates household name everywhere after state refresh.

---

# 22. Journey J18 — Remove Household Member

## Goal

Owner removes a member.

## Role

Owner only.

## Entry

Members → member overflow → `Remove member`.

## Confirmation

Title:

`Remove <Name>?`

Body:

`They will lose access to this household and its shared recipes.`

Do not claim what happens to recipes they created unless that backend rule is defined.

Actions:

- Cancel;
- Remove.

## Restrictions

- owner cannot remove self through this member action;
- owner record should not show `Remove member`.

## Acceptance criteria

- [ ] Only owner sees remove action.
- [ ] Owner cannot remove owner/self through member-row action.
- [ ] Confirmation names the member.
- [ ] Failed removal leaves member visible.
- [ ] Success removes member after confirmed backend response.

---

# 23. Journey J19 — Delete Household

## Goal

Owner permanently deletes household space.

## Role

Owner only.

## Entry

Household Settings → Danger Zone.

## Confirmation

This is high-risk and must be more explicit than recipe deletion.

Title:

`Delete household?`

Body must explain backend-defined consequences for:

- member access;
- shared recipe associations;
- household cookbooks if they exist;
- join code.

If those consequences are not yet defined, this action should not be implemented beyond a placeholder specification.

Possible confirmation pattern:

- second confirmation button;
- optional type household name for higher-risk deletion if product warrants it.

## Acceptance criteria

- [ ] Only owner can invoke deletion.
- [ ] Consequences are explicitly described.
- [ ] Cancel performs no mutation.
- [ ] Delete cannot double-submit.
- [ ] User is routed to Household empty state after confirmed success.
- [ ] Backend rejects member deletion attempts.

---

# 24. Journey J20 — Create/Edit/Delete Shared Recipes

## Goal

Owner and member can collaborate on household recipes according to the provided permission matrix.

## Roles

- Owner: allowed.
- Member: allowed.

## UX

Use the same Recipe Editor.

When entry context is household:

- household context should be visible;
- do not rely on teal alone;
- user should understand whether the new recipe is being created as shared or personal.

## Required product decision

The permission matrix grants `Add/edit recipes` and `Delete recipes` to both roles, but does not define:

- whether these are only household-scoped records;
- whether shared recipes remain owned by an individual;
- who can edit recipes originally created by another member;
- whether delete is permanent or unshare-only.

This is a **blocking data/authorization decision**.

Frontend can implement capability placeholders, but backend mutations should not be finalized by assumption.

## Acceptance criteria

- [ ] Shared edit uses the standard editor.
- [ ] Household context is visible.
- [ ] Permission checks are enforced server-side.
- [ ] Final edit/delete behavior follows an explicit ownership model.

---

# 25. Journey J21 — Profile and Sign Out

## Goal

The user accesses account utilities without polluting core recipe navigation.

## Screen

S15 Profile / Settings.

## MVP sections

- account identity;
- optional display name/avatar;
- optional unit preference if product decides it is global;
- sign out;
- privacy/about links as required.

## Sign out

May use confirmation if accidental sign-out is costly; otherwise direct action is acceptable.

After sign-out:

- clear local authenticated state;
- return to S01.

Do not clear user recipes from backend.

## Acceptance criteria

- [ ] Profile is reachable from bottom navigation.
- [ ] Sign out clears active session.
- [ ] Household admin settings are not duplicated here.
- [ ] Private cached data is handled according to app security policy.

---

# 26. Screen S01 — Welcome / Authentication Spec

## Components

- SafeArea
- Brand
- Illustration/Image
- H1
- Supporting copy
- Auth actions
- Legal copy

## States

- idle;
- auth loading;
- auth error.

## Layout constraints

- primary action visible without scrolling on common phone sizes when practical;
- illustration may shrink before form/action area is pushed off-screen;
- keyboard must not hide active input/actions if form-based auth exists.

---

# 27. Screen S02 — Personal Recipe Library Spec

## Components

- TopAppBar
- SearchField
- SegmentedControl
- RecipeGrid
- RecipeCard
- FAB
- BottomNavigation
- EmptyState
- ErrorState
- SkeletonGrid

## State model

```text
view = recipes | cookbooks
query = string
recipes = loading | error | loaded
```

## Scroll

- top app bar can remain static;
- search may remain near top;
- FAB remains visible;
- bottom nav fixed.

---

# 28. Screen S05 — Recipe Detail Spec

## Components

- DetailAppBar
- RecipeHero
- RecipeTitle
- SharingState
- MetadataRow
- ActionRow
- SectionHeader
- ServingStepper
- UnitSelector
- IngredientGroup
- IngredientRow
- DirectionStep
- OverflowMenu

## Sticky behavior

Do not make Ingredients/Directions permanently obscured by a large sticky panel.

Optional compact sticky top app bar after hero scroll is acceptable.

---

# 29. Screen S07 — Recipe Editor Spec

## Components

- EditorAppBar
- PhotoPicker
- TextField
- NumberField
- IngredientEditor
- IngredientGroupEditor
- DirectionEditor
- CookbookSelector
- SharingSelector
- SaveButton
- UnsavedChangesDialog

## Form behavior

- preserve input on validation failure;
- focus first invalid required field on save;
- do not wipe rows after add/reorder;
- keyboard navigation must work predictably.

---

# 30. Screen S11 — Household Shared Recipes Spec

## Components

- HouseholdHeader
- HouseholdTabs
- SearchField
- RecipeGrid
- SharedRecipeCard
- FAB or contextual create action
- EmptyState
- BottomNavigation

## Household tabs

Recommended:

- `Recipes`
- `Members`

Owner settings remains a trailing action rather than a third content tab.

---

# 31. Screen S12 — Members Spec

## Components

- HouseholdHeader
- HouseholdTabs
- MemberList
- MemberRow
- OwnerOnlyMenu
- InviteAction for owner

Member list should not use colored cards per person.

---

# 32. Screen S13/S14 — Owner Administration Spec

## Owner-only route guard

If a member navigates to an owner-only deep link:

- backend denies protected data/mutation;
- UI returns to Household;
- show non-sensitive message such as:
  `You don't have permission to manage this household.`

Do not expose admin data and merely disable buttons.

---

# 33. Destructive Action Matrix

| Action | Confirm? | Severity | Notes |
|---|---:|---|---|
| Delete recipe | Yes | Medium/High | Shared semantics must be defined |
| Delete cookbook | Yes | Medium | Must define effect on contained recipes |
| Regenerate code | Yes | Medium | Current code invalidated |
| Revoke code | Yes | Medium | Prevents future joins |
| Remove member | Yes | High | Name member in dialog |
| Delete household | Yes, strong | Critical | Consequences must be explicit |
| Discard unsaved edits | Yes, only when dirty | Medium | No prompt if unchanged |

---

# 34. Empty-State Matrix

| Context | Headline | Primary action |
|---|---|---|
| Personal recipes | Your recipes will live here. | Add your first recipe |
| Search no results | No recipes found | Clear/change search |
| Cookbooks | No cookbooks yet | Create cookbook |
| Cookbook detail | No recipes in this cookbook | Add recipe |
| No household | Share recipes with the people you cook with. | Create household |
| Shared recipes | No shared recipes yet | Share a recipe |
| Network/content error | Couldn't load… | Try again |

Search no-results must not reuse the personal-library empty state.

---

# 35. Loading-State Matrix

### Recipe list

Skeleton cards.

### Recipe detail

Skeleton hero + text blocks.

### Household shared list

Skeleton recipe cards.

### Members

Skeleton rows.

### Mutation button

Inline spinner/progress + disabled duplicate submission.

Avoid full-screen loading overlays for:

- copy code;
- local serving adjustment;
- local unit selection;
- opening menus.

---

# 36. Error-Copy Principles

Use:

- specific;
- short;
- recoverable;
- human language.

Examples:

`Couldn't save your recipe. Your changes are still here.`

`That join code is no longer active.`

`Couldn't load the household. Try again.`

Avoid:

- raw HTTP messages;
- stack traces;
- `Unknown error`;
- humorous copy for destructive or account errors.

---

# 37. Analytics Events — Optional Implementation Contract

Only add if analytics is part of the stack.

Suggested event names:

```text
recipe_created
recipe_opened
recipe_edited
recipe_deleted
recipe_search_used
servings_changed
unit_system_changed
cookbook_created
household_created
household_join_attempted
household_joined
recipe_shared
join_code_generated
join_code_copied
member_removed
household_deleted
```

Do not log:

- recipe text;
- ingredient content;
- join codes;
- private household names;

unless privacy policy and analytics design explicitly require it.

---

# 38. Accessibility Acceptance Criteria

- [ ] All action targets are at least 48 × 48 dp.
- [ ] Core text meets WCAG AA contrast.
- [ ] Shared state has text/icon, not color only.
- [ ] Owner/member role has text label.
- [ ] Error state has more than red color.
- [ ] Buttons expose accessible names.
- [ ] Large font does not clip ingredient quantities.
- [ ] Ingredient rows wrap naturally.
- [ ] Directions remain readable with text scaling.
- [ ] Swipe is never the only destructive/edit mechanism.
- [ ] Reduced-motion preference is respected.

---

# 39. Performance Acceptance Criteria

Targets should be adapted to the actual stack, but UX behavior should follow these rules:

- list skeleton appears quickly if data is not immediately available;
- recipe images are lazy-loaded/cached appropriately;
- opening a cached recipe should feel immediate;
- serving/unit changes should be local and immediate;
- search should not create unnecessary network traffic;
- grid image loading should not cause major layout shifts.

---

# 40. Offline / Connectivity Behavior

The provided source material does not define offline-first support.

Therefore:

- do not claim offline availability in UI;
- local cached data may be displayed if the implementation naturally supports it;
- mutations requiring server access must clearly fail/retry;
- never show a successful household mutation before server confirmation unless a robust optimistic rollback exists.

---

# 41. Data and Authorization Questions to Resolve Before Backend Freeze

These questions are intentionally kept explicit rather than guessed.

## Q1 — Can a user belong to more than one household?

Affects:

- navigation;
- share target;
- invite flow;
- data model.

## Q2 — What does "Delete recipe" mean for a shared recipe?

Affects:

- permission;
- confirmation copy;
- ownership.

## Q3 — Can a member edit a shared recipe created by another member?

The permission matrix suggests broad edit capability but does not define ownership granularity.

## Q4 — What happens to a member's shared recipes when they are removed?

Possible models:

- remain in household;
- unshare;
- transfer household ownership;
- become read-only;
- delete.

Must be explicit.

## Q5 — Are cookbooks personal, shared, or both?

The permission matrix says both roles can create/manage cookbooks but does not define scope.

## Q6 — Can a member leave voluntarily?

Not represented in the role matrix.

## Q7 — Join code lifecycle

Resolved for MVP:

- six numeric digits, with spaces/hyphens accepted only as input formatting;
- 10-minute expiry controlled by database time;
- one-time use, consumed by deleting the code row in the successful Join transaction;
- one active code row per household;
- generating replaces the previous row and revoking deletes it;
- Preview and Join share a concurrency-safe limit of 10 failed lookups per authenticated user per 10 minutes, followed by a 10-minute lock;
- membership is checked before code lookup for lost-response recovery;
- HMAC-key rotation deliberately deletes/invalidates every outstanding code, with no mixed-key rollout or grace period.

## Q8 — Unit preference persistence

Define:

- per recipe;
- per user;
- session only.

## Q9 — Recipe import

Not part of this MVP spec. If added later, define source-specific reliability rather than promising universal social-media extraction.

---

# 42. Implementation Order

Recommended incremental implementation sequence:

## Phase 1 — Personal recipe core

1. S02 Recipe Library.
2. S05 Recipe Detail.
3. S07 Add Recipe.
4. S07 Edit Recipe.
5. Delete flow.
6. Search.

## Phase 2 — Cooking utilities

7. Serving stepper.
8. Unit selector/conversion.
9. Ingredient grouping.
10. Direction-step polish.

## Phase 3 — Organization

11. Cookbooks.
12. Cookbook detail.
13. Assign/remove cookbook.

## Phase 4 — Household foundation

14. Household empty state.
15. Create household.
16. Join household.
17. Shared recipe library.
18. Members list.

## Phase 5 — Collaboration

19. Share personal recipe.
20. Shared editing after ownership semantics are defined.
21. Join-code management.
22. Remove member.
23. Household rename.
24. Delete household.

## Phase 6 — Polish

25. loading/empty/error states;
26. accessibility;
27. motion;
28. image performance;
29. deep-link guards;
30. final permission testing.

This order keeps the app useful as an individual recipe product before household complexity is introduced.

---

# 43. Final MVP Definition of Done

The MVP is ready for a design/implementation review when:

- [ ] A new user can authenticate and reach an empty personal library.
- [ ] A user can create a personal recipe.
- [ ] A user can browse/search/open recipes.
- [ ] Recipe Detail presents ingredients and directions clearly.
- [ ] Serving adjustment is reliable.
- [ ] Unit conversion is safe and does not invent invalid mass/volume conversions.
- [ ] A user can edit and delete according to defined ownership rules.
- [ ] A user can create and manage cookbooks.
- [ ] A user can create or join a household.
- [ ] Owner/member UI matches the permission matrix.
- [ ] Household users can view shared recipes.
- [ ] Sharing is explicit and visible.
- [ ] Owner can manage invitations and members.
- [ ] Critical household ownership/deletion semantics are documented and implemented.
- [ ] Loading, empty, error, disabled, and destructive states exist.
- [ ] Core accessibility criteria pass.
- [ ] UI uses the design-system semantic tokens rather than copying competitor styling.
