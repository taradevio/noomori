import { apiConfig } from "@/config/api";
import { type Href, useRouter } from "expo-router";
import { useRef } from "react";

import {
  toRecipeCard,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import {
  recipeKeys,
  seedRecipeDetail,
} from "@/shared/components/recipe/recipe-query";
import { RecipesLibraryView } from "@/shared/components/recipe/recipes-library-view";
import { getHouseholdSettings } from "@/shared/household-api";
import { useSession } from "@/shared/providers/session-providers";
import type {
  CookbookCardModel,
  LibraryResource,
  RecipeCardModel,
} from "@/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const emptyCookbooks: LibraryResource<CookbookCardModel> = {
  status: "ready",
  data: [],
};

export default function HouseholdRecipesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const accessToken = session?.access_token ?? "";
  const retriedRecipeImages = useRef(false);
  const householdQuery = useQuery({
    enabled: Boolean(accessToken),
    queryKey: ["household"],
    queryFn: () => getHouseholdSettings(accessToken),
    retry: false,
  });
  // NOTE: Household recipes use their own cache so personal-only mutations do
  // not accidentally expose or remove another member's recipes.
  const recipesQuery = useQuery<ApiRecipe[]>({
    enabled: Boolean(accessToken),
    queryKey: recipeKeys.householdList,
    refetchInterval: 45 * 60 * 1000,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.householdRecipes}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(apiConfig.timeout),
          ]),
        },
      );
      if (!response.ok) throw new Error("Could not load shared recipes.");
      return response.json();
    },
  });
  const recipes: LibraryResource<RecipeCardModel> = recipesQuery.isPending
    ? { status: "loading" }
    : recipesQuery.isError
      ? { status: "error", message: "Couldn’t load shared recipes." }
      : { status: "ready", data: recipesQuery.data.map(toRecipeCard) };

  return (
    <RecipesLibraryView
      cookbooks={emptyCookbooks}
      householdName={householdQuery.data?.household_name}
      mode="household"
      onRecipeImageError={() => {
        if (retriedRecipeImages.current) return;
        retriedRecipeImages.current = true;
        recipesQuery.refetch();
      }}
      onRecipePress={(id) => {
        const recipe = recipesQuery.data?.find((item) => item.id === id);
        if (recipe) {
          seedRecipeDetail(queryClient, recipe, recipesQuery.dataUpdatedAt);
        }
        router.navigate(`/recipe/${id}` as Href);
      }}
      onRetryRecipes={() => recipesQuery.refetch()}
      onShareRecipe={() =>
        router.navigate({ pathname: "/", params: { section: "recipes" } })
      }
      recipes={recipes}
    />
  );
}
