import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createCookbook, CookbookApiError } from "@/shared/cookbook-api";
import { cacheCreatedCookbook } from "@/shared/cookbook-query";
import { CookbookRecipePicker } from "@/shared/components/cookbook/cookbook-recipe-picker";
import {
  getPersonalRecipes,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import { toRecipeCard, type ApiRecipe } from "@/shared/components/recipe/recipe-response";
import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function NewCookbookRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const accessToken = session?.access_token ?? "";
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const recipesQuery = useQuery<ApiRecipe[]>({
    enabled: Boolean(accessToken),
    queryKey: recipeKeys.list,
    staleTime: 60_000,
    queryFn: ({ signal }) => getPersonalRecipes(accessToken, signal),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createCookbook(accessToken, {
        title: title.trim(),
        recipe_ids: [...selectedIds],
      }),
    onSuccess: (cookbook) => {
      cacheCreatedCookbook(queryClient, cookbook);
      router.replace({
        pathname: "/cookbook/[id]",
        params: { id: cookbook.id },
      });
    },
  });
  const saveError = createMutation.isError
    ? createMutation.error instanceof CookbookApiError
      ? createMutation.error.message
      : "Couldn’t create the cookbook. Try again."
    : null;

  useEffect(() => {
    if (saveError) AccessibilityInfo.announceForAccessibility(saveError);
  }, [saveError]);

  const toggleRecipe = (recipeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  };

  if (step === 2) {
    return (
      <CookbookRecipePicker
        error={
          saveError ??
          (recipesQuery.isError ? "Couldn’t load your recipes." : null)
        }
        isLoading={recipesQuery.isPending}
        isSaving={createMutation.isPending}
        onBack={() => setStep(1)}
        onRetry={() => recipesQuery.refetch()}
        onSave={() => createMutation.mutate()}
        onToggle={toggleRecipe}
        recipes={(recipesQuery.data ?? []).map(toRecipeCard)}
        saveLabel="Create cookbook"
        selectedIds={selectedIds}
        title="Choose recipes"
      />
    );
  }

  const continueToRecipes = () => {
    if (!title.trim()) {
      const message = "Enter a cookbook title.";
      setTitleError(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    setTitleError(null);
    setStep(2);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="min-h-16 flex-row items-center border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Cancel cookbook creation"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={() => router.back()}
        >
          <SymbolView
            accessible={false}
            name={{ ios: "xmark", android: "close", web: "close" }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="flex-1 px-2 text-center text-xl font-bold leading-7 text-text-primary"
        >
          New cookbook
        </Text>
        <View className="h-12 w-12" />
      </View>

      <View className="flex-1 items-center px-5 py-8">
        <View className="w-full gap-8" style={{ maxWidth: MaxContentWidth }}>
          <View className="gap-2">
            <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-primary-strong">
              Step 1 of 2
            </Text>
            <Text
              accessibilityRole="header"
              className="text-[28px] font-bold leading-[34px] text-text-primary"
            >
              Name your cookbook
            </Text>
            <Text className="text-base leading-6 text-text-secondary">
              Choose a short title that makes this collection easy to recognize.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-base font-bold leading-6 text-text-primary">
              Cookbook title
            </Text>
            <TextInput
              accessibilityLabel="Cookbook title"
              autoCapitalize="sentences"
              autoFocus
              className={`min-h-14 rounded-xl border-2 bg-surface px-4 py-3 text-base leading-6 text-text-primary outline-none ${titleError ? "border-error" : "border-border focus:border-primary-strong"}`}
              maxLength={100}
              onChangeText={(value) => {
                setTitle(value);
                if (titleError && value.trim()) setTitleError(null);
              }}
              onSubmitEditing={continueToRecipes}
              placeholder="e.g. Weeknight favorites"
              placeholderTextColor={colorTokens.textSecondary}
              returnKeyType="next"
              selectionColor={colorTokens.primaryStrong}
              value={title}
            />
            {titleError ? (
              <Text
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                className="text-sm font-medium leading-5 text-error"
              >
                {titleError}
              </Text>
            ) : (
              <Text className="text-sm leading-5 text-text-secondary">
                {title.length}/100 characters
              </Text>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-80"
            onPress={continueToRecipes}
          >
            <Text className="text-base font-bold leading-6 text-on-primary">
              Choose recipes
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
