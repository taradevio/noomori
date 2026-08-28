import { apiConfig } from "@/config/api";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";

import { AddRecipeBottomSheet } from "@/shared/components/recipe/add-recipe-bottom-sheet";
import {
  toRecipeCard,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import {
  recipeKeys,
  seedRecipeDetail,
} from "@/shared/components/recipe/recipe-query";
import { RecipesLibraryView } from "@/shared/components/recipe/recipes-library-view";
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

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const section = params.section === "cookbooks" ? "cookbooks" : "recipes";
  const retriedRecipeImages = useRef(false);
  const recipesQuery = useQuery<ApiRecipe[]>({
    enabled: Boolean(session?.access_token),
    queryKey: recipeKeys.list,
    refetchInterval: 45 * 60 * 1000,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.recipes}`,
        {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(apiConfig.timeout),
          ]),
        },
      );
      if (!response.ok) throw new Error("Could not load recipes.");
      return response.json();
    },
  });
  const recipes: LibraryResource<RecipeCardModel> = recipesQuery.isPending
    ? { status: "loading" }
    : recipesQuery.isError
      ? { status: "error", message: "Couldn’t load your recipes." }
      : { status: "ready", data: recipesQuery.data.map(toRecipeCard) };

  return (
    <>
      <RecipesLibraryView
        recipes={recipes}
        cookbooks={emptyCookbooks}
        onAddRecipe={() => setIsAddRecipeOpen(true)}
        onRecipePress={(id) => {
          const recipe = recipesQuery.data?.find((item) => item.id === id);
          if (recipe) {
            // PERFORMANCE: Promote the full list item into detail cache so the
            // detail screen can paint before navigation finishes.
            seedRecipeDetail(queryClient, recipe, recipesQuery.dataUpdatedAt);
          }
          router.push(`/recipe/${id}` as Href);
        }}
        onRecipeImageError={() => {
          if (retriedRecipeImages.current) return;
          retriedRecipeImages.current = true;
          recipesQuery.refetch();
        }}
        onRetryRecipes={() => recipesQuery.refetch()}
        onSectionChange={(nextSection) =>
          router.setParams({ section: nextSection })
        }
        section={section}
      />
      <AddRecipeBottomSheet
        isOpen={isAddRecipeOpen}
        onDismiss={() => setIsAddRecipeOpen(false)}
        onImportFromText={() => {
          setIsAddRecipeOpen(false);
          router.push("/recipe/import-text");
        }}
        onImportFromWebsite={() => {
          setIsAddRecipeOpen(false);
          router.push("/recipe/import-url");
        }}
        onWriteFromScratch={() => {
          // NOTE: Close the native chooser before entering the full-screen form.
          setIsAddRecipeOpen(false);
          router.push("/recipe/new");
        }}
      />
    </>
  );
}
