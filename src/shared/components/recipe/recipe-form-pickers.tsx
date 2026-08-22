import {
  BottomSheet,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";

const durationOptions: readonly (number | null)[] = [
  null,
  5,
  10,
  15,
  20,
  30,
  45,
  60,
  90,
];

export const recipeUnits = [
  "tsp",
  "tbsp",
  "cup",
  "ml",
  "L",
  "mg",
  "g",
  "kg",
  "oz",
  "lb",
  "piece",
  "clove",
  "slice",
  "can",
  "pack",
  "bunch",
  "pinch",
] as const;

function SheetHeader({
  title,
  onDismiss,
}: {
  title: string;
  onDismiss: () => void;
}) {
  return (
    <View className="min-h-14 flex-row items-center justify-between gap-4">
      <Text
        accessibilityRole="header"
        className="shrink text-xl font-bold leading-7 text-text-primary"
      >
        {title}
      </Text>
      <Pressable
        accessibilityLabel={`Close ${title}`}
        accessibilityRole="button"
        className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
        onPress={onDismiss}
      >
        <SymbolView
          accessible={false}
          name={{ ios: "xmark", android: "close", web: "close" }}
          size={22}
          tintColor={colorTokens.textPrimary}
        />
      </Pressable>
    </View>
  );
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return "Not set";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function RecipeDurationPicker({
  isOpen,
  label,
  onDismiss,
  onSelect,
  value,
}: {
  isOpen: boolean;
  label: string;
  onDismiss: () => void;
  onSelect: (minutes: number | null) => void;
  value: number | null;
}) {
  const insets = useSafeAreaInsets();
  const [showCustom, setShowCustom] = useState(false);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setShowCustom(false);
      setHours("");
      setMinutes("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // NOTE: Custom durations are normalized to integer minutes in local form state.
  const customMinutes =
    Math.max(0, Number.parseInt(hours || "0", 10) || 0) * 60 +
    Math.min(59, Math.max(0, Number.parseInt(minutes || "0", 10) || 0));

  const select = (nextValue: number | null) => {
    onSelect(nextValue);
    onDismiss();
  };

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
          className="px-5 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <View className="w-full max-w-[640px] self-center">
            <SheetHeader title={label} onDismiss={onDismiss} />

            {showCustom ? (
              <View className="mt-4 gap-5">
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-2">
                    <Text className="text-sm font-bold leading-5 text-text-primary">
                      Hours
                    </Text>
                    <BottomSheetTextInput
                      accessibilityLabel={`${label} hours`}
                      className="min-h-[52px] rounded-xl border-2 border-border bg-surface px-4 py-3 text-base text-text-primary focus:border-primary-strong"
                      inputMode="numeric"
                      keyboardType="number-pad"
                      onChangeText={setHours}
                      placeholder="0"
                      placeholderTextColor={colorTokens.textSecondary}
                      value={hours}
                    />
                  </View>
                  <View className="flex-1 gap-2">
                    <Text className="text-sm font-bold leading-5 text-text-primary">
                      Minutes
                    </Text>
                    <BottomSheetTextInput
                      accessibilityHint="Enter a value from zero to fifty-nine."
                      accessibilityLabel={`${label} minutes`}
                      className="min-h-[52px] rounded-xl border-2 border-border bg-surface px-4 py-3 text-base text-text-primary focus:border-primary-strong"
                      inputMode="numeric"
                      keyboardType="number-pad"
                      maxLength={2}
                      onChangeText={setMinutes}
                      placeholder="0"
                      placeholderTextColor={colorTokens.textSecondary}
                      value={minutes}
                    />
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                    onPress={() => setShowCustom(false)}
                  >
                    <Text className="text-base font-bold text-text-primary">
                      Back
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: customMinutes <= 0 }}
                    className={`min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-4 py-3 focus:border-text-primary active:opacity-[0.82] ${customMinutes <= 0 ? "opacity-50" : ""}`}
                    disabled={customMinutes <= 0}
                    onPress={() => select(customMinutes)}
                  >
                    <Text className="text-base font-bold text-on-primary">
                      Apply
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="mt-4 gap-2">
                {durationOptions.map((option) => {
                  const selected = option === value;
                  return (
                    <Pressable
                      key={option ?? "unset"}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-12 flex-row items-center justify-between rounded-xl border-2 px-4 py-3 focus:border-primary-strong active:bg-surface-subtle ${selected ? "border-primary-strong bg-surface-subtle" : "border-border bg-surface"}`}
                      onPress={() => select(option)}
                    >
                      <Text className="text-base font-medium text-text-primary">
                        {formatDuration(option)}
                      </Text>
                      {selected ? (
                        <SymbolView
                          accessible={false}
                          name={{
                            ios: "checkmark",
                            android: "check",
                            web: "check",
                          }}
                          size={20}
                          tintColor={colorTokens.primaryStrong}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
                  onPress={() => setShowCustom(true)}
                >
                  <Text className="text-base font-bold text-primary-strong">
                    Custom duration
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

export function RecipeUnitPicker({
  isOpen,
  onDismiss,
  onSelect,
  value,
}: {
  isOpen: boolean;
  onDismiss: () => void;
  onSelect: (unit: string) => void;
  value: string;
}) {
  const insets = useSafeAreaInsets();
  const [customUnit, setCustomUnit] = useState("");

  useEffect(() => {
    if (!isOpen) setCustomUnit("");
  }, [isOpen]);

  if (!isOpen) return null;

  // NOTE: Custom units are preserved exactly after trimming; no conversion
  // meaning is inferred for user-defined values.
  const select = (unit: string) => {
    onSelect(unit);
    onDismiss();
  };

  return (
    <BottomSheet
      backgroundStyle={{
        backgroundColor: colorTokens.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      enablePanDownToClose={false}
      index={0}
      snapPoints={["85%"]}
    >
      <BottomSheetScrollView
        contentContainerClassName="px-5 pt-2"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[640px] self-center">
          <SheetHeader title="Choose a unit" onDismiss={onDismiss} />
          <View className="mt-4 gap-2">
            {["", ...recipeUnits].map((unit) => {
              const selected = unit === value;
              return (
                <Pressable
                  key={unit || "no-unit"}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  className={`min-h-12 flex-row items-center justify-between rounded-xl border-2 px-4 py-3 focus:border-primary-strong active:bg-surface-subtle ${selected ? "border-primary-strong bg-surface-subtle" : "border-border bg-surface"}`}
                  onPress={() => select(unit)}
                >
                  <Text className="text-base font-medium text-text-primary">
                    {unit || "No unit"}
                  </Text>
                  {selected ? (
                    <SymbolView
                      accessible={false}
                      name={{
                        ios: "checkmark",
                        android: "check",
                        web: "check",
                      }}
                      size={20}
                      tintColor={colorTokens.primaryStrong}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View className="mt-5 gap-2 border-t border-border pt-5">
            <Text className="text-sm font-bold leading-5 text-text-primary">
              Custom unit
            </Text>
            <View className="flex-row gap-3">
              <BottomSheetTextInput
                accessibilityLabel="Custom ingredient unit"
                autoCapitalize="none"
                className="min-h-[52px] flex-1 rounded-xl border-2 border-border bg-surface px-4 py-3 text-base text-text-primary focus:border-primary-strong"
                onChangeText={setCustomUnit}
                placeholder="e.g. jar"
                placeholderTextColor={colorTokens.textSecondary}
                value={customUnit}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !customUnit.trim() }}
                className={`min-h-[52px] min-w-20 items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-4 focus:border-text-primary active:opacity-[0.82] ${!customUnit.trim() ? "opacity-50" : ""}`}
                disabled={!customUnit.trim()}
                onPress={() => select(customUnit.trim())}
              >
                <Text className="text-base font-bold text-on-primary">Use</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
