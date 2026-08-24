import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useSession } from "../providers/session-providers";

export function SplashScreenController() {
  const { state } = useSession();

  useEffect(() => {
    if (state === "loading") SplashScreen.hide();
  }, [state]);

  return null;
}
