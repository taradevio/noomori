# Recipe ID Page Specification

## Scope

This specification defines the dynamic Recipe Detail page addressed by a canonical `recipeId`.

The page is used to display a recipe after it has been created and may also be reused for any existing recipe opened elsewhere in the app.

The route should be conceptually equivalent to:

```text
/recipe/[recipeId]
```

The exact Expo Router folder location should follow the existing route-group structure in the project.

This specification focuses only on the `recipeId` page itself.

It does not define the create-recipe flow, mutation orchestration, or the navigation logic that leads into this page.

---

## 1. Route Contract

The page must receive one stable route parameter:

```text
recipeId
```

Recommended Expo Router shape:

```text
app/recipe/[recipeId].tsx
```

or the equivalent route inside the current route group.

Use one consistent parameter name across the app.

Preferred:

```text
recipeId
```

Avoid mixing route parameter names such as:

```text
id
recipe_id
recipeId
slug
```

without a deliberate architectural reason.

---

## 2. Route Identity

`recipeId` is the only route identity required by the page.

Do not serialize the full recipe object into URL/search params.

Correct:

```text
/recipe/550e8400-e29b-41d4-a716-446655440000
```

Conceptually:

```ts
const { recipeId } = useLocalSearchParams<{
  recipeId: string;
}>();
```

Incorrect:

```text
/recipe?title=Chicken+Curry&ingredients=...
```

The route identifies the resource.

The data layer provides the resource content.

---

## 3. Canonical Recipe Detail Page

A newly created recipe must not have a special detail-page implementation.

The same page should represent:

- a newly created recipe;
- an existing recipe opened from All Recipes;
- a recipe opened from a Cookbook;
- a recipe opened from Activity or another future internal link.

Do not create parallel pages such as:

```text
/new-recipe-detail
/recipe-detail
```

Use one canonical `recipeId` page.

---

## 4. Data Loading

The page should read `recipeId` from the route and load the canonical recipe through the established data layer.

Conceptually:

```text
recipeId
   ↓
TanStack Query
   ↓
GET recipe by ID
   ↓
Recipe Detail UI
```

Suggested query identity:

```ts
["recipe", recipeId]
```

Use the project's existing query-key conventions if they differ.

The page should not depend on temporary form state from the previous screen in order to render correctly.

---

## 5. Backend Contract

The page requires an endpoint or service capable of retrieving one recipe by its canonical ID.

Conceptually:

```text
GET /recipes/{recipeId}
```

The response should contain the complete canonical Recipe Detail representation required by the UI.

The exact API shape should follow the backend's current conventions.

---

## 6. Authorization

Knowing a `recipeId` does not grant access to the recipe.

The backend must verify that the authenticated user is allowed to access the recipe through the current household membership model.

Conceptually:

```text
authenticated user
      +
recipeId
      ↓
household membership check
      ↓
authorized recipe
```

Do not rely on client-side route hiding as authorization.

---

## 7. Required Page States

The page must explicitly support:

- loading;
- success;
- not found;
- unauthorized/forbidden where applicable;
- network/server error.

Do not assume the recipe is always immediately available.

---

## 8. Loading State

While the recipe is loading, render a stable Recipe Detail skeleton or equivalent loading state.

Prefer a skeleton that roughly matches the final hierarchy:

```text
[ image skeleton ]

[ title skeleton ]
[ metadata skeleton ]

[ ingredient section skeleton ]

[ instruction section skeleton ]
```

Avoid:

- blank white screens;
- blocking full-screen spinners when a structured skeleton is practical;
- fake recipe data.

---

## 9. Newly Created Recipe Cache

The page must work correctly whether the newly created recipe is:

- already present in TanStack Query cache; or
- fetched from the backend after the page mounts.

If the canonical recipe is already cached, render it immediately and revalidate according to the application's query policy.

The page must not require cache seeding to function.

---

## 10. Not Found State

If `recipeId` does not resolve to an accessible recipe, show an intentional state.

Example:

```text
Recipe not found

This recipe may have been deleted or is no longer available.

[ Back to Recipes ]
```

Do not crash or render an empty Recipe Detail shell.

---

## 11. Error State

For recoverable loading failures:

```text
We couldn't load this recipe.

[ Try again ]
```

Retry should refetch the same `recipeId`.

Keep errors distinct from a confirmed `404 / not found` state where the API makes that distinction available.

---

## 12. Page Content Hierarchy

The successful Recipe Detail page should follow this content order:

```text
Recipe image

Recipe title

Source / attribution context

Prep time · Cook time · Base servings

Cookbook membership preview

Servings control

Unit conversion control

Ingredients

Instructions

Notes

Nutrition per serving

Source details

Recipe actions
```

Keep the screen readable for long recipes.

---

## 13. Recipe Image

Display the recipe image when available.

If no image exists, use the approved warm fallback treatment from the design system.

Do not introduce unrelated stock photography.

The recipe image should be prominent but must not push essential recipe information excessively far below the fold.

---

## 14. Recipe Title

Recipe title is the strongest text element on the page.

The title should:

- be easy to scan;
- support wrapping;
- avoid aggressive truncation;
- remain readable across small mobile widths.

---

## 15. Source / Attribution Context

Show concise provenance near the title/metadata area.

Examples:

```text
My recipe
```

```text
From Mom
```

```text
example.com
```

This is contextual attribution, not social-author profile UI.

---

## 16. Recipe Metadata Summary

Show available recipe metadata in a concise summary.

Supported metadata:

```text
Prep time
Cook time
Base servings
```

Do not render empty metadata values as meaningless placeholders.

For example, if Prep Time is absent, omit it rather than showing:

```text
Prep: —
```

unless the final design system explicitly standardizes empty metadata placeholders.

---

## 17. Cookbook Membership Preview

Show current Cookbook membership as lightweight contextual information.

Examples:

```text
Family Favorites
Weeknight
```

If the recipe belongs to many Cookbooks, show a concise preview rather than rendering an unbounded chip list.

Provide the approved `Manage Cookbooks` entry point where appropriate.

Cookbooks remain an organization layer, not the primary identity of the recipe.

---

## 18. Servings Control

Recipe Detail supports a transient servings selector.

Example:

```text
Servings

[ − ]   4   [ + ]
```

The selected display serving count is page-local state unless the product later explicitly persists it.

Changing the Detail servings selector must not directly overwrite the canonical stored recipe.

---

## 19. Ingredient Scaling

When the displayed servings value changes, numeric ingredient amounts should update dynamically according to the approved serving behavior.

Use the canonical recipe quantities as the stable calculation source.

Do not repeatedly scale already-rounded display values.

Example:

```text
Canonical:
4 servings
400 g chicken

Display:
8 servings
800 g chicken
```

Non-numeric quantities remain unchanged.

Examples:

```text
salt — to taste
parsley — as needed
```

---

## 20. Unit Conversion

Recipe Detail supports display-only unit conversion modes:

```text
Original
Metric
Imperial
```

Conversion rules:

- volume ↔ volume only;
- mass ↔ mass only;
- never volume ↔ mass;
- custom units remain unchanged;
- count-style units remain unchanged;
- deterministic conversion only.

Do not use an LLM to infer ingredient density or conversion meaning.

Changing conversion mode does not persist new canonical ingredient units.

---

## 21. Ingredients

Ingredients should render from the canonical structured ingredient model.

Each row may contain:

```text
amount
unit
ingredient name
optional note
```

Example:

```text
1/3 cup coconut milk
2 cloves garlic, minced
salt, to taste
```

Preserve the relationship between amount, unit, ingredient name, and note.

---

## 22. Ingredient Sections

Ingredient groups are optional.

Simple recipe:

```text
Ingredients

2 eggs
100 g flour
200 ml milk
```

Sectioned recipe:

```text
Ingredients

Marinade

1/3 cup coconut milk
2 tbsp soy sauce
2 cloves garlic


Chicken & Salad

400 g chicken breast
1 tbsp olive oil
1 avocado
```

Use:

- heading;
- whitespace;
- restrained divider where useful.

Do not put every ingredient section inside a large elevated card by default.

Only one grouping level exists.

---

## 23. Instructions

Instructions render as ordered steps.

Simple example:

```text
Instructions

1. Mix the ingredients.
2. Heat the pan.
3. Cook for 10 minutes.
```

Use clear numbering and enough spacing for comfortable cooking-time scanning.

---

## 24. Instruction Sections

Instruction groups are optional.

Example:

```text
Prepare the marinade

1. Combine the ingredients.
2. Mix thoroughly.


Cook the chicken

1. Heat the pan.
2. Cook until browned.


Assemble

1. Combine the components.
```

Ingredient-group names and instruction-group names do not need to match.

Do not attempt to infer a relationship between the two.

---

## 25. Notes

If recipe-level Notes exist, show them after the primary cooking content.

Notes should be visually distinct from:

- ingredient notes;
- instructions;
- source information.

If Notes are empty, omit the section.

---

## 26. Nutrition Per Serving

Supported fields:

```text
Calories
Fat
Saturated fat
Cholesterol
Sodium
Carbohydrate
Dietary fiber
Sugar
Protein
```

Keep the section visually restrained.

This is recipe metadata, not a nutrition-tracking experience.

Do not add:

- macro rings;
- daily goals;
- progress meters;
- diet scores.

---

## 27. Nutrition × Displayed Servings

The latest product requirement states that Nutrition per Serving should update dynamically when the displayed serving count changes.

The page should support this dynamic state.

However, the exact nutrition calculation must follow the final approved product formula.

Do not invent a conflicting calculation model if the canonical nutrition semantics have not yet been finalized.

The UI architecture should make the nutrition values derived from the current displayed serving state rather than hard-coding a static render.

---

## 28. Source Details

At the bottom of the recipe content, show fuller source information where relevant.

Examples:

### My Recipe

```text
Source
My recipe
```

### Family / Friend

```text
Source
Mom
```

### Website

```text
Source
example.com
```

The Website source may expose an external-link action if that is part of the current implementation.

Preserve the original source URL in canonical data.

---

## 29. Recipe Actions

The page should provide access to the approved recipe actions.

At minimum:

```text
Edit
Delete
Manage Cookbooks
```

The exact placement may use:

- visible action;
- overflow menu;
- approved bottom-sheet pattern.

Do not add unrelated actions such as:

- rating;
- social sharing;
- meal planning;
- grocery generation;

unless separately added to product scope.

---

## 30. Edit Entry Point

Edit should use the same canonical `recipeId`.

Conceptually:

```text
Recipe Detail
→ Edit
→ edit/[recipeId]
```

or the equivalent project route.

The Edit screen should load/prefill from the canonical saved recipe.

Do not create a duplicate recipe object to edit.

---

## 31. Delete Behavior

Delete is a shared household-data action.

The page must use the approved destructive confirmation behavior.

The copy must communicate that deleting the recipe affects the household collection.

Conceptual requirement:

```text
This recipe will be removed for everyone in this household.
```

Do not imply deletion is user-local.

If deletion fails:

- keep the page;
- keep the recipe visible;
- show a recoverable error.

---

## 32. Freshly Created State

The page may optionally receive or derive a short-lived UI state indicating that the recipe was just created.

This state is presentation-only.

Example:

```text
Recipe saved
```

It may be displayed as:

- Snackbar;
- Toast;
- equivalent transient feedback.

Do not fork the Recipe Detail component based on `newlyCreated`.

The underlying recipe UI remains identical.

---

## 33. Page Refresh / Refetch

Refetching the page must preserve route identity:

```text
recipeId
```

The page should be able to recover from stale or invalidated recipe data without requiring navigation away and back.

Use the established TanStack Query stale/refetch policy.

---

## 34. Cache Key Stability

Use a stable detail-query key.

Recommended concept:

```ts
["recipe", recipeId]
```

Recipe-list queries and Recipe Detail queries should not accidentally overwrite each other's cache shapes.

---

## 35. Route Param Validation

Treat `recipeId` as untrusted route input.

At minimum:

- ensure the param exists;
- normalize Expo Router's potential array/string param shape if required;
- do not issue a recipe query with an undefined/invalid empty ID.

If IDs use UUID format and the application already performs client-side validation consistently, validation may occur before querying.

Backend validation remains authoritative.

---

## 36. Accessibility

The page should provide:

- accessible image labels where useful;
- semantic heading hierarchy;
- accessible labels for servings controls;
- accessible labels for Edit/Delete/Manage Cookbook actions;
- adequate touch targets;
- no color-only state communication;
- readable contrast;
- sufficient spacing for cooking-time scanning.

---

## 37. Mobile Layout

The page is mobile-first.

Avoid layouts requiring horizontal scrolling for core recipe content.

Ingredient rows may wrap gracefully.

Long section names, ingredient names, and source text must not break the layout.

The page should remain readable at narrow Android widths.

---

## 38. Empty Optional Sections

Do not render empty section shells.

Examples:

If there are no Notes:

```text
omit Notes
```

If there is no nutrition data:

```text
omit Nutrition
```

If the recipe has no Cookbook memberships:

- omit membership chips/preview;
- still allow `Manage Cookbooks` if that action belongs to the current page design.

---

## 39. Canonical Data Requirements

The page should be capable of rendering the canonical recipe shape conceptually represented as:

```text
Recipe
├── id
├── household_id
├── title
├── photo?
├── prep_minutes?
├── cook_minutes?
├── canonical_servings
│
├── ingredient_groups[]
│   ├── title?
│   ├── note?
│   └── ingredients[]
│       ├── amount?
│       ├── unit?
│       ├── name
│       └── note?
│
├── instruction_groups[]
│   ├── title?
│   └── steps[]
│
├── notes?
├── nutrition?
├── source
└── cookbooks[]
```

This is a product contract, not a mandatory database response shape.

The API may map database entities into a Recipe Detail DTO.

---

## 40. Explicitly Out of Scope

This page should not introduce:

- meal planning;
- grocery generation;
- pantry management;
- public comments;
- likes;
- ratings;
- social follower UI;
- AI recipe rewriting;
- AI cooking chat;
- nutrition goals;
- complex household permissions.

---

## 41. Acceptance Criteria

The `recipeId` page is acceptable when:

- [ ] A dynamic route exists for `recipeId`.
- [ ] The route uses a consistent `recipeId` parameter.
- [ ] The page does not require the full Recipe object in route params.
- [ ] The page can load a recipe directly by ID.
- [ ] Newly created and existing recipes use the same Recipe Detail page.
- [ ] Loading state is intentional.
- [ ] Fetch failure has a retry path.
- [ ] Invalid/missing recipes have an intentional not-found state.
- [ ] Backend household authorization protects recipe access.
- [ ] Recipe image/title/metadata render correctly.
- [ ] Cookbook membership can be displayed.
- [ ] Display servings can be adjusted.
- [ ] Numeric ingredients react dynamically to displayed servings.
- [ ] Ingredient sections render correctly.
- [ ] Instruction sections render correctly.
- [ ] Unit conversion supports Original / Metric / Imperial.
- [ ] Notes render only when present.
- [ ] Nutrition renders only when present.
- [ ] Nutrition UI can react to current displayed servings.
- [ ] Source/provenance is visible.
- [ ] Edit action is available.
- [ ] Delete uses shared-household consequence messaging.
- [ ] Manage Cookbooks uses the approved shared interaction.
- [ ] Optional `Recipe saved` feedback does not create a separate page mode.
- [ ] The page remains usable after query invalidation/refetch.
- [ ] Long recipe content remains readable on mobile.

---

## 42. Codex Planning Notes

Before implementing this page, Codex should inspect:

1. the existing Expo Router route tree;
2. current recipe detail components, if any;
3. current Recipe DTO/API response;
4. existing TanStack Query keys;
5. existing recipe service/client;
6. current ingredient/instruction data shape;
7. the shared cookbook selection component;
8. the existing Edit/Delete entry points;
9. the current design-system and Recipe Detail visual references.

Codex should implement the smallest reusable canonical Recipe Detail page possible.

Do not redesign unrelated flows while adding the `recipeId` page.
