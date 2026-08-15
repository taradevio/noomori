import "@/global.css";

import { ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import AppTabs from "@/navigation/app-tabs";
import { noomoriNavigationTheme } from "@/shared/design-system";
import { AnimatedSplashOverlay } from "@/shared/platform";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider value={noomoriNavigationTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
