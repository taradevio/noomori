import {
  type Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useRef, useState } from "react";

import { AddRecipeBottomSheet } from "@/shared/components/recipe/add-recipe-bottom-sheet";
import { getCookbooks, toCookbookCard } from "@/shared/cookbook-api";
import { cookbookKeys } from "@/shared/cookbook-query";
import {
  toRecipeCard,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import {
  getPersonalRecipes,
  recipeKeys,
  seedRecipeDetail,
} from "@/shared/components/recipe/recipe-query";
import { RecipesLibraryView } from "@/shared/components/recipe/recipes-library-view";
import {
  getHouseholdActivity,
  householdActivityKey,
} from "@/shared/household-api";
import { useSession } from "@/shared/providers/session-providers";
import type { LibraryResource, RecipeCardModel } from "@/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const section = params.section === "cookbooks" ? "cookbooks" : "recipes";
  const retriedRecipeImages = useRef(false);
  const hasFocusedActivity = useRef(false);
  const accessToken = session?.access_token ?? "";
  const activityQuery = useQuery({
    enabled: Boolean(accessToken),
    queryKey: householdActivityKey,
    queryFn: () => getHouseholdActivity(accessToken),
    retry: false,
    staleTime: 60_000,
  });
  const refetchActivity = activityQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      if (hasFocusedActivity.current) void refetchActivity();
      hasFocusedActivity.current = true;
    }, [accessToken, refetchActivity]),
  );
  const recipesQuery = useQuery<ApiRecipe[]>({
    enabled: Boolean(session?.access_token),
    queryKey: recipeKeys.list,
    refetchInterval: 45 * 60 * 1000,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      getPersonalRecipes(session?.access_token ?? "", signal),
  });
  const recipes: LibraryResource<RecipeCardModel> = recipesQuery.isPending
    ? { status: "loading" }
    : recipesQuery.isError
      ? { status: "error", message: "Couldn’t load your recipes." }
      : { status: "ready", data: recipesQuery.data.map(toRecipeCard) };
  const cookbooksQuery = useQuery({
    enabled: Boolean(session?.access_token),
    queryKey: cookbookKeys.list,
    staleTime: 60_000,
    retry: false,
    queryFn: () => getCookbooks(session?.access_token ?? ""),
  });
  const cookbooks = cookbooksQuery.isPending
    ? ({ status: "loading" } as const)
    : cookbooksQuery.isError
      ? ({ status: "error", message: "Couldn’t load your cookbooks." } as const)
      : ({
          status: "ready",
          data: cookbooksQuery.data.map(toCookbookCard),
        } as const);

  return (
    <>
      <RecipesLibraryView
        recipes={recipes}
        cookbooks={cookbooks}
        onActivityPress={() => router.push("/activity" as Href)}
        onAddRecipe={() => setIsAddRecipeOpen(true)}
        onCookbookPress={(id) => router.push(`/cookbook/${id}` as Href)}
        onCreateCookbook={() => router.push("/cookbook/new")}
        onRecipePress={(id) => {
          const recipe = recipesQuery.data?.find((item) => item.id === id);
          if (recipe) {
            // PERFORMANCE: Promote the full list item into detail cache so the
            // detail screen can paint before navigation finishes.
            seedRecipeDetail(queryClient, recipe, recipesQuery.dataUpdatedAt);
          }
          router.navigate(`/recipe/${id}` as Href);
        }}
        onRecipeImageError={() => {
          if (retriedRecipeImages.current) return;
          retriedRecipeImages.current = true;
          recipesQuery.refetch();
        }}
        onRetryRecipes={() => recipesQuery.refetch()}
        onRetryCookbooks={() => cookbooksQuery.refetch()}
        onSectionChange={(nextSection) =>
          router.setParams({ section: nextSection })
        }
        section={section}
        showActivity={(activityQuery.data?.member_count ?? 0) >= 2}
        unreadActivityCount={activityQuery.data?.unread_count ?? 0}
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
