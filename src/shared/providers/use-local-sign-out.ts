import { supabase } from "@/lib/supabase";
import { useNotifications } from "@/shared/providers/notification-provider";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

const SIGN_OUT_ERROR = "Couldn’t sign out. Try again.";

export function useLocalSignOut() {
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSigningOut(true);
    setSignOutError(null);

    try {
      await notifications.prepareForSignOut();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;

      // Prevent private data from remaining visible to the next local session.
      queryClient.clear();
    } catch {
      setSignOutError(SIGN_OUT_ERROR);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsSigningOut(false);
    }
  }, [notifications, queryClient]);

  return { isSigningOut, signOut, signOutError };
}
