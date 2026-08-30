import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

import {
  CookbookApiError,
  getCookbook,
  replaceCookbookRecipes,
  type ApiCookbookDetail,
} from "@/shared/cookbook-api";
import {
  cacheUpdatedCookbook,
  cookbookKeys,
} from "@/shared/cookbook-query";
import { CookbookRecipePicker } from "@/shared/components/cookbook/cookbook-recipe-picker";
import {
  getPersonalRecipes,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import { toRecipeCard, type ApiRecipe } from "@/shared/components/recipe/recipe-response";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function EditCookbookRecipesRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { session } = useSession();
  const initialized = useRef(false);
  const cookbookId = Array.isArray(params.id) ? params.id[0] : params.id;
  const normalizedCookbookId = cookbookId?.trim() ?? "";
  const accessToken = session?.access_token ?? "";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const cookbookQuery = useQuery<ApiCookbookDetail>({
    enabled: Boolean(accessToken && normalizedCookbookId),
    queryKey: cookbookKeys.detail(normalizedCookbookId),
    staleTime: 60_000,
    queryFn: () => getCookbook(accessToken, normalizedCookbookId),
  });
  const recipesQuery = useQuery<ApiRecipe[]>({
    enabled: Boolean(accessToken),
    queryKey: recipeKeys.list,
    staleTime: 60_000,
    queryFn: ({ signal }) => getPersonalRecipes(accessToken, signal),
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      replaceCookbookRecipes(accessToken, normalizedCookbookId, {
        recipe_ids: [...selectedIds],
      }),
    onSuccess: (cookbook) => {
      cacheUpdatedCookbook(queryClient, cookbook);
      AccessibilityInfo.announceForAccessibility("Cookbook recipes updated");
      router.back();
    },
  });

  useEffect(() => {
    if (!cookbookQuery.data || initialized.current) return;
    initialized.current = true;
    setSelectedIds(new Set(cookbookQuery.data.recipes.map((recipe) => recipe.id)));
  }, [cookbookQuery.data]);

  const error = saveMutation.isError
    ? saveMutation.error instanceof CookbookApiError
      ? saveMutation.error.message
      : "Couldn’t update the cookbook. Try again."
    : cookbookQuery.isError
      ? "Couldn’t load the cookbook."
      : recipesQuery.isError
        ? "Couldn’t load your recipes."
        : null;

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <CookbookRecipePicker
      error={error}
      isLoading={cookbookQuery.isPending || recipesQuery.isPending}
      isSaving={saveMutation.isPending}
      onBack={() => router.back()}
      onRetry={() => {
        if (cookbookQuery.isError) cookbookQuery.refetch();
        if (recipesQuery.isError) recipesQuery.refetch();
      }}
      onSave={() => {
        if (initialized.current) saveMutation.mutate();
      }}
      onToggle={(recipeId) =>
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(recipeId)) next.delete(recipeId);
          else next.add(recipeId);
          return next;
        })
      }
      recipes={(recipesQuery.data ?? []).map(toRecipeCard)}
      saveLabel="Save changes"
      selectedIds={selectedIds}
      title="Edit recipes"
    />
  );
}
