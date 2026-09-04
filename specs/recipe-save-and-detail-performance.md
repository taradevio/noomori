# Recipe Save and Detail Performance

## Summary

Two related issues make recipe creation and navigation feel slower than they need to:

1. The Save button briefly changes from **Saving...** back to **Save recipe**, then to **Saving...** again.
2. Opening a recipe waits for another network request even though the library has already fetched that recipe.

The first issue is a submission-state handoff bug. The second is a query-cache and data-fetching issue.

## Problem 1: Save State Flickers

### Current behavior

When a recipe has a photo, saving passes through separate states:

1. `RecipeForm` sets `isWaitingForPhoto` while preparing the image.
2. It clears `isWaitingForPhoto` after preparation.
3. The route starts the React Query mutation, which sets `isPending`.

The button derives its label from `isWaitingForPhoto || isPending`. There is a render between steps 2 and 3 where both values are false, so the label briefly returns to **Save recipe**.

Relevant code:

- `src/shared/components/recipe/recipe-form.tsx`
- `src/app/recipe/new.tsx`
- `src/app/recipe/[id]/edit.tsx`

### User impact

- Saving looks like it stopped and restarted.
- Users may think their first tap did not work.
- The enabled-looking button creates a risk of another tap.
- Perceived performance is worse even when the underlying work is reasonably fast.

### Minimal fix

Use one form-level submission state for the complete operation:

```text
validate
-> prepare photo
-> create or update recipe
-> upload or remove photo
-> finish navigation/error handling
```

Set that state once, immediately after validation succeeds, and clear it only after `onSubmit` settles. The button label and disabled state should use this uninterrupted state.

Implementation outline:

```tsx
const [isSubmittingForm, setIsSubmittingForm] = useState(false);
const isSaving = isSubmittingForm || isSubmitting;

async function submit() {
  setSubmitAttempted(true);
  if (hasRecipeDraftErrors(validationErrors) || isSaving) return;

  setIsSubmittingForm(true);
  try {
    const photo = await resolvePreparedPhoto();
    await onSubmit(draft, photo);
  } finally {
    setIsSubmittingForm(false);
  }
}
```

`isWaitingForPhoto` can then be removed unless it is needed for separate user-facing copy. No new state machine or dependency is necessary.

### Expected behavior

- One tap changes **Save recipe** to **Saving...**.
- The label never reverts while work is in progress.
- The button remains disabled throughout the operation.
- Success navigates once.
- Failure restores the button once and shows the existing error feedback.

## Problem 2: Recipe Details Fetch Again

### Current behavior

The library query stores recipes under:

```ts
["recipes"]
```

The detail screen requests the selected recipe under a different key:

```ts
["recipe", recipeId]
```

Because the detail key has no cached value, the detail route waits for a new request before rendering `RecipeDetailView`.

This is especially wasteful today because `/recipes` returns complete recipe objects, including ingredients, instructions, nutrition, and source data. The client converts them to card models but does not seed the detail cache.

Relevant code:

- `src/app/(tabs)/index.tsx`
- `src/app/recipe/[id]/index.tsx`
- `src/shared/components/recipe/recipe-response.ts`
- `server/src/server/main.py`

### User impact

- Card presses lead to a loading screen instead of immediate content.
- Previously downloaded data is fetched again.
- The backend repeats authentication, database access, and image URL signing.
- The delay grows with network latency rather than device capability.

### Minimal fix for the current API

Before navigating, copy the selected `ApiRecipe` into the detail query cache:

```tsx
const queryClient = useQueryClient();

function openRecipe(recipeId: string) {
  const recipe = recipesQuery.data?.find((item) => item.id === recipeId);
  if (recipe) queryClient.setQueryData(["recipe", recipeId], recipe);
  router.push(`/recipe/${recipeId}` as Href);
}
```

The detail screen can render the cached recipe immediately. Its existing query may refresh stale data in the background without blocking the first render.

Also seed `['recipe', recipe.id]` from successful create and update responses when those responses contain the full recipe.

### Longer-term API fix

The list endpoint should eventually return only card data:

- `id`
- `title`
- `image_path`
- `image_url` or thumbnail URL
- preparation/cooking time
- sharing and cookbook summary fields

Add pagination and avoid signing image URLs one at a time. Once the list response becomes lightweight, prefetch the detail query when a card is pressed or focused instead of copying full list data.

Do not add a new caching library. TanStack Query already provides the required cache, prefetch, invalidation, and background refresh behavior.

### Expected behavior

- A recipe opened from the populated library renders immediately from cache.
- A quiet background refresh may update it afterward.
- A cold deep link still displays the existing loading and retry states.
- Newly created or edited recipes use their returned data without an immediate duplicate fetch.
- Cache invalidation still refreshes the library after mutations.

## Recommended Order

1. Unify the Save button state.
2. Seed the detail cache when a recipe card is pressed.
3. Seed detail data after create and update mutations.
4. Measure list response size and latency.
5. Only then split the list API into a lightweight, paginated response.

## Acceptance Checks

- Save a recipe without a photo on a slow connection.
- Save a recipe with a photo while image preparation is still running.
- Confirm the Save label never flickers or becomes enabled mid-submit.
- Confirm repeated taps cannot create duplicate recipes.
- Open a recipe already visible in the library and confirm content appears without a blocking loader.
- Open a recipe through a cold deep link and confirm loading, error, and retry states still work.
- Run `bunx tsc --noEmit` after implementation.

## Scope Deliberately Skipped

- No new state-management or caching dependency.
- No FlashList migration; the existing `FlatList` is appropriate.
- No backend rewrite before response size and latency are measured.
