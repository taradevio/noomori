import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { AppIcon } from "@/shared/ui/app-icon";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";
import { getHouseholdSettings } from "@/shared/household-api";
import { useNotifications } from "@/shared/providers/notification-provider";
import { useSession } from "@/shared/providers/session-providers";
import { useLocalSignOut } from "@/shared/providers/use-local-sign-out";

const SETTINGS_MAX_WIDTH = 560;

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="mb-2 ml-1 text-xs font-bold uppercase leading-4 tracking-[0.8px] text-text-secondary"
    >
      {children}
    </Text>
  );
}

/** Compact settings surface using only capabilities Noomori already supports. */
export default function AccountScreen() {
  const router = useRouter();
  const { session } = useSession();
  const notifications = useNotifications();
  const { isSigningOut, signOut, signOutError } = useLocalSignOut();
  const { height, width } = useWindowDimensions();
  const email = session?.user.email?.trim() || "Signed in";
  const metadataName = session?.user.user_metadata.full_name;
  const displayName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    email.split("@")[0] ||
    "Account";
  const initial = displayName.charAt(0).toLocaleUpperCase() || "A";
  const appVersion = Constants.expoConfig?.version?.trim();
  const horizontalGutter = Math.min(width, height) >= 600 ? 24 : 20;
  const accessToken = session?.access_token ?? "";
  const householdQuery = useQuery({
    enabled: notifications.available && Boolean(accessToken),
    queryKey: ["household"],
    queryFn: () => getHouseholdSettings(accessToken),
    retry: false,
  });
  // NOTE: Keep the section mounted while eligibility resolves so Account does
  // not shift when the household request finishes.
  const household = householdQuery.data;
  const notificationEligibilityFailed =
    householdQuery.isError || (!householdQuery.isPending && !household);
  const notificationsEligible =
    !notificationEligibilityFailed && (household?.member_count ?? 0) >= 2;
  const soloOwner =
    !notificationEligibilityFailed &&
    household?.member_count === 1 &&
    household.role === "owner";
  const notificationDescription = householdQuery.isPending
    ? "Checking notification settings…"
    : notificationEligibilityFailed
      ? "Couldn’t load notification settings."
      : notificationsEligible
        ? "Get notified when shared recipes change."
        : soloOwner
          ? "Invite someone to get notified when shared recipes change."
          : "Only the household owner can invite people.";

  const notificationRowContent = (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle"
      >
        <AppIcon
          accessible={false}
          name="notifications"
          accented
          size={21}
          color={colorTokens.primary}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-bold leading-6 text-text-primary">
          Receive shared recipe updates
        </Text>
        <Text className="min-h-10 text-sm font-normal leading-5 text-text-secondary">
          {notificationDescription}
        </Text>
      </View>
      <View className="w-14 shrink-0 items-end justify-center">
        {notificationsEligible ? (
          <Switch
            accessibilityLabel="Receive shared recipe updates"
            accessibilityState={{
              busy: notifications.isPending,
              disabled: notifications.isPending || isSigningOut,
            }}
            disabled={notifications.isPending || isSigningOut}
            onValueChange={(enabled) => {
              void notifications.setEnabled(enabled).catch(() => undefined);
            }}
            thumbColor={colorTokens.surface}
            trackColor={{
              false: colorTokens.border,
              true: colorTokens.primary,
            }}
            value={notifications.enabled}
          />
        ) : soloOwner ? (
          <AppIcon
            accessible={false}
            name="chevron-right"
            size={19}
            color={colorTokens.textSecondary}
          />
        ) : notificationEligibilityFailed ? (
          <Pressable
            accessibilityLabel="Retry notification availability"
            accessibilityRole="button"
            className="min-h-12 w-14 items-center justify-center rounded-lg border-2 border-transparent focus:border-primary active:bg-surface-subtle"
            onPress={() => void householdQuery.refetch()}
          >
            <Text className="text-sm font-bold leading-5 text-primary-strong">
              Retry
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-background"
      testID="account-screen"
    >
      <StatusBar style="dark" />
      <View className="min-h-14 items-center justify-center px-5 py-2">
        <Text
          accessibilityRole="header"
          className="text-xl font-bold leading-7 text-text-primary"
        >
          Settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: horizontalGutter,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="w-full self-center gap-8 pb-4 pt-4"
          style={{ maxWidth: SETTINGS_MAX_WIDTH }}
        >
          <View>
            <SectionLabel>Profile</SectionLabel>
            <View className="min-h-24 flex-row items-center gap-4 rounded-2xl bg-surface px-4 py-4">
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-warm-soft"
              >
                <Text
                  allowFontScaling={false}
                  className="text-2xl font-bold leading-8 text-primary-strong"
                >
                  {initial}
                </Text>
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text
                  numberOfLines={2}
                  className="text-lg font-bold leading-6 text-text-primary"
                >
                  {displayName}
                </Text>
                <Text className="text-sm font-normal leading-5 text-text-secondary">
                  {email}
                </Text>
              </View>
            </View>
          </View>

          <View>
            <SectionLabel>Household</SectionLabel>
            <View className="overflow-hidden rounded-2xl bg-surface">
              <Pressable
                accessibilityHint="Opens household settings"
                accessibilityLabel="Household settings"
                accessibilityRole="button"
                className="min-h-16 flex-row items-center gap-3 border-2 border-transparent px-3 py-2.5 focus:border-primary active:bg-surface-subtle"
                onPress={() => router.push("/household/settings")}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle"
                >
                  <AppIcon
                    accessible={false}
                    name="household"
                    accented
                    size={21}
                    color={colorTokens.primary}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold leading-6 text-text-primary">
                    Household
                  </Text>
                  <Text className="text-sm font-normal leading-5 text-text-secondary">
                    People and invites
                  </Text>
                </View>
                <AppIcon
                  accessible={false}
                  name="chevron-right"
                  size={19}
                  color={colorTokens.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {notifications.available ? (
            <View>
              <SectionLabel>Notifications</SectionLabel>
              {soloOwner ? (
                <Pressable
                  accessibilityHint="Opens household settings at Invite someone"
                  accessibilityLabel={`Receive shared recipe updates. ${notificationDescription}`}
                  accessibilityRole="button"
                  className="min-h-16 flex-row items-center gap-3 rounded-2xl border-2 border-transparent bg-surface px-3 py-2.5 focus:border-primary active:bg-surface-subtle"
                  onPress={() =>
                    router.push({
                      pathname: "/household/settings",
                      params: { section: "invite" },
                    })
                  }
                >
                  {notificationRowContent}
                </Pressable>
              ) : (
                <View className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
                  {notificationRowContent}
                </View>
              )}
              {notifications.error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="mt-2 px-1 text-sm font-normal leading-5 text-error"
                >
                  {notifications.error}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View>
            <SectionLabel>Account</SectionLabel>
            <View className="overflow-hidden rounded-2xl bg-surface">
              <Pressable
                accessibilityHint="Signs out on this device"
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                accessibilityState={{
                  busy: isSigningOut,
                  disabled: isSigningOut,
                }}
                className="min-h-16 flex-row items-center gap-3 border-2 border-transparent px-3 py-2.5 focus:border-text-primary active:bg-surface-subtle disabled:opacity-50"
                disabled={isSigningOut}
                onPress={() => void signOut()}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle"
                >
                  <AppIcon
                    accessible={false}
                    name="logout"
                    size={21}
                    color={colorTokens.error}
                  />
                </View>
                <Text className="min-w-0 flex-1 text-base font-bold leading-6 text-error">
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </Text>
              </Pressable>
            </View>
            {signOutError ? (
              <Text
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                className="mt-2 px-1 text-sm font-normal leading-5 text-error"
              >
                {signOutError}
              </Text>
            ) : null}
          </View>

          {appVersion ? (
            <Text
              className="pt-2 text-center text-xs font-medium leading-4 text-text-secondary"
              testID="settings-version"
            >
              Version {appVersion}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
