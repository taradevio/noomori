import { AppIcon } from "@/shared/ui/app-icon";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  I18nManager,
  Keyboard,
  Platform,
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

import { Gesture, GestureDetector } from "react-native-gesture-handler";

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
import { RecipeSortMenu, type RecipeSort } from "./recipe-sort-menu";

type LibraryListItem =
  | { kind: "recipe"; item: RecipeCardModel }
  | { kind: "cookbook"; item: CookbookCardModel }
  | { kind: "skeleton"; id: string };

const GRID_GAP = 12;
const LIBRARY_SECTIONS: readonly LibrarySection[] = ["recipes", "cookbooks"];

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
      <AppIcon
        accessible={false}
        name="search"
        size={21}
        color={colorTokens.textSecondary}
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
          <AppIcon
            accessible={false}
            name="close-circle"
            size={21}
            color={colorTokens.textSecondary}
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
        className="w-full pb-4 pt-2"
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
            {/* <AppIcon
              name="utensils"
              size={23}
              color={colorTokens.onPrimary}
            /> */}
            <Image
              source={require("@/assets/images/noomori-icon.webp")}
              style={{ width: 44, height: 44 }}
              contentFit="contain"
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
              <AppIcon
                accessible={false}
                name="notifications"
                size={23}
                color={colorTokens.textPrimary}
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
      className="flex-row gap-1 rounded-[14px] bg-surface-subtle p-1"
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
            aria-selected={selected}
            className={`min-h-12 min-w-0 flex-1 items-center justify-center rounded-[10px] border-2 border-transparent px-2 py-3 focus:border-primary ${selected ? "bg-surface" : "bg-surface-subtle"}`}
            onPress={() => onSectionChange(section)}
            testID={`library-segment-${section}`}
          >
            <Text
              className={`w-full text-center text-sm leading-[21px] ${selected ? "font-bold text-primary" : "font-medium text-text-secondary"}`}
            >
              {label}
            </Text>
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
          icon="sync-error"
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
          icon="search"
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
          actionFullWidth
          body="Pick one of your recipes to share with the household."
          illustration={require("@/assets/images/household.webp")}
          icon="people"
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
            ? "Keep the dishes you love, ready for the next time you cook."
            : "Gather the recipes you love into cookbooks."
        }
        illustration={require("@/assets/images/cookbook.webp")}
        actionFullWidth
        onAction={isRecipes ? onAddRecipe : onCreateCookbook}
        testID={`library-${noun}-empty`}
        title={
          isRecipes ? "Your cookbook starts here" : "Your cookbooks start here"
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
        <View className="pb-4">
          {isHousehold ? (
            <>
              <View className="min-h-14 justify-center">
                <Text
                  accessibilityRole="header"
                  className="text-[31px] font-bold leading-[36px] text-text-primary"
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
                  <AppIcon
                    accessible={false}
                    name="inbox"
                    accented
                    size={24}
                    color={colorTokens.primaryStrong}
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
                  <AppIcon
                    accessible={false}
                    name="chevron-right"
                    size={22}
                    color={colorTokens.textSecondary}
                  />
                </Pressable>
              ) : null}
            </>
          ) : null}
          {isHousehold ? (
            <Text
              accessibilityRole="header"
              className="mt-8 text-[24px] font-bold leading-[34px] text-text-primary"
            >
              Shared recipes
            </Text>
          ) : null}
          {isHousehold || hasSourceData || status === "loading" ? (
            <View className="min-h-12 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {count != null ? (
                <Text className="text-sm font-medium leading-[21px] text-text-secondary">
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
              {pageSection === "recipes" && hasSourceData ? (
                <RecipeSortMenu value={sort} onChange={onSortChange} />
              ) : null}
            </View>
          ) : null}
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
      style={{
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
        // Browsers stop resolving touch-action at the first scroll container.
        ...(Platform.OS === "web" ? { touchAction: "pan-y" as const } : {}),
      }}
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

  const sectionSwipe = Gesture.Pan()
    .enabled(!isHousehold && Boolean(onSectionChange))
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .withTestId("library-section-swipe")
    .onEnd((event, success) => {
      if (
        !success ||
        Math.abs(event.translationX) < 48 ||
        Math.abs(event.translationY) > 16
      )
        return;
      const forward =
        (I18nManager.isRTL ? -event.translationX : event.translationX) < 0;
      if (forward && activeSection === "recipes")
        onSectionChange?.("cookbooks");
      else if (!forward && activeSection === "cookbooks")
        onSectionChange?.("recipes");
    });

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
          <View className="flex-1 items-center bg-background">
            <View
              className="w-full pb-4"
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
            <GestureDetector gesture={sectionSwipe} touchAction="pan-y">
              <View collapsable={false} className="w-full flex-1 items-center">
                {page}
              </View>
            </GestureDetector>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
