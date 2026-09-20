import {
  householdActivityKey,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from "@/shared/household-api";
import { useSession } from "@/shared/providers/session-providers";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, Linking, Platform } from "react-native";

const ENABLED_KEY = "household-recipe-notifications-enabled";
const TOKEN_KEY = "household-recipe-notifications-token";
const CHANNEL_ID = "household-recipe-activity";

// NOTE: Keep diagnostics development-only and never include auth or push tokens.
function debugNotifications(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (__DEV__) console.debug(`[notifications] ${event}`, details);
}

// NOTE: Household pushes are intentionally visual-only: no sound and no badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationContextValue = {
  available: boolean;
  enabled: boolean;
  error: string | null;
  isPending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  prepareForSignOut: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

function allowsNotifications(
  permission: Notifications.NotificationPermissionsStatus,
) {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  debugNotifications("android_channel_creating");
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Household recipe activity",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  });
  debugNotifications("android_channel_ready");
}

async function getExpoPushToken() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("EAS project ID is missing");
  }
  debugNotifications("push_token_request_started");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  debugNotifications("push_token_request_succeeded");
  return token;
}

export function notificationRoute(data: Record<string, unknown>): Href | null {
  // NOTE: Treat remote payloads as untrusted before allowing navigation.
  if (
    data.kind !== "household_recipe_activity" ||
    (data.action !== "added" &&
      data.action !== "edited" &&
      data.action !== "unshared") ||
    typeof data.recipe_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.recipe_id,
    )
  ) {
    return null;
  }
  if (data.action === "unshared") return "/activity";
  return `/recipe/${data.recipe_id}` as Href;
}

export function NotificationProvider({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, state } = useSession();
  // NOTE: Pending intent drives the switch immediately; enabled changes only
  // after registration or cleanup commits.
  const [enabled, setEnabledState] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const accessToken = session?.access_token ?? "";

  const operationsRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCountRef = useRef(0);
  const enabledRef = useRef(false);
  const pendingEnabledRef = useRef<boolean | null>(null);
  const intentVersionRef = useRef(0);
  const signingOutRef = useRef(false);

  const commitEnabled = useCallback((nextEnabled: boolean) => {
    enabledRef.current = nextEnabled;
    setEnabledState(nextEnabled);
  }, []);

  // One queue keeps registration and cleanup ordered, including sign-out.
  const runExclusive = useCallback(
    (operationName: string, operation: () => Promise<void>) => {
      pendingCountRef.current += 1;
      debugNotifications("operation_queued", {
        operation: operationName,
        pendingCount: pendingCountRef.current,
      });
      setIsPending(true);
      const result = operationsRef.current.then(async () => {
        debugNotifications("operation_started", { operation: operationName });
        setError(null);
        try {
          await operation();
          debugNotifications("operation_succeeded", {
            operation: operationName,
          });
        } catch (operationError) {
          debugNotifications("operation_failed", {
            operation: operationName,
            error:
              operationError instanceof Error
                ? {
                    message: operationError.message,
                    name: operationError.name,
                    stack: operationError.stack,
                  }
                : String(operationError),
          });
          setError(
            "Couldn’t update notifications. Try again.",
          );
          throw new Error("Could not update notifications");
        } finally {
          pendingCountRef.current -= 1;
          debugNotifications("operation_finished", {
            operation: operationName,
            pendingCount: pendingCountRef.current,
          });
          if (pendingCountRef.current === 0) setIsPending(false);
        }
      });
      // A failed operation must not prevent a later cleanup or retry.
      operationsRef.current = result.catch(() => undefined);
      return result;
    },
    [],
  );

  const disable = useCallback(
    async (clearPreference: boolean) => {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const tokens = [
        ...new Set([storedToken, tokenRef.current].filter(Boolean)),
      ] as string[];
      if (tokens.length > 0 && !accessToken) {
        throw new Error(
          "A signed-in session is required to disable notifications",
        );
      }
      for (const token of tokens) {
        await unregisterNotificationDevice(accessToken, token);
      }
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      if (clearPreference) await SecureStore.deleteItemAsync(ENABLED_KEY);
      tokenRef.current = null;
      commitEnabled(false);
    },
    [accessToken, commitEnabled],
  );

  const reconcile = useCallback(
    async (
      requestPermission = false,
      intentVersion = intentVersionRef.current,
    ) => {
      const optedIn = (await SecureStore.getItemAsync(ENABLED_KEY)) === "true";
      debugNotifications("reconcile_started", {
        optedIn,
        platform: Platform.OS,
        requestPermission,
      });
      if (!optedIn && !requestPermission) {
        debugNotifications("reconcile_skipped", { reason: "not_opted_in" });
        commitEnabled(false);
        await disable(false);
        return;
      }

      await ensureAndroidChannel();
      let permission = await Notifications.getPermissionsAsync();
      debugNotifications("permission_checked", {
        canAskAgain: permission.canAskAgain,
        granted: allowsNotifications(permission),
        status: permission.status,
        iosStatus: permission.ios?.status,
      });
      if (!allowsNotifications(permission) && requestPermission) {
        debugNotifications("permission_request_started");
        permission = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: false, allowSound: false },
        });
        debugNotifications("permission_request_finished", {
          canAskAgain: permission.canAskAgain,
          granted: allowsNotifications(permission),
          status: permission.status,
          iosStatus: permission.ios?.status,
        });
      }
      if (!allowsNotifications(permission)) {
        debugNotifications("permission_unavailable");
        // OS revocation changes availability, not the user's saved preference.
        commitEnabled(false);
        await disable(false);
        if (requestPermission && intentVersion === intentVersionRef.current) {
          Alert.alert(
            "Notifications are turned off",
            "Turn them on in your device settings if you’d like updates when shared recipes change.",
            [
              {
                text: "Not now",
                style: "cancel",
                onPress: () => {
                  void runExclusive("permission_cancelled", async () => {
                    if (intentVersion !== intentVersionRef.current) return;
                    intentVersionRef.current += 1;
                    await SecureStore.deleteItemAsync(ENABLED_KEY);
                    commitEnabled(false);
                  }).catch(() => undefined);
                },
              },
              {
                text: "Open settings",
                onPress: () => {
                  void runExclusive("open_settings", async () => {
                    if (intentVersion !== intentVersionRef.current) return;
                    await SecureStore.setItemAsync(ENABLED_KEY, "true");
                    debugNotifications("opening_system_settings");
                    await Linking.openSettings();
                  }).catch(() => undefined);
                },
              },
            ],
          );
        }
        return;
      }

      const previousToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const token = await getExpoPushToken();
      debugNotifications("device_registration_started", {
        hadPreviousToken: Boolean(previousToken),
        platform: Platform.OS,
        tokenRotated: Boolean(previousToken && previousToken !== token),
      });
      // Retain even an uncertain registration so sign-out can safely remove it.
      tokenRef.current = token;
      try {
        await registerNotificationDevice(
          accessToken,
          token,
          Platform.OS as "android" | "ios",
          previousToken,
        );
        debugNotifications("device_registration_succeeded");
        try {
          await SecureStore.setItemAsync(TOKEN_KEY, token);
          if (requestPermission) {
            await SecureStore.setItemAsync(ENABLED_KEY, "true");
          }
          debugNotifications("notification_preference_saved", {
            enabled: true,
          });
        } catch (storageError) {
          // Preserve existing intent; failed cleanup retains the in-memory token.
          await disable(false).catch(() => undefined);
          throw storageError;
        }
        commitEnabled(true);
        debugNotifications("reconcile_enabled");
      } catch (registrationError) {
        commitEnabled(false);
        throw registrationError;
      }
    },
    [accessToken, commitEnabled, disable, runExclusive],
  );

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      debugNotifications("toggle_requested", {
        committedEnabled: enabledRef.current,
        nextEnabled,
        pendingEnabled: pendingEnabledRef.current,
      });
      if (!accessToken || signingOutRef.current) {
        debugNotifications("toggle_ignored", {
          reason: !accessToken ? "no_session" : "signing_out",
        });
        return Promise.resolve();
      }
      // NOTE: Native switches can repeat the same target before React rerenders.
      if (
        pendingEnabledRef.current === nextEnabled ||
        (pendingEnabledRef.current === null &&
          enabledRef.current === nextEnabled)
      ) {
        debugNotifications("toggle_ignored", { reason: "duplicate_target" });
        return Promise.resolve();
      }
      const intentVersion = ++intentVersionRef.current;
      pendingEnabledRef.current = nextEnabled;
      setPendingEnabled(nextEnabled);
      return runExclusive(nextEnabled ? "enable" : "disable", () =>
        nextEnabled ? reconcile(true, intentVersion) : disable(true),
      ).finally(() => {
        if (intentVersion !== intentVersionRef.current) return;
        pendingEnabledRef.current = null;
        setPendingEnabled(null);
      });
    },
    [accessToken, disable, reconcile, runExclusive],
  );

  const prepareForSignOut = useCallback(async () => {
    signingOutRef.current = true;
    intentVersionRef.current += 1;
    try {
      // Includes retained tokens even when the switch and preference are off.
      await runExclusive("sign_out_cleanup", () => disable(true));
    } finally {
      pendingEnabledRef.current = null;
      setPendingEnabled(null);
      signingOutRef.current = false;
    }
  }, [disable, runExclusive]);

  useEffect(() => {
    if (state !== "ready" || !accessToken) return;
    let active = true;
    const refresh = () => {
      // NOTE: Android's permission sheet can reactivate the app while enabling;
      // that event must not enqueue a second device registration.
      if (signingOutRef.current || pendingEnabledRef.current !== null) {
        debugNotifications("foreground_reconcile_skipped", {
          reason: signingOutRef.current ? "signing_out" : "toggle_pending",
        });
        return;
      }
      void runExclusive("foreground_reconcile", async () => {
        if (active) await reconcile();
      }).catch(() => undefined);
    };
    refresh();
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      debugNotifications("app_state_changed", {
        from: previousState,
        to: nextState,
      });
      if (nextState === "active" && previousState !== "active") refresh();
      previousState = nextState;
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [accessToken, reconcile, runExclusive, state]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: householdActivityKey });
    });
    return () => received.remove();
  }, [queryClient]);

  useEffect(() => {
    if (state !== "ready") return;
    const redirect = (notification: Notifications.Notification) => {
      void queryClient.invalidateQueries({ queryKey: householdActivityKey });
      const route = notificationRoute(notification.request.content.data ?? {});
      if (route) router.push(route);
    };
    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse?.notification) {
      redirect(initialResponse.notification);
      Notifications.clearLastNotificationResponse();
    }
    const responses = Notifications.addNotificationResponseReceivedListener(
      (response) => redirect(response.notification),
    );
    return () => responses.remove();
  }, [queryClient, router, state]);

  const value = useMemo(
    () => ({
      available: true,
      enabled: pendingEnabled ?? enabled,
      error,
      isPending,
      setEnabled,
      prepareForSignOut,
    }),
    [enabled, error, isPending, pendingEnabled, prepareForSignOut, setEnabled],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider",
    );
  }
  return context;
}
