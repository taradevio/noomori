import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

import type { CookbookCardModel } from "@/shared/types";

type CookbookCardProps = {
  item: CookbookCardModel;
  onPress?: (cookbookId: string) => void;
  width: number;
};

function getCoverUrls(imageUrls: readonly string[] | undefined) {
  return (imageUrls ?? [])
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function CoverFallback({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-full w-full items-center justify-center bg-surface-subtle"
    >
      <View className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-secondary opacity-10" />
      <View className="absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-primary opacity-10" />
      {!compact ? (
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-surface">
          <SymbolView
            name={{
              ios: "books.vertical",
              android: "library_books",
              web: "library_books",
            }}
            size={28}
            tintColor={colorTokens.textSecondary}
          />
        </View>
      ) : null}
    </View>
  );
}

function CookbookCover({ imageUrls }: { imageUrls?: readonly string[] }) {
  const urls = getCoverUrls(imageUrls);

  if (urls.length === 0) {
    return (
      <View className="aspect-[4/3] overflow-hidden">
        <CoverFallback />
      </View>
    );
  }

  if (urls.length === 1) {
    return (
      <View className="aspect-[4/3] overflow-hidden bg-surface-subtle">
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="cover"
          source={urls[0]}
          style={styles.fullCover}
        />
      </View>
    );
  }

  const slots = urls.length === 2 ? urls : [urls[0], urls[1], urls[2], urls[3]];
  const imageStyle = urls.length === 2 ? styles.halfCover : styles.quarterCover;

  return (
    <View className="aspect-[4/3] flex-row flex-wrap overflow-hidden bg-surface-subtle">
      {slots.map((url, index) =>
        url ? (
          <Image
            key={`${url}-${index}`}
            accessible={false}
            cachePolicy="memory-disk"
            contentFit="cover"
            source={url}
            style={imageStyle}
          />
        ) : (
          <View key={`empty-${index}`} style={styles.quarterCover}>
            <CoverFallback compact />
          </View>
        ),
      )}
    </View>
  );
}

/** Cookbook summary with an optional data-supplied image collage. */
export function CookbookCard({ item, onPress, width }: CookbookCardProps) {
  const [focused, setFocused] = useState(false);
  const recipeCount = Number.isFinite(item.recipeCount)
    ? Math.max(0, Math.floor(item.recipeCount))
    : 0;
  const countLabel = `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;
  const content = (
    <>
      <CookbookCover imageUrls={item.coverImageUrls} />
      <View className="min-h-[92px] gap-1 px-4 pb-4 pt-3.5">
        <Text className="text-[17px] font-bold leading-[23px] text-text-primary">
          {item.title}
        </Text>
        <Text className="mt-auto text-sm font-normal leading-5 text-text-secondary">
          {countLabel}
        </Text>
      </View>
    </>
  );

  return (
    <View
      className={`overflow-hidden rounded-[14px] border bg-surface shadow-sm shadow-text-primary/5 ${focused ? "border-primary-strong" : "border-border"}`}
      style={{ width }}
      testID={`cookbook-card-${item.id}`}
    >
      {onPress ? (
        <Pressable
          accessibilityHint="Opens this cookbook."
          accessibilityLabel={`${item.title}, ${countLabel}`}
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
  fullCover: {
    width: "100%",
    height: "100%",
  },
  halfCover: {
    width: "50%",
    height: "100%",
  },
  quarterCover: {
    width: "50%",
    height: "50%",
  },
});
