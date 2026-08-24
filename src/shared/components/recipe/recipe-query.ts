import type { QueryClient } from "@tanstack/react-query";

import type { ApiRecipe } from "./recipe-response";

export const recipeKeys = {
  list: ["recipes"] as const,
  detail: (id: string) => ["recipes", id] as const,
};

// PERFORMANCE: List-seeded and mutation-returned details stay fresh long enough
// to open immediately without a blocking detail request.
export const RECIPE_DETAIL_STALE_TIME = 60_000;

// PERFORMANCE: Preserve the list query's timestamp when promoting a list item;
// old data still renders immediately but refreshes in the background.
export function seedRecipeDetail(
  queryClient: QueryClient,
  recipe: ApiRecipe,
  updatedAt?: number,
) {
  queryClient.setQueryData(
    recipeKeys.detail(recipe.id),
    recipe,
    updatedAt === undefined ? undefined : { updatedAt },
  );
}

export function cacheCreatedRecipe(
  queryClient: QueryClient,
  recipe: ApiRecipe,
) {
  // PERFORMANCE: Mutation responses are authoritative, so update existing
  // caches directly instead of invalidating them and downloading the same data.
  seedRecipeDetail(queryClient, recipe);
  queryClient.setQueryData<ApiRecipe[]>(recipeKeys.list, (recipes) =>
    recipes
      ? [recipe, ...recipes.filter((existing) => existing.id !== recipe.id)]
      : recipes,
  );
}

export function cacheUpdatedRecipe(
  queryClient: QueryClient,
  recipe: ApiRecipe,
) {
  // PERFORMANCE: Keep list order stable and avoid creating a partial list cache
  // when the library has never been loaded.
  seedRecipeDetail(queryClient, recipe);
  queryClient.setQueryData<ApiRecipe[]>(recipeKeys.list, (recipes) =>
    recipes?.map((existing) => (existing.id === recipe.id ? recipe : existing)),
  );
}

// NOTE: Delete cache entries only after the API returns success; deletion is not optimistic.
export function cacheDeletedRecipe(queryClient: QueryClient, recipeId: string) {
  queryClient.setQueryData<ApiRecipe[]>(recipeKeys.list, (recipes) =>
    recipes?.filter((recipe) => recipe.id !== recipeId),
  );
  queryClient.removeQueries({
    queryKey: recipeKeys.detail(recipeId),
    exact: true,
  });
}
