import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import {
  BottomTabInset,
  colorTokens,
  MaxContentWidth,
} from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";

type AccountRow = {
  href?: "/household/settings";
  icon: SymbolViewProps["name"];
  subtitle: string;
  title: string;
};

const accountSections: readonly {
  rows: readonly AccountRow[];
  title: string;
}[] = [
  {
    title: "Household",
    rows: [
      {
        icon: { ios: "house", android: "home", web: "home" },
        href: "/household/settings",
        title: "Household",
        subtitle: "Manage your household",
      },
    ],
  },
  {
    title: "Preferences",
    rows: [
      {
        icon: {
          ios: "bell",
          android: "notifications",
          web: "notifications",
        },
        title: "Notifications",
        subtitle: "Household activity alerts",
      },
    ],
  },
  {
    title: "Help",
    rows: [
      {
        icon: { ios: "bubble.left", android: "feedback", web: "feedback" },
        title: "Send feedback",
        subtitle: "Help us improve Noomori",
      },
      {
        icon: {
          ios: "exclamationmark.bubble",
          android: "report_problem",
          web: "report_problem",
        },
        title: "Report a problem",
        subtitle: "Tell us when something goes wrong",
      },
    ],
  },
  {
    title: "Legal",
    rows: [
      {
        icon: {
          ios: "hand.raised",
          android: "privacy_tip",
          web: "privacy_tip",
        },
        title: "Privacy Policy",
        subtitle: "How we handle your data",
      },
      {
        icon: { ios: "doc.text", android: "description", web: "description" },
        title: "Terms of Service",
        subtitle: "Rules for using Noomori",
      },
    ],
  },
];

function AccountInfoRow({
  icon,
  onPress,
  subtitle,
  title,
}: AccountRow & { onPress?: () => void }) {
  const content = (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-subtle"
      >
        <SymbolView
          accessible={false}
          name={icon}
          size={23}
          tintColor={colorTokens.textSecondary}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-lg font-bold leading-6 text-text-primary">
          {title}
        </Text>
        <Text className="text-base font-normal leading-6 text-text-secondary">
          {subtitle}
        </Text>
      </View>
      {onPress ? (
        <SymbolView
          accessible={false}
          name={{
            ios: "chevron.right",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={20}
          tintColor={colorTokens.textSecondary}
        />
      ) : null}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityHint={`Opens ${title} settings`}
      accessibilityRole="button"
      className="min-h-24 flex-row items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    <View className="min-h-24 flex-row items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3">
      {content}
    </View>
  );
}

/** Session identity and currently available account information. */
export default function AccountScreen() {
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const safeAreaInsets = useSafeAreaInsets();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const email = session?.user.email?.trim() || "Signed in";
  const metadataName = session?.user.user_metadata.full_name;
  const displayName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    email.split("@")[0] ||
    "Account";
  const initial = displayName.charAt(0).toLocaleUpperCase() || "A";

  // Sign out only this device; the existing auth listener handles the redirect.
  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) throw error;

      // Prevent private data from remaining visible to the next local session.
      queryClient.clear();
    } catch {
      setSignOutError(
        "Couldn’t sign out. Check your connection and try again.",
      );
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-background"
      testID="account-screen"
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom:
            BottomTabInset + Math.max(safeAreaInsets.bottom, 16) + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="w-full self-center px-5 pb-8 pt-4 md:px-6"
          style={{ maxWidth: MaxContentWidth }}
        >
          <Text
            accessibilityRole="header"
            className="text-[32px] font-bold leading-10 text-text-primary"
          >
            Account
          </Text>

          <View className="mt-8 min-h-32 flex-row items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-5">
            <View className="h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-subtle">
              <Text className="text-[30px] font-bold leading-9 text-text-primary">
                {initial}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-2xl font-bold leading-8 text-text-primary">
                {displayName}
              </Text>
              <Text className="text-base font-normal leading-6 text-text-secondary">
                {email}
              </Text>
            </View>
          </View>

          <View className="mt-10 gap-10">
            {accountSections.map((section) => (
              <View key={section.title} className="gap-3">
                <Text
                  accessibilityRole="header"
                  className="text-sm font-bold uppercase leading-5 text-text-secondary"
                >
                  {section.title}
                </Text>
                {section.rows.map((row) => (
                  <AccountInfoRow
                    key={row.title}
                    {...row}
                    onPress={
                      row.href
                        ? () => router.push("/household/settings")
                        : undefined
                    }
                  />
                ))}
              </View>
            ))}

            {/* Keep session-changing actions separate from informational rows. */}
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-sm font-bold uppercase leading-5 text-text-secondary"
              >
                Session
              </Text>
              <Pressable
                accessibilityHint="Signs out on this device"
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                accessibilityState={{
                  busy: isSigningOut,
                  disabled: isSigningOut,
                }}
                className="min-h-14 w-full flex-row items-center gap-4 rounded-2xl border-2 border-error bg-surface px-4 py-3 focus:border-text-primary active:bg-surface-subtle disabled:opacity-50"
                disabled={isSigningOut}
                onPress={() => void handleSignOut()}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-subtle"
                >
                  <SymbolView
                    accessible={false}
                    name={{
                      ios: "rectangle.portrait.and.arrow.right",
                      android: "logout",
                      web: "logout",
                    }}
                    size={23}
                    tintColor={colorTokens.error}
                  />
                </View>
                <Text className="min-w-0 flex-1 text-base font-bold leading-6 text-error">
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </Text>
              </Pressable>
              {signOutError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="text-sm font-normal leading-5 text-error"
                >
                  {signOutError}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
