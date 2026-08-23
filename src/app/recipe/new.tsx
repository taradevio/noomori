import { apiConfig } from "@/config/api";
import { useSession } from "@/shared/providers/session-providers";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import {
  createBlankRecipeDraft,
  RecipeForm,
} from "@/shared/components/recipe/recipe-form";
import type { RecipeDraft } from "@/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const blankRecipe = createBlankRecipeDraft();

export default function NewRecipeRoute() {
  const navigation = useNavigation();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
    const res = await fetch(
      `${apiConfig.backendUrl}${apiConfig.endpoints.addRecipes}`,
      {
        method: "POST",
        headers: {
          // The backend validates this token and forwards it to PostgREST so
          // database policies can resolve auth.uid() for the current user.
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recipeDraft),
      },
    );

    if (!res.ok) {
      throw new Error(`Server returned status code: ${res.status}`);
    }

    return res.json();
  };

  const { mutate, isPending, isError, reset } = useMutation({
    mutationFn: createNewRecipe,
    onSuccess: async (data) => {
      queryClient.invalidateQueries({
        queryKey: ["recipes"],
      });

      // router.replace(`/r`);
    },
  });

  // NOTE: Keep submit orchestration in the route so the shared form stays
  // persistence-agnostic and cannot start duplicate requests.
  const handleNewRecipe = (value: RecipeDraft) => {
    if (isPending) return;
    if (isError) reset();

    console.log(value);
    mutate(value);
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
        isSubmitting={isPending}
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
