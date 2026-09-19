import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import {
  OnboardingScreen,
  useOnboardingLayout,
} from "@/shared/components/onboarding/onboarding-screen";
import { colorTokens } from "@/shared/design-system";
import {
  HouseholdApiError,
  joinHousehold,
  previewHouseholdCode,
  type HouseholdJoinPreview,
} from "@/shared/household-api";
import { clearHouseholdTransitionCaches } from "@/shared/household-query";
import { useSession } from "@/shared/providers/session-providers";
import { toast } from "@/shared/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Text,
  TextInput,
  View,
} from "react-native";

type JoinStep = "entry" | "preview";

function normalizeJoinCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function formatJoinCode(value: string) {
  return value.length > 3 ? `${value.slice(0, 3)} ${value.slice(3)}` : value;
}

export function joinErrorMessage(error: unknown) {
  if (error instanceof HouseholdApiError) {
    if (error.status === 400) {
      return "This join code doesn’t work. Check the code, or ask for a new one.";
    }
    if (error.status === 409) {
      if (error.message.includes("must have only you")) {
        return "You can only join another household when no one else is in yours.";
      }
      return "You’re already part of a household.";
    }
    if (error.status === 429) {
      return error.retryAfter
        ? `Too many tries. Try again in ${error.retryAfter} seconds.`
        : "Too many tries. Try again in a little while.";
    }
  }
  return "Couldn’t check the join code. Try again.";
}

type JoinHouseholdScreenProps = {
  preservesOwnedHousehold?: boolean;
};

export function JoinHouseholdScreen({
  preservesOwnedHousehold = false,
}: JoinHouseholdScreenProps) {
  const navigation = useNavigation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshUserState, session } = useSession();
  const { compact } = useOnboardingLayout();
  const [step, setStep] = useState<JoinStep>("entry");
  const [code, setCode] = useState("");
  const [isFieldFocused, setIsFieldFocused] = useState(false);
  const [isFieldTouched, setIsFieldTouched] = useState(false);
  const [preview, setPreview] = useState<HouseholdJoinPreview | null>(null);
  const allowRouteRemovalRef = useRef(false);

  async function refreshCanonicalState() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["household"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
    ]);
    await refreshUserState();
  }

  const previewMutation = useMutation({
    mutationFn: () => previewHouseholdCode(session?.access_token ?? "", code),
    onSuccess: (result) => {
      Keyboard.dismiss();
      joinMutation.reset();
      setPreview(result);
      setStep("preview");
    },
    onError: (error) => {
      if (
        error instanceof HouseholdApiError &&
        error.status === 409 &&
        !error.message.includes("must have only you")
      ) {
        void refreshCanonicalState();
      }
    },
  });

  const joinMutation = useMutation({
    mutationFn: () => joinHousehold(session?.access_token ?? "", code),
    onSuccess: async () => {
      toast.success("Joined household");
      if (preservesOwnedHousehold) {
        await clearHouseholdTransitionCaches(queryClient);
        allowRouteRemovalRef.current = true;
        router.replace("/household");
        return;
      }
      await refreshCanonicalState();
    },
  });

  const hasIncompleteCode =
    isFieldTouched && code.length > 0 && code.length < 6;
  const canPreview =
    Boolean(session?.access_token) &&
    code.length === 6 &&
    !previewMutation.isPending;
  const hasCodeError = hasIncompleteCode || previewMutation.isError;
  const inputBorder = hasCodeError
    ? "border-error"
    : isFieldFocused
      ? "border-primary-strong"
      : "border-text-secondary";

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (step !== "preview" || allowRouteRemovalRef.current) return;

      event.preventDefault();
      if (joinMutation.isPending) return;
      setStep("entry");
    });
  }, [joinMutation.isPending, navigation, step]);

  useEffect(() => {
    if (hasIncompleteCode) {
      AccessibilityInfo.announceForAccessibility("Enter all 6 digits.");
    }
  }, [hasIncompleteCode]);

  useEffect(() => {
    const error = previewMutation.error ?? joinMutation.error;
    if (error) {
      AccessibilityInfo.announceForAccessibility(joinErrorMessage(error));
    }
  }, [joinMutation.error, previewMutation.error]);

  const handleCodeChange = (value: string) => {
    if (previewMutation.isError) previewMutation.reset();
    setCode(normalizeJoinCode(value));
  };

  const handleContinue = () => {
    if (!canPreview) return;
    previewMutation.mutate();
  };

  const handleUseDifferentCode = () => {
    joinMutation.reset();
    setStep("entry");
  };

  if (step === "preview" && preview) {
    return (
      <OnboardingScreen headerVisible>
        <View
          className={`grow ${compact ? "gap-6 pb-4 pt-5" : "gap-8 pb-6 pt-8"}`}
        >
          <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-secondary">
            Your household
          </Text>

          <View className="w-full max-w-[400px] self-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-[30px] font-bold leading-9 text-text-primary"
            >
              Join “{preview.household_name}”?
            </Text>
            <Text className="text-base font-normal leading-6 text-text-secondary">
              Just checking that you’ve got the right household.
            </Text>
          </View>

          <View className="w-full max-w-[400px] self-center gap-5 rounded-xl border border-border bg-surface p-5">
            <View className="gap-1">
              <Text className="text-sm font-bold leading-5 text-text-secondary">
                Household
              </Text>
              <Text className="text-xl font-bold leading-7 text-text-primary">
                {preview.household_name}
              </Text>
            </View>
            <View className="h-px bg-border" />
            <View className="gap-1">
              <Text className="text-sm font-bold leading-5 text-text-secondary">
                Created by
              </Text>
              <Text className="text-lg font-bold leading-6 text-text-primary">
                {preview.owner_display_name}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="text-sm font-bold leading-5 text-text-secondary">
                People
              </Text>
              <Text className="text-base font-normal leading-6 text-text-primary">
                {preview.member_count}
              </Text>
            </View>
          </View>

          <View className="w-full max-w-[400px] self-center rounded-[10px] bg-surface-subtle px-4 py-3">
            <Text className="text-sm font-medium leading-5 text-text-primary">
              {preservesOwnedHousehold
                ? "Your household will stay saved while you’re away."
                : "Your recipes will stay yours."}
            </Text>
          </View>

          <View className="mt-auto w-full max-w-[380px] self-center gap-3 pt-2">
            <OnboardingButton
              accessibilityHint="Joins this household."
              label="Join household"
              loading={joinMutation.isPending}
              loadingLabel="Joining household…"
              onPress={() => joinMutation.mutate()}
            />
            <OnboardingButton
              accessibilityHint="Returns to the join code field without clearing the code."
              disabled={joinMutation.isPending}
              label="Use a different code"
              onPress={handleUseDifferentCode}
              variant="secondary"
            />
            {joinMutation.isError ? (
              <Text
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                className="px-2 text-center text-sm font-medium leading-5 text-error"
              >
                {joinErrorMessage(joinMutation.error)}
              </Text>
            ) : null}
          </View>
        </View>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen headerVisible keyboardAware>
      <View
        className={`grow ${compact ? "gap-6 pb-4 pt-5" : "gap-8 pb-6 pt-8"}`}
      >
        <Text className="text-[13px] font-bold uppercase leading-[18px] tracking-[0.5px] text-secondary">
          Your household
        </Text>

        <View className="w-full max-w-[400px] self-center gap-3">
          <Text
            accessibilityRole="header"
            className="text-[30px] font-bold leading-9 text-text-primary"
          >
            {preservesOwnedHousehold
              ? "Join another household"
              : "Join a household"}
          </Text>
          <Text className="text-base font-normal leading-6 text-text-secondary">
            {preservesOwnedHousehold
              ? "Enter the join code someone shared with you. Your household will stay saved."
              : "Enter the join code someone shared with you."}
          </Text>
        </View>

        <View className="w-full max-w-[400px] self-center">
          <View className="mb-2 flex-row items-baseline justify-between gap-4">
            <Text
              nativeID="joinCodeLabel"
              className="shrink text-sm font-bold leading-5 text-text-primary"
            >
              Join code
            </Text>
            <Text className="text-[13px] font-medium leading-[18px] text-text-secondary">
              Required
            </Text>
          </View>
          <TextInput
            accessibilityHint="Enter or paste the 6-digit code shared by the household owner."
            accessibilityLabel="Join code"
            aria-labelledby="joinCodeLabel"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="numeric"
            keyboardType="number-pad"
            onBlur={() => {
              setIsFieldFocused(false);
              setIsFieldTouched(true);
            }}
            onChangeText={handleCodeChange}
            onFocus={() => setIsFieldFocused(true)}
            placeholder="000 000"
            placeholderTextColor={colorTokens.textSecondary}
            returnKeyType="done"
            selectionColor={colorTokens.primaryStrong}
            className={`min-h-16 w-full rounded-[10px] border-2 bg-surface px-4 py-3 text-center font-mono text-[28px] font-bold leading-[34px] tracking-[3px] text-text-primary ${inputBorder}`}
            value={formatJoinCode(code)}
          />

          <View className="min-h-12 pt-2">
            {hasIncompleteCode ? (
              <Text
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                className="text-sm font-medium leading-5 text-error"
              >
                Enter all 6 digits.
              </Text>
            ) : previewMutation.isError ? (
              <Text
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                className="text-sm font-medium leading-5 text-error"
              >
                {joinErrorMessage(previewMutation.error)}
              </Text>
            ) : (
              <Text className="text-sm font-normal leading-5 text-text-secondary">
                Type or paste the 6-digit code.
              </Text>
            )}
          </View>

          <View className="mt-2">
            <OnboardingButton
              accessibilityHint="Checks the join code and shows the household."
              disabled={!canPreview}
              label="Continue"
              loading={previewMutation.isPending}
              loadingLabel="Checking code…"
              onPress={handleContinue}
            />
          </View>
        </View>
      </View>
    </OnboardingScreen>
  );
}

export default function JoinHousehold() {
  return <JoinHouseholdScreen />;
}
