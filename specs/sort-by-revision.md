# Noomori Recipe Sorting Performance Spec

## Summary

Improve the perceived responsiveness and efficiency of recipe sorting without introducing a custom sorting algorithm, changing the current API contract, adding pagination, or moving sorting to the backend.

The current implementation is functionally correct:

- `Newest` uses the order returned by the backend (`created_at DESC`).
- `A–Z` is performed locally after filtering.
- Filtering creates a new array before sorting, so query/cache data is not mutated.
- Sorting and filtering are already derived inside `useMemo`.
- Sorting state persists while switching between Recipes and Cookbooks and resets on remount.
- Existing functional tests cover source immutability, search + sort behavior, refreshes, section changes, and scroll reset behavior.

The goal of this work is therefore not to replace `Array.prototype.sort()`. The goal is to identify and remove unnecessary work around the sort interaction so switching between **Newest** and **A–Z** feels immediate on release Android builds.

---

## Problem

Changing recipe sort order can feel heavier than expected even though the operation is entirely client-side.

The current interaction is approximately:

```text
User taps A–Z
    ↓
setSort("alphabetical")
    ↓
filter recipes
    ↓
locale-aware Array.sort()
    ↓
map into FlatList items
    ↓
FlatList receives reordered data
    ↓
visible cards reconcile/layout
    ↓
list is forced back to offset 0
```

There is no network request caused by changing sort order.

Potential contributors to perceived delay include:

- repeated locale collation setup during title comparisons;
- repeated derivation of recipe-card models in parent screens;
- recreation of list item arrays and wrapper objects;
- FlatList reconciliation/layout after reordering;
- recipe-card rerenders;
- the immediate non-animated `scrollToOffset({ offset: 0 })` triggered by a sort change.

This spec requires measurement before introducing broader rendering or memoization changes.

---

## Goals

1. Make switching between **Newest** and **A–Z** feel effectively immediate for realistic recipe-library sizes.
2. Preserve all existing sorting, searching, accessibility, and refresh behavior.
3. Keep sorting client-side while the complete recipe collection is loaded.
4. Avoid cache mutation and unnecessary network requests.
5. Measure the actual cost of:
   - title sorting;
   - derived-data construction;
   - React rendering;
   - FlatList reconciliation;
   - scroll-to-top behavior.
6. Establish an explicit future boundary for moving sorting to the backend when pagination is introduced.

---

## Non-Goals

Do not:

- implement QuickSort, MergeSort, HeapSort, RadixSort, or another custom sorting algorithm;
- add a loading spinner for local sort changes;
- refetch recipes when the sort option changes;
- add the sort option to the TanStack Query key;
- add a database index for alphabetical sorting;
- move A–Z sorting to FastAPI or Supabase;
- introduce pagination in this work;
- migrate from `FlatList` to another list library;
- add broad `React.memo`, `useMemo`, or `useCallback` usage without profiling evidence;
- change the search behavior or add a debounce to local search;
- change recipe-card UI.

---

## Current Behavior to Preserve

### Newest

The backend remains the source of the default order:

```python
.eq("owner_user_id", auth.user.id)
.order("created_at", desc=True)
```

The existing database index remains appropriate for the personal-recipe query:

```sql
(owner_user_id, created_at DESC)
```

No additional client-side sort is required for `Newest`.

### A–Z

A–Z remains client-side:

```ts
const filteredRecipes = recipes.data.filter(...);

filteredRecipes.sort((a, b) =>
  a.title.localeCompare(b.title, undefined, {
    sensitivity: "base",
    numeric: true,
  }),
);
```

Filtering must continue to happen before sorting so only matching results are sorted.

The source recipe collection must remain immutable.

### Search

Search remains immediate and local.

Changing the search query must not cause a network request.

A–Z ordering must continue to apply to filtered results.

### Sort State

Sort state remains:

```ts
type RecipeSort = "newest" | "alphabetical";
```

Default:

```ts
"newest"
```

The selected sort remains active while switching between Recipes and Cookbooks during the same mounted library session.

A fresh remount defaults back to `Newest`.

---

## Implementation Changes

### 1. Reuse a Single Title Collator

Replace repeated `localeCompare(...options)` configuration with one module-level `Intl.Collator`.

Use:

```ts
const RECIPE_TITLE_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});
```

Then:

```ts
filteredRecipes.sort((a, b) =>
  RECIPE_TITLE_COLLATOR.compare(a.title, b.title),
);
```

Preserve the existing semantics:

- case-insensitive ordering;
- accent-insensitive ordering at the current sensitivity;
- natural numeric ordering;
- `Soup 2` sorts before `Soup 10`.

Do not replace locale-aware comparison with simple `<` / `>` string comparison.

---

### 2. Keep the Existing Filter → Sort Pipeline

The derived recipe pipeline must remain conceptually:

```text
canonical recipe data
    ↓
normalize query
    ↓
filter
    ↓
optional A–Z sort
    ↓
map to FlatList items
```

Do not sort the entire collection before filtering.

Expected complexity:

```text
filter: O(n)
sort:   O(k log k)
```

where `k` is the number of recipes matching the current search.

---

### 3. Measure Parent-Level Recipe-Card Derivation

Both personal and household screens currently derive card models from API data with:

```ts
recipesQuery.data.map(toRecipeCard)
```

Profile whether this transformation is recomputed during unrelated parent renders despite React Compiler being enabled.

Do not add manual memoization by default.

If profiling confirms repeated recomputation while `recipesQuery.data` is unchanged, stabilize the derived array explicitly:

```ts
const recipeCards = useMemo(
  () => recipesQuery.data?.map(toRecipeCard) ?? [],
  [recipesQuery.data],
);
```

Apply the same pattern to:

- personal recipes;
- household recipes.

Only make this change if measurement demonstrates that React Compiler is not already eliminating the redundant work.

---

### 4. Measure FlatList Reconciliation Cost

Profile the list update caused by switching:

```text
Newest → A–Z
A–Z → Newest
```

Specifically inspect:

- JS execution duration around the sort state change;
- number of rendered/re-rendered `RecipeCard` instances;
- JS thread stalls;
- dropped frames;
- layout duration;
- image remount/reload behavior;
- memory growth.

Do not introduce list tuning until measurements show a concrete rendering bottleneck.

Potential follow-up changes, only when justified:

- stable `renderItem`;
- stable `keyExtractor`;
- `RecipeCard` memoization;
- FlatList batching/window tuning.

React Compiler is enabled in the project, so manual memoization must be justified by measured behavior rather than added mechanically.

---

### 5. Evaluate Scroll-to-Top Separately

Current behavior resets the list to offset `0` on:

- normalized search changes;
- section changes;
- sort changes.

Keep the existing behavior initially.

Profile sort interactions with:

```ts
listRef.current?.scrollToOffset({
  offset: 0,
  animated: false,
});
```

and compare them against a temporary local build where the sort dependency is removed from the scroll-reset effect.

Determine whether perceived heaviness primarily comes from:

```text
sort/reconciliation
```

or from:

```text
sort/reconciliation + immediate non-animated scroll reset
```

Do not permanently change scroll behavior without confirming the UX impact.

If scroll reset is shown to be the dominant perceptual issue, revise the interaction separately while preserving the expectation that a newly sorted collection starts from a predictable position.

---

### 6. Do Not Add a Local Sorting Loading State

Do not show:

```text
Loading...
```

when users switch between `Newest` and `A–Z`.

Sorting is an in-memory derived-state operation and should be optimized to feel immediate.

A loading indicator would:

- suggest a network operation that does not exist;
- make fast sorting feel slower;
- not reliably solve JS-thread blocking if the expensive work is synchronous.

If a local sort interaction is slow enough to require a visible spinner, treat that as a performance regression to fix rather than normal behavior.

---

## Performance Characterization

Add a development-only characterization path or fixture generator for recipe libraries of approximately:

```text
50 recipes
250 recipes
1,000 recipes
5,000 recipes
```

Synthetic fixtures should vary:

- title length;
- capitalization;
- accented characters;
- numeric titles such as `Soup 2` / `Soup 10`;
- presence/absence of image URLs;
- shared state;
- servings/time metadata.

Do not commit oversized generated payloads if they materially bloat the repository. Prefer deterministic fixture generation when practical.

---

## Test Matrix

Run performance validation on a release Android build, not only Expo development mode.

Test each fixture size against:

| Scenario | Expected behavior |
| --- | --- |
| Initial library load | Newest order appears correctly |
| Newest → A–Z | No network request; list updates immediately |
| A–Z → Newest | No network request; backend/source order restored |
| Rapid sort toggling | No crashes, stale ordering, or runaway work |
| Search while Newest | Filtered results preserve source/newest order |
| Search while A–Z | Filtered results remain alphabetically sorted |
| Clear search | Active sort remains selected |
| Refresh while A–Z | Refreshed data remains A–Z |
| Switch Recipes → Cookbooks → Recipes | Sort selection remains stable |
| Detail → back | Sort state and visible collection remain correct |
| Sort while scrolled deep in list | Scroll/reset behavior is predictable |
| Missing images | Sort does not trigger unnecessary image refetches |

---

## Functional Regression Tests

Retain the existing sorting regression coverage.

Add or preserve assertions for:

- source recipe arrays are never mutated;
- `Newest` uses source order;
- `A–Z` is case-insensitive;
- numeric comparison remains natural;
- accented titles preserve current comparison semantics;
- sorting persists through search;
- sorting persists through refresh;
- cookbooks are not affected by recipe sorting;
- remount resets to `Newest`;
- changing sort does not trigger API calls;
- normalized-equivalent search changes do not trigger unnecessary scroll resets.

If the collator is extracted into a helper, add focused unit coverage for representative title ordering.

---

## Instrumentation

For temporary profiling builds, measure:

```text
sort interaction duration
derived-list computation duration
RecipeCard render count
JS thread responsiveness
dropped frames
memory usage
network request count
```

Use performance markers around the derived-list computation only in development/profile builds.

Do not ship noisy per-sort production logs unless profiling demonstrates that production observability is needed.

Backend list logging already records:

```text
recipe_count
image_count
duration_ms
```

Use those metrics when evaluating future list scalability, but they are not expected to change when users switch sort modes because sorting remains local.

---

## API and Database

No API changes are required.

Do not add:

```text
?sort=title
?sort=created_at
```

to `GET /recipes` in this work.

Do not add an alphabetical database index.

The current personal default order remains:

```sql
WHERE owner_user_id = ?
ORDER BY created_at DESC
```

with the existing composite index.

---

## Future Pagination Boundary

Client-side sorting is valid only while the client has the complete recipe collection.

Once recipe pagination is introduced, this architecture becomes invalid for global ordering.

Incorrect future design:

```text
DB contains 10,000 recipes
        ↓
client loads 50
        ↓
client sorts those 50 A–Z
```

That produces only page-local ordering.

When pagination lands, move ordering into the API/database at the same time:

```text
GET /recipes
  ?sort=title
  &direction=asc
  &cursor=...
```

At that point:

- sort becomes part of the server query;
- sort parameters become part of the TanStack Query key;
- database indexes are evaluated against real query patterns;
- pagination and ordering must use deterministic tie-breakers.

Until then, keep recipe sorting client-side.

---

## Separate Future Optimization: Recipe List DTO

The current `GET /recipes` endpoint returns full recipe records, including data such as:

- ingredients;
- instructions;
- nutrition;
- description;
- source metadata.

The recipe library only needs a smaller card subset.

This is a more meaningful long-term scaling concern than the A–Z sorting algorithm.

Do not change the endpoint as part of this sorting task because the full list data currently enables immediate detail-cache seeding and fast recipe-detail navigation.

Track a separate future investigation:

```text
full recipe list payload
vs
lightweight RecipeSummary payload + detail prefetch/fetch
```

Only change this architecture after measuring:

- response bytes;
- backend duration;
- JSON parsing cost;
- memory usage;
- detail-navigation latency.

---

## Acceptance Criteria

The implementation is complete when:

1. `Array.prototype.sort()` remains the sorting mechanism; no custom algorithm is introduced.
2. A reusable `Intl.Collator` performs A–Z title comparison.
3. Source recipe data remains immutable.
4. Changing sort order performs no network request.
5. No loading spinner is introduced for local sorting.
6. Search + sort behavior remains unchanged.
7. Existing functional sorting tests continue to pass.
8. Performance has been characterized with realistic large-library fixtures.
9. Parent recipe-card derivation is only manually memoized if profiling proves redundant recomputation.
10. FlatList/RecipeCard memoization or virtualization tuning is only introduced if profiling identifies rendering as a bottleneck.
11. Scroll-to-top cost has been measured independently from sorting cost.
12. Release Android testing shows no meaningful UI stall at the realistic target library size.
13. The pagination boundary is documented so future pagination moves sorting to the backend instead of sorting individual pages locally.

---

## Recommended Execution Order

```text
1. Extract reusable Intl.Collator
2. Preserve existing functional tests
3. Add/prepare large deterministic recipe fixtures
4. Profile sort interaction on release Android
5. Measure:
   - derived-data computation
   - card renders
   - FlatList/layout
   - scroll reset
6. Apply only evidence-backed memoization/list tuning
7. Re-run functional + performance matrix
8. Record pagination/server-sort boundary in architecture notes
```

The expected outcome is a sorting interaction that feels immediate without introducing unnecessary backend work, custom algorithms, or speculative rendering optimizations.
