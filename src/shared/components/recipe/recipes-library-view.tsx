import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
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

import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import type {
  CookbookCardModel,
  LibraryMode,
  LibraryResource,
  LibrarySection,
  RecipeCardModel,
  RecipesLibraryViewProps,
} from "@/shared/types";

import { CookbookCard } from "./cookbook-card";
import { LibraryFeedback, SkeletonCard } from "./library-feedback";
import { RecipeCard } from "./recipe-card";

type LibraryListItem =
  | { kind: "recipe"; item: RecipeCardModel }
  | { kind: "cookbook"; item: CookbookCardModel }
  | { kind: "skeleton"; id: string };

const GRID_GAP = 12;
const LIBRARY_SECTIONS: readonly LibrarySection[] = ["recipes", "cookbooks"];
const RECIPE_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "alphabetical", label: "A–Z" },
] as const;
type RecipeSort = (typeof RECIPE_SORT_OPTIONS)[number]["value"];

export function getLibraryColumnCount({
  fontScale,
  height,
  width,
}: {
  fontScale: number;
  height: number;
  width: number;
}) {
  if (fontScale >= 1.3) return 1;
  return Math.min(width, height) >= 600 ? 3 : 2;
}

function SearchField({
  mode,
  onChangeText,
  section,
  value,
}: {
  mode: LibraryMode;
  onChangeText: (value: string) => void;
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
      className={`min-h-12 flex-row items-center rounded-2xl border bg-surface px-1 pl-4 ${focused ? "border-primary" : "border-border"}`}
    >
      <SymbolView
        accessible={false}
        name={{ ios: "magnifyingglass", android: "search", web: "search" }}
        size={21}
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
        selectionColor={colorTokens.primary}
        value={value}
        className="min-h-12 flex-1 px-3 py-2 text-base font-normal leading-6 text-text-primary outline-none"
        testID={`library-${section}-search-input`}
      />
      {value ? (
        <Pressable
          accessibilityHint={`Clears the ${noun} search.`}
          accessibilityLabel={`Clear ${noun} search`}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => onChangeText("")}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary active:bg-surface-subtle"
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

function PersonalHeader({
  horizontalGutter,
  onActivityPress,
  onQueryChange,
  query,
  section,
  showActivity,
  unreadActivityCount,
}: {
  horizontalGutter: number;
  onActivityPress?: () => void;
  onQueryChange: (query: string) => void;
  query: string;
  section: LibrarySection;
  showActivity: boolean;
  unreadActivityCount: number;
}) {
  return (
    <View className="w-full items-center">
      <View
        className="w-full pb-5 pt-2"
        style={{
          maxWidth: MaxContentWidth,
          paddingHorizontal: horizontalGutter,
        }}
      >
        <View className="min-h-14 flex-row items-center gap-3">
          <View
            accessible={false}
            className="h-11 w-11 items-center justify-center rounded-[14px] bg-primary"
          >
            <SymbolView
              name={{
                ios: "fork.knife",
                android: "restaurant",
                web: "restaurant",
              }}
              size={23}
              tintColor={colorTokens.onPrimary}
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              accessibilityRole="header"
              className="text-[22px] font-bold leading-7 text-text-primary"
            >
              Noomori
            </Text>
            <Text
              numberOfLines={1}
              className="text-sm font-medium leading-5 text-text-secondary"
            >
              Recipes for you and your household
            </Text>
          </View>
          {showActivity ? (
            <Pressable
              accessibilityHint="Opens household recipe activity."
              accessibilityLabel={
                unreadActivityCount
                  ? `Activity, ${unreadActivityCount} unread`
                  : "Activity"
              }
              accessibilityRole="button"
              className="relative h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary active:bg-surface"
              onPress={onActivityPress}
              testID="recipe-activity-button"
            >
              <SymbolView
                accessible={false}
                name={{
                  ios: "bell",
                  android: "notifications",
                  web: "notifications",
                }}
                size={23}
                tintColor={colorTokens.textPrimary}
              />
              {Boolean(unreadActivityCount) ? (
                <View
                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-background bg-accent"
                  testID="recipe-activity-unread-dot"
                />
              ) : null}
            </Pressable>
          ) : null}
        </View>
        <View className="mt-4">
          <SearchField
            mode="personal"
            onChangeText={onQueryChange}
            section={section}
            value={query}
          />
        </View>
      </View>
    </View>
  );
}

function SectionSelector({
  activeSection,
  onSectionChange,
}: {
  activeSection: LibrarySection;
  onSectionChange: (section: LibrarySection) => void;
}) {
  return (
    <View
      accessibilityLabel="Recipe library view"
      className="flex-row border-b border-border"
      testID="library-section-selector"
    >
      {LIBRARY_SECTIONS.map((section) => {
        const selected = section === activeSection;
        const label = section === "recipes" ? "Recipes" : "Cookbooks";
        return (
          <Pressable
            key={section}
            accessibilityHint={
              selected ? "Currently selected." : `Shows ${label.toLowerCase()}.`
            }
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="relative min-h-12 min-w-[112px] items-center justify-center border-2 border-transparent px-4 focus:border-primary"
            onPress={() => onSectionChange(section)}
            testID={`library-segment-${section}`}
          >
            <Text
              className={`text-base leading-6 ${selected ? "font-bold text-primary" : "font-semibold text-text-secondary"}`}
            >
              {label}
            </Text>
            {selected ? (
              <View className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-accent" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

type LibraryPageProps = Pick<
  RecipesLibraryViewProps,
  | "cookbooks"
  | "householdName"
  | "handoffCount"
  | "mode"
  | "onAddRecipe"
  | "onCookbookPress"
  | "onCreateCookbook"
  | "onRecipeImageError"
  | "onRecipePress"
  | "onRefresh"
  | "onReviewHandoffs"
  | "onRetryCookbooks"
  | "onRetryRecipes"
  | "onShareRecipe"
  | "refreshing"
  | "recipes"
> & {
  cardWidth: number;
  columnCount: number;
  horizontalGutter: number;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: RecipeSort) => void;
  pageSection: LibrarySection;
  query: string;
  sort: RecipeSort;
};

function LibraryPage({
  cardWidth,
  columnCount,
  cookbooks,
  handoffCount = 0,
  householdName,
  horizontalGutter,
  mode = "personal",
  onAddRecipe,
  onCookbookPress,
  onCreateCookbook,
  onQueryChange,
  onRecipeImageError,
  onRecipePress,
  onRefresh,
  onReviewHandoffs,
  onRetryCookbooks,
  onRetryRecipes,
  onShareRecipe,
  onSortChange,
  pageSection,
  query,
  refreshing = false,
  recipes,
  sort,
}: LibraryPageProps) {
  const listRef = useRef<FlatList<LibraryListItem>>(null);
  const isHousehold = mode === "household";
  const resource: LibraryResource<RecipeCardModel | CookbookCardModel> =
    pageSection === "recipes" ? recipes : cookbooks;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const status = resource.status;
  const hasSourceData = resource.status === "ready" && resource.data.length > 0;
  const message = resource.status === "error" ? resource.message : undefined;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [normalizedQuery, pageSection, sort]);

  const listItems = useMemo<LibraryListItem[]>(() => {
    if (status === "loading") {
      return Array.from({ length: columnCount * 2 }, (_, index) => ({
        kind: "skeleton" as const,
        id: `${pageSection}-skeleton-${index}`,
      }));
    }
    if (pageSection === "recipes" && recipes.status === "ready") {
      const filteredRecipes = recipes.data.filter(
        (recipe) =>
          !normalizedQuery ||
          recipe.title.toLocaleLowerCase().includes(normalizedQuery),
      );
      if (sort === "alphabetical") {
        filteredRecipes.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
            numeric: true,
          }),
        );
      }
      return filteredRecipes.map((item) => ({ kind: "recipe" as const, item }));
    }
    if (pageSection === "cookbooks" && cookbooks.status === "ready") {
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
    columnCount,
    cookbooks,
    normalizedQuery,
    pageSection,
    recipes,
    sort,
    status,
  ]);
  // NOTE: Count the rendered results so searches stay accurate in every library mode.
  const count = status === "ready" ? listItems.length : null;

  const renderEmptyState = () => {
    const noun = isHousehold
      ? "shared recipes"
      : pageSection === "recipes"
        ? "recipes"
        : "cookbooks";
    const isRecipes = pageSection === "recipes";
    const stateKey = isHousehold ? "shared-recipes" : noun;

    if (status === "error") {
      return (
        <LibraryFeedback
          actionLabel={
            isRecipes
              ? onRetryRecipes && "Try again"
              : onRetryCookbooks && "Try again"
          }
          body="Try again in a moment."
          icon={{
            ios: "exclamationmark.arrow.circlepath",
            android: "sync_problem",
            web: "sync_problem",
          }}
          onAction={isRecipes ? onRetryRecipes : onRetryCookbooks}
          testID={`library-${stateKey}-error`}
          title={message?.trim() || `Couldn’t load your ${noun}.`}
        />
      );
    }
    if (status === "ready" && normalizedQuery && hasSourceData) {
      return (
        <LibraryFeedback
          actionLabel="Clear search"
          body={`Try a different ${isRecipes ? "name or keyword" : "cookbook name"}.`}
          icon={{ ios: "magnifyingglass", android: "search", web: "search" }}
          onAction={() => onQueryChange("")}
          testID={`library-${stateKey}-no-results`}
          title={`No ${noun} found for “${query.trim()}”`}
        />
      );
    }
    if (status !== "ready") return null;
    if (isHousehold) {
      return (
        <LibraryFeedback
          actionLabel="Share a recipe"
          body="Pick one of your recipes to share with the household."
          icon={{ ios: "person.2", android: "group", web: "group" }}
          onAction={onShareRecipe}
          testID="library-shared-recipes-empty"
          title="Nothing shared yet"
        />
      );
    }
    return (
      <LibraryFeedback
        actionLabel={isRecipes ? "Add your first recipe" : "Create a cookbook"}
        body={
          isRecipes
            ? "Add one you already love. It’s yours until you choose to share it."
            : "Keep the recipes you come back to together."
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
  };

  return (
    <FlatList
      ref={listRef}
      key={`library-${pageSection}-${columnCount}`}
      data={listItems}
      extraData={handoffCount}
      keyExtractor={(entry) =>
        entry.kind === "skeleton" ? entry.id : `${entry.kind}-${entry.item.id}`
      }
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      numColumns={columnCount}
      onScrollBeginDrag={Keyboard.dismiss}
      onRefresh={onRefresh}
      refreshing={refreshing}
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
              showSharedBadge={!isHousehold}
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
          {isHousehold ? (
            <>
              <View className="min-h-14 justify-center">
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-bold leading-[30px] text-text-primary"
                >
                  {householdName?.trim() || "Household"}
                </Text>
              </View>
              <View className="mt-4">
                <SearchField
                  mode="household"
                  onChangeText={onQueryChange}
                  section="recipes"
                  value={query}
                />
              </View>
              {handoffCount > 0 ? (
                <Pressable
                  accessibilityHint="Opens recipes from someone who left."
                  accessibilityRole="button"
                  className="mt-5 min-h-[64px] flex-row items-center gap-3 border-y border-accent py-3 focus:border-2 focus:border-primary active:opacity-70"
                  onPress={onReviewHandoffs}
                  testID="recipe-handoff-banner"
                >
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "tray.full",
                      android: "inbox",
                      web: "inbox",
                    }}
                    size={24}
                    tintColor={colorTokens.primaryStrong}
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-bold leading-6 text-text-primary">
                      Recipes from someone who left
                    </Text>
                    <Text className="text-sm leading-5 text-text-secondary">
                      Choose which {handoffCount === 1 ? "one" : "ones"} you’d
                      like to keep.
                    </Text>
                  </View>
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "chevron.right",
                      android: "chevron_right",
                      web: "chevron_right",
                    }}
                    size={22}
                    tintColor={colorTokens.textSecondary}
                  />
                </Pressable>
              ) : null}
            </>
          ) : null}
          <View className={isHousehold ? "mt-8" : "pt-1"}>
            <View className="min-h-12 flex-row items-center justify-between gap-4">
              <Text
                accessibilityRole="header"
                className="shrink text-[28px] font-bold leading-[34px] text-text-primary"
              >
                {isHousehold
                  ? "Shared recipes"
                  : pageSection === "recipes"
                    ? "Your recipes"
                    : "Cookbooks"}
              </Text>
              {count != null ? (
                <Text className="text-sm font-medium leading-5 text-text-secondary">
                  {pageSection === "recipes"
                    ? count === 1
                      ? "1 recipe"
                      : `${count} recipes`
                    : count === 1
                      ? "1 cookbook"
                      : `${count} cookbooks`}
                </Text>
              ) : status === "loading" ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-sm font-medium leading-5 text-text-secondary"
                >
                  Loading…
                </Text>
              ) : null}
            </View>
            {pageSection === "recipes" && hasSourceData ? (
              <View
                accessibilityLabel="Recipe sort order"
                className="mt-3 flex-row flex-wrap gap-2"
              >
                {RECIPE_SORT_OPTIONS.map(({ value, label }) => {
                  const selected = sort === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                      className={`min-h-12 min-w-12 max-w-full items-center justify-center rounded-xl border-2 px-4 py-2 focus:border-text-primary active:opacity-80 ${selected ? "border-primary bg-primary" : "border-border bg-surface"}`}
                      onPress={() => onSortChange(value)}
                    >
                      <Text
                        className={`text-base font-semibold leading-6 ${selected ? "text-on-primary" : "text-text-primary"}`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      }
      ItemSeparatorComponent={() => <View className="h-3" />}
      columnWrapperStyle={columnCount > 1 ? { gap: GRID_GAP } : undefined}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: horizontalGutter,
        paddingBottom: 32,
      }}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, width: "100%", maxWidth: MaxContentWidth }}
      testID={`library-grid-${pageSection}`}
    />
  );
}

/** Direct personal recipe library with secondary cookbooks and stable household mode. */
export function RecipesLibraryView({
  recipes,
  cookbooks,
  handoffCount = 0,
  householdName,
  mode = "personal",
  onActivityPress,
  onAddRecipe,
  onCookbookPress,
  onCreateCookbook,
  onRecipeImageError,
  onRecipePress,
  onRefresh,
  onReviewHandoffs,
  onRetryCookbooks,
  onRetryRecipes,
  onSectionChange,
  onSearchQueryChange,
  onShareRecipe,
  refreshing = false,
  section: activeSection = "recipes",
  showActivity = false,
  unreadActivityCount = 0,
}: RecipesLibraryViewProps) {
  const { fontScale, height, width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const pageWidth = width - safeAreaInsets.left - safeAreaInsets.right;
  const [queries, setQueries] = useState<Record<LibrarySection, string>>({
    recipes: "",
    cookbooks: "",
  });
  const [sort, setSort] = useState<RecipeSort>("newest");
  const isHousehold = mode === "household";
  const visibleSection = isHousehold ? "recipes" : activeSection;
  const isTablet = Math.min(width, height) >= 600;
  const columnCount = getLibraryColumnCount({ fontScale, height, width });
  const horizontalGutter = isTablet ? 24 : 20;
  const availableWidth =
    Math.min(pageWidth, MaxContentWidth) - horizontalGutter * 2;
  const cardWidth =
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;

  const changeQuery = (section: LibrarySection, query: string) => {
    setQueries((current) => ({ ...current, [section]: query }));
    onSearchQueryChange?.(section, query);
  };

  const page = (
    <LibraryPage
      cardWidth={cardWidth}
      columnCount={columnCount}
      cookbooks={cookbooks}
      handoffCount={handoffCount}
      householdName={householdName}
      horizontalGutter={horizontalGutter}
      mode={mode}
      onAddRecipe={onAddRecipe}
      onCookbookPress={onCookbookPress}
      onCreateCookbook={onCreateCookbook}
      onQueryChange={(query) => changeQuery(visibleSection, query)}
      onRecipeImageError={onRecipeImageError}
      onRecipePress={onRecipePress}
      onRefresh={onRefresh}
      onReviewHandoffs={onReviewHandoffs}
      onRetryCookbooks={onRetryCookbooks}
      onRetryRecipes={onRetryRecipes}
      onShareRecipe={onShareRecipe}
      onSortChange={setSort}
      pageSection={visibleSection}
      query={queries[visibleSection]}
      refreshing={refreshing}
      recipes={recipes}
      sort={sort}
    />
  );

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
      {isHousehold ? (
        <View className="flex-1 items-center">{page}</View>
      ) : (
        <>
          <PersonalHeader
            horizontalGutter={horizontalGutter}
            onActivityPress={onActivityPress}
            onQueryChange={(query) => changeQuery(activeSection, query)}
            query={queries[activeSection]}
            section={activeSection}
            showActivity={showActivity}
            unreadActivityCount={unreadActivityCount}
          />
          <View className="flex-1 items-center overflow-hidden rounded-t-[24px] bg-surface">
            <View
              className="w-full"
              style={{
                maxWidth: MaxContentWidth,
                paddingHorizontal: horizontalGutter,
              }}
            >
              <SectionSelector
                activeSection={activeSection}
                onSectionChange={(section) => onSectionChange?.(section)}
              />
            </View>
            {page}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
