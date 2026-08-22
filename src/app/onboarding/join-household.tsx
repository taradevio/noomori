import { HouseholdIllustration } from "@/shared/components/onboarding/household-illustration";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import {
  OnboardingScreen,
  useOnboardingLayout,
} from "@/shared/components/onboarding/onboarding-screen";
import { router } from "expo-router";
import { Text, View } from "react-native";

export default function JoinHousehold() {
  const { compact } = useOnboardingLayout();

  return (
    <OnboardingScreen headerVisible>
      <View
        className={`grow items-center justify-center ${compact ? "gap-4 py-5" : "gap-6 py-8"}`}
      >
        <Text className="text-center text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-secondary">
          Household setup
        </Text>
        <HouseholdIllustration compact />

        <View className="w-full max-w-[400px] items-center gap-3">
          <Text
            accessibilityRole="header"
            className="text-center text-[28px] font-bold leading-[34px] text-text-primary"
          >
            Join household is coming soon.
          </Text>
          <Text className="text-center text-base font-normal leading-6 text-text-secondary">
            Joining with a code isn’t available in this build yet. You can go
            back and create a household instead.
          </Text>
        </View>

        <View className="w-full max-w-[380px] pt-2">
          <OnboardingButton
            accessibilityHint="Returns to household setup."
            label="Back to setup"
            onPress={() => router.replace("/onboarding")}
          />
        </View>
      </View>
    </OnboardingScreen>
  );
}
