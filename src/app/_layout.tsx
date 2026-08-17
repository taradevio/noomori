import "@/global.css";

import { noomoriNavigationTheme } from "@/shared/design-system";
import { AnimatedSplashOverlay } from "@/shared/platform";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SplashScreenController } from "../shared/components/splash-screen-controller";
import { useAuthContext } from "../shared/hooks/use-auth-context";
import AuthProvider from "../shared/providers/auth-providers";

SplashScreen.preventAutoHideAsync();

// Separate RootNavigator so we can access the AuthContext
function RootNavigator() {
  const { isLoggedIn } = useAuthContext();
  return (
    <Stack>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={noomoriNavigationTheme}>
      <AuthProvider>
        <SplashScreenController />
        <RootNavigator />
        <AnimatedSplashOverlay />
      </AuthProvider>
    </ThemeProvider>
  );
}
