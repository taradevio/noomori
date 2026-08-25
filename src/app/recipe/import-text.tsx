import { apiConfig } from "@/config/api";
import { RecipeCreateScreen } from "@/shared/components/recipe/recipe-create-screen";
import {
  toImportedRecipeDraft,
  type ImportedRecipeTextDraft,
} from "@/shared/components/recipe/recipe-text-import";
import { colorTokens } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import type { RecipeDraft } from "@/shared/types";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_RECIPE_TEXT_LENGTH = 20_000;

export default function ImportRecipeTextRoute() {
  const router = useRouter();
  const { session } = useSession();
  const [rawText, setRawText] = useState("");
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const importMutation = useMutation({
    mutationFn: async (text: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Authentication required.");

      const response = await fetch(
        `${apiConfig.backendUrl}${apiConfig.endpoints.importRecipeText}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(apiConfig.timeout),
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 422
            ? "We couldn’t identify enough recipe information. Edit the text and try again."
            : "We couldn’t process this recipe. Check your connection and try again.",
        );
      }
      return (await response.json()) as ImportedRecipeTextDraft;
    },
    onSuccess: (imported) => setDraft(toImportedRecipeDraft(imported)),
  });

  if (draft) {
    return <RecipeCreateScreen initialDraft={draft} initiallyDirty />;
  }

  const disabled = !rawText.trim() || importMutation.isPending;
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="grow items-center px-5 py-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[640px] flex-1">
            <View className="min-h-12 flex-row items-center gap-3">
              <Pressable
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
                onPress={close}
                testID="import-text-back"
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
              <Text
                accessibilityRole="header"
                className="shrink text-2xl font-bold leading-[30px] text-text-primary"
              >
                Import from text
              </Text>
            </View>

            <Text className="mt-5 text-base font-normal leading-6 text-text-secondary">
              Paste one structured recipe from notes, messages, or another
              document. You’ll review everything before saving.
            </Text>

            <View className="mt-8">
              <Text className="mb-2 text-sm font-bold leading-5 text-text-primary">
                Recipe text
              </Text>
              <TextInput
                accessibilityHint="Paste one recipe, up to 20,000 characters."
                accessibilityLabel="Recipe text"
                className={`min-h-[280px] rounded-2xl border-2 bg-surface px-4 py-4 text-base font-normal leading-6 text-text-primary ${focused ? "border-primary-strong" : importMutation.isError ? "border-error" : "border-border"}`}
                maxLength={MAX_RECIPE_TEXT_LENGTH}
                multiline
                onBlur={() => setFocused(false)}
                onChangeText={(text) => {
                  setRawText(text);
                  if (importMutation.isError) importMutation.reset();
                }}
                onFocus={() => setFocused(true)}
                placeholder="Paste recipe here..."
                placeholderTextColor={colorTokens.textSecondary}
                selectionColor={colorTokens.primaryStrong}
                textAlignVertical="top"
                value={rawText}
              />
              <Text className="mt-2 text-sm font-normal leading-5 text-text-secondary">
                Paste one recipe, up to 20,000 characters.
              </Text>
              {importMutation.isError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="mt-3 text-sm font-medium leading-5 text-error"
                >
                  {importMutation.error.message}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: importMutation.isPending }}
              className="mt-6 min-h-[52px] flex-row items-center justify-center gap-2 rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82] disabled:opacity-50"
              disabled={disabled}
              onPress={() => importMutation.mutate(rawText)}
              testID="import-text-submit"
            >
              {importMutation.isPending ? (
                <ActivityIndicator color={colorTokens.onPrimary} size="small" />
              ) : null}
              <Text className="text-center text-base font-bold leading-6 text-on-primary">
                {importMutation.isPending
                  ? "Importing…"
                  : importMutation.isError
                    ? "Try again"
                    : "Import recipe"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
