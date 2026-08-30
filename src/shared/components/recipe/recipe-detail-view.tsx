import {
  BottomSheetModal,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import type { RecipeDetailModel } from "@/shared/types";

import {
  formatIngredientMeasurement,
  type MeasurementDisplayMode,
  nutritionFields,
} from "./recipe-calculations";

type RecipeDetailViewProps = {
  deleteError?: boolean;
  householdName?: string;
  isDeleting?: boolean;
  isSharing?: boolean;
  onBack: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onImageError?: () => void;
  onRetryShare?: () => void;
  onSetShared?: (shared: boolean) => void;
  recipe: RecipeDetailModel;
  shareErrorMode?: "share" | "unshare";
};

const measurementModes = [
  ["original", "Original"],
  ["metric", "Metric"],
  ["us", "US"],
] as const satisfies readonly (readonly [MeasurementDisplayMode, string])[];

function formatDuration(minutes: number | null) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} hr` : null, remainder ? `${remainder} min` : null]
    .filter(Boolean)
    .join(" ");
}

function sourceLabel(recipe: RecipeDetailModel) {
  if (recipe.source.type === "family-friend") {
    return recipe.source.name.trim() || "Family or friend";
  }
  if (recipe.source.type === "website") {
    try {
      return new URL(recipe.source.url).hostname.replace(/^www\./, "");
    } catch {
      return "Website";
    }
  }
  return "My recipe";
}

export function RecipeDetailView({
  deleteError = false,
  householdName,
  isDeleting = false,
  isSharing = false,
  onBack,
  onDelete,
  onEdit,
  onImageError,
  onRetryShare,
  onSetShared,
  recipe,
  shareErrorMode,
}: RecipeDetailViewProps) {
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const confirmationSheetRef = useRef<BottomSheetModal>(null);
  const shareConfirmationSheetRef = useRef<BottomSheetModal>(null);
  const deleteAfterDismiss = useRef(false);
  const shareAfterDismiss = useRef<boolean | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const safeAreaInsets = useSafeAreaInsets();
  const baseServings = Math.max(1, recipe.servings);
  // NOTE: Serving and unit selections are display-only. Ingredient amounts derive
  // from the saved recipe while nutrition remains the saved per-serving value.
  const [displayedServings, setDisplayedServings] = useState(baseServings);
  const [measurementMode, setMeasurementMode] =
    useState<MeasurementDisplayMode>("original");
  const visibleNutrition = nutritionFields.filter(
    ([key]) => recipe.nutrition[key] !== "",
  );
  const prep = formatDuration(recipe.prepMinutes);
  const cook = formatDuration(recipe.cookMinutes);
  const canManage = Boolean(onEdit && onDelete);
  const isBusy = isDeleting || isSharing;
  const householdLabel = householdName?.trim() || "your household";

  // NOTE: Run actions after dismissal so native sheets never overlap.
  const dismissActions = (action?: () => void) => {
    pendingAction.current = action ?? null;
    actionsSheetRef.current?.dismiss();
  };

  const runPendingAction = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };

  const finishConfirmationDismiss = () => {
    if (!deleteAfterDismiss.current) return;
    deleteAfterDismiss.current = false;
    onDelete?.();
  };

  const finishShareConfirmationDismiss = () => {
    const shared = shareAfterDismiss.current;
    shareAfterDismiss.current = null;
    if (shared !== null) onSetShared?.(shared);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-16 flex-row items-center justify-between border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back to recipes"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={onBack}
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
        {canManage ? (
          <Pressable
            accessibilityHint="Opens recipe actions."
            accessibilityLabel="Recipe actions"
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy }}
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle disabled:opacity-50"
            disabled={isBusy}
            onPress={() => actionsSheetRef.current?.present()}
            testID="recipe-actions"
          >
            {isBusy ? (
              <ActivityIndicator
                color={colorTokens.primaryStrong}
                size="small"
              />
            ) : (
              <SymbolView
                accessible={false}
                name={{
                  ios: "ellipsis",
                  android: "more_vert",
                  web: "more_vert",
                }}
                size={24}
                tintColor={colorTokens.textPrimary}
              />
            )}
          </Pressable>
        ) : null}
      </View>

      {deleteError || shareErrorMode ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="gap-3 border-b border-error bg-surface px-5 py-3"
          testID={deleteError ? "recipe-delete-error" : "recipe-share-error"}
        >
          <View>
            <Text className="text-base font-bold leading-6 text-error">
              {deleteError
                ? "Recipe not deleted"
                : shareErrorMode === "share"
                  ? "Recipe not shared"
                  : "Recipe still shared"}
            </Text>
            <Text className="text-sm leading-5 text-text-secondary">
              {deleteError
                ? "Check your connection and try again."
                : "Check your household and connection, then try again."}
            </Text>
          </View>
          {canManage && (deleteError || onRetryShare) ? (
            <Pressable
              accessibilityHint={
                deleteError
                  ? "Opens the delete confirmation again."
                  : "Tries the sharing change again."
              }
              accessibilityLabel={
                deleteError
                  ? "Try deleting recipe again"
                  : `Try to ${shareErrorMode} recipe again`
              }
              accessibilityRole="button"
              className="min-h-12 self-start rounded-xl border-2 border-error bg-surface px-4 py-3 focus:border-text-primary active:bg-surface-subtle"
              onPress={
                deleteError
                  ? () => confirmationSheetRef.current?.present()
                  : onRetryShare
              }
            >
              <Text className="text-base font-bold leading-6 text-error">
                Try again
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerClassName="items-center px-5 pb-12 pt-5">
        <View className="w-full gap-8" style={{ maxWidth: MaxContentWidth }}>
          <View className="aspect-[4/3] overflow-hidden rounded-[20px] bg-surface-subtle">
            {recipe.imageUrl ? (
              <Image
                accessibilityLabel={`Photo of ${recipe.title}`}
                accessible
                cachePolicy="memory-disk"
                contentFit="cover"
                onError={onImageError}
                source={{
                  uri: recipe.imageUrl,
                  cacheKey: recipe.imagePath ?? undefined,
                }}
                style={styles.image}
              />
            ) : (
              <View className="h-full items-center justify-center">
                <View className="h-16 w-16 items-center justify-center rounded-2xl bg-surface">
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "fork.knife",
                      android: "restaurant",
                      web: "restaurant",
                    }}
                    size={30}
                    tintColor={colorTokens.textSecondary}
                  />
                </View>
              </View>
            )}
          </View>

          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-[32px] font-bold leading-[39px] text-text-primary"
            >
              {recipe.title}
            </Text>
            {recipe.isShared ? (
              <View className="min-h-9 self-start flex-row items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
                <SymbolView
                  accessible={false}
                  name={{ ios: "person.2", android: "group", web: "group" }}
                  size={17}
                  tintColor={colorTokens.success}
                />
                <Text className="text-sm font-bold leading-5 text-success">
                  Shared
                </Text>
              </View>
            ) : null}
            <Text className="text-base font-medium leading-6 text-secondary">
              {sourceLabel(recipe)}
            </Text>
            <View className="flex-row flex-wrap gap-x-5 gap-y-2">
              {prep ? (
                <Text className="text-sm leading-5 text-text-secondary">
                  Prep {prep}
                </Text>
              ) : null}
              {cook ? (
                <Text className="text-sm leading-5 text-text-secondary">
                  Cook {cook}
                </Text>
              ) : null}
              <Text className="text-sm leading-5 text-text-secondary">
                Base {baseServings} servings
              </Text>
            </View>
          </View>

          <View className="gap-3 border-y border-border py-5">
            <Text
              accessibilityRole="header"
              className="text-xl font-bold leading-7 text-text-primary"
            >
              Servings
            </Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityLabel="Decrease displayed servings"
                accessibilityRole="button"
                accessibilityState={{ disabled: displayedServings <= 1 }}
                className="h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-surface focus:border-primary-strong active:bg-surface-subtle disabled:opacity-40"
                disabled={displayedServings <= 1}
                onPress={() =>
                  setDisplayedServings((value) => Math.max(1, value - 1))
                }
              >
                <SymbolView
                  accessible={false}
                  name={{ ios: "minus", android: "remove", web: "remove" }}
                  size={20}
                  tintColor={colorTokens.textPrimary}
                />
              </Pressable>
              <Text
                accessibilityLiveRegion="polite"
                className="min-w-12 text-center text-xl font-bold leading-7 text-text-primary"
              >
                {displayedServings}
              </Text>
              <Pressable
                accessibilityLabel="Increase displayed servings"
                accessibilityRole="button"
                className="h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-surface focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => setDisplayedServings((value) => value + 1)}
              >
                <SymbolView
                  accessible={false}
                  name={{ ios: "plus", android: "add", web: "add" }}
                  size={20}
                  tintColor={colorTokens.textPrimary}
                />
              </Pressable>
            </View>
          </View>

          <View className="gap-5">
            <Text
              accessibilityRole="header"
              className="text-2xl font-bold leading-8 text-text-primary"
            >
              Ingredients
            </Text>
            <View
              accessibilityLabel="Ingredient measurement units"
              accessibilityRole="tablist"
              className="min-h-14 flex-row rounded-2xl bg-surface-subtle p-1"
            >
              {measurementModes.map(([mode, label]) => {
                const selected = measurementMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 py-2 focus:border-primary-strong active:opacity-[0.78] ${selected ? "border-border bg-surface" : "border-transparent bg-transparent"}`}
                    onPress={() => setMeasurementMode(mode)}
                    testID={`recipe-measurement-${mode}`}
                  >
                    <Text
                      className={`text-center text-base font-bold leading-6 ${selected ? "text-text-primary" : "text-text-secondary"}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {recipe.ingredientGroups.map((group) => (
              <View key={group.id} className="gap-3">
                {group.title?.trim() ? (
                  <Text
                    accessibilityRole="header"
                    className="text-lg font-bold leading-6 text-text-primary"
                  >
                    {group.title.trim()}
                  </Text>
                ) : null}
                {group.ingredients.map((ingredient) => {
                  const measurement = formatIngredientMeasurement(
                    ingredient.amount,
                    ingredient.unit,
                    baseServings,
                    displayedServings,
                    measurementMode,
                  );
                  return (
                    <View
                      key={ingredient.id}
                      className="flex-row gap-3 border-b border-border pb-3"
                    >
                      <Text className="max-w-[40%] shrink font-bold leading-6 text-text-primary">
                        {[measurement.amount, measurement.unit]
                          .filter(Boolean)
                          .join(" ")}
                      </Text>
                      <Text className="min-w-0 shrink flex-1 leading-6 text-text-primary">
                        {ingredient.name}
                        {ingredient.note.trim()
                          ? `, ${ingredient.note.trim()}`
                          : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <View className="gap-5">
            <Text
              accessibilityRole="header"
              className="text-2xl font-bold leading-8 text-text-primary"
            >
              Instructions
            </Text>
            {recipe.instructionGroups.map((group) => (
              <View key={group.id} className="gap-3">
                {group.title?.trim() ? (
                  <Text
                    accessibilityRole="header"
                    className="text-lg font-bold leading-6 text-text-primary"
                  >
                    {group.title.trim()}
                  </Text>
                ) : null}
                {group.steps.map((step, index) => (
                  <View key={step.id} className="flex-row gap-3">
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-subtle">
                      <Text className="font-bold text-text-primary">
                        {index + 1}
                      </Text>
                    </View>
                    <Text className="shrink flex-1 pt-1 leading-6 text-text-primary">
                      {step.text}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {recipe.notes.trim() ? (
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold leading-8 text-text-primary"
              >
                Notes
              </Text>
              <Text className="text-base leading-6 text-text-secondary">
                {recipe.notes.trim()}
              </Text>
            </View>
          ) : null}

          {visibleNutrition.length ? (
            <View className="gap-4">
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold leading-8 text-text-primary"
              >
                Nutrition per serving
              </Text>
              <View className="overflow-hidden rounded-2xl border border-border bg-surface">
                {visibleNutrition.map(([key, label, unit], index) => (
                  <View
                    key={key}
                    className={`min-h-12 flex-row items-center justify-between gap-4 px-4 py-3 ${index ? "border-t border-border" : ""}`}
                  >
                    <Text className="shrink text-base leading-6 text-text-primary">
                      {label}
                    </Text>
                    <Text className="font-bold leading-6 text-text-primary">
                      {recipe.nutrition[key]}
                      {unit ? ` ${unit}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View className="gap-2 border-t border-border pt-6">
            <Text
              accessibilityRole="header"
              className="text-xl font-bold leading-7 text-text-primary"
            >
              Source
            </Text>
            <Text className="text-base leading-6 text-text-secondary">
              {sourceLabel(recipe)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {canManage ? (
        <BottomSheetModal
          ref={actionsSheetRef}
          backgroundStyle={{
            backgroundColor: colorTokens.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
          enableDynamicSizing
          enablePanDownToClose
          onDismiss={runPendingAction}
        >
          <BottomSheetView>
            <View
              className="items-center px-5 pt-2"
              style={{ paddingBottom: Math.max(safeAreaInsets.bottom, 20) }}
              testID="recipe-actions-sheet"
            >
              <View className="w-full max-w-[640px]">
                <View className="min-h-14 flex-row items-center justify-between gap-4">
                  <Text
                    accessibilityRole="header"
                    className="shrink text-xl font-bold leading-7 text-text-primary"
                  >
                    Recipe actions
                  </Text>
                  <Pressable
                    accessibilityLabel="Close Recipe actions"
                    accessibilityRole="button"
                    className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
                    onPress={() => dismissActions()}
                  >
                    <SymbolView
                      accessible={false}
                      name={{ ios: "xmark", android: "close", web: "close" }}
                      size={22}
                      tintColor={colorTokens.textPrimary}
                    />
                  </Pressable>
                </View>
                <View className="mt-4 gap-3">
                  {onSetShared ? (
                    <Pressable
                      accessibilityHint={`Opens a confirmation to ${recipe.isShared ? "remove this recipe from" : "share this recipe with"} ${householdLabel}.`}
                      accessibilityLabel={
                        recipe.isShared
                          ? "Unshare recipe from household"
                          : "Share recipe to household"
                      }
                      accessibilityRole="button"
                      className={`min-h-12 flex-row items-center gap-4 rounded-xl border-2 bg-surface px-4 py-3 focus:border-text-primary active:bg-surface-subtle ${recipe.isShared ? "border-error" : "border-border"}`}
                      onPress={() =>
                        dismissActions(() =>
                          shareConfirmationSheetRef.current?.present(),
                        )
                      }
                      testID="recipe-share-action"
                    >
                      <SymbolView
                        accessible={false}
                        name={
                          recipe.isShared
                            ? {
                                ios: "person.2.slash",
                                android: "group_remove",
                                web: "group_remove",
                              }
                            : {
                                ios: "square.and.arrow.up",
                                android: "group_add",
                                web: "group_add",
                              }
                        }
                        size={22}
                        tintColor={
                          recipe.isShared
                            ? colorTokens.error
                            : colorTokens.primaryStrong
                        }
                      />
                      <Text
                        className={`text-base font-bold leading-6 ${recipe.isShared ? "text-error" : "text-primary-strong"}`}
                      >
                        {recipe.isShared
                          ? "Unshare from household"
                          : "Share to household"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel="Edit recipe"
                    accessibilityRole="button"
                    className="min-h-12 flex-row items-center gap-4 rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                    onPress={() => dismissActions(onEdit)}
                  >
                    <SymbolView
                      accessible={false}
                      name={{ ios: "pencil", android: "edit", web: "edit" }}
                      size={22}
                      tintColor={colorTokens.textPrimary}
                    />
                    <Text className="text-base font-bold leading-6 text-text-primary">
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint={
                      recipe.isShared
                        ? "Unshare this recipe before deleting it."
                        : "Opens a confirmation before permanently deleting this recipe."
                    }
                    accessibilityLabel={
                      recipe.isShared
                        ? "Delete recipe. Unshare before deleting."
                        : "Delete recipe"
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: recipe.isShared }}
                    className={`min-h-12 flex-row items-center gap-4 rounded-xl border-2 px-4 py-3 ${recipe.isShared ? "border-border bg-surface-subtle opacity-50" : "border-error bg-surface focus:border-text-primary active:bg-surface-subtle"}`}
                    disabled={recipe.isShared}
                    onPress={() =>
                      dismissActions(() =>
                        confirmationSheetRef.current?.present(),
                      )
                    }
                  >
                    <SymbolView
                      accessible={false}
                      name={{ ios: "trash", android: "delete", web: "delete" }}
                      size={22}
                      tintColor={
                        recipe.isShared
                          ? colorTokens.textSecondary
                          : colorTokens.error
                      }
                    />
                    <View>
                      <Text
                        className={`text-base font-bold leading-6 ${recipe.isShared ? "text-text-secondary" : "text-error"}`}
                      >
                        Delete
                      </Text>
                      {recipe.isShared ? (
                        <Text className="text-sm leading-5 text-text-secondary">
                          Unshare before deleting
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </BottomSheetView>
        </BottomSheetModal>
      ) : null}

      {canManage && onSetShared ? (
        <BottomSheetModal
          ref={shareConfirmationSheetRef}
          backgroundStyle={{
            backgroundColor: colorTokens.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
          enableDynamicSizing
          enablePanDownToClose
          onDismiss={finishShareConfirmationDismiss}
        >
          <BottomSheetView>
            <View
              className="items-center px-5 pt-5"
              style={{ paddingBottom: Math.max(safeAreaInsets.bottom, 20) }}
              testID="recipe-share-confirmation"
            >
              <View className="w-full max-w-[640px] gap-5">
                <View className="gap-2">
                  <Text
                    accessibilityRole="header"
                    className="text-xl font-bold leading-7 text-text-primary"
                  >
                    {recipe.isShared
                      ? householdName?.trim()
                        ? `Unshare from ${householdName.trim()}?`
                        : "Unshare from household?"
                      : `Share with ${householdLabel}?`}
                  </Text>
                  <Text className="text-base leading-6 text-text-secondary">
                    {recipe.isShared
                      ? `People in ${householdLabel} will lose access. The recipe stays in your personal library.`
                      : `Everyone in ${householdLabel} will be able to view this recipe.`}
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityLabel="Cancel recipe sharing change"
                    accessibilityRole="button"
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                    onPress={() => shareConfirmationSheetRef.current?.dismiss()}
                  >
                    <Text className="text-base font-bold leading-6 text-text-primary">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={
                      recipe.isShared
                        ? "Confirm unshare recipe"
                        : "Confirm share recipe"
                    }
                    accessibilityRole="button"
                    className={`min-h-12 flex-1 items-center justify-center rounded-xl border-2 px-4 py-3 focus:border-text-primary active:opacity-[0.82] ${recipe.isShared ? "border-error bg-error" : "border-primary-strong bg-primary-strong"}`}
                    onPress={() => {
                      shareAfterDismiss.current = !recipe.isShared;
                      shareConfirmationSheetRef.current?.dismiss();
                    }}
                  >
                    <Text className="text-base font-bold leading-6 text-on-primary">
                      {recipe.isShared ? "Unshare" : "Share"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </BottomSheetView>
        </BottomSheetModal>
      ) : null}

      {canManage ? (
        <BottomSheetModal
          ref={confirmationSheetRef}
          backgroundStyle={{
            backgroundColor: colorTokens.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
          enableDynamicSizing
          enablePanDownToClose
          onDismiss={finishConfirmationDismiss}
        >
          <BottomSheetView>
            <View
              className="items-center px-5 pt-5"
              style={{ paddingBottom: Math.max(safeAreaInsets.bottom, 20) }}
              testID="recipe-delete-confirmation"
            >
              <View className="w-full max-w-[640px] gap-5">
                <View className="gap-2">
                  <Text
                    accessibilityRole="header"
                    className="text-xl font-bold leading-7 text-text-primary"
                  >
                    Delete recipe?
                  </Text>
                  <Text className="text-base leading-6 text-text-secondary">
                    This permanently deletes “{recipe.title}”. This can’t be
                    undone.
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityLabel="Cancel recipe deletion"
                    accessibilityRole="button"
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                    onPress={() => confirmationSheetRef.current?.dismiss()}
                  >
                    <Text className="text-base font-bold leading-6 text-text-primary">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint="Permanently deletes this recipe."
                    accessibilityLabel="Confirm delete recipe"
                    accessibilityRole="button"
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-error bg-error px-4 py-3 focus:border-text-primary active:opacity-[0.82]"
                    onPress={() => {
                      deleteAfterDismiss.current = true;
                      confirmationSheetRef.current?.dismiss();
                    }}
                  >
                    <Text className="text-base font-bold leading-6 text-on-primary">
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </BottomSheetView>
        </BottomSheetModal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ image: { width: "100%", height: "100%" } });
