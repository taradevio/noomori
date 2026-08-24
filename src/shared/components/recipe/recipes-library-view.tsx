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
  LibrarySection,
  RecipeCardModel,
  RecipesLibraryViewProps,
} from "@/shared/types";

type LibraryListItem =
  | { kind: "recipe"; item: RecipeCardModel }
  | { kind: "cookbook"; item: CookbookCardModel }
  | { kind: "skeleton"; id: string };

const GRID_GAP = 12;

function OptionalIconAction({
  accessibilityHint,
  accessibilityLabel,
  icon,
  onPress,
  testID,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  icon: {
    ios: "person.crop.circle" | "plus";
    android: "account_circle" | "add";
    web: "account_circle" | "add";
  };
  onPress?: () => void;
  testID: string;
}) {
  const content = (
    <SymbolView
      accessible={false}
      name={icon}
      size={20}
      tintColor={colorTokens.textPrimary}
    />
  );

  if (onPress) {
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
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-12 w-12 items-center justify-center rounded-full"
      testID={`${testID}-shell`}
    >
      {content}
    </View>
  );
}

function SearchField({
  onChangeText,
  onClear,
  section,
  value,
}: {
  onChangeText: (value: string) => void;
  onClear: () => void;
  section: LibrarySection;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const noun = section === "recipes" ? "recipes" : "cookbooks";

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

function LibrarySegment({
  activeSection,
  onChange,
}: {
  activeSection: LibrarySection;
  onChange: (section: LibrarySection) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="mt-6 min-h-14 flex-row rounded-2xl bg-surface-subtle p-1"
    >
      {(["recipes", "cookbooks"] as const).map((section) => {
        const selected = section === activeSection;
        const label = section === "recipes" ? "Recipes" : "Cookbooks";

        return (
          <Pressable
            key={section}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(section)}
            className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 py-2 focus:border-primary-strong active:opacity-[0.78] ${selected ? "border-border bg-surface" : "border-transparent bg-transparent"}`}
            testID={`library-segment-${section}`}
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
  );
}

/** Data-ready personal library surface. No backend or fixture data is owned here. */
export function RecipesLibraryView({
  recipes,
  cookbooks,
  initialSection = "recipes",
  onAddRecipe,
  onCookbookPress,
  onCreateCookbook,
  onProfilePress,
  onRecipeImageError,
  onRecipePress,
  onRetryCookbooks,
  onRetryRecipes,
  onSearchQueryChange,
}: RecipesLibraryViewProps) {
  const { fontScale, height, width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const [activeSection, setActiveSection] =
    useState<LibrarySection>(initialSection);
  const [queries, setQueries] = useState<Record<LibrarySection, string>>({
    recipes: "",
    cookbooks: "",
  });

  const safeContentWidth = width - safeAreaInsets.left - safeAreaInsets.right;
  const isTablet = Math.min(width, height) >= 600;
  const columnCount = fontScale >= 1.3 ? 1 : isTablet ? 3 : 2;
  const horizontalGutter = isTablet ? 24 : 20;
  const availableWidth =
    Math.min(safeContentWidth, MaxContentWidth) - horizontalGutter * 2;
  const cardWidth =
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;
  const query = queries[activeSection];
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
    const noun = activeSection === "recipes" ? "recipes" : "cookbooks";
    const isRecipes = activeSection === "recipes";
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
          testID={`library-${noun}-error`}
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
          testID={`library-${noun}-no-results`}
          title={`No ${noun} found`}
        />
      );
    }

    if (activeStatus === "ready") {
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
          visualActionShell
        />
      );
    }

    return null;
  };

  const floatingBottom =
    BottomTabInset + Math.max(safeAreaInsets.bottom, 12) + 12;
  const showRecipeFab =
    activeSection === "recipes" &&
    recipes.status === "ready" &&
    recipes.data.length > 0;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-background"
      testID="recipes-library-screen"
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
                className="h-14 flex-row items-center justify-between border-b border-border"
                style={{
                  marginHorizontal: -horizontalGutter,
                  paddingHorizontal: horizontalGutter,
                }}
              >
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-bold leading-[30px] text-text-primary"
                >
                  Recipes
                </Text>
                <OptionalIconAction
                  accessibilityHint="Opens your profile."
                  accessibilityLabel="Open profile"
                  icon={{
                    ios: "person.crop.circle",
                    android: "account_circle",
                    web: "account_circle",
                  }}
                  onPress={onProfilePress}
                  testID="library-profile-action"
                />
              </View>

              <View className="pt-5">
                <SearchField
                  onChangeText={setQuery}
                  onClear={() => setQuery("")}
                  section={activeSection}
                  value={query}
                />
                <LibrarySegment
                  activeSection={activeSection}
                  onChange={setActiveSection}
                />
              </View>

              <View className="mt-8">
                <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-primary-strong">
                  {activeSection === "recipes"
                    ? "Personal library"
                    : "Your collections"}
                </Text>
                <View className="mt-1.5 min-h-12 flex-row items-center justify-between gap-4">
                  <Text
                    accessibilityRole="header"
                    className="shrink text-[28px] font-bold leading-[34px] text-text-primary"
                  >
                    {activeSection === "recipes"
                      ? "Recently saved"
                      : "Cookbooks"}
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

                    {activeSection === "cookbooks" ? (
                      <OptionalIconAction
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
