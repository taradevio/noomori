import {
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AddRecipeActionProvider,
  useAddRecipeAction,
} from "@/shared/components/recipe/add-recipe-action";
import { colorTokens } from "@/shared/design-system";

const FAB_SIZE = 56;
const FAB_GAP = 12;
const FAB_TRAILING = 20;
const BAR_RISE = FAB_SIZE + FAB_GAP;
const BAR_HEIGHT = 64;
const TRACK_COUNT = 3;

type TabButtonProps = TabTriggerSlotProps & {
  barHeight: number;
  icon: SymbolViewProps["name"];
  label: string;
  labelLines: number;
};

function TabButton({
  barHeight,
  icon,
  isFocused,
  label,
  labelLines,
  onBlur,
  onFocus,
  ...props
}: TabButtonProps) {
  const [controlFocused, setControlFocused] = useState(false);

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      onBlur={(event) => {
        setControlFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setControlFocused(true);
        onFocus?.(event);
      }}
      style={StyleSheet.flatten([
        styles.tabButton,
        { height: barHeight, marginTop: BAR_RISE },
        controlFocused && styles.tabButtonFocused,
      ])}
    >
      <SymbolView
        accessible={false}
        name={icon}
        size={22}
        tintColor={isFocused ? colorTokens.primary : colorTokens.textSecondary}
      />
      <Text
        numberOfLines={labelLines}
        style={[styles.tabLabel, isFocused && styles.tabLabelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AddFab() {
  const { openAddRecipe } = useAddRecipeAction();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const scale = useSharedValue(1);
  const createsCookbook = pathname === "/" && section === "cookbooks";
  const label = createsCookbook ? "Create cookbook" : "Add recipe";
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const setPressFeedback = (isPressed: boolean) => {
    scale.set(
      reduceMotion
        ? 1
        : withTiming(isPressed ? 0.97 : 1, {
            duration: 120,
            easing: Easing.out(Easing.cubic),
          }),
    );
  };

  if (pathname === "/account") return null;

  return (
    <Animated.View
      style={[styles.addButtonPosition, animatedStyle]}
      testID="tab-add-recipe-position"
    >
      <Pressable
        accessibilityHint={
          createsCookbook
            ? "Opens the new cookbook screen."
            : "Opens options for adding a recipe."
        }
        accessibilityLabel={label}
        accessibilityRole="button"
        hitSlop={4}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={() =>
          createsCookbook ? router.push("/cookbook/new") : openAddRecipe()
        }
        onPressIn={() => setPressFeedback(true)}
        onPressOut={() => setPressFeedback(false)}
        pressRetentionOffset={12}
        style={StyleSheet.flatten([
          styles.addButton,
          focused && styles.addButtonFocused,
        ])}
        testID="tab-add-recipe-button"
      >
        <SymbolView
          accessible={false}
          name={{ ios: "plus", android: "add", web: "add" }}
          size={28}
          tintColor={colorTokens.onAccent}
        />
      </Pressable>
    </Animated.View>
  );
}

function AppTabsContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [barHeight, setBarHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const contentBottomInset = Math.max(0, barHeight - BAR_RISE);
  const labelLines = fontScale >= 1.5 ? 2 : 1;
  const barSurfaceHeight = Math.max(
    BAR_HEIGHT,
    Math.ceil(22 + 2 + 16 * fontScale * labelLines + 12),
  );

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const willHide = Keyboard.addListener("keyboardWillHide", () =>
      setKeyboardVisible(false),
    );
    const didHide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      willHide.remove();
      didHide.remove();
    };
  }, []);

  const handleBarLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== barHeight) setBarHeight(nextHeight);
  };

  return (
    <Tabs options={{ backBehavior: "history" }}>
      <TabSlot
        style={{
          height: "100%",
          paddingBottom: keyboardVisible ? 0 : contentBottomInset,
        }}
      />

      <TabList asChild>
        <View
          onLayout={handleBarLayout}
          pointerEvents={keyboardVisible ? "none" : "box-none"}
          style={StyleSheet.flatten([
            styles.barPosition,
            { height: BAR_RISE + barSurfaceHeight + safeAreaInsets.bottom },
            keyboardVisible && styles.hiddenBar,
          ])}
          testID="primary-tab-bar"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.barSurface}
          />
          <TabTrigger name="recipes" href="/" asChild>
            <TabButton
              barHeight={barSurfaceHeight}
              icon={{
                ios: "book.closed",
                android: "menu_book",
                web: "menu_book",
              }}
              label="Recipes"
              labelLines={labelLines}
            />
          </TabTrigger>
          <TabTrigger name="household" href="/household" asChild>
            <TabButton
              barHeight={barSurfaceHeight}
              icon={{ ios: "house", android: "home", web: "home" }}
              label="Household"
              labelLines={labelLines}
            />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton
              barHeight={barSurfaceHeight}
              icon={{
                ios: "person.crop.circle",
                android: "account_circle",
                web: "account_circle",
              }}
              label="Account"
              labelLines={labelLines}
            />
          </TabTrigger>
          <AddFab />
        </View>
      </TabList>
    </Tabs>
  );
}

/** Cross-platform tab shell with a trailing, non-route Add Recipe action. */
export function AppTabs() {
  return (
    <AddRecipeActionProvider>
      <AppTabsContent />
    </AddRecipeActionProvider>
  );
}

const styles = StyleSheet.create({
  barPosition: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "center",
  },
  hiddenBar: {
    display: "none",
  },
  barSurface: {
    position: "absolute",
    top: BAR_RISE,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colorTokens.surface,
    borderTopColor: colorTokens.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    width: `${100 / TRACK_COUNT}%`,
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "transparent",
    borderRadius: 12,
    borderWidth: 2,
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  tabButtonFocused: {
    borderColor: colorTokens.primaryStrong,
  },
  tabLabel: {
    color: colorTokens.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
  tabLabelSelected: { color: colorTokens.primary, fontWeight: "700" },
  addButtonPosition: {
    position: "absolute",
    top: 0,
    right: FAB_TRAILING,
  },
  addButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: colorTokens.accent,
    borderColor: colorTokens.surface,
    borderWidth: 4,
    shadowColor: colorTokens.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonFocused: {
    borderColor: colorTokens.textPrimary,
  },
});
