import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { useSession } from "../providers/session-providers";

export function SplashScreenController() {
  const { state } = useSession();
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (state === "loading" || hiddenRef.current) return;
    hiddenRef.current = true;
    SplashScreen.hide();
  }, [state]);

  return null;
}
