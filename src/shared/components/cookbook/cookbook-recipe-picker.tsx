import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import type { RecipeCardModel } from "@/shared/types";

type CookbookRecipePickerProps = {
  error?: string | null;
  isLoading?: boolean;
  isSaving?: boolean;
  onBack: () => void;
  onRetry?: () => void;
  onSave: () => void;
  onToggle: (recipeId: string) => void;
  recipes: readonly RecipeCardModel[];
  saveLabel: string;
  selectedIds: ReadonlySet<string>;
  title: string;
};

export function CookbookRecipePicker({
  error,
  isLoading = false,
  isSaving = false,
  onBack,
  onRetry,
  onSave,
  onToggle,
  recipes,
  saveLabel,
  selectedIds,
  title,
}: CookbookRecipePickerProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRecipes = useMemo(
    () =>
      recipes.filter(
        (recipe) =>
          !normalizedQuery ||
          recipe.title.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, recipes],
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="min-h-16 flex-row items-center border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={onBack}
        >
          <SymbolView
            accessible={false}
            name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="min-w-0 shrink flex-1 px-2 text-center text-xl font-bold leading-7 text-text-primary"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="h-12 w-12" />
      </View>

      {error ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="border-b border-error bg-surface px-5 py-3"
        >
          <Text className="text-base font-bold leading-6 text-error">{error}</Text>
        </View>
      ) : null}

      <View className="flex-1 items-center">
        <FlatList
          data={isLoading ? [] : filteredRecipes}
          keyExtractor={(recipe) => recipe.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View className="gap-4 pb-5">
              <Text className="text-base leading-6 text-text-secondary">
                Choose any recipes to include. You can also save an empty cookbook.
              </Text>
              <View
                className={`min-h-12 flex-row items-center rounded-2xl border-2 bg-surface-subtle pl-4 ${focused ? "border-primary-strong" : "border-transparent"}`}
              >
                <SymbolView
                  accessible={false}
                  name={{ ios: "magnifyingglass", android: "search", web: "search" }}
                  size={21}
                  tintColor={colorTokens.textSecondary}
                />
                <TextInput
                  accessibilityLabel="Search recipes"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-12 flex-1 px-3 py-2 text-base leading-6 text-text-primary outline-none"
                  onBlur={() => setFocused(false)}
                  onChangeText={setQuery}
                  onFocus={() => setFocused(true)}
                  placeholder="Search recipes"
                  placeholderTextColor={colorTokens.textSecondary}
                  returnKeyType="search"
                  selectionColor={colorTokens.primaryStrong}
                  value={query}
                />
                {query ? (
                  <Pressable
                    accessibilityLabel="Clear recipe search"
                    accessibilityRole="button"
                    className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:opacity-60"
                    onPress={() => setQuery("")}
                  >
                    <SymbolView
                      accessible={false}
                      name={{ ios: "xmark.circle.fill", android: "cancel", web: "cancel" }}
                      size={21}
                      tintColor={colorTokens.textSecondary}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="min-h-[280px] items-center justify-center gap-3 px-5 py-10">
              {isLoading ? (
                <>
                  <ActivityIndicator color={colorTokens.primaryStrong} size="large" />
                  <Text
                    accessibilityLiveRegion="polite"
                    className="text-base leading-6 text-text-secondary"
                  >
                    Loading recipes…
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    accessibilityRole="header"
                    className="text-center text-xl font-bold leading-7 text-text-primary"
                  >
                    {normalizedQuery ? "No recipes found" : "No recipes yet"}
                  </Text>
                  <Text className="text-center text-base leading-6 text-text-secondary">
                    {normalizedQuery
                      ? "Try a different recipe name."
                      : "You can save this cookbook now and add recipes later."}
                  </Text>
                  {onRetry && error ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
                      onPress={onRetry}
                    >
                      <Text className="text-base font-bold text-text-primary">Try again</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <Pressable
                accessibilityLabel={item.title}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                className={`mb-3 min-h-[88px] flex-row items-center gap-4 rounded-2xl border-2 p-3 focus:border-primary-strong active:opacity-80 ${selected ? "border-primary-strong bg-surface-subtle" : "border-border bg-surface"}`}
                onPress={() => onToggle(item.id)}
                testID={`cookbook-recipe-option-${item.id}`}
              >
                <View className="h-16 w-16 overflow-hidden rounded-xl bg-surface-subtle">
                  {item.imageUrl ? (
                    <Image
                      accessible={false}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      source={{ uri: item.imageUrl, cacheKey: item.imagePath ?? undefined }}
                      style={styles.image}
                    />
                  ) : (
                    <View className="h-full items-center justify-center">
                      <SymbolView
                        accessible={false}
                        name={{ ios: "fork.knife", android: "restaurant", web: "restaurant" }}
                        size={23}
                        tintColor={colorTokens.textSecondary}
                      />
                    </View>
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold leading-6 text-text-primary">
                    {item.title}
                  </Text>
                  {item.cookingTimeMinutes ? (
                    <Text className="mt-1 text-sm leading-5 text-text-secondary">
                      {item.cookingTimeMinutes} min
                    </Text>
                  ) : null}
                </View>
                <View
                  className={`h-7 w-7 items-center justify-center rounded-lg border-2 ${selected ? "border-primary-strong bg-primary-strong" : "border-border bg-surface"}`}
                >
                  {selected ? (
                    <SymbolView
                      accessible={false}
                      name={{ ios: "checkmark", android: "check", web: "check" }}
                      size={18}
                      tintColor={colorTokens.onPrimary}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
          style={{ width: "100%", maxWidth: MaxContentWidth }}
        />
      </View>

      <View
        className="items-center border-t border-border bg-surface px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View className="w-full max-w-[800px] flex-row items-center justify-between gap-4">
          <Text
            accessibilityLiveRegion="polite"
            className="text-base font-medium leading-6 text-text-secondary"
          >
            {selectedIds.size} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving }}
            className="min-h-12 min-w-[144px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-80 disabled:opacity-50"
            disabled={isSaving}
            onPress={onSave}
          >
            {isSaving ? (
              <ActivityIndicator color={colorTokens.onPrimary} />
            ) : (
              <Text className="text-base font-bold leading-6 text-on-primary">{saveLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
