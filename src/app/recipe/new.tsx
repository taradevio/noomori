import { apiConfig } from "@/config/api";
import { useSession } from "@/shared/providers/session-providers";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";

import {
  createBlankRecipeDraft,
  RecipeForm,
} from "@/shared/components/recipe/recipe-form";
import { toRecipeCreatePayload } from "@/shared/components/recipe/recipe-payload";
import {
  debugRecipeImage,
  type PreparedRecipePhoto,
} from "@/shared/components/recipe/recipe-image";
import { attachRecipeImage } from "@/shared/components/recipe/recipe-image-storage";
import {
  cacheCreatedRecipe,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import type { ApiRecipe } from "@/shared/components/recipe/recipe-response";
import type { RecipeDraft } from "@/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const blankRecipe = createBlankRecipeDraft();
type RecipeSubmission = {
  draft: RecipeDraft;
  photo: PreparedRecipePhoto | null;
};

export default function NewRecipeRoute() {
  const navigation = useNavigation();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isHandlingPhotoFailure, setIsHandlingPhotoFailure] = useState(false);
  const pendingAction = useRef<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  const allowNavigation = useRef(false);
  const queryClient = useQueryClient();
  const { session } = useSession();

  useEffect(() => {
    // NOTE: Navigation is intercepted only after meaningful local edits. A
    // pristine draft exits immediately without a discard prompt.
    return navigation.addListener("beforeRemove", (event) => {
      if (!dirty || allowNavigation.current) return;

      event.preventDefault();
      pendingAction.current = event.data.action;
      setConfirmDiscard(true);
    });
  }, [dirty, navigation]);

  const closeEditor = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const discard = () => {
    const action = pendingAction.current;
    allowNavigation.current = true;
    setConfirmDiscard(false);

    if (action) {
      navigation.dispatch(action);
    } else {
      router.replace("/");
    }
  };

  const createNewRecipe = async (recipeDraft: RecipeDraft) => {
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Authentication required.");
    // Image persistence is a separate post-create flow. The canonical create
    // payload must never contain the picker URI or other device-local metadata.
    const payload = toRecipeCreatePayload(recipeDraft);
    debugRecipeImage("recipe_create_started", {
      hasPhoto: Boolean(recipeDraft.photo),
    });
    // PERFORMANCE: Measure the API stage separately from photo processing/upload.
    const startedAt = Date.now();
    try {
      const res = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.addRecipes}`,
        {
          method: "POST",
          headers: {
            // The backend validates this token and forwards it to PostgREST so
            // database policies can resolve auth.uid() for the current user.
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(`Server returned status code: ${res.status}`);
      }

      const recipe = (await res.json()) as ApiRecipe;
      if (!recipe.id) throw new Error("Recipe creation returned no ID.");
      debugRecipeImage("recipe_create_completed", {
        recipeId: recipe.id,
        durationMs: Date.now() - startedAt,
      });
      return recipe;
    } catch (error) {
      debugRecipeImage("recipe_create_failed", {
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  const saveNewRecipe = async ({ draft, photo }: RecipeSubmission) => {
    const recipe = await createNewRecipe(draft);
    if (!photo) {
      debugRecipeImage("attachment_skipped", { recipeId: recipe.id });
      return { recipe, photo: null, photoFailed: false };
    }

    try {
      const recipeWithPhoto = await attachRecipeImage(
        recipe.id,
        session!.user.id,
        session!.access_token,
        photo,
      );
      return { recipe: recipeWithPhoto, photo, photoFailed: false };
    } catch (error) {
      debugRecipeImage("recipe_saved_without_photo", {
        recipeId: recipe.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return { recipe, photo, photoFailed: true };
    }
  };

  const finish = async (recipe: ApiRecipe) => {
    // PERFORMANCE: Cancel only the in-flight library request before applying the
    // authoritative create response to both caches.
    await queryClient.cancelQueries({ queryKey: recipeKeys.list, exact: true });
    cacheCreatedRecipe(queryClient, recipe);
    setIsHandlingPhotoFailure(false);
    allowNavigation.current = true;
    router.replace({ pathname: "/recipe/[id]", params: { id: recipe.id } });
  };

  const { mutateAsync, isPending, isError, reset } = useMutation({
    mutationFn: saveNewRecipe,
    onError: () => {
      Alert.alert("Recipe not saved", "Check your connection and try again.");
    },
    onSuccess: async ({ recipe, photo, photoFailed }) => {
      const retryPhoto = async () => {
        if (!photo) return finish(recipe);
        debugRecipeImage("retry_requested", { recipeId: recipe.id });
        setIsHandlingPhotoFailure(true);
        try {
          const recipeWithPhoto = await attachRecipeImage(
            recipe.id,
            session!.user.id,
            session!.access_token,
            photo,
          );
          await finish(recipeWithPhoto);
        } catch (error) {
          debugRecipeImage("retry_failed", {
            recipeId: recipe.id,
            message: error instanceof Error ? error.message : "Unknown error",
          });
          Alert.alert(
            "Photo still not added",
            "The recipe is safe. You can try once more or continue without a photo.",
            [
              { text: "Continue", onPress: () => void finish(recipe) },
              { text: "Try again", onPress: retryPhoto },
            ],
          );
        }
      };

      if (!photoFailed) return finish(recipe);
      setIsHandlingPhotoFailure(true);
      Alert.alert(
        "Recipe saved without its photo",
        "The recipe is safe. Try adding the photo again?",
        [
          { text: "Continue", onPress: () => void finish(recipe) },
          { text: "Try again", onPress: retryPhoto },
        ],
      );
    },
  });

  // NOTE: Keep submit orchestration in the route so the shared form stays
  // persistence-agnostic and cannot start duplicate requests.
  const handleNewRecipe = async (
    value: RecipeDraft,
    photo: PreparedRecipePhoto | null,
  ) => {
    if (isPending || isHandlingPhotoFailure) return;
    if (isError) reset();
    await mutateAsync({ draft: value, photo });
  };

  return (
    <>
      <RecipeForm
        initialDraft={blankRecipe}
        mode="create"
        onClose={closeEditor}
        onDirtyChange={setDirty}
        // NOTE: Route form submissions through the mutation wrapper and expose
        // its pending state so the form disables Save while the request runs.
        onSubmit={handleNewRecipe}
        isSubmitting={isPending || isHandlingPhotoFailure}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmDiscard(false)}
        statusBarTranslucent
        transparent
        visible={confirmDiscard}
      >
        <View className="flex-1 items-center justify-center px-5">
          <Pressable
            accessibilityLabel="Keep editing recipe"
            accessibilityRole="button"
            className="absolute inset-0 bg-text-primary/50"
            onPress={() => setConfirmDiscard(false)}
          />
          <View
            accessibilityRole="alert"
            accessibilityViewIsModal
            className="w-full max-w-[400px] rounded-[20px] border border-border bg-surface p-5 shadow-lg shadow-text-primary/10"
            onAccessibilityEscape={() => setConfirmDiscard(false)}
          >
            <Text
              accessibilityRole="header"
              className="text-xl font-bold leading-7 text-text-primary"
            >
              Discard changes?
            </Text>
            <Text className="mt-2 text-base font-normal leading-6 text-text-secondary">
              Your unsaved recipe changes will be lost.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => setConfirmDiscard(false)}
              >
                <Text className="text-center text-base font-bold text-text-primary">
                  Keep editing
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-error bg-error px-4 py-3 focus:border-text-primary active:opacity-[0.82]"
                onPress={discard}
              >
                <Text className="text-center text-base font-bold text-on-primary">
                  Discard
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
