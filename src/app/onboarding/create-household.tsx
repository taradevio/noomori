// update onboarding first to navigate to home since onboarding is still null

import { apiConfig } from "@/config/api";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import {
  OnboardingScreen,
  useOnboardingLayout,
} from "@/shared/components/onboarding/onboarding-screen";
import { colorTokens } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Text, TextInput, View } from "react-native";

type CreateHousehold = {
  name: string;
};

export default function CreateHousehold() {
  const queryClient = useQueryClient();
  const [household, onChangeHousehold] = useState<string>("");
  const [isFieldFocused, setIsFieldFocused] = useState(false);
  // const [isDisabled, setIsDisabled] = useState<boolean>(true);
  const { refreshUserState, session } = useSession();
  const { compact } = useOnboardingLayout();

  const isDisabled = household.trim() === "";

  const createHouseholdName = async (householdName: CreateHousehold) => {
    const res = await fetch(
      `${apiConfig.backendUrl}${apiConfig.endpoints.households}`,
      {
        method: "POST",
        headers: {
          // The backend validates this token and forwards it to PostgREST so
          // database policies can resolve auth.uid() for the current user.
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(householdName),
      },
    );

    if (!res.ok) {
      throw new Error(`Server returned status code: ${res.status}`);
    }

    return res.json();
  };

  const { mutate, isPending, isError, reset } = useMutation({
    mutationFn: createHouseholdName,
    onSuccess: async (data) => {
      console.log(`Household is set ${data}`);
      // Clear user-scoped cached data before re-resolving the navigation state
      // that depends on the newly completed profile.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["household"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["profile"],
        }),
      ]);

      await refreshUserState();
    },
  });
  const inputBorder = isError
    ? "border-error"
    : isFieldFocused
      ? "border-primary-strong"
      : "border-text-secondary";

  useEffect(() => {
    if (isError) {
      AccessibilityInfo.announceForAccessibility(
        "Couldn’t create your household. Try again.",
      );
    }
  }, [isError]);

  const handleHouseholdName = () => {
    if (!household.trim() || isPending) return;

    mutate({ name: household });
  };

  const handleHouseholdChange = (value: string) => {
    if (isError) reset();
    onChangeHousehold(value);
  };

  return (
    <OnboardingScreen headerVisible keyboardAware>
      <View
        className={`grow ${compact ? "gap-6 pb-4 pt-5" : "gap-10 pb-6 pt-8"}`}
      >
        <View className="gap-3">
          <Text
            accessibilityRole="header"
            className="text-[30px] font-bold leading-9 text-text-primary"
          >
            Create your household
          </Text>
          <Text className="max-w-[440px] text-base font-normal leading-6 text-text-secondary">
            You'll be the owner. You can invite people whenever you're ready.
          </Text>
        </View>

        <View className="w-full">
          <View className="mb-2 flex-row items-baseline justify-between gap-4">
            <Text
              nativeID="householdName"
              className="shrink text-sm font-bold leading-5 text-text-primary"
            >
              Household name
            </Text>
            <Text className="text-[13px] font-medium leading-[18px] text-text-secondary">
              Required
            </Text>
          </View>
          <TextInput
            accessibilityHint="Enter a name that household members will recognize."
            accessibilityLabel="Household name"
            aria-labelledby="householdName"
            accessibilityState={{ disabled: isPending }}
            autoCapitalize="words"
            editable={!isPending}
            onBlur={() => setIsFieldFocused(false)}
            onChangeText={handleHouseholdChange}
            onFocus={() => setIsFieldFocused(true)}
            onSubmitEditing={handleHouseholdName}
            placeholder="e.g. Our kitchen"
            placeholderTextColor={colorTokens.textSecondary}
            returnKeyType="done"
            selectionColor={colorTokens.primaryStrong}
            className={`min-h-[52px] w-full rounded-[10px] border-2 bg-surface px-4 py-3 text-base font-normal leading-6 text-text-primary ${inputBorder} ${isPending ? "opacity-[0.72]" : ""}`}
            value={household}
          />
          <Text className="mt-2 text-sm font-normal leading-5 text-text-secondary">
            Choose a name everyone in the household will recognize.
          </Text>

          <View className="mt-6">
            <OnboardingButton
              accessibilityHint="Creates the household using the name entered above."
              disabled={isDisabled}
              label="Create household"
              loading={isPending}
              loadingLabel="Creating household…"
              onPress={handleHouseholdName}
            />
          </View>

          <View className="min-h-[68px] justify-center pt-3">
            {isError ? (
              <View className="min-h-[52px] flex-row items-start gap-2.5 rounded-[10px] border border-error bg-surface px-3 py-3">
                <View
                  accessible={false}
                  className="mt-1.5 h-2 w-2 rounded bg-error"
                />
                <Text
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                  className="flex-1 text-sm font-medium leading-5 text-text-primary"
                >
                  Couldn’t create your household. Try again.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </OnboardingScreen>
  );
}
