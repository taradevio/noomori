import { QueryClient } from "@tanstack/react-query";

import type { ApiCookbookDetail, ApiCookbookSummary } from "./cookbook-api";
import {
  cacheCreatedCookbook,
  cacheDeletedCookbook,
  cacheUpdatedCookbook,
  cookbookKeys,
} from "./cookbook-query";

function detail(id: string, title: string): ApiCookbookDetail {
  return { id, title, recipe_count: 0, recipes: [] };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const queryClient = new QueryClient();
const first: ApiCookbookSummary = {
  id: "first",
  title: "First",
  recipe_count: 0,
  cover_image_urls: [],
};
queryClient.setQueryData(cookbookKeys.list, [first]);

cacheCreatedCookbook(queryClient, detail("second", "Second"));
assert(
  queryClient
    .getQueryData<ApiCookbookSummary[]>(cookbookKeys.list)
    ?.map(({ id }) => id)
    .join(",") === "second,first",
  "Create should prepend a cookbook to an existing list.",
);

cacheUpdatedCookbook(queryClient, detail("first", "Renamed"));
assert(
  queryClient
    .getQueryData<ApiCookbookSummary[]>(cookbookKeys.list)
    ?.find(({ id }) => id === "first")?.title === "Renamed",
  "Update should replace the matching summary.",
);

cacheDeletedCookbook(queryClient, "second");
assert(
  queryClient
    .getQueryData<ApiCookbookSummary[]>(cookbookKeys.list)
    ?.map(({ id }) => id)
    .join(",") === "first" &&
    queryClient.getQueryData(cookbookKeys.detail("second")) === undefined,
  "Delete should remove the matching summary and detail only.",
);
