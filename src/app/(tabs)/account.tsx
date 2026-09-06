import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { colorTokens } from "@/shared/design-system";
import { getHouseholdSettings } from "@/shared/household-api";
import { useNotifications } from "@/shared/providers/notification-provider";
import { useSession } from "@/shared/providers/session-providers";

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
  const queryClient = useQueryClient();
  const { height, width } = useWindowDimensions();
  const signingOutRef = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
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
  // NOTE: Web and one-person households keep the existing activity UI only.
  const showNotifications =
    notifications.available && (householdQuery.data?.member_count ?? 0) >= 2;

  async function handleSignOut() {
    if (signingOutRef.current) return;

    signingOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError(null);

    try {
      await notifications.prepareForSignOut();
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) throw error;

      // Prevent private data from remaining visible to the next local session.
      queryClient.clear();
    } catch {
      signingOutRef.current = false;
      setIsSigningOut(false);
      setSignOutError(
        "Couldn’t sign out. Check your connection and try again.",
      );
    }
  }

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
                  <SymbolView
                    accessible={false}
                    name={{ ios: "house", android: "home", web: "home" }}
                    size={21}
                    tintColor={colorTokens.textSecondary}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold leading-6 text-text-primary">
                    Household settings
                  </Text>
                  <Text className="text-sm font-normal leading-5 text-text-secondary">
                    Manage members and invitations
                  </Text>
                </View>
                <SymbolView
                  accessible={false}
                  name={{
                    ios: "chevron.right",
                    android: "chevron_right",
                    web: "chevron_right",
                  }}
                  size={19}
                  tintColor={colorTokens.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {showNotifications ? (
            <View>
              <SectionLabel>Notifications</SectionLabel>
              <View className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle"
                >
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "bell",
                      android: "notifications",
                      web: "notifications",
                    }}
                    size={21}
                    tintColor={colorTokens.textSecondary}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold leading-6 text-text-primary">
                    Recipe activity
                  </Text>
                  <Text className="text-sm font-normal leading-5 text-text-secondary">
                    Shared recipe additions and updates
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Recipe activity"
                  accessibilityState={{
                    busy: notifications.isPending,
                    disabled: notifications.isPending,
                  }}
                  disabled={notifications.isPending}
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
              </View>
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
            <SectionLabel>Session</SectionLabel>
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
                onPress={() => void handleSignOut()}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle"
                >
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "rectangle.portrait.and.arrow.right",
                      android: "logout",
                      web: "logout",
                    }}
                    size={21}
                    tintColor={colorTokens.error}
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
