import { HouseholdIllustration } from "@/modules/onboarding/components/household-illustration";
import { OnboardingButton } from "@/modules/onboarding/components/onboarding-button";
import {
  OnboardingScreen,
  useOnboardingLayout,
} from "@/modules/onboarding/components/onboarding-screen";
import { router } from "expo-router";
import { Text, View } from "react-native";

export default function Onboarding() {
  const { compact } = useOnboardingLayout();

  return (
    <OnboardingScreen>
      <View className={`grow ${compact ? "py-3" : "py-5"}`}>
        <Text className="self-start text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-secondary">
          Household setup
        </Text>

        <View
          className={`grow items-center justify-center ${compact ? "gap-3.5 py-3" : "gap-6 py-6"}`}
        >
          <HouseholdIllustration compact={compact} />
          <View className="w-full max-w-[420px] items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-center text-[32px] font-bold leading-[38px] text-text-primary"
            >
              Share recipes with the people you cook with.
            </Text>
            <Text className="max-w-[380px] text-center text-base font-normal leading-6 text-text-secondary">
              Your personal library stays yours. Choose exactly which recipes
              become part of your household.
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
          <View className="min-h-6 flex-row items-start justify-center gap-2 px-2 pt-1">
            <View
              accessible={false}
              className="mt-1.5 h-[7px] w-[7px] rounded bg-secondary"
            />
            <Text className="shrink text-center text-sm font-medium leading-5 text-text-secondary">
              Joining isn’t available in this build yet.
            </Text>
          </View>
        </View>
      </View>
    </OnboardingScreen>
  );
}
