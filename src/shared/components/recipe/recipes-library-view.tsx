import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
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
const SWIPE_COMMIT_RATIO = 0.35;
const LIBRARY_SECTIONS: readonly LibrarySection[] = ["recipes", "cookbooks"];

function LibraryAddButton({
  onPress,
  section,
}: {
  onPress: () => void;
  section: LibrarySection;
}) {
  const isRecipes = section === "recipes";

  return (
    <Pressable
      accessibilityHint={
        isRecipes ? "Starts a new recipe." : "Starts a new cookbook."
      }
      accessibilityLabel={isRecipes ? "Add recipe" : "Create cookbook"}
      accessibilityRole="button"
      onPress={onPress}
      className="h-14 w-14 items-center justify-center rounded-2xl border-2 border-primary-strong bg-primary focus:border-text-primary active:opacity-[0.82]"
      testID={
        isRecipes ? "library-add-recipe-fab" : "library-create-cookbook-fab"
      }
    >
      <SymbolView
        accessible={false}
        name={{ ios: "plus", android: "add", web: "add" }}
        size={27}
        tintColor={colorTokens.onPrimary}
      />
    </Pressable>
  );
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
        testID={`library-${section}-search-input`}
      />
      {value ? (
        <Pressable
          accessibilityHint={`Clears the ${noun} search.`}
          accessibilityLabel={`Clear ${noun} search`}
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => onChangeText("")}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:opacity-[0.64]"
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

function PersonalLibraryHeader({
  activeSection,
  horizontalGutter,
  onActivityPress,
  onSectionChange,
  pageWidth,
  scrollPosition,
  showActivity,
  unreadActivityCount,
}: {
  activeSection: LibrarySection;
  horizontalGutter: number;
  onActivityPress?: () => void;
  onSectionChange: (section: LibrarySection) => void;
  pageWidth: number;
  scrollPosition: Animated.Value;
  showActivity?: boolean;
  unreadActivityCount?: number;
}) {
  const indicatorWidth = Math.max(
    0,
    (Math.min(pageWidth, MaxContentWidth) - horizontalGutter * 2 - 8) / 2,
  );
  const indicatorTranslateX = scrollPosition.interpolate({
    inputRange: [0, Math.max(pageWidth, 1)],
    outputRange: [0, indicatorWidth],
    extrapolate: "clamp",
  });

  return (
    <View className="w-full items-center">
      <View className="w-full" style={{ maxWidth: MaxContentWidth }}>
        <View
          className="min-h-14 flex-row items-center justify-between border-b border-border py-1"
          style={{ paddingHorizontal: horizontalGutter }}
        >
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold leading-[30px] text-text-primary"
          >
            Recipes
          </Text>
          {showActivity ? (
            <Pressable
              accessibilityHint="Opens household recipe activity."
              accessibilityLabel={
                unreadActivityCount
                  ? `Activity, ${unreadActivityCount} unread`
                  : "Activity"
              }
              accessibilityRole="button"
              className="relative h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
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
              {Boolean(unreadActivityCount) && (
                <View
                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-surface bg-primary-strong"
                  testID="recipe-activity-unread-dot"
                />
              )}
            </Pressable>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: horizontalGutter }}>
          <View
            accessibilityLabel="Recipe library view"
            className="mt-5 min-h-14 flex-row rounded-2xl bg-surface-subtle p-1"
            testID="library-section-segmented-control"
          >
            <Animated.View
              pointerEvents="none"
              className="absolute bottom-1 left-1 top-1 rounded-xl border border-border bg-surface"
              style={{
                width: indicatorWidth,
                transform: [{ translateX: indicatorTranslateX }],
              }}
            />
            {LIBRARY_SECTIONS.map((section) => {
              const selected = section === activeSection;
              const label = section === "recipes" ? "Recipes" : "Cookbooks";
              return (
                <Pressable
                  key={section}
                  accessibilityHint={
                    selected
                      ? "Currently selected."
                      : `Shows ${label.toLowerCase()}.`
                  }
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="z-10 min-h-12 flex-1 items-center justify-center rounded-xl border border-transparent bg-transparent px-3 py-2 focus:border-primary-strong active:opacity-[0.78]"
                  onPress={() => onSectionChange(section)}
                  testID={`library-segment-${section}`}
                >
                  <Text
                    className={`text-center text-base leading-6 ${selected ? "font-bold text-text-primary" : "font-semibold text-text-secondary"}`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

type LibraryPageProps = Pick<
  RecipesLibraryViewProps,
  | "cookbooks"
  | "householdName"
  | "mode"
  | "onAddRecipe"
  | "onCookbookPress"
  | "onCreateCookbook"
  | "onRecipeImageError"
  | "onRecipePress"
  | "onRetryCookbooks"
  | "onRetryRecipes"
  | "onShareRecipe"
  | "recipes"
> & {
  active: boolean;
  addButtonBottom: number;
  cardWidth: number;
  columnCount: number;
  horizontalGutter: number;
  onQueryChange: (query: string) => void;
  pageSection: LibrarySection;
  pageWidth: number;
  query: string;
};

function LibraryPage({
  active,
  addButtonBottom,
  cardWidth,
  columnCount,
  cookbooks,
  householdName,
  horizontalGutter,
  mode = "personal",
  onAddRecipe,
  onCookbookPress,
  onCreateCookbook,
  onQueryChange,
  onRecipeImageError,
  onRecipePress,
  onRetryCookbooks,
  onRetryRecipes,
  onShareRecipe,
  pageSection,
  pageWidth,
  query,
  recipes,
}: LibraryPageProps) {
  const isHousehold = mode === "household";
  const resource: LibraryResource<RecipeCardModel | CookbookCardModel> =
    pageSection === "recipes" ? recipes : cookbooks;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const status = resource.status;
  const count = resource.status === "ready" ? resource.data.length : null;
  const message = resource.status === "error" ? resource.message : undefined;
  const addAction =
    !isHousehold && count != null && count > 0
      ? pageSection === "recipes"
        ? onAddRecipe
        : onCreateCookbook
      : undefined;
  const listItems = useMemo<LibraryListItem[]>(() => {
    if (status === "loading") {
      return Array.from({ length: columnCount * 2 }, (_, index) => ({
        kind: "skeleton" as const,
        id: `${pageSection}-skeleton-${index}`,
      }));
    }
    if (pageSection === "recipes" && recipes.status === "ready") {
      return recipes.data
        .filter(
          (recipe) =>
            !normalizedQuery ||
            recipe.title.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((item) => ({ kind: "recipe" as const, item }));
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
  }, [columnCount, cookbooks, normalizedQuery, pageSection, recipes, status]);

  const renderEmptyState = () => {
    const noun = isHousehold
      ? "shared recipes"
      : pageSection === "recipes"
        ? "recipes"
        : "cookbooks";
    const isRecipes = pageSection === "recipes";
    const stateKey = isHousehold ? "shared-recipes" : noun;
    const hasSourceData = count != null && count > 0;

    if (status === "error") {
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
          title={`No ${noun} found`}
        />
      );
    }
    if (status !== "ready") return null;
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
        actionLabel={isRecipes ? "Add your first recipe" : "Create a cookbook"}
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
  };

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      pointerEvents={active ? "auto" : "none"}
      style={{ width: pageWidth }}
      className="flex-1 items-center"
    >
      <FlatList
        key={`library-${pageSection}-${columnCount}`}
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
          if (item.kind === "skeleton")
            return <SkeletonCard width={cardWidth} />;
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
            {isHousehold ? (
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
                  {householdName?.trim() || "Household"}
                </Text>
              </View>
            ) : null}
            <View className="pt-5">
              <SearchField
                mode={mode}
                onChangeText={onQueryChange}
                section={pageSection}
                value={query}
              />
            </View>
            <View className="mt-8">
              <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-primary-strong">
                {isHousehold
                  ? "Household"
                  : pageSection === "recipes"
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
                    : pageSection === "recipes"
                      ? "Recently saved"
                      : "All cookbooks"}
                </Text>
                {count != null ? (
                  <Text className="text-base font-medium leading-6 text-text-secondary">
                    {count} total
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
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        columnWrapperStyle={columnCount > 1 ? { gap: GRID_GAP } : undefined}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: horizontalGutter,
          paddingBottom: addAction ? addButtonBottom + 72 : 32,
        }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, width: "100%", maxWidth: MaxContentWidth }}
        testID={`library-grid-${pageSection}`}
      />
    </View>
  );
}

/** Personal recipe and cookbook libraries with native horizontal paging. */
export function RecipesLibraryView({
  recipes,
  cookbooks,
  householdName,
  mode = "personal",
  onActivityPress,
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
  showActivity = false,
  unreadActivityCount = 0,
}: RecipesLibraryViewProps) {
  const { fontScale, height, width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const pageWidth = width - safeAreaInsets.left - safeAreaInsets.right;
  const pagerRef = useRef<ScrollView>(null);
  const visibleSectionRef = useRef<LibrarySection>(activeSection);
  const lastPagerWidthRef = useRef(0);
  const [scrollPosition] = useState(
    () => new Animated.Value(activeSection === "cookbooks" ? pageWidth : 0),
  );
  const [queries, setQueries] = useState<Record<LibrarySection, string>>({
    recipes: "",
    cookbooks: "",
  });
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const isHousehold = mode === "household";
  const isTablet = Math.min(width, height) >= 600;
  const columnCount = fontScale >= 1.3 ? 1 : isTablet ? 3 : 2;
  const horizontalGutter = isTablet ? 24 : 20;
  const availableWidth =
    Math.min(pageWidth, MaxContentWidth) - horizontalGutter * 2;
  const cardWidth =
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;
  const addButtonBottom = BottomTabInset;
  const activeResource = activeSection === "recipes" ? recipes : cookbooks;
  const activeAddAction =
    !isHousehold &&
    activeResource.status === "ready" &&
    activeResource.data.length > 0
      ? activeSection === "recipes"
        ? onAddRecipe
        : onCreateCookbook
      : undefined;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isHousehold || !pageWidth) return;
    const widthChanged = lastPagerWidthRef.current !== pageWidth;
    lastPagerWidthRef.current = pageWidth;
    if (visibleSectionRef.current !== activeSection || widthChanged) {
      visibleSectionRef.current = activeSection;
      const offset = activeSection === "cookbooks" ? pageWidth : 0;
      scrollPosition.setValue(offset);
      pagerRef.current?.scrollTo({
        x: offset,
        animated: false,
      });
    }
  }, [activeSection, isHousehold, pageWidth, scrollPosition]);

  const changeSection = (section: LibrarySection) => {
    visibleSectionRef.current = section;
    pagerRef.current?.scrollTo({
      x: section === "cookbooks" ? pageWidth : 0,
      animated: !reduceMotionEnabled,
    });
    onSectionChange?.(section);
  };

  const finishSwipe = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const committedSection = visibleSectionRef.current;
    const committedOffset = committedSection === "cookbooks" ? pageWidth : 0;
    const displacement = event.nativeEvent.contentOffset.x - committedOffset;
    const section: LibrarySection =
      Math.abs(displacement) >= pageWidth * SWIPE_COMMIT_RATIO
        ? displacement > 0
          ? "cookbooks"
          : "recipes"
        : committedSection;
    visibleSectionRef.current = section;
    pagerRef.current?.scrollTo({
      x: section === "cookbooks" ? pageWidth : 0,
      animated: !reduceMotionEnabled,
    });
    if (section !== activeSection) onSectionChange?.(section);
  };

  const pageProps = {
    addButtonBottom,
    cardWidth,
    columnCount,
    cookbooks,
    householdName,
    horizontalGutter,
    mode,
    onAddRecipe,
    onCookbookPress,
    onCreateCookbook,
    onRecipeImageError,
    onRecipePress,
    onRetryCookbooks,
    onRetryRecipes,
    onShareRecipe,
    pageWidth,
    recipes,
  };

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
        <LibraryPage
          {...pageProps}
          active
          onQueryChange={(query) => {
            setQueries((current) => ({ ...current, recipes: query }));
            onSearchQueryChange?.("recipes", query);
          }}
          pageSection="recipes"
          query={queries.recipes}
        />
      ) : (
        <>
          <PersonalLibraryHeader
            activeSection={activeSection}
            horizontalGutter={horizontalGutter}
            onActivityPress={onActivityPress}
            onSectionChange={changeSection}
            pageWidth={pageWidth}
            scrollPosition={scrollPosition}
            showActivity={showActivity}
            unreadActivityCount={unreadActivityCount}
          />
          <Animated.ScrollView
            ref={pagerRef}
            decelerationRate={0}
            directionalLockEnabled
            horizontal
            nestedScrollEnabled
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollPosition } } }],
              { useNativeDriver: true },
            )}
            onScrollEndDrag={finishSwipe}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1, width: "100%" }}
            testID="library-section-pager"
          >
            {LIBRARY_SECTIONS.map((section) => (
              <LibraryPage
                key={section}
                {...pageProps}
                active={section === activeSection}
                onQueryChange={(query) => {
                  setQueries((current) => ({ ...current, [section]: query }));
                  onSearchQueryChange?.(section, query);
                }}
                pageSection={section}
                query={queries[section]}
              />
            ))}
          </Animated.ScrollView>
        </>
      )}
      {activeAddAction ? (
        <View
          pointerEvents="box-none"
          className="absolute right-0 left-0 items-center"
          style={{ bottom: addButtonBottom }}
        >
          <View
            pointerEvents="box-none"
            className="w-full max-w-[800px] items-end"
            style={{ paddingHorizontal: horizontalGutter }}
          >
            <LibraryAddButton
              onPress={activeAddAction}
              section={activeSection}
            />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
