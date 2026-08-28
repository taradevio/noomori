import { apiConfig } from "@/config/api";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RecipeForm } from "@/shared/components/recipe/recipe-form";
import {
  debugRecipeImage,
  type PreparedRecipePhoto,
} from "@/shared/components/recipe/recipe-image";
import {
  attachRecipeImage,
  removeRecipeImage,
} from "@/shared/components/recipe/recipe-image-storage";
import { toRecipeCreatePayload } from "@/shared/components/recipe/recipe-payload";
import {
  cacheUpdatedRecipe,
  RECIPE_DETAIL_STALE_TIME,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import {
  toRecipeDraft,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import { colorTokens } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import type { RecipeDraft } from "@/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type EditSubmission = {
  draft: RecipeDraft;
  photo: PreparedRecipePhoto | null;
};

export default function EditRecipeRoute() {
  const navigation = useNavigation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const normalizedRecipeId = recipeId?.trim() || "";
  const [dirty, setDirty] = useState(false);
  const [isHandlingPhotoFailure, setIsHandlingPhotoFailure] = useState(false);
  const allowNavigation = useRef(false);

  const recipeQuery = useQuery<ApiRecipe>({
    enabled: Boolean(normalizedRecipeId && session?.access_token),
    queryKey: recipeKeys.detail(normalizedRecipeId),
    // PERFORMANCE: Reuse the detail already opened before entering edit.
    staleTime: RECIPE_DETAIL_STALE_TIME,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.recipe(normalizedRecipeId)}`,
        {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          // PERFORMANCE: Abort stale editor loads rather than finishing unused work.
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(apiConfig.timeout),
          ]),
        },
      );
      if (!response.ok) throw new Error("Could not load recipe.");
      return response.json();
    },
  });

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirty || allowNavigation.current) return;
        event.preventDefault();
        Alert.alert(
          "Discard changes?",
          "Your unsaved recipe changes will be lost.",
          [
            { text: "Keep editing", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                allowNavigation.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ],
        );
      }),
    [dirty, navigation],
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const finish = async (recipe: ApiRecipe) => {
    // PERFORMANCE: Stop both list requests before applying the authoritative
    // response so a stale household request cannot overwrite an edited recipe.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: recipeKeys.list, exact: true }),
      queryClient.cancelQueries({
        queryKey: recipeKeys.householdList,
        exact: true,
      }),
    ]);
    cacheUpdatedRecipe(queryClient, recipe);
    setIsHandlingPhotoFailure(false);
    allowNavigation.current = true;
    router.dismissTo({
      pathname: "/recipe/[id]",
      params: { id: normalizedRecipeId },
    });
  };

  const performPhotoChange = async ({ draft, photo }: EditSubmission) => {
    const accessToken = session?.access_token;
    const ownerId = session?.user.id;
    if (!accessToken || !ownerId) throw new Error("Authentication required.");

    if (photo) {
      return attachRecipeImage(normalizedRecipeId, ownerId, accessToken, photo);
    } else if (recipeQuery.data?.image_path && !draft.photo) {
      return removeRecipeImage(normalizedRecipeId, accessToken);
    }
    return null;
  };

  const updateRecipe = async (submission: EditSubmission) => {
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Authentication required.");
    debugRecipeImage("recipe_update_started", {
      recipeId: normalizedRecipeId,
      photoChange: submission.photo
        ? "replace"
        : recipeQuery.data?.image_path && !submission.draft.photo
          ? "remove"
          : "unchanged",
    });
    // PERFORMANCE: Measure recipe persistence separately from photo work.
    const startedAt = Date.now();
    let updatedRecipe: ApiRecipe;
    try {
      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.recipe(normalizedRecipeId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(toRecipeCreatePayload(submission.draft)),
          signal: AbortSignal.timeout(apiConfig.timeout),
        },
      );
      if (!response.ok) {
        throw new Error(`Could not update recipe (${response.status}).`);
      }
      updatedRecipe = (await response.json()) as ApiRecipe;
      debugRecipeImage("recipe_update_completed", {
        recipeId: normalizedRecipeId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      debugRecipeImage("recipe_update_failed", {
        recipeId: normalizedRecipeId,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }

    try {
      const recipeWithPhotoChange = await performPhotoChange(submission);
      return {
        recipe: recipeWithPhotoChange ?? updatedRecipe,
        submission,
        photoFailed: false,
      };
    } catch (error) {
      debugRecipeImage("recipe_updated_without_photo_change", {
        recipeId: normalizedRecipeId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return { recipe: updatedRecipe, submission, photoFailed: true };
    }
  };

  const { mutateAsync, isPending, isError, reset } = useMutation({
    mutationFn: updateRecipe,
    onError: () => {
      Alert.alert("Recipe not saved", "Check your connection and try again.");
    },
    onSuccess: ({ recipe, submission, photoFailed }) => {
      if (!photoFailed) return finish(recipe);
      setIsHandlingPhotoFailure(true);

      const retryPhoto = async () => {
        debugRecipeImage("retry_requested", { recipeId: normalizedRecipeId });
        setIsHandlingPhotoFailure(true);
        try {
          const recipeWithPhotoChange = await performPhotoChange(submission);
          await finish(recipeWithPhotoChange ?? recipe);
        } catch (error) {
          debugRecipeImage("retry_failed", {
            recipeId: normalizedRecipeId,
            message: error instanceof Error ? error.message : "Unknown error",
          });
          Alert.alert(
            "Photo still not changed",
            "Your recipe edits are safe. You can try once more or continue with the previous photo.",
            [
              { text: "Continue", onPress: () => void finish(recipe) },
              { text: "Try again", onPress: retryPhoto },
            ],
          );
        }
      };

      Alert.alert(
        "Recipe saved, but the photo wasn’t changed",
        "Your recipe edits are safe. Try the photo again?",
        [
          { text: "Continue", onPress: () => void finish(recipe) },
          { text: "Try again", onPress: retryPhoto },
        ],
      );
    },
  });

  if (recipeQuery.data) {
    return (
      <RecipeForm
        initialDraft={toRecipeDraft(recipeQuery.data)}
        isSubmitting={isPending || isHandlingPhotoFailure}
        mode="edit"
        onClose={close}
        onDirtyChange={setDirty}
        onSubmit={async (draft, photo) => {
          if (isPending || isHandlingPhotoFailure) return;
          if (isError) reset();
          await mutateAsync({ draft, photo });
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-16 flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Close recipe editor"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={close}
        >
          <SymbolView
            accessible={false}
            name={{ ios: "xmark", android: "close", web: "close" }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          className="shrink flex-1 text-xl font-bold leading-7 text-text-primary"
        >
          {recipeQuery.isError ? "Couldn’t load recipe" : "Loading recipe…"}
        </Text>
      </View>
      {recipeQuery.isError ? (
        <View className="flex-1 items-center justify-center px-5">
          <Pressable
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
            onPress={() => recipeQuery.refetch()}
          >
            <Text className="text-base font-bold leading-6 text-primary-strong">
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
