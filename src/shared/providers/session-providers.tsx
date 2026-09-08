// providers/session-provider.tsx

import { supabase } from "@/lib/supabase";
import { retryJwtIssuedInFutureOnce } from "@/shared/providers/session-profile-retry";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type AppState =
  "loading" | "signed-out" | "needs-onboarding" | "ready" | "error";

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
  const activeUserIdRef = useRef<string | null | undefined>(undefined);
  const resolutionIdRef = useRef(0);
  const deferredResolutionRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const resolveProfile = useCallback(
    async (nextSession: Session, resolutionId: number) => {
      const userId = nextSession.user.id;
      const isCurrent = () =>
        resolutionId === resolutionIdRef.current &&
        userId === activeUserIdRef.current;

      if (!isCurrent()) return;

      const readProfile = () =>
        supabase
          .from("profiles")
          .select("onboarding_completed_at")
          .eq("id", userId)
          .maybeSingle();
      const { data: profile, error } =
        await retryJwtIssuedInFutureOnce(readProfile);

      if (!isCurrent()) return;

      if (error) {
        if (__DEV__) {
          console.debug("[session] profile resolution failed", {
            code: error.code,
            message: error.message,
          });
        }
        setState("error");
        return;
      }

      setState(profile?.onboarding_completed_at ? "ready" : "needs-onboarding");
    },
    [],
  );

  const cancelDeferredResolution = useCallback(() => {
    if (deferredResolutionRef.current === null) return;
    clearTimeout(deferredResolutionRef.current);
    deferredResolutionRef.current = null;
  }, []);

  const refreshUserState = useCallback(async () => {
    cancelDeferredResolution();
    const resolutionId = ++resolutionIdRef.current;
    setState("loading");

    const { data, error } = await supabase.auth.getSession();
    if (resolutionId !== resolutionIdRef.current) return;

    if (error) {
      if (__DEV__) {
        console.debug("[session] session restoration failed", {
          message: error.message,
        });
      }
      setState("error");
      return;
    }

    const nextSession = data.session;
    const userId = nextSession?.user.id ?? null;
    activeUserIdRef.current = userId;
    setSession(nextSession);

    if (!nextSession) {
      setState("signed-out");
      return;
    }

    await resolveProfile(nextSession, resolutionId);
  }, [cancelDeferredResolution, resolveProfile]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = activeUserIdRef.current !== nextUserId;

      // Every event may rotate the access token, but repeated events for the
      // same user do not need another onboarding lookup or loading transition.
      setSession(nextSession);
      if (!userChanged) return;

      activeUserIdRef.current = nextUserId;
      cancelDeferredResolution();
      const resolutionId = ++resolutionIdRef.current;

      if (!nextSession) {
        setState("signed-out");
        return;
      }

      setState("loading");
      deferredResolutionRef.current = setTimeout(() => {
        deferredResolutionRef.current = null;
        void resolveProfile(nextSession, resolutionId);
      }, 0);
    });

    return () => {
      cancelDeferredResolution();
      activeUserIdRef.current = undefined;
      resolutionIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [cancelDeferredResolution, resolveProfile]);

  return (
    <SessionContext.Provider
      value={{
        state,
        session,
        refreshUserState,
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
