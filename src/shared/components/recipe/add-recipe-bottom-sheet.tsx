import { BottomSheet, BottomSheetView } from "@expo/ui/community/bottom-sheet";
import { AppIcon, type AppIconProps } from "@/shared/ui/app-icon";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";

type AddRecipeBottomSheetProps = {
  isOpen: boolean;
  onDismiss: () => void;
  onImportFromText?: () => void;
  onImportFromWebsite?: () => void;
  onWriteFromScratch?: () => void;
};

type RecipeOption = {
  body: string;
  icon: AppIconProps["name"];
  id: string;
  title: string;
};

const recipeOptions: readonly RecipeOption[] = [
  {
    id: "write",
    title: "Write a recipe",
    body: "Start with a blank page.",
    icon: "write",
  },
  {
    id: "copy",
    title: "Paste a recipe",
    body: "Bring in one from your notes or messages.",
    icon: "paste",
  },
  {
    id: "url",
    title: "Import from a website",
    body: "Paste a recipe link and we’ll fill it in.",
    icon: "link",
  },
];

export function AddRecipeBottomSheet({
  isOpen,
  onDismiss,
  onImportFromText,
  onImportFromWebsite,
  onWriteFromScratch,
}: AddRecipeBottomSheetProps) {
  const safeAreaInsets = useSafeAreaInsets();

  if (!isOpen) return null;

  // NOTE: Expo couples pan-to-close with backdrop taps and Android back dismissal.
  return (
    <BottomSheet
      backgroundStyle={{
        backgroundColor: colorTokens.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      enableDynamicSizing
      enablePanDownToClose
      index={0}
      onDismiss={onDismiss}
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
                <AppIcon
                  accessible={false}
                  name="close"
                  size={22}
                  color={colorTokens.textPrimary}
                />
              </Pressable>
            </View>

            <View className="mt-4 gap-3">
              {recipeOptions.map((option) => {
                const onPress =
                  option.id === "write"
                    ? onWriteFromScratch
                    : option.id === "copy"
                      ? onImportFromText
                      : onImportFromWebsite;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !onPress }}
                    disabled={!onPress}
                    onPress={onPress}
                    className={`min-h-[76px] flex-row items-center gap-4 rounded-2xl border border-border bg-surface-subtle px-4 py-3 focus:border-primary-strong active:opacity-[0.82] ${!onPress ? "opacity-50" : ""}`}
                    testID={`add-recipe-option-${option.id}`}
                  >
                    <View
                      accessible={false}
                      className="h-12 w-12 items-center justify-center rounded-xl bg-surface"
                    >
                      <AppIcon
                        name={option.icon}
                        accented
                        size={24}
                        color={colorTokens.primaryStrong}
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
                );
              })}
            </View>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
