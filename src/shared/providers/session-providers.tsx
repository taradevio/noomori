// providers/session-provider.tsx

import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

type AppState = "loading" | "signed-out" | "needs-onboarding" | "ready";

type SessionContextValue = {
  state: AppState;
  session: Session | null;
  refreshUserState: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>("loading");
  // Expose Supabase's managed session so API callers can use its short-lived
  // access token without copying it into separate storage.
  const [session, setSession] = useState<Session | null>(null);

  async function resolveUserState(nextSession?: Session | null) {
    setState("loading");

    const resolvedSession =
      nextSession === undefined
        ? (await supabase.auth.getSession()).data.session
        : nextSession;

    // Keep consumers synchronized with Supabase after sign-in, refresh, or
    // sign-out events handled by resolveUserState.
    setSession(resolvedSession);

    if (!resolvedSession) {
      setState("signed-out");
      return;
    }

    const userId = resolvedSession.user.id;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    if (!profile?.onboarding_completed_at) {
      setState("needs-onboarding");
      return;
    }

    setState("ready");
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // INITIAL_SESSION supplies the restored session, so reading it again here
      // would repeat both session restoration and the onboarding profile query.
      void resolveUserState(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        state,
        session,
        refreshUserState: resolveUserState,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }

  return context;
}
