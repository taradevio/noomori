import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { colorTokens } from "@/shared/design-system";

import type { RecipeCardModel } from "@/shared/types";

type RecipeCardProps = {
  item: RecipeCardModel;
  onImageError?: (imagePath: string) => void;
  onPress?: (recipeId: string) => void;
  showSharedBadge?: boolean;
  width: number;
};

function getCookingTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  return Math.round(minutes);
}

function getSharedLabel(item: RecipeCardModel) {
  if (!item.isShared) return null;
  return item.sharedLabel?.trim() || "Shared with household";
}

/** Compact, data-driven recipe summary with no fabricated metadata. */
export function RecipeCard({
  item,
  onImageError,
  onPress,
  showSharedBadge = true,
  width,
}: RecipeCardProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const cookingTime = getCookingTime(item.cookingTimeMinutes);
  const servingsLabel =
    item.servings === null
      ? null
      : `${item.servings} serving${item.servings === 1 ? "" : "s"}`;
  const sharedLabel = showSharedBadge ? getSharedLabel(item) : null;
  const cookbookName = item.cookbookName?.trim() || null;
  const imageUrl = item.imageUrl?.trim() || null;
  const accessibilityParts = [
    item.title,
    cookingTime ? `${cookingTime} minutes` : null,
    servingsLabel,
    sharedLabel,
    cookbookName ? `In ${cookbookName}` : null,
  ].filter(Boolean);

  const content = (
    <>
      <View className="relative aspect-[4/3] overflow-hidden bg-surface-subtle">
        {imageUrl ? (
          <Image
            accessible={false}
            cachePolicy="memory-disk"
            contentFit="cover"
            onError={() => {
              if (item.imagePath) onImageError?.(item.imagePath);
            }}
            source={{
              uri: imageUrl,
              cacheKey: item.imagePath ?? undefined,
            }}
            style={styles.coverImage}
          />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-full w-full items-center justify-center"
            testID={`recipe-card-missing-image-${item.id}`}
          >
            <SymbolView
              name={{
                ios: "fork.knife",
                android: "restaurant",
                web: "restaurant",
              }}
              size={30}
              tintColor={colorTokens.primary}
            />
          </View>
        )}

        {sharedLabel ? (
          <View className="absolute left-3 top-3 min-h-8 max-w-[85%] flex-row items-center gap-1.5 rounded-full bg-surface px-2.5 py-1">
            <SymbolView
              accessible={false}
              name={{ ios: "person.2", android: "group", web: "group" }}
              size={17}
              tintColor={colorTokens.success}
            />
            <Text
              numberOfLines={1}
              className="shrink text-sm font-bold leading-5 text-success"
            >
              {sharedLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="min-h-[104px] gap-2 px-3.5 pb-3.5 pt-3">
        <Text
          numberOfLines={2}
          className="text-base font-bold leading-[22px] text-text-primary"
        >
          {item.title}
        </Text>

        <View className="mt-auto flex-row items-center gap-2 pt-1">
          {cookingTime ? (
            <View className="shrink-0 flex-row items-center gap-1">
              <SymbolView
                accessible={false}
                name={{ ios: "clock", android: "schedule", web: "schedule" }}
                size={15}
                tintColor={colorTokens.textSecondary}
              />
              <Text className="text-[13px] font-normal leading-[18px] text-text-secondary">
                {cookingTime} min
              </Text>
            </View>
          ) : null}
          {cookingTime && (servingsLabel || cookbookName) ? (
            <View className="h-1 w-1 shrink-0 rounded-full bg-border-strong" />
          ) : null}
          {servingsLabel ? (
            <View className="shrink-0 flex-row items-center gap-1">
              <SymbolView
                accessible={false}
                name={{ ios: "person.2", android: "group", web: "group" }}
                size={15}
                tintColor={colorTokens.textSecondary}
              />
              <Text className="text-[13px] font-normal leading-[18px] text-text-secondary">
                {item.servings}
              </Text>
            </View>
          ) : null}
          {servingsLabel && cookbookName ? (
            <View className="h-1 w-1 shrink-0 rounded-full bg-border-strong" />
          ) : null}
          {cookbookName ? (
            <Text
              numberOfLines={1}
              className="min-w-0 shrink flex-1 text-[13px] font-medium leading-[18px] text-primary"
            >
              {cookbookName}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <Animated.View
      style={[
        { width },
        {
          transform: [{ scale: reduceMotion || !pressed ? 1 : 0.98 }],
          transition: "transform 120ms cubic-bezier(0.23, 1, 0.32, 1)",
        },
      ]}
      testID={`recipe-card-${item.id}`}
    >
      <View
        className={`overflow-hidden rounded-2xl border bg-surface ${focused ? "border-primary" : "border-border"}`}
      >
        {onPress ? (
          <Pressable
            accessibilityHint="Opens this recipe."
            accessibilityLabel={accessibilityParts.join(", ")}
            accessibilityRole="button"
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            onPress={() => onPress(item.id)}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            {content}
          </Pressable>
        ) : (
          content
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  coverImage: {
    width: "100%",
    height: "100%",
  },
});
