import { BottomSheet, BottomSheetView } from "@expo/ui/community/bottom-sheet";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";

type AddRecipeBottomSheetProps = {
  isOpen: boolean;
  onDismiss: () => void;
  onWriteFromScratch?: () => void;
};

type RecipeOption = {
  body: string;
  icon: SymbolViewProps["name"];
  id: string;
  title: string;
};

const recipeOptions: readonly RecipeOption[] = [
  {
    id: "write",
    title: "Write from scratch",
    body: "Start with a blank recipe.",
    icon: {
      ios: "square.and.pencil",
      android: "edit_note",
      web: "edit_note",
    },
  },
  {
    id: "copy",
    title: "Import from text",
    body: "Paste a recipe you already have.",
    icon: {
      ios: "doc.on.clipboard",
      android: "content_paste",
      web: "content_paste",
    },
  },
  {
    id: "url",
    title: "Import from URL",
    body: "Bring in a recipe from a website.",
    icon: { ios: "link", android: "link", web: "link" },
  },
  {
    id: "instagram",
    title: "Import from Instagram captions",
    body: "Start from a public Instagram captions.",
    icon: { ios: "camera", android: "photo_camera", web: "photo_camera" },
  },
];

export function AddRecipeBottomSheet({
  isOpen,
  onDismiss,
  onWriteFromScratch,
}: AddRecipeBottomSheetProps) {
  const safeAreaInsets = useSafeAreaInsets();

  if (!isOpen) return null;

  return (
    <BottomSheet
      backgroundStyle={{
        backgroundColor: colorTokens.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      enableDynamicSizing
      enablePanDownToClose={false}
      index={0}
    >
      <BottomSheetView>
        <View
          className="items-center px-5 pt-2"
          style={{ paddingBottom: Math.max(safeAreaInsets.bottom, 20) }}
          testID="add-recipe-bottom-sheet"
        >
          <View className="w-full max-w-[640px]">
            <View className="min-h-14 flex-row items-center justify-between gap-4">
              <Text
                accessibilityRole="header"
                className="shrink text-2xl font-bold leading-[30px] text-text-primary"
              >
                Add a recipe
              </Text>
              <Pressable
                accessibilityLabel="Close Add recipe sheet"
                accessibilityRole="button"
                onPress={onDismiss}
                className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
                testID="add-recipe-sheet-close"
              >
                <SymbolView
                  accessible={false}
                  name={{ ios: "xmark", android: "close", web: "close" }}
                  size={22}
                  tintColor={colorTokens.textPrimary}
                />
              </Pressable>
            </View>

            <View className="mt-4 gap-3">
              {recipeOptions.map((option) => (
                // NOTE: Write from scratch is the only connected path. Import
                // options remain visibly and semantically disabled placeholders.
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: option.id !== "write" || !onWriteFromScratch,
                  }}
                  disabled={option.id !== "write" || !onWriteFromScratch}
                  onPress={
                    option.id === "write" ? onWriteFromScratch : undefined
                  }
                  className={`min-h-[76px] flex-row items-center gap-4 rounded-2xl border border-border bg-surface-subtle px-4 py-3 focus:border-primary-strong active:opacity-[0.82] ${option.id !== "write" || !onWriteFromScratch ? "opacity-50" : ""}`}
                  testID={`add-recipe-option-${option.id}`}
                >
                  <View
                    accessible={false}
                    className="h-12 w-12 items-center justify-center rounded-xl bg-surface"
                  >
                    <SymbolView
                      name={option.icon}
                      size={24}
                      tintColor={colorTokens.primaryStrong}
                    />
                  </View>
                  <View className="shrink flex-1">
                    <Text className="text-base font-bold leading-6 text-text-primary">
                      {option.title}
                    </Text>
                    <Text className="mt-0.5 text-sm font-normal leading-5 text-text-secondary">
                      {option.body}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
