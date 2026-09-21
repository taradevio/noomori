import { HouseholdIllustration } from "@/shared/components/onboarding/household-illustration";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import {
  OnboardingScreen,
  useOnboardingLayout,
} from "@/shared/components/onboarding/onboarding-screen";
import { router } from "expo-router";
import { Text, View } from "react-native";

export default function Onboarding() {
  const { compact } = useOnboardingLayout();

  return (
    <OnboardingScreen>
      <View className={`grow ${compact ? "py-3" : "py-5"}`}>
        <View
          className={`grow items-center justify-center ${compact ? "gap-3.5 py-3" : "gap-6 py-6"}`}
        >
          <HouseholdIllustration compact={compact} />
          <View className="w-full max-w-[380px] items-center gap-6">
            <Text
              accessibilityRole="header"
              className="text-center text-[32px] font-bold leading-[38px] text-text-primary"
            >
              Good food brings{"\n"}us together.
            </Text>
            <Text className="max-w-[380px] text-center text-base font-normal leading-6 text-text-secondary">
              Keep your own recipes close and share favourites with the people
              you cook for.
            </Text>
          </View>
        </View>

        <View className="w-full max-w-[380px] self-center gap-3">
          <OnboardingButton
            accessibilityHint="Opens the household creation form."
            label="Create household"
            onPress={() => router.push("/onboarding/create-household")}
          />
          <OnboardingButton
            accessibilityHint="Opens information about joining a household."
            label="Join household"
            onPress={() => router.push("/onboarding/join-household")}
            variant="secondary"
          />
        </View>
      </View>
    </OnboardingScreen>
  );
}
