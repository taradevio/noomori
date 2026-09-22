import { AppIcon } from "@/shared/ui/app-icon";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  findNodeHandle,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";

const options = [
  { value: "newest", label: "Recently added" },
  { value: "alphabetical", label: "A–Z" },
] as const;
export type RecipeSort = (typeof options)[number]["value"];

function focusControl(control: View | null) {
  if (!control) return;
  if (Platform.OS === "web") control.focus();
  else {
    const handle = findNodeHandle(control);
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  }
}

export function RecipeSortMenu({
  value,
  onChange,
}: {
  value: RecipeSort;
  onChange: (sort: RecipeSort) => void;
}) {
  const trigger = useRef<View>(null);
  const choices = useRef<(View | null)[]>([]);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [menuHeight, setMenuHeight] = useState(112);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const label = options[selectedIndex].label;
  const dismiss = () => {
    setAnchor(null);
    requestAnimationFrame(() => focusControl(trigger.current));
  };

  // A measured anchor is no longer valid after rotation or text resizing.
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () =>
      setAnchor(null),
    );
    return () => subscription.remove();
  }, []);

  const menuWidth = Math.min(
    Math.max(208, 176 * fontScale),
    width - insets.left - insets.right - 32,
  );
  const maxHeight = height - insets.top - insets.bottom - 32;
  const left = Math.max(
    insets.left + 16,
    Math.min(
      I18nManager.isRTL
        ? (anchor?.x ?? 0)
        : (anchor?.x ?? 0) + (anchor?.width ?? 0) - menuWidth,
      width - insets.right - menuWidth - 16,
    ),
  );
  const below = (anchor?.y ?? 0) + (anchor?.height ?? 0) + 4;
  const top = Math.max(
    insets.top + 16,
    Math.min(
      below + menuHeight <= height - insets.bottom - 16
        ? below
        : (anchor?.y ?? 0) - menuHeight - 4,
      height - insets.bottom - menuHeight - 16,
    ),
  );

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`Sort recipes: ${label}`}
        accessibilityState={{ expanded: anchor !== null }}
        aria-expanded={anchor !== null}
        onPress={() =>
          trigger.current?.measureInWindow(
            (x, y, measuredWidth, measuredHeight) => {
              setAnchor({ x, y, width: measuredWidth, height: measuredHeight });
            },
          )
        }
        className="min-h-12 max-w-full flex-row items-center justify-end gap-1 rounded-lg border-2 border-transparent px-1 py-2 focus:border-primary active:bg-surface-subtle"
        style={I18nManager.isRTL ? { marginRight: "auto" } : { marginLeft: "auto" }}
        testID="recipe-sort-trigger"
      >
        <Text className="shrink text-sm font-medium leading-[21px] text-primary">
          {label}
        </Text>
        <AppIcon
          accessible={false}
          name="chevron-down"
          size={20}
          color={colorTokens.primary}
        />
      </Pressable>
      <Modal
        testID="recipe-sort-modal"
        transparent
        visible={anchor !== null}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={dismiss}
        onShow={() => focusControl(choices.current[selectedIndex])}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            accessible={false}
            focusable={false}
            onPress={dismiss}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
            testID="recipe-sort-backdrop"
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel="Recipe sort order"
            accessibilityRole="radiogroup"
            onAccessibilityEscape={dismiss}
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              position: "absolute",
              direction: I18nManager.isRTL ? "rtl" : "ltr",
              left,
              top,
              width: menuWidth,
              maxHeight,
            }}
            className="rounded-[14px] border border-border bg-surface p-1 shadow-lg"
            testID="recipe-sort-menu"
            {...(Platform.OS === "web"
              ? {
                  onKeyDown: (event: React.KeyboardEvent) => {
                    const focused = choices.current.findIndex(
                      (choice) =>
                        choice === (document.activeElement as unknown),
                    );
                    if (event.key === "Escape") {
                      event.preventDefault();
                      dismiss();
                    } else if (
                      (event.key === "Enter" || event.key === " ") &&
                      focused >= 0
                    ) {
                      event.preventDefault();
                      onChange(options[focused].value);
                      dismiss();
                    } else if (
                      ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? options.length - 1
                            : ((focused < 0 ? selectedIndex : focused) +
                                (event.key === "ArrowDown" ? 1 : -1) +
                                options.length) %
                              options.length;
                      focusControl(choices.current[next]);
                    }
                  },
                }
              : {})}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option, index) => (
                <Pressable
                  ref={(node) => {
                    choices.current[index] = node;
                  }}
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: value === option.value }}
                  aria-checked={value === option.value}
                  onPress={() => {
                    onChange(option.value);
                    dismiss();
                  }}
                  className="min-h-12 flex-row items-center gap-3 rounded-[10px] border-2 border-transparent px-3 py-3 focus:border-primary active:bg-surface-subtle"
                >
                  <Text className="flex-1 text-base leading-6 text-text-primary">
                    {option.label}
                  </Text>
                  <View className="h-5 w-5">
                    {value === option.value ? (
                      <AppIcon
                        accessible={false}
                        name="check"
                        size={20}
                        color={colorTokens.primary}
                      />
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
