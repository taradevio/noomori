import "@/global.css";

import { noomoriNavigationTheme } from "@/shared/design-system";
import AuthProvider from "@/shared/providers/auth-providers";
import {
  SessionProvider,
  useSession,
} from "@/shared/providers/session-providers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SplashScreenController } from "../shared/components/splash-screen-controller";
import { useAuthContext } from "../shared/hooks/use-auth-context";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

// Separate RootNavigator so we can access the AuthContext
function RootNavigator() {
  const { isLoading, isLoggedIn } = useAuthContext();
  const { state } = useSession();

  if (state === "loading") {
    return null;
  }

  if (isLoading) return null;

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
        <Stack.Screen name="recipe/[id]/edit" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={noomoriNavigationTheme}>
        <SessionProvider>
          <AuthProvider>
            <SplashScreenController />
            <RootNavigator />
          </AuthProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
