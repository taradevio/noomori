import { apiConfig } from "@/config/api";
import { RecipeCreateScreen } from "@/shared/components/recipe/recipe-create-screen";
import {
  cleanupImportedRecipeImage,
  prepareImportedRecipeImage,
  type ImportedRecipePhoto,
} from "@/shared/components/recipe/recipe-image-import";
import { debugRecipeImage } from "@/shared/components/recipe/recipe-image";
import { isValidRecipeWebsiteUrl } from "@/shared/components/recipe/recipe-payload";
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
import { useEffect, useState } from "react";
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

const MAX_RECIPE_URL_LENGTH = 2_048;
const TEXT_FALLBACK_ERRORS = new Set([
  "page_too_large",
  "unsupported_content_type",
  "recipe_not_found",
]);

const errorMessages: Record<string, string> = {
  unsafe_url:
    "For your safety, this link can’t be opened. Check the URL or try another public recipe page.",
  page_too_large:
    "This page is too large to import. Paste the recipe text instead.",
  unsupported_content_type:
    "This link isn’t an HTML recipe page. Try another link or paste the recipe text.",
  recipe_not_found:
    "We couldn’t find enough recipe information on this page. Paste the recipe text instead.",
  page_unavailable:
    "We couldn’t reach this page. Check that it’s public and try again.",
  fetch_timeout: "This page took too long to respond. Try again.",
};

class WebsiteImportFailure extends Error {
  constructor(public detail: string) {
    super(
      errorMessages[detail] ??
        "We couldn’t import this recipe. Check the link and try again.",
    );
  }
}

export default function ImportRecipeUrlRoute() {
  const router = useRouter();
  const { session } = useSession();
  const [rawUrl, setRawUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [review, setReview] = useState<{
    draft: RecipeDraft;
    photo: ImportedRecipePhoto | null;
    notice: string | null;
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (url: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Authentication required.");

      let response: Response;
      try {
        response = await fetch(
          `${apiConfig.backendUrl}${apiConfig.endpoints.importRecipeUrl}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(apiConfig.timeout),
          },
        );
      } catch {
        throw new Error(
          "We couldn’t connect to Noomori. Check your connection and try again.",
        );
      }
      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // Keep the generic failure message when the server response has no JSON.
        }
        throw new WebsiteImportFailure(detail);
      }
      const imported = (await response.json()) as ImportedRecipeTextDraft;
      let photo: ImportedRecipePhoto | null = null;
      let photoFailed = false;
      // NOTE: A source image is optional enrichment. Download or preparation
      // failure must still open review with the extracted recipe content.
      if (imported.image_url) {
        try {
          photo = await prepareImportedRecipeImage(
            imported.image_url,
            accessToken,
          );
        } catch (error) {
          photoFailed = true;
          debugRecipeImage("website_import_photo_skipped", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      return { imported, photo, photoFailed };
    },
    onSuccess: ({ imported, photo, photoFailed }, submittedUrl) => {
      const importedDraft: RecipeDraft = {
        ...toImportedRecipeDraft(imported),
        photo: photo?.draftPhoto ?? null,
        source: { type: "website", name: "", url: submittedUrl },
      };
      setReview({
        draft: importedDraft,
        photo,
        notice: photoFailed
          ? "The recipe is ready, but its photo couldn’t be imported. You can choose another photo before saving."
          : null,
      });
    },
  });

  const preparedUri = review?.photo?.preparedPhoto.uri;
  useEffect(() => {
    // NOTE: Unfinished imported previews are temporary; saved recipes use their
    // Storage-backed image path and do not depend on this cache entry.
    return () => {
      if (preparedUri) void cleanupImportedRecipeImage(preparedUri);
    };
  }, [preparedUri]);

  if (review) {
    return (
      <RecipeCreateScreen
        initialDraft={review.draft}
        initialNotice={review.notice}
        initialPreparedPhoto={review.photo?.preparedPhoto}
        initiallyDirty
      />
    );
  }

  const trimmedUrl = rawUrl.trim();
  const validUrl = isValidRecipeWebsiteUrl(trimmedUrl);
  const disabled = !trimmedUrl || !validUrl || importMutation.isPending;
  const mutationDetail =
    importMutation.error instanceof WebsiteImportFailure
      ? importMutation.error.detail
      : null;
  const visibleError = validationError ?? importMutation.error?.message;
  const showTextFallback = Boolean(
    mutationDetail && TEXT_FALLBACK_ERRORS.has(mutationDetail),
  );
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const submit = () => {
    if (disabled) return;
    importMutation.mutate(trimmedUrl);
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
                testID="import-url-back"
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
                Import from website
              </Text>
            </View>

            <Text className="mt-5 text-base font-normal leading-6 text-text-secondary">
              Paste a recipe link. You’ll review everything before saving.
            </Text>

            <View className="mt-8">
              <Text className="mb-2 text-sm font-bold leading-5 text-text-primary">
                Recipe link
              </Text>
              <TextInput
                accessibilityHint="Enter a public HTTP or HTTPS recipe link."
                accessibilityLabel="Recipe link"
                autoCapitalize="none"
                autoCorrect={false}
                className={`min-h-12 rounded-xl border-2 bg-surface px-4 py-3 text-base font-normal leading-6 text-text-primary ${focused ? "border-primary-strong" : visibleError ? "border-error" : "border-border"}`}
                editable={!importMutation.isPending}
                keyboardType="url"
                maxLength={MAX_RECIPE_URL_LENGTH}
                onBlur={() => {
                  setFocused(false);
                  setValidationError(
                    trimmedUrl && !validUrl
                      ? "Enter a valid HTTP or HTTPS recipe link."
                      : null,
                  );
                }}
                onChangeText={(url) => {
                  setRawUrl(url);
                  setValidationError(null);
                  if (importMutation.isError) importMutation.reset();
                }}
                onFocus={() => setFocused(true)}
                onSubmitEditing={submit}
                placeholder="https://example.com/recipe"
                placeholderTextColor={colorTokens.textSecondary}
                returnKeyType="go"
                selectionColor={colorTokens.primaryStrong}
                value={rawUrl}
              />
              <Text className="mt-2 text-sm font-normal leading-5 text-text-secondary">
                Public recipe pages only. Sites that require sign-in aren’t
                supported.
              </Text>
              {visibleError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="mt-3 text-sm font-medium leading-5 text-error"
                >
                  {visibleError}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: importMutation.isPending }}
              className="mt-6 min-h-[52px] flex-row items-center justify-center gap-2 rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82] disabled:opacity-50"
              disabled={disabled}
              onPress={submit}
              testID="import-url-submit"
            >
              {importMutation.isPending ? (
                <ActivityIndicator color={colorTokens.onPrimary} size="small" />
              ) : null}
              <Text className="text-center text-base font-bold leading-6 text-on-primary">
                {importMutation.isPending
                  ? "Preparing recipe…"
                  : "Import recipe"}
              </Text>
            </Pressable>

            {showTextFallback ? (
              <Pressable
                accessibilityRole="button"
                className="mt-3 min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => router.push("/recipe/import-text")}
                testID="import-url-text-fallback"
              >
                <Text className="text-center text-base font-bold leading-6 text-primary-strong">
                  Paste recipe text instead
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
