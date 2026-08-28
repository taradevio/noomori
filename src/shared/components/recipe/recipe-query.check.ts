import { QueryClient } from "@tanstack/react-query";

import {
  cacheCreatedRecipe,
  cacheDeletedRecipe,
  cacheUpdatedRecipe,
  recipeKeys,
  seedRecipeDetail,
} from "./recipe-query";
import {
  toRecipeCard,
  toRecipeDetail,
  type ApiRecipe,
} from "./recipe-response";

function recipe(id: string, title = id): ApiRecipe {
  return {
    id,
    is_shared: false,
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
const shared = { ...recipe("shared"), is_shared: true };
const peerShared = { ...recipe("peer-shared"), is_shared: true };

assert(
  toRecipeCard(shared).isShared && toRecipeDetail(shared).isShared,
  "Shared state should map to both card and detail models.",
);

queryClient.setQueryData(recipeKeys.list, [first, second]);
queryClient.setQueryData(recipeKeys.householdList, [peerShared]);
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

cacheUpdatedRecipe(queryClient, shared);
assert(
  queryClient.getQueryData<ApiRecipe>(recipeKeys.detail(shared.id))?.is_shared,
  "Share updates should replace the detail cache.",
);
assert(
  queryClient
    .getQueryData<ApiRecipe[]>(recipeKeys.householdList)
    ?.map(({ id }) => id)
    .join(",") === "shared,peer-shared",
  "Sharing should add the recipe to an existing household list.",
);
cacheUpdatedRecipe(queryClient, { ...shared, is_shared: false });
assert(
  queryClient
    .getQueryData<ApiRecipe[]>(recipeKeys.householdList)
    ?.map(({ id }) => id)
    .join(",") === "peer-shared",
  "Unsharing should remove the recipe from the household list.",
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
queryClient.setQueryData(recipeKeys.householdList, [shared, peerShared]);
cacheDeletedRecipe(queryClient, shared.id);
assert(
  queryClient
    .getQueryData<ApiRecipe[]>(recipeKeys.householdList)
    ?.map(({ id }) => id)
    .join(",") === "peer-shared",
  "Delete should remove the recipe from the household list.",
);
assert(
  queryClient.getQueryData(recipeKeys.detail(first.id)) === undefined &&
    queryClient.getQueryData(recipeKeys.detail(second.id)) === second,
  "Delete should remove only its matching detail cache.",
);
