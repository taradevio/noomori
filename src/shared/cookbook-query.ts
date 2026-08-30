import type { QueryClient } from "@tanstack/react-query";

import type {
  ApiCookbookDetail,
  ApiCookbookSummary,
} from "@/shared/cookbook-api";

export const cookbookKeys = {
  all: ["cookbooks"] as const,
  list: ["cookbooks", "list"] as const,
  detail: (id: string) => ["cookbooks", "detail", id] as const,
};

function summaryFromDetail(detail: ApiCookbookDetail): ApiCookbookSummary {
  return {
    id: detail.id,
    title: detail.title,
    recipe_count: detail.recipe_count,
    cover_image_urls: detail.recipes
      .map((recipe) => recipe.image_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 4),
  };
}

export function cacheCreatedCookbook(
  queryClient: QueryClient,
  detail: ApiCookbookDetail,
) {
  queryClient.setQueryData(cookbookKeys.detail(detail.id), detail);
  queryClient.setQueryData<ApiCookbookSummary[]>(cookbookKeys.list, (items) =>
    items
      ? [
          summaryFromDetail(detail),
          ...items.filter((item) => item.id !== detail.id),
        ]
      : items,
  );
}

export function cacheUpdatedCookbook(
  queryClient: QueryClient,
  detail: ApiCookbookDetail,
) {
  queryClient.setQueryData(cookbookKeys.detail(detail.id), detail);
  queryClient.setQueryData<ApiCookbookSummary[]>(cookbookKeys.list, (items) =>
    items?.map((item) =>
      item.id === detail.id ? summaryFromDetail(detail) : item,
    ),
  );
}

export function cacheDeletedCookbook(
  queryClient: QueryClient,
  cookbookId: string,
) {
  queryClient.setQueryData<ApiCookbookSummary[]>(cookbookKeys.list, (items) =>
    items?.filter((item) => item.id !== cookbookId),
  );
  queryClient.removeQueries({
    queryKey: cookbookKeys.detail(cookbookId),
    exact: true,
  });
}
