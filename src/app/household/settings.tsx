import {
  generateHouseholdCode,
  getHouseholdSettings,
  revokeHouseholdCode,
  type GeneratedHouseholdCode,
} from "@/shared/household-api";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import { colorTokens } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Household membership and invite settings, separate from shared recipes. */
export default function HouseholdSettingsScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const safeAreaInsets = useSafeAreaInsets();
  const accessToken = session?.access_token ?? "";
  const [generatedCode, setGeneratedCode] =
    useState<GeneratedHouseholdCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["household"],
    enabled: Boolean(accessToken),
    queryFn: () => getHouseholdSettings(accessToken),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeHouseholdCode(accessToken),
    onSuccess: async () => {
      setGeneratedCode(null);
      setCopied(false);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["household"] });
    },
    onError: () => {
      setActionError("Couldn’t revoke the join code. Try again.");
    },
  });

  useEffect(() => {
    if (actionError) {
      AccessibilityInfo.announceForAccessibility(actionError);
    }
  }, [actionError]);

  async function generateCode() {
    if (isGenerating) return;
    setIsGenerating(true);
    setActionError(null);
    setCopied(false);

    try {
      const result = await generateHouseholdCode(accessToken);
      setGeneratedCode(result);
      await queryClient.invalidateQueries({ queryKey: ["household"] });
    } catch {
      setActionError("Couldn’t generate a join code. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function confirmGenerate() {
    if (!settingsQuery.data?.active_code_expires_at && !generatedCode) {
      void generateCode();
      return;
    }

    Alert.alert(
      "Generate a new join code?",
      "The current code will stop working.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", onPress: () => void generateCode() },
      ],
    );
  }

  function confirmRevoke() {
    Alert.alert(
      "Revoke join code?",
      "New members won’t be able to use this code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => revokeMutation.mutate(),
        },
      ],
    );
  }

  async function copyCode() {
    if (!generatedCode) return;
    try {
      await Clipboard.setStringAsync(generatedCode.code);
      setActionError(null);
      setCopied(true);
      AccessibilityInfo.announceForAccessibility("Join code copied");
    } catch {
      setActionError("Couldn’t copy the join code. Try again.");
    }
  }

  async function shareCode() {
    if (!generatedCode || !settingsQuery.data) return;
    try {
      await Share.share({
        message: `Join my household “${settingsQuery.data.household_name}” on Noomori.\n\nInvite code: ${formatCode(generatedCode.code)}\n\nThis code can be used once and expires in 10 minutes.`,
      });
      setActionError(null);
    } catch {
      setActionError("Couldn’t open sharing. Try again.");
    }
  }

  if (settingsQuery.isPending) {
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        className="flex-1 items-center justify-center bg-background"
      >
        <StatusBar style="dark" />
        <ActivityIndicator color={colorTokens.primaryStrong} size="large" />
        <Text className="mt-3 text-base text-text-secondary">
          Loading household…
        </Text>
      </SafeAreaView>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        className="flex-1 items-center justify-center bg-background px-5"
      >
        <StatusBar style="dark" />
        <View className="w-full max-w-[400px] gap-4 rounded-xl border border-border bg-surface p-5">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-text-primary"
          >
            Couldn’t load your household
          </Text>
          <Text className="text-base leading-6 text-text-secondary">
            Check your connection and try again.
          </Text>
          <OnboardingButton
            label="Try again"
            onPress={() => void settingsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const settings = settingsQuery.data;
  const activeExpiry =
    generatedCode?.expires_at ?? settings.active_code_expires_at;
  const hasActiveCode = Boolean(activeExpiry);

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      className="flex-1 bg-background"
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(safeAreaInsets.bottom, 16) + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="w-full self-center px-5 pb-8 pt-6 md:px-8"
          style={{ maxWidth: 520 }}
        >
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-[30px] font-bold leading-9 text-text-primary"
            >
              {settings.household_name}
            </Text>
            <Text className="text-base leading-6 text-text-secondary">
              {settings.member_count}{" "}
              {settings.member_count === 1 ? "member" : "members"}
              {" · "}
              {settings.role === "owner" ? "Owner" : "Member"}
            </Text>
          </View>

          <View className="mt-8 gap-3 rounded-xl border border-border bg-surface p-5">
            <Text className="text-sm font-bold uppercase leading-5 text-text-secondary">
              Household
            </Text>
            <View className="gap-1">
              <Text className="text-sm font-medium leading-5 text-text-secondary">
                Name
              </Text>
              <Text className="text-lg font-bold leading-6 text-text-primary">
                {settings.household_name}
              </Text>
            </View>
            <View className="h-px bg-border" />
            <View className="gap-1">
              <Text className="text-sm font-medium leading-5 text-text-secondary">
                Your role
              </Text>
              <Text className="text-lg font-bold leading-6 text-text-primary">
                {settings.role === "owner" ? "Owner" : "Member"}
              </Text>
            </View>
          </View>

          {settings.role === "owner" ? (
            <View className="mt-8 gap-5 rounded-xl border border-border bg-surface p-5">
              <View className="gap-2">
                <Text
                  accessibilityRole="header"
                  className="text-xl font-bold leading-7 text-text-primary"
                >
                  Invite member
                </Text>
                <Text className="text-base leading-6 text-text-secondary">
                  Share one short-lived code with the person you want to invite.
                </Text>
              </View>

              {generatedCode ? (
                <View className="gap-3 rounded-xl bg-surface-subtle p-4">
                  <Text className="text-sm font-bold leading-5 text-text-secondary">
                    Join code
                  </Text>
                  <Text
                    accessibilityLabel={`Join code ${generatedCode.code.split("").join(" ")}`}
                    className="text-center font-mono text-[32px] font-bold leading-10 tracking-[3px] text-text-primary"
                    selectable
                  >
                    {formatCode(generatedCode.code)}
                  </Text>
                  <Text className="text-center text-sm leading-5 text-text-secondary">
                    Valid until {formatExpiry(generatedCode.expires_at)}. One
                    use only.
                  </Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <OnboardingButton
                        disabled={revokeMutation.isPending}
                        label="Copy"
                        onPress={() => void copyCode()}
                        variant="secondary"
                      />
                    </View>
                    <View className="flex-1">
                      <OnboardingButton
                        disabled={revokeMutation.isPending}
                        label="Share"
                        onPress={() => void shareCode()}
                        variant="secondary"
                      />
                    </View>
                  </View>
                  <View className="min-h-5">
                    {copied ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        className="text-center text-sm font-medium leading-5 text-secondary"
                      >
                        Code copied
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : hasActiveCode && activeExpiry ? (
                <View className="gap-2 rounded-xl bg-surface-subtle p-4">
                  <Text className="text-base font-bold leading-6 text-text-primary">
                    A join code is active
                  </Text>
                  <Text className="text-sm leading-5 text-text-secondary">
                    It expires at {formatExpiry(activeExpiry)}. Generate a new
                    code if you need to see or share it again.
                  </Text>
                </View>
              ) : (
                <View className="rounded-xl bg-surface-subtle p-4">
                  <Text className="text-sm leading-5 text-text-secondary">
                    No active join code. New codes are valid for 10 minutes and
                    can be used once.
                  </Text>
                </View>
              )}

              <OnboardingButton
                disabled={revokeMutation.isPending}
                label={
                  hasActiveCode ? "Generate new code" : "Generate join code"
                }
                loading={isGenerating}
                loadingLabel="Generating…"
                onPress={confirmGenerate}
              />

              {hasActiveCode ? (
                <Pressable
                  accessibilityHint="Immediately invalidates the active join code."
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: revokeMutation.isPending,
                    disabled: isGenerating || revokeMutation.isPending,
                  }}
                  className="min-h-[52px] items-center justify-center rounded-xl border-2 border-error bg-surface px-5 py-3 focus:border-text-primary active:bg-surface-subtle disabled:opacity-50"
                  disabled={isGenerating || revokeMutation.isPending}
                  onPress={confirmRevoke}
                >
                  <Text className="text-[17px] font-bold leading-6 text-error">
                    {revokeMutation.isPending ? "Revoking…" : "Revoke code"}
                  </Text>
                </Pressable>
              ) : null}

              {actionError ? (
                <Text
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                  className="text-sm font-medium leading-5 text-error"
                >
                  {actionError}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="mt-8 rounded-xl border border-border bg-surface p-5">
              <Text className="text-base leading-6 text-text-secondary">
                Household invitations are managed by the Owner.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
