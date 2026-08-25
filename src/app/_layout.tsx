import "@/global.css";

import { noomoriNavigationTheme } from "@/shared/design-system";
import {
  SessionProvider,
  useSession,
} from "@/shared/providers/session-providers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { SplashScreenController } from "../shared/components/splash-screen-controller";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

// Separate RootNavigator so route guards can consume the current session state.
function RootNavigator() {
  const { state } = useSession();

  if (state === "loading") {
    return null;
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
        {/* NOTE: Recipe editors remain inside the authenticated route boundary. */}
        <Stack.Screen name="recipe/new" />
        <Stack.Screen name="recipe/import-text" />
        <Stack.Screen name="recipe/[id]/index" />
        <Stack.Screen name="recipe/[id]/edit" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // PERFORMANCE: Keep one cache for the app lifetime so layout rerenders cannot
  // discard recipe data and force avoidable network requests.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={noomoriNavigationTheme}>
        <SessionProvider>
          <SplashScreenController />
          <RootNavigator />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
