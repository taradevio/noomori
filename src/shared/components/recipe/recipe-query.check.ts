import { QueryClient } from "@tanstack/react-query";

import {
  cacheCreatedRecipe,
  cacheDeletedRecipe,
  cacheUpdatedRecipe,
  recipeKeys,
  seedRecipeDetail,
} from "./recipe-query";
import type { ApiRecipe } from "./recipe-response";

function recipe(id: string, title = id): ApiRecipe {
  return {
    id,
    owner_user_id: "owner",
    title,
    description: null,
    image_path: null,
    image_url: null,
    ingredients: [],
    instructions: [],
    servings: 1,
    prep_time_minutes: null,
    cook_time_minutes: null,
    nutrition_per_serving: null,
    source_type: "my_recipe",
    source_person_name: null,
    source_url: null,
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const queryClient = new QueryClient();
const first = recipe("first");
const second = recipe("second");

queryClient.setQueryData(recipeKeys.list, [first, second]);
cacheCreatedRecipe(queryClient, recipe("third"));
cacheCreatedRecipe(queryClient, recipe("third", "Updated third"));
const afterCreate = queryClient.getQueryData<ApiRecipe[]>(recipeKeys.list)!;
assert(
  afterCreate.map(({ id }) => id).join(",") === "third,first,second",
  "Create should prepend exactly once.",
);

cacheUpdatedRecipe(queryClient, recipe("first", "Updated first"));
const afterUpdate = queryClient.getQueryData<ApiRecipe[]>(recipeKeys.list)!;
assert(
  afterUpdate.map(({ id }) => id).join(",") === "third,first,second" &&
    afterUpdate[1].title === "Updated first",
  "Update should replace without reordering.",
);

const emptyClient = new QueryClient();
cacheCreatedRecipe(emptyClient, first);
cacheUpdatedRecipe(emptyClient, second);
assert(
  emptyClient.getQueryData(recipeKeys.list) === undefined,
  "Create should not fabricate a list cache.",
);

const updatedAt = Date.now() - 10_000;
seedRecipeDetail(queryClient, second, updatedAt);
assert(
  queryClient.getQueryState(recipeKeys.detail(second.id))?.dataUpdatedAt ===
    updatedAt,
  "Library seeding should preserve the source timestamp.",
);

await queryClient.cancelQueries({ queryKey: recipeKeys.list, exact: true });
assert(
  queryClient.getQueryData(recipeKeys.detail(second.id)) === second,
  "Cancelling the exact list query should leave detail data intact.",
);

seedRecipeDetail(queryClient, first);
seedRecipeDetail(queryClient, second);
cacheDeletedRecipe(queryClient, first.id);
assert(
  queryClient
    .getQueryData<ApiRecipe[]>(recipeKeys.list)
    ?.map(({ id }) => id)
    .join(",") === "third,second",
  "Delete should remove exactly one list entry.",
);
assert(
  queryClient.getQueryData(recipeKeys.detail(first.id)) === undefined &&
    queryClient.getQueryData(recipeKeys.detail(second.id)) === second,
  "Delete should remove only its matching detail cache.",
);
