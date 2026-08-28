import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  BottomTabInset,
  colorTokens,
  MaxContentWidth,
} from "@/shared/design-system";

import { CookbookCard } from "./cookbook-card";
import { LibraryFeedback, SkeletonCard } from "./library-feedback";
import { RecipeCard } from "./recipe-card";
import type {
  CookbookCardModel,
  LibraryMode,
  LibrarySection,
  RecipeCardModel,
  RecipesLibraryViewProps,
} from "@/shared/types";

type LibraryListItem =
  | { kind: "recipe"; item: RecipeCardModel }
  | { kind: "cookbook"; item: CookbookCardModel }
  | { kind: "skeleton"; id: string };

const GRID_GAP = 12;
const LIBRARY_SECTIONS: readonly LibrarySection[] = ["recipes", "cookbooks"];

function IconAction({
  accessibilityHint,
  accessibilityLabel,
  icon,
  onPress,
  testID,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  icon: {
    ios: "plus";
    android: "add";
    web: "add";
  };
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
      testID={testID}
    >
      <SymbolView
        accessible={false}
        name={icon}
        size={20}
        tintColor={colorTokens.textPrimary}
      />
    </Pressable>
  );
}

function SearchField({
  mode,
  onChangeText,
  onClear,
  section,
  value,
}: {
  mode: LibraryMode;
  onChangeText: (value: string) => void;
  onClear: () => void;
  section: LibrarySection;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const noun =
    mode === "household"
      ? "shared recipes"
      : section === "recipes"
        ? "recipes"
        : "cookbooks";

  return (
    <View
      className={`min-h-12 flex-row items-center rounded-2xl border-2 bg-surface-subtle pl-4 ${focused ? "border-primary-strong" : "border-transparent"}`}
    >
      <SymbolView
        accessible={false}
        name={{ ios: "magnifyingglass", android: "search", web: "search" }}
        size={22}
        tintColor={colorTokens.textSecondary}
      />
      <TextInput
        accessibilityLabel={`Search ${noun}`}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={`Search ${noun}`}
        placeholderTextColor={colorTokens.textSecondary}
        returnKeyType="search"
        selectionColor={colorTokens.primaryStrong}
        value={value}
        className="min-h-12 flex-1 px-3 py-2 text-base font-normal leading-6 text-text-primary outline-none"
        testID="library-search-input"
      />

      {value ? (
        <Pressable
          accessibilityHint={`Clears the ${noun} search.`}
          accessibilityLabel={`Clear ${noun} search`}
          accessibilityRole="button"
          hitSlop={4}
          onPress={onClear}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:opacity-[0.64]"
          testID="library-search-clear"
        >
          <SymbolView
            accessible={false}
            name={{
              ios: "xmark.circle.fill",
              android: "cancel",
              web: "cancel",
            }}
            size={21}
            tintColor={colorTokens.textSecondary}
          />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
}

/** Data-ready library surface. No backend or fixture data is owned here. */
export function RecipesLibraryView({
  recipes,
  cookbooks,
  householdName,
  mode = "personal",
  onAddRecipe,
  onCookbookPress,
  onCreateCookbook,
  onRecipeImageError,
  onRecipePress,
  onRetryCookbooks,
  onRetryRecipes,
  onSectionChange,
  onSearchQueryChange,
  onShareRecipe,
  section: activeSection = "recipes",
}: RecipesLibraryViewProps) {
  const { fontScale, height, width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const [queries, setQueries] = useState<Record<LibrarySection, string>>({
    recipes: "",
    cookbooks: "",
  });
  const query = queries[activeSection];
  const isHousehold = mode === "household";

  const safeContentWidth = width - safeAreaInsets.left - safeAreaInsets.right;
  const isTablet = Math.min(width, height) >= 600;
  const columnCount = fontScale >= 1.3 ? 1 : isTablet ? 3 : 2;
  const horizontalGutter = isTablet ? 24 : 20;
  const availableWidth =
    Math.min(safeContentWidth, MaxContentWidth) - horizontalGutter * 2;
  const cardWidth =
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const activeResource = activeSection === "recipes" ? recipes : cookbooks;
  const activeStatus = activeResource.status;
  const activeCount =
    activeResource.status === "ready" ? activeResource.data.length : null;
  const activeMessage =
    activeResource.status === "error" ? activeResource.message : undefined;

  const listItems = useMemo<LibraryListItem[]>(() => {
    if (activeStatus === "loading") {
      return Array.from({ length: columnCount * 2 }, (_, index) => ({
        kind: "skeleton" as const,
        id: `skeleton-${index}`,
      }));
    }

    if (activeStatus !== "ready") return [];

    if (activeSection === "recipes" && recipes.status === "ready") {
      return recipes.data
        .filter(
          (recipe) =>
            !normalizedQuery ||
            recipe.title.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((item) => ({ kind: "recipe" as const, item }));
    }

    if (activeSection === "cookbooks" && cookbooks.status === "ready") {
      return cookbooks.data
        .filter(
          (cookbook) =>
            !normalizedQuery ||
            cookbook.title.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((item) => ({ kind: "cookbook" as const, item }));
    }

    return [];
  }, [
    activeSection,
    activeStatus,
    columnCount,
    cookbooks,
    normalizedQuery,
    recipes,
  ]);

  const setQuery = (nextQuery: string) => {
    setQueries((current) => ({
      ...current,
      [activeSection]: nextQuery,
    }));
    onSearchQueryChange?.(activeSection, nextQuery);
  };

  const renderEmptyState = () => {
    const noun = isHousehold
      ? "shared recipes"
      : activeSection === "recipes"
        ? "recipes"
        : "cookbooks";
    const isRecipes = activeSection === "recipes";
    const stateKey = isHousehold ? "shared-recipes" : noun;
    const hasSourceData = activeCount != null && activeCount > 0;

    if (activeStatus === "error") {
      return (
        <LibraryFeedback
          actionLabel={
            isRecipes
              ? onRetryRecipes && "Try again"
              : onRetryCookbooks && "Try again"
          }
          body="Check your connection and try again."
          icon={{
            ios: "exclamationmark.arrow.circlepath",
            android: "sync_problem",
            web: "sync_problem",
          }}
          onAction={isRecipes ? onRetryRecipes : onRetryCookbooks}
          testID={`library-${stateKey}-error`}
          title={activeMessage?.trim() || `Couldn’t load your ${noun}.`}
        />
      );
    }

    if (activeStatus === "ready" && normalizedQuery && hasSourceData) {
      return (
        <LibraryFeedback
          actionLabel="Clear search"
          body={`Try a different ${isRecipes ? "name or keyword" : "cookbook name"}.`}
          icon={{ ios: "magnifyingglass", android: "search", web: "search" }}
          onAction={() => setQuery("")}
          testID={`library-${stateKey}-no-results`}
          title={`No ${noun} found`}
        />
      );
    }

    if (activeStatus === "ready") {
      if (isHousehold) {
        return (
          <LibraryFeedback
            actionLabel="Share a recipe"
            body="Choose a recipe from your personal library to share with your household."
            icon={{ ios: "person.2", android: "group", web: "group" }}
            onAction={onShareRecipe}
            testID="library-shared-recipes-empty"
            title="No shared recipes yet"
          />
        );
      }

      return (
        <LibraryFeedback
          actionLabel={
            isRecipes ? "Add your first recipe" : "Create a cookbook"
          }
          body={
            isRecipes
              ? "Start by adding one you already love. Your library stays private until you choose to share."
              : "Group the recipes you return to into simple collections."
          }
          icon={
            isRecipes
              ? { ios: "book.closed", android: "menu_book", web: "menu_book" }
              : {
                  ios: "books.vertical",
                  android: "library_books",
                  web: "library_books",
                }
          }
          onAction={isRecipes ? onAddRecipe : onCreateCookbook}
          testID={`library-${noun}-empty`}
          title={
            isRecipes
              ? "Your recipes will live here."
              : "Your cookbooks will live here."
          }
        />
      );
    }

    return null;
  };

  const floatingBottom =
    BottomTabInset + Math.max(safeAreaInsets.bottom, 12) + 12;
  const showRecipeFab =
    !isHousehold &&
    activeSection === "recipes" &&
    recipes.status === "ready" &&
    recipes.data.length > 0;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-background"
      testID={
        isHousehold
          ? "household-recipes-library-screen"
          : `${activeSection}-library-screen`
      }
    >
      <StatusBar style="dark" />

      <View className="flex-1 items-center">
        <FlatList
          key={`library-grid-${columnCount}`}
          data={listItems}
          keyExtractor={(entry) =>
            entry.kind === "skeleton"
              ? entry.id
              : `${entry.kind}-${entry.item.id}`
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          numColumns={columnCount}
          onScrollBeginDrag={Keyboard.dismiss}
          renderItem={({ item }) => {
            if (item.kind === "skeleton") {
              return <SkeletonCard width={cardWidth} />;
            }

            if (item.kind === "recipe") {
              return (
                <RecipeCard
                  item={item.item}
                  onImageError={onRecipeImageError}
                  onPress={onRecipePress}
                  width={cardWidth}
                />
              );
            }

            return (
              <CookbookCard
                item={item.item}
                onPress={onCookbookPress}
                width={cardWidth}
              />
            );
          }}
          ListEmptyComponent={renderEmptyState}
          ListHeaderComponent={
            <View className="pb-5">
              <View
                className="min-h-14 flex-row items-center justify-between border-b border-border py-2"
                style={{
                  marginHorizontal: -horizontalGutter,
                  paddingHorizontal: horizontalGutter,
                }}
              >
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-bold leading-[30px] text-text-primary"
                >
                  {isHousehold
                    ? householdName?.trim() || "Household"
                    : "Recipes"}
                </Text>
              </View>

              <View className="pt-5">
                <SearchField
                  mode={mode}
                  onChangeText={setQuery}
                  onClear={() => setQuery("")}
                  section={activeSection}
                  value={query}
                />
              </View>

              {/* NOTE: Cookbooks are a secondary Recipes view, not a bottom-nav destination. */}
              {!isHousehold ? (
                <View
                  accessibilityLabel="Recipe library sections"
                  accessibilityRole="tablist"
                  className="mt-5 min-h-14 flex-row rounded-2xl bg-surface-subtle p-1"
                  testID="library-section-tabs"
                >
                  {LIBRARY_SECTIONS.map((section) => {
                    const selected = section === activeSection;
                    const label =
                      section === "recipes" ? "Recipes" : "Cookbooks";
                    return (
                      <Pressable
                        key={section}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 py-2 focus:border-primary-strong active:opacity-[0.78] ${selected ? "border-border bg-surface" : "border-transparent bg-transparent"}`}
                        onPress={() => onSectionChange?.(section)}
                        testID={`library-section-${section}`}
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
              ) : null}

              <View className="mt-8">
                <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-primary-strong">
                  {isHousehold
                    ? "Household"
                    : activeSection === "recipes"
                      ? "Personal library"
                      : "Your collections"}
                </Text>
                <View className="mt-1.5 min-h-12 flex-row items-center justify-between gap-4">
                  <Text
                    accessibilityRole="header"
                    className="shrink text-[28px] font-bold leading-[34px] text-text-primary"
                  >
                    {isHousehold
                      ? "Shared recipes"
                      : activeSection === "recipes"
                        ? "Recently saved"
                        : "All cookbooks"}
                  </Text>

                  <View className="flex-row items-center gap-1">
                    {activeCount != null ? (
                      <Text className="text-base font-medium leading-6 text-text-secondary">
                        {activeCount} total
                      </Text>
                    ) : activeStatus === "loading" ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        className="text-sm font-medium leading-5 text-text-secondary"
                      >
                        Loading…
                      </Text>
                    ) : null}

                    {!isHousehold &&
                    activeSection === "cookbooks" &&
                    onCreateCookbook ? (
                      <IconAction
                        accessibilityHint="Starts a new cookbook."
                        accessibilityLabel="Create cookbook"
                        icon={{ ios: "plus", android: "add", web: "add" }}
                        onPress={onCreateCookbook}
                        testID="library-create-cookbook-action"
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
          columnWrapperStyle={columnCount > 1 ? { gap: GRID_GAP } : undefined}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: horizontalGutter,
            paddingBottom: showRecipeFab ? floatingBottom + 72 : 32,
          }}
          showsVerticalScrollIndicator={false}
          style={{ width: "100%", maxWidth: MaxContentWidth }}
          testID="library-grid"
        />

        {showRecipeFab ? (
          <View
            pointerEvents="box-none"
            className="absolute left-0 right-0 items-center"
            style={{ bottom: floatingBottom }}
          >
            <View
              pointerEvents="box-none"
              className="w-full max-w-[800px] items-end"
              style={{ paddingHorizontal: horizontalGutter }}
            >
              {onAddRecipe ? (
                <Pressable
                  accessibilityHint="Starts a new recipe."
                  accessibilityLabel="Add recipe"
                  accessibilityRole="button"
                  onPress={onAddRecipe}
                  className="h-14 w-14 items-center justify-center rounded-2xl border-2 border-primary-strong bg-primary shadow-md shadow-text-primary/10 focus:border-text-primary active:opacity-[0.82]"
                  testID="library-add-recipe-fab"
                >
                  <SymbolView
                    accessible={false}
                    name={{ ios: "plus", android: "add", web: "add" }}
                    size={27}
                    tintColor={colorTokens.onPrimary}
                  />
                </Pressable>
              ) : (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-14 w-14 items-center justify-center rounded-2xl border-2 border-primary-strong bg-primary shadow-md shadow-text-primary/10"
                  testID="library-add-recipe-fab-shell"
                >
                  <SymbolView
                    name={{ ios: "plus", android: "add", web: "add" }}
                    size={27}
                    tintColor={colorTokens.onPrimary}
                  />
                </View>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
