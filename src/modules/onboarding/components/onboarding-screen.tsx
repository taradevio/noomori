import { StatusBar } from "expo-status-bar";
import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type OnboardingScreenProps = {
  children: ReactNode;
  headerVisible?: boolean;
  keyboardAware?: boolean;
};

export function useOnboardingLayout() {
  const { fontScale, height, width } = useWindowDimensions();

  return {
    compact: height < 720 || fontScale > 1.15,
    tablet: width >= 700,
  };
}

/** Shared safe-area and responsive layout for the household onboarding flow. */
export function OnboardingScreen({
  children,
  headerVisible = false,
  keyboardAware = false,
}: OnboardingScreenProps) {
  const { tablet } = useOnboardingLayout();

  const scrollView = (
    <ScrollView
      bounces={false}
      className="flex-1"
      contentContainerClassName="grow items-center"
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className={`w-full max-w-[520px] grow ${tablet ? "px-8" : "px-5"}`}>
        {children}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView
      edges={
        headerVisible
          ? ["left", "right", "bottom"]
          : ["top", "left", "right", "bottom"]
      }
      className="flex-1 bg-background"
    >
      <StatusBar style="dark" />
      {keyboardAware ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {scrollView}
        </KeyboardAvoidingView>
      ) : (
        scrollView
      )}
    </SafeAreaView>
  );
}
