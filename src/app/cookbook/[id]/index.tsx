import {
  BottomSheetModal,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CookbookApiError,
  deleteCookbook,
  getCookbook,
  renameCookbook,
  toCookbookCard,
  type ApiCookbookDetail,
} from "@/shared/cookbook-api";
import {
  cacheDeletedCookbook,
  cacheUpdatedCookbook,
  cookbookKeys,
} from "@/shared/cookbook-query";
import { CookbookCard } from "@/shared/components/recipe/cookbook-card";
import { RecipeCard } from "@/shared/components/recipe/recipe-card";
import { seedRecipeDetail } from "@/shared/components/recipe/recipe-query";
import { toRecipeCard } from "@/shared/components/recipe/recipe-response";
import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const GRID_GAP = 12;

export default function CookbookDetailRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { session } = useSession();
  const { fontScale, height, width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const pendingAction = useRef<"rename" | "delete" | null>(null);
  const retriedImage = useRef(false);
  const cookbookId = Array.isArray(params.id) ? params.id[0] : params.id;
  const normalizedCookbookId = cookbookId?.trim() ?? "";
  const accessToken = session?.access_token ?? "";
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const isTablet = Math.min(width, height) >= 600;
  const columnCount = fontScale >= 1.3 ? 1 : isTablet ? 3 : 2;
  const horizontalGutter = isTablet ? 24 : 20;
  const availableWidth = Math.min(width, MaxContentWidth) - horizontalGutter * 2;
  const cardWidth =
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;

  const cookbookQuery = useQuery<ApiCookbookDetail>({
    enabled: Boolean(accessToken && normalizedCookbookId),
    queryKey: cookbookKeys.detail(normalizedCookbookId),
    staleTime: 60_000,
    queryFn: () => getCookbook(accessToken, normalizedCookbookId),
  });
  const renameMutation = useMutation({
    mutationFn: () =>
      renameCookbook(accessToken, normalizedCookbookId, {
        title: renameTitle.trim(),
      }),
    onSuccess: (cookbook) => {
      cacheUpdatedCookbook(queryClient, cookbook);
      setRenameOpen(false);
      setRenameError(null);
      AccessibilityInfo.announceForAccessibility("Cookbook renamed");
    },
    onError: (error) => {
      const message =
        error instanceof CookbookApiError
          ? error.message
          : "Couldn’t rename the cookbook. Try again.";
      setRenameError(message);
      AccessibilityInfo.announceForAccessibility(message);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCookbook(accessToken, normalizedCookbookId),
    onSuccess: () => {
      cacheDeletedCookbook(queryClient, normalizedCookbookId);
      router.replace({ pathname: "/", params: { section: "cookbooks" } });
    },
  });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/", params: { section: "cookbooks" } });
  };

  const finishActionsDismiss = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action === "rename") {
      setRenameTitle(cookbookQuery.data?.title ?? "");
      setRenameError(null);
      setRenameOpen(true);
    } else if (action === "delete") {
      Alert.alert(
        "Delete cookbook?",
        "The cookbook will be deleted. Its recipes will stay in your Recipes library.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete cookbook",
            style: "destructive",
            onPress: () => deleteMutation.mutate(),
          },
        ],
      );
    }
  };

  const requestAction = (action: "rename" | "delete") => {
    pendingAction.current = action;
    actionsSheetRef.current?.dismiss();
  };

  if (!cookbookQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        <View className="min-h-16 flex-row items-center border-b border-border bg-surface px-4 py-2">
          <Pressable
            accessibilityLabel="Back to cookbooks"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
            onPress={close}
          >
            <SymbolView
              accessible={false}
              name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
              size={22}
              tintColor={colorTokens.textPrimary}
            />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center gap-4 px-5">
          {cookbookQuery.isError ? (
            <>
              <Text accessibilityRole="header" className="text-xl font-bold text-text-primary">
                Couldn’t load cookbook
              </Text>
              <Text className="text-center text-base leading-6 text-text-secondary">
                Check your connection and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-h-12 rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => cookbookQuery.refetch()}
              >
                <Text className="text-base font-bold text-text-primary">Try again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={colorTokens.primaryStrong} size="large" />
              <Text accessibilityLiveRegion="polite" className="text-base text-text-secondary">
                Loading cookbook…
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const cookbook = cookbookQuery.data;
  const recipes = cookbook.recipes.map(toRecipeCard);
  const summary = toCookbookCard({
    id: cookbook.id,
    title: cookbook.title,
    recipe_count: cookbook.recipe_count,
    cover_image_urls: cookbook.recipes
      .map((recipe) => recipe.image_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 4),
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="min-h-16 flex-row items-center justify-between border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back to cookbooks"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={close}
        >
          <SymbolView
            accessible={false}
            name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text className="min-w-0 shrink flex-1 px-2 text-center text-lg font-bold text-text-primary" numberOfLines={1}>
          {cookbook.title}
        </Text>
        <Pressable
          accessibilityHint="Opens cookbook actions."
          accessibilityLabel="Cookbook actions"
          accessibilityRole="button"
          accessibilityState={{ disabled: deleteMutation.isPending }}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle disabled:opacity-50"
          disabled={deleteMutation.isPending}
          onPress={() => actionsSheetRef.current?.present()}
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator color={colorTokens.primaryStrong} />
          ) : (
            <SymbolView
              accessible={false}
              name={{ ios: "ellipsis", android: "more_vert", web: "more_vert" }}
              size={24}
              tintColor={colorTokens.textPrimary}
            />
          )}
        </Pressable>
      </View>

      {deleteMutation.isError ? (
        <View accessibilityRole="alert" className="border-b border-error bg-surface px-5 py-3">
          <Text className="text-base font-bold text-error">Cookbook not deleted</Text>
          <Text className="mt-1 text-sm text-text-secondary">Check your connection and try again.</Text>
        </View>
      ) : null}

      <View className="flex-1 items-center">
        <FlatList
          key={`cookbook-recipes-${columnCount}`}
          data={recipes}
          keyExtractor={(recipe) => recipe.id}
          numColumns={columnCount}
          renderItem={({ item }) => (
            <RecipeCard
              item={item}
              onImageError={() => {
                if (retriedImage.current) return;
                retriedImage.current = true;
                cookbookQuery.refetch();
              }}
              onPress={(recipeId) => {
                const apiRecipe = cookbook.recipes.find((recipe) => recipe.id === recipeId);
                if (apiRecipe) seedRecipeDetail(queryClient, apiRecipe);
                router.navigate({ pathname: "/recipe/[id]", params: { id: recipeId } });
              }}
              width={cardWidth}
            />
          )}
          ListHeaderComponent={
            <View className="gap-6 pb-6">
              <CookbookCard item={summary} width={availableWidth} />
              <View className="flex-row items-center justify-between gap-4">
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-primary-strong">
                    Recipes
                  </Text>
                  <Text accessibilityRole="header" className="mt-1 text-2xl font-bold leading-8 text-text-primary">
                    {cookbook.recipe_count === 1 ? "1 recipe" : `${cookbook.recipe_count} recipes`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                  onPress={() =>
                    router.push({
                      pathname: "/cookbook/[id]/recipes",
                      params: { id: cookbook.id },
                    })
                  }
                >
                  <Text className="text-base font-bold text-primary-strong">
                    {recipes.length ? "Edit recipes" : "Add recipes"}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="min-h-[260px] items-center justify-center rounded-2xl border border-border bg-surface px-6 py-10">
              <Text accessibilityRole="header" className="text-center text-xl font-bold text-text-primary">
                No recipes yet
              </Text>
              <Text className="mt-2 text-center text-base leading-6 text-text-secondary">
                Add recipes whenever this collection is ready.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
          columnWrapperStyle={columnCount > 1 ? { gap: GRID_GAP } : undefined}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: horizontalGutter, paddingTop: 20, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
          style={{ width: "100%", maxWidth: MaxContentWidth }}
        />
      </View>

      <BottomSheetModal
        ref={actionsSheetRef}
        backgroundStyle={{
          backgroundColor: colorTokens.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
        enableDynamicSizing
        enablePanDownToClose
        onDismiss={finishActionsDismiss}
      >
        <BottomSheetView>
          <View className="items-center px-5 pt-2" style={{ paddingBottom: Math.max(safeAreaInsets.bottom, 20) }}>
            <View className="w-full max-w-[640px] gap-3">
              <View className="min-h-14 flex-row items-center justify-between">
                <Text accessibilityRole="header" className="text-xl font-bold text-text-primary">
                  Cookbook actions
                </Text>
                <Pressable
                  accessibilityLabel="Close cookbook actions"
                  accessibilityRole="button"
                  className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
                  onPress={() => actionsSheetRef.current?.dismiss()}
                >
                  <SymbolView accessible={false} name={{ ios: "xmark", android: "close", web: "close" }} size={22} tintColor={colorTokens.textPrimary} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Rename cookbook"
                accessibilityRole="button"
                className="min-h-12 flex-row items-center gap-4 rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => requestAction("rename")}
              >
                <SymbolView accessible={false} name={{ ios: "pencil", android: "edit", web: "edit" }} size={22} tintColor={colorTokens.textPrimary} />
                <Text className="text-base font-bold text-text-primary">Rename</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Delete cookbook"
                accessibilityRole="button"
                className="min-h-12 flex-row items-center gap-4 rounded-xl border-2 border-error bg-surface px-4 py-3 focus:border-text-primary active:bg-surface-subtle"
                onPress={() => requestAction("delete")}
              >
                <SymbolView accessible={false} name={{ ios: "trash", android: "delete", web: "delete" }} size={22} tintColor={colorTokens.error} />
                <Text className="text-base font-bold text-error">Delete</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <Modal
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
        transparent
        visible={renameOpen}
      >
        <View className="flex-1 items-center justify-center bg-text-primary/50 px-5">
          <View className="w-full max-w-[440px] gap-5 rounded-2xl border border-border bg-surface p-5">
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-xl font-bold text-text-primary">
                Rename cookbook
              </Text>
              <Text className="text-base leading-6 text-text-secondary">
                Choose a title up to 100 characters.
              </Text>
            </View>
            <View className="gap-2">
              <Text className="text-base font-bold text-text-primary">Cookbook title</Text>
              <TextInput
                accessibilityLabel="Cookbook title"
                autoFocus
                className={`min-h-14 rounded-xl border-2 bg-surface px-4 py-3 text-base text-text-primary outline-none ${renameError ? "border-error" : "border-border focus:border-primary-strong"}`}
                maxLength={100}
                onChangeText={(value) => {
                  setRenameTitle(value);
                  if (renameError && value.trim()) setRenameError(null);
                }}
                onSubmitEditing={() => {
                  if (renameTitle.trim()) renameMutation.mutate();
                }}
                returnKeyType="done"
                selectionColor={colorTokens.primaryStrong}
                value={renameTitle}
              />
              {renameError ? (
                <Text accessibilityRole="alert" className="text-sm font-medium text-error">{renameError}</Text>
              ) : null}
            </View>
            <View className="flex-row justify-end gap-3">
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border-2 border-border px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                onPress={() => setRenameOpen(false)}
              >
                <Text className="text-base font-bold text-text-primary">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !renameTitle.trim() || renameMutation.isPending }}
                className="min-h-12 min-w-[92px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-4 py-3 focus:border-text-primary active:opacity-80 disabled:opacity-50"
                disabled={!renameTitle.trim() || renameMutation.isPending}
                onPress={() => renameMutation.mutate()}
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator color={colorTokens.onPrimary} />
                ) : (
                  <Text className="text-base font-bold text-on-primary">Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
