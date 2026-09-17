import type { QueryClient } from "@tanstack/react-query";

import { recipeKeys } from "@/shared/components/recipe/recipe-query";

export async function clearHouseholdTransitionCaches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ["household"] }),
    queryClient.cancelQueries({ queryKey: recipeKeys.list }),
  ]);
  queryClient.removeQueries({ queryKey: ["household"] });
  queryClient.removeQueries({ queryKey: recipeKeys.list });
}
