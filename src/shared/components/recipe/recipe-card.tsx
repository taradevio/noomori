import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

import type { RecipeCardModel } from "@/shared/types";

type RecipeCardProps = {
  item: RecipeCardModel;
  onPress?: (recipeId: string) => void;
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
  return item.sharedLabel?.trim() || "Shared";
}

/** Compact, data-driven recipe summary with no fabricated metadata. */
export function RecipeCard({ item, onPress, width }: RecipeCardProps) {
  const [focused, setFocused] = useState(false);
  const cookingTime = getCookingTime(item.cookingTimeMinutes);
  const sharedLabel = getSharedLabel(item);
  const cookbookName = item.cookbookName?.trim() || null;
  const imageUrl = item.imageUrl?.trim() || null;
  const accessibilityParts = [
    item.title,
    cookingTime ? `${cookingTime} minutes` : null,
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
            source={imageUrl}
            style={styles.coverImage}
          />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-full w-full items-center justify-center"
          >
            <View className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-primary opacity-10" />
            <View className="absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-secondary opacity-10" />
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-surface">
              <SymbolView
                name={{
                  ios: "fork.knife",
                  android: "restaurant",
                  web: "restaurant",
                }}
                size={28}
                tintColor={colorTokens.textSecondary}
              />
            </View>
          </View>
        )}

        {sharedLabel ? (
          <View className="absolute left-3 top-3 min-h-9 max-w-[85%] flex-row items-center gap-1.5 rounded-full border border-surface bg-surface px-3 py-1.5">
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

      <View className="min-h-[100px] gap-1 px-4 pb-4 pt-3.5">
        <Text className="text-[17px] font-bold leading-[23px] text-text-primary">
          {item.title}
        </Text>

        {cookingTime || cookbookName ? (
          <View className="mt-auto gap-0.5 pt-1">
            {cookingTime ? (
              <Text className="text-sm font-normal leading-5 text-text-secondary">
                {cookingTime} min
              </Text>
            ) : null}
            {cookbookName ? (
              <Text className="text-[13px] font-medium leading-[18px] text-secondary">
                {cookbookName}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      className={`overflow-hidden rounded-[14px] border bg-surface shadow-sm shadow-text-primary/5 ${focused ? "border-primary-strong" : "border-border"}`}
      style={{ width }}
      testID={`recipe-card-${item.id}`}
    >
      {onPress ? (
        <Pressable
          accessibilityHint="Opens this recipe."
          accessibilityLabel={accessibilityParts.join(", ")}
          accessibilityRole="button"
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onPress={() => onPress(item.id)}
          className="active:opacity-[0.84]"
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  coverImage: {
    width: "100%",
    height: "100%",
  },
});
