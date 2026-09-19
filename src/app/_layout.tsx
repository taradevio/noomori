import "@/global.css";

import { KeyboardProvider } from "@/shared/components/keyboard-layout";
import { OnboardingButton } from "@/shared/components/onboarding/onboarding-button";
import { noomoriNavigationTheme } from "@/shared/design-system";
import { NotificationProvider } from "@/shared/providers/notification-provider";
import {
  SessionProvider,
  useSession,
} from "@/shared/providers/session-providers";
import { useLocalSignOut } from "@/shared/providers/use-local-sign-out";
import { ToastHost } from "@/shared/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { SplashScreenController } from "../shared/components/splash-screen-controller";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

// Separate RootNavigator so route guards can consume the current session state.
export function RootNavigator() {
  const { refreshUserState, state } = useSession();
  const { isSigningOut, signOut, signOutError } = useLocalSignOut();

  if (state === "loading") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-5">
        <StatusBar style="dark" />
        <ActivityIndicator
          color={noomoriNavigationTheme.colors.primary}
          size="large"
        />
        <Text
          accessibilityLiveRegion="polite"
          className="text-base text-text-secondary"
        >
          Loading your account…
        </Text>
      </SafeAreaView>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-5">
        <StatusBar style="dark" />
        <View className="w-full max-w-[400px] gap-4 rounded-xl border border-border bg-surface p-5">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-text-primary"
          >
            Couldn’t load your account
          </Text>
          <Text className="text-base leading-6 text-text-secondary">
            Try again in a moment.
          </Text>
          <OnboardingButton
            disabled={isSigningOut}
            label="Try again"
            onPress={() => void refreshUserState()}
          />
          <OnboardingButton
            label="Sign out"
            loading={isSigningOut}
            loadingLabel="Signing out…"
            onPress={() => void signOut()}
            variant="secondary"
          />
          {signOutError ? (
            <Text
              accessibilityRole="alert"
              className="text-sm font-medium leading-5 text-error"
            >
              {signOutError}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={state === "signed-out"}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={state === "needs-onboarding"}>
        {/* <Stack.Screen name="auth" options={{ headerShown: false }} /> */}
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={state === "ready"}>
        {/* <Stack.Screen name="auth" options={{ headerShown: false }} /> */}
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="activity" />
        {/* NOTE: Recipe editors remain inside the authenticated route boundary. */}
        <Stack.Screen name="recipe/new" />
        <Stack.Screen name="recipe/import-text" />
        <Stack.Screen name="recipe/import-url" />
        <Stack.Screen name="recipe/[id]/index" />
        <Stack.Screen name="recipe/[id]/edit" />
        <Stack.Screen name="cookbook/new" />
        <Stack.Screen name="cookbook/[id]/index" />
        <Stack.Screen name="cookbook/[id]/recipes" />
        {/* NOTE: /household belongs to the tab; management stays on a nested route. */}
        <Stack.Screen
          name="household/settings"
          options={{
            headerBackTitle: "Back",
            headerShown: true,
            title: "Household settings",
          }}
        />
        <Stack.Screen
          name="household/join"
          options={{
            headerBackTitle: "Back",
            headerShown: true,
            title: "Join another household",
          }}
        />
        <Stack.Screen
          name="household/recipe-handoffs"
          options={{ headerShown: false }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // PERFORMANCE: Keep one cache for the app lifetime so layout rerenders cannot
  // discard recipe data and force avoidable network requests.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider
        navigationBarTranslucent
        preserveEdgeToEdge
        statusBarTranslucent
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={noomoriNavigationTheme}>
            <SessionProvider>
              <NotificationProvider>
                <SplashScreenController />
                <RootNavigator />
                {/* NOTE: Keep the host beside the navigator so route replacement
                    never unmounts an active toast. */}
                <ToastHost />
              </NotificationProvider>
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
