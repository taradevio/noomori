import {
  generateHouseholdCode,
  getHouseholdSettings,
  leaveHousehold,
  revokeHouseholdCode,
  type GeneratedHouseholdCode,
} from "@/shared/household-api";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import { colorTokens } from "@/shared/design-system";
import { clearHouseholdTransitionCaches } from "@/shared/household-query";
import { useSession } from "@/shared/providers/session-providers";
import { toast } from "@/shared/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
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
  const { section } = useLocalSearchParams<{ section?: "invite" }>();
  const router = useRouter();
  const { refreshUserState, session } = useSession();
  const queryClient = useQueryClient();
  const safeAreaInsets = useSafeAreaInsets();
  const accessToken = session?.access_token ?? "";
  const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inviteHeadingRef = useRef<ComponentRef<typeof Text>>(null);
  const handledInviteTargetRef = useRef(false);
  const [inviteSectionY, setInviteSectionY] = useState<number | null>(null);
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
      toast.success("Join code deactivated");
    },
    onError: () => {
      setActionError("Couldn’t deactivate the join code. Try again.");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveHousehold(accessToken),
    onSuccess: async (result) => {
      setActionError(null);
      await clearHouseholdTransitionCaches(queryClient);

      if (result.status === "RESTORED") {
        toast.success(`Returned to ${result.household.name}`);
        router.replace("/household");
        return;
      }

      toast.success("Left household");
      await refreshUserState();
      queryClient.removeQueries({ queryKey: ["profile"] });
    },
    onError: () => {
      setActionError(
        "Couldn’t leave the household. Try again.",
      );
    },
  });

  useEffect(() => {
    if (actionError) {
      AccessibilityInfo.announceForAccessibility(actionError);
    }
  }, [actionError]);

  // NOTE: Route-targeted invite navigation scrolls and focuses once; query and
  // mutation rerenders must not pull the user back to this section.
  useEffect(() => {
    if (
      section !== "invite" ||
      settingsQuery.data?.role !== "owner" ||
      inviteSectionY === null ||
      handledInviteTargetRef.current ||
      !scrollViewRef.current ||
      !inviteHeadingRef.current
    ) {
      return;
    }

    handledInviteTargetRef.current = true;
    scrollViewRef.current.scrollTo({
      y: Math.max(0, inviteSectionY - 16),
      animated: false,
    });
    const inviteHeading = inviteHeadingRef.current;
    const focusFrame = requestAnimationFrame(() => {
      AccessibilityInfo.sendAccessibilityEvent(inviteHeading, "focus");
    });

    return () => cancelAnimationFrame(focusFrame);
  }, [inviteSectionY, section, settingsQuery.data?.role]);

  async function generateCode() {
    if (isGenerating) return;
    setIsGenerating(true);
    setActionError(null);
    setCopied(false);

    try {
      const result = await generateHouseholdCode(accessToken);
      setGeneratedCode(result);
      await queryClient.invalidateQueries({ queryKey: ["household"] });
      toast.success("Join code ready");
    } catch {
      setActionError("Couldn’t create a join code. Try again.");
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
      "Create a new join code?",
      "The current code will stop working.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create new code", onPress: () => void generateCode() },
      ],
    );
  }

  function confirmRevoke() {
    Alert.alert(
      "Deactivate this join code?",
      "It won’t work anymore.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate code",
          style: "destructive",
          onPress: () => revokeMutation.mutate(),
        },
      ],
    );
  }

  function confirmLeave() {
    if (!settingsQuery.data || leaveMutation.isPending) return;

    const sharedRecipeCount = settingsQuery.data.shared_recipe_count;
    const sharedRecipeMessage = sharedRecipeCount
      ? `${sharedRecipeCount} ${sharedRecipeCount === 1 ? "recipe" : "recipes"} you shared will stay behind for the household owner to keep or remove. Your own ${sharedRecipeCount === 1 ? "recipe stays" : "recipes stay"} with you.`
      : "Your own recipes will stay with you.";

    Alert.alert(
      `Leave “${settingsQuery.data.household_name}”?`,
      `You’ll lose access to this household’s shared recipes. ${sharedRecipeMessage} You can create or join another household afterward.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave household",
          style: "destructive",
          onPress: () => leaveMutation.mutate(),
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
        message: `Join my household “${settingsQuery.data.household_name}” on Noomori.\n\nJoin code: ${formatCode(generatedCode.code)}\n\nThis code can be used once and expires in 10 minutes.`,
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
            Try again in a moment.
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
        ref={scrollViewRef}
        contentContainerStyle={{
          paddingBottom: Math.max(safeAreaInsets.bottom, 16) + 32,
        }}
        refreshControl={
          <RefreshControl
            colors={[colorTokens.primaryStrong]}
            onRefresh={() => void settingsQuery.refetch()}
            refreshing={Boolean(settingsQuery.isRefetching)}
            tintColor={colorTokens.primaryStrong}
          />
        }
        showsVerticalScrollIndicator={false}
        testID="household-settings-scroll"
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
              {settings.member_count === 1
                ? "1 person"
                : `${settings.member_count} people`}
            </Text>
          </View>

          <View className="mt-8 rounded-xl border border-border bg-surface p-5">
            <View className="gap-1">
              <Text
                accessibilityRole="header"
                className="text-xl font-bold leading-7 text-text-primary"
              >
                People
              </Text>
              <Text className="text-sm leading-5 text-text-secondary">
                {settings.member_count}{" "}
                {settings.member_count === 1 ? "person" : "people"} in this
                household
              </Text>
            </View>

            <View className="mt-4">
              {settings.members.map((member, index) => {
                const isCurrentUser = member.user_id === session?.user.id;
                const roleLabel = member.role === "owner" ? "Owner" : "Member";

                return (
                  <View key={member.user_id}>
                    {index > 0 ? <View className="h-px bg-border" /> : null}
                    <View
                      accessibilityLabel={`${member.display_name}, ${roleLabel}${isCurrentUser ? ", you" : ""}`}
                      accessible
                      className="min-h-[56px] flex-row items-center gap-4 py-3"
                    >
                      <Text className="min-w-0 flex-1 text-base font-bold leading-6 text-text-primary">
                        {member.display_name}
                        {isCurrentUser ? " (You)" : ""}
                      </Text>
                      <Text className="shrink-0 text-sm font-medium leading-5 text-text-secondary">
                        {roleLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {settings.role === "owner" ? (
            <>
              <View
                className="mt-8 gap-5 rounded-xl border border-border bg-surface p-5"
                onLayout={(event) => {
                  const nextY = event.nativeEvent.layout.y;
                  setInviteSectionY((currentY) =>
                    currentY === nextY ? currentY : nextY,
                  );
                }}
              >
                <View className="gap-2">
                  <Text
                    ref={inviteHeadingRef}
                    accessible
                    accessibilityRole="header"
                    className="text-xl font-bold leading-7 text-text-primary"
                  >
                    Invite someone
                  </Text>
                  <Text className="text-base leading-6 text-text-secondary">
                    Create a join code and send it to the person you want to
                    bring in.
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
                      Works once and expires at{" "}
                      {formatExpiry(generatedCode.expires_at)}.
                    </Text>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <OnboardingButton
                          disabled={revokeMutation.isPending}
                          label="Copy code"
                          onPress={() => void copyCode()}
                          variant="secondary"
                        />
                      </View>
                      <View className="flex-1">
                        <OnboardingButton
                          disabled={revokeMutation.isPending}
                          label="Share code"
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
                      It expires at {formatExpiry(activeExpiry)}. Create a new
                      code if you need to see or share it again.
                    </Text>
                  </View>
                ) : (
                  <View className="rounded-xl bg-surface-subtle p-4">
                    <Text className="text-sm leading-5 text-text-secondary">
                      No active join code. New codes are valid for 10 minutes
                      and can be used once.
                    </Text>
                  </View>
                )}

                <OnboardingButton
                  disabled={revokeMutation.isPending}
                  label={
                    hasActiveCode ? "Create new code" : "Create join code"
                  }
                  loading={isGenerating}
                  loadingLabel="Creating code…"
                  onPress={confirmGenerate}
                />

                {hasActiveCode ? (
                  <Pressable
                    accessibilityHint="Makes this join code stop working."
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
                      {revokeMutation.isPending
                        ? "Deactivating…"
                        : "Deactivate code"}
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

              {settings.member_count === 1 ? (
                <View className="mt-8 gap-4 rounded-xl border border-border bg-surface p-5">
                  <View className="gap-2">
                    <Text
                      accessibilityRole="header"
                      className="text-xl font-bold leading-7 text-text-primary"
                    >
                      Join another household
                    </Text>
                    <Text className="text-base leading-6 text-text-secondary">
                      Your household and its shared recipes will stay saved.
                      You’ll return here when you leave the other household.
                    </Text>
                  </View>
                  <OnboardingButton
                    accessibilityHint="Opens the join code form and keeps this household saved."
                    label="Join another household"
                    onPress={() => router.push("/household/join" as Href)}
                    variant="secondary"
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <View className="mt-8 rounded-xl border border-border bg-surface p-5">
                <Text className="text-base leading-6 text-text-secondary">
                  Only the household owner can invite people.
                </Text>
              </View>

              <View className="mt-8 gap-4 rounded-xl border border-error bg-surface p-5">
                <View className="gap-2">
                  <Text
                    accessibilityRole="header"
                    className="text-xl font-bold leading-7 text-text-primary"
                  >
                    Leave household
                  </Text>
                  <Text className="text-base leading-6 text-text-secondary">
                    You’ll lose access to this household’s shared recipes. Your
                    own recipes will stay with you.
                  </Text>
                </View>

                <Pressable
                  accessibilityHint="Opens a confirmation before leaving this household."
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: leaveMutation.isPending,
                    disabled: leaveMutation.isPending,
                  }}
                  className="min-h-[52px] items-center justify-center rounded-xl border-2 border-error bg-surface px-5 py-3 focus:border-text-primary active:bg-surface-subtle disabled:opacity-50"
                  disabled={leaveMutation.isPending}
                  onPress={confirmLeave}
                >
                  <View className="flex-row items-center justify-center gap-2.5">
                    {leaveMutation.isPending ? (
                      <ActivityIndicator
                        accessible={false}
                        color={colorTokens.error}
                        size="small"
                      />
                    ) : null}
                    <Text className="text-[17px] font-bold leading-6 text-error">
                      {leaveMutation.isPending
                        ? "Leaving household…"
                        : "Leave household"}
                    </Text>
                  </View>
                </Pressable>

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
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
