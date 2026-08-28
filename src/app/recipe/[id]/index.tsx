import { apiConfig } from "@/config/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useRef } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getHouseholdSettings } from "@/shared/household-api";
import { RecipeDetailView } from "@/shared/components/recipe/recipe-detail-view";
import {
  cacheDeletedRecipe,
  cacheUpdatedRecipe,
  RECIPE_DETAIL_STALE_TIME,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import {
  toRecipeDetail,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import { colorTokens } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function RecipeDetailRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { session } = useSession();
  const deleteStarted = useRef(false);
  const retriedImage = useRef(false);
  const recipeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const normalizedRecipeId = recipeId?.trim() || "";
  const accessToken = session?.access_token ?? "";
  const recipeQuery = useQuery<ApiRecipe>({
    enabled: Boolean(normalizedRecipeId && session?.access_token),
    queryKey: recipeKeys.detail(normalizedRecipeId),
    // PERFORMANCE: A freshly seeded detail skips GET; older cache still renders
    // immediately while TanStack Query refreshes it in the background.
    refetchInterval: 45 * 60 * 1000,
    staleTime: RECIPE_DETAIL_STALE_TIME,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.recipe(normalizedRecipeId)}`,
        {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          // PERFORMANCE: Abort detail work when this query is superseded.
          signal,
        },
      );
      if (!response.ok) throw new Error("Could not load recipe.");
      return response.json();
    },
  });
  const recipe = recipeQuery.data ? toRecipeDetail(recipeQuery.data) : null;
  // NOTE: Recipe ownership—not household role—controls mutation actions.
  const canManage = recipeQuery.data?.owner_user_id === session?.user.id;
  const householdQuery = useQuery({
    enabled: Boolean(canManage && accessToken),
    queryKey: ["household"],
    queryFn: () => getHouseholdSettings(accessToken),
    retry: false,
  });

  const shareMutation = useMutation<ApiRecipe, Error, boolean>({
    mutationFn: async (shared) => {
      if (!accessToken) throw new Error("Authentication required.");
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.recipeShare(normalizedRecipeId)}`,
        {
          method: shared ? "PUT" : "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(apiConfig.timeout),
        },
      );
      if (!response.ok) throw new Error("Could not change recipe sharing.");
      return response.json();
    },
    onSuccess: async (updatedRecipe, shared) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: recipeKeys.list,
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: recipeKeys.householdList,
          exact: true,
        }),
      ]);
      cacheUpdatedRecipe(queryClient, updatedRecipe);
      AccessibilityInfo.announceForAccessibility(
        shared
          ? "Recipe shared with household"
          : "Recipe unshared from household",
      );
    },
  });

  // NOTE: Keep the detail and caches intact until the server confirms deletion.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const startedAt = Date.now();
      if (__DEV__) {
        console.debug("[recipe-delete] request_started", {
          recipeId: normalizedRecipeId,
        });
      }
      try {
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("Authentication required.");
        const response = await fetch(
          `${apiConfig.backendUrl}${apiConfig.endpoints.recipe(normalizedRecipeId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(apiConfig.timeout),
          },
        );
        if (__DEV__) {
          console.debug("[recipe-delete] response_received", {
            recipeId: normalizedRecipeId,
            status: response.status,
            durationMs: Date.now() - startedAt,
          });
        }
        if (!response.ok) {
          throw new Error(`Could not delete recipe (${response.status}).`);
        }
      } catch (error) {
        if (__DEV__) {
          console.debug("[recipe-delete] request_failed", {
            recipeId: normalizedRecipeId,
            durationMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
        throw error;
      }
    },
    onError: () => {
      deleteStarted.current = false;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: recipeKeys.list,
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: recipeKeys.householdList,
          exact: true,
        }),
      ]);
      cacheDeletedRecipe(queryClient, normalizedRecipeId);
      if (__DEV__) {
        console.debug("[recipe-delete] cache_updated_and_navigating", {
          recipeId: normalizedRecipeId,
        });
      }
      router.dismissTo("/");
    },
  });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (recipe) {
    return (
      <RecipeDetailView
        deleteError={deleteMutation.isError}
        isDeleting={deleteMutation.isPending}
        isSharing={shareMutation.isPending}
        householdName={householdQuery.data?.household_name}
        onBack={close}
        onDelete={
          canManage
            ? () => {
                if (deleteStarted.current) return;
                deleteStarted.current = true;
                if (__DEV__) {
                  console.debug("[recipe-delete] deletion_confirmed", {
                    recipeId: normalizedRecipeId,
                  });
                }
                deleteMutation.mutate();
              }
            : undefined
        }
        onEdit={
          canManage
            ? () =>
                router.push({
                  pathname: "/recipe/[id]/edit",
                  params: { id: recipe.id },
                })
            : undefined
        }
        onImageError={() => {
          if (retriedImage.current) return;
          retriedImage.current = true;
          recipeQuery.refetch();
        }}
        onRetryShare={
          shareMutation.isError && shareMutation.variables !== undefined
            ? () => shareMutation.mutate(shareMutation.variables!)
            : undefined
        }
        onSetShared={
          canManage &&
          (recipe.isShared || (householdQuery.data?.member_count ?? 0) >= 2)
            ? (shared) => shareMutation.mutate(shared)
            : undefined
        }
        recipe={recipe}
        shareErrorMode={
          shareMutation.isError
            ? shareMutation.variables
              ? "share"
              : "unshare"
            : undefined
        }
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-16 flex-row items-center border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back to recipes"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={close}
        >
          <SymbolView
            accessible={false}
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center px-5 py-10">
        <View className="w-full max-w-[440px] items-center rounded-2xl border border-border bg-surface px-5 py-8">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle">
            <SymbolView
              accessible={false}
              name={{
                ios: "fork.knife",
                android: "restaurant",
                web: "restaurant",
              }}
              size={26}
              tintColor={colorTokens.primaryStrong}
            />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            className="text-center text-xl font-bold leading-7 text-text-primary"
          >
            {recipeQuery.isError ? "Couldn’t load recipe" : "Loading recipe…"}
          </Text>
          <Text className="mt-2 text-center text-base leading-6 text-text-secondary">
            {recipeQuery.isError
              ? "Check your connection and try again."
              : "Your saved recipe will appear here shortly."}
          </Text>
          {recipeQuery.isError ? (
            <Pressable
              accessibilityRole="button"
              className="mt-5 min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
              onPress={() => recipeQuery.refetch()}
            >
              <Text className="text-base font-bold leading-6 text-primary-strong">
                Try again
              </Text>
            </Pressable>
          ) : null}
          <Text className="mt-4 text-center text-sm font-medium leading-5 text-text-secondary">
            Recipe ID: {normalizedRecipeId || "Missing"}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
