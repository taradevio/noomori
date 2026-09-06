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
import { Alert, Linking, Platform } from "react-native";

const ENABLED_KEY = "household-recipe-notifications-enabled";
const TOKEN_KEY = "household-recipe-notifications-token";
const CHANNEL_ID = "household-recipe-activity";

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
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Household recipe activity",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  });
}

async function getExpoPushToken() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("EAS project ID is missing");
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
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
  const [enabled, setEnabledState] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const accessToken = session?.access_token ?? "";

  const disable = useCallback(async () => {
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
    await Promise.all([
      SecureStore.deleteItemAsync(ENABLED_KEY),
      SecureStore.deleteItemAsync(TOKEN_KEY),
    ]);
    tokenRef.current = null;
    setEnabledState(false);
  }, [accessToken]);

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!accessToken || isPending || nextEnabled === enabled) return;
      setIsPending(true);
      setError(null);
      try {
        if (!nextEnabled) {
          await disable();
          return;
        }

        await ensureAndroidChannel();
        let permission = await Notifications.getPermissionsAsync();
        if (!allowsNotifications(permission)) {
          permission = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: false, allowSound: false },
          });
        }
        if (!allowsNotifications(permission)) {
          Alert.alert(
            "Notifications are off",
            "Allow notifications in your device settings to receive household recipe updates.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open settings", onPress: () => void Linking.openSettings() },
            ],
          );
          return;
        }

        const previousToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const token = await getExpoPushToken();
        await registerNotificationDevice(
          accessToken,
          token,
          Platform.OS as "android" | "ios",
          previousToken,
        );
        tokenRef.current = token;
        try {
          await Promise.all([
            SecureStore.setItemAsync(ENABLED_KEY, "true"),
            SecureStore.setItemAsync(TOKEN_KEY, token),
          ]);
        } catch (storageError) {
          try {
            await unregisterNotificationDevice(accessToken, token);
            await Promise.all([
              SecureStore.deleteItemAsync(ENABLED_KEY),
              SecureStore.deleteItemAsync(TOKEN_KEY),
            ]);
            tokenRef.current = null;
          } catch {
            // Keep the in-memory state accurate so sign-out retries safe cleanup.
            setEnabledState(true);
          }
          throw storageError;
        }
        setEnabledState(true);
      } catch {
        setError(
          "Couldn’t update notifications. Check your connection and try again.",
        );
        throw new Error("Could not update notifications");
      } finally {
        setIsPending(false);
      }
    }, [accessToken, disable, enabled, isPending],
  );

  const prepareForSignOut = useCallback(async () => {
    // NOTE: Server cleanup must succeed before the session can be discarded.
    const optedIn = (await SecureStore.getItemAsync(ENABLED_KEY)) === "true";
    if (enabled || optedIn) await disable();
  }, [disable, enabled]);

  useEffect(() => {
    // NOTE: Startup refreshes an existing opt-in but never prompts automatically.
    if (state !== "ready" || !accessToken) return;
    let active = true;
    void (async () => {
      try {
        const optedIn = (await SecureStore.getItemAsync(ENABLED_KEY)) === "true";
        if (!active || !optedIn) {
          if (active) setEnabledState(false);
          return;
        }
        setEnabledState(true);
        await ensureAndroidChannel();
        const permission = await Notifications.getPermissionsAsync();
        if (!allowsNotifications(permission)) {
          await disable();
          return;
        }
        const previousToken = await SecureStore.getItemAsync(TOKEN_KEY);
        tokenRef.current = previousToken;
        const token = await getExpoPushToken();
        await registerNotificationDevice(
          accessToken,
          token,
          Platform.OS as "android" | "ios",
          previousToken,
        );
        tokenRef.current = token;
        if (token !== previousToken) {
          await SecureStore.setItemAsync(TOKEN_KEY, token);
        }
      } catch {
        if (active) {
          setError("Notifications will retry when Noomori opens again.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken, disable, state]);

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
      enabled,
      error,
      isPending,
      setEnabled,
      prepareForSignOut,
    }),
    [enabled, error, isPending, prepareForSignOut, setEnabled],
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
    throw new Error("useNotifications must be used inside NotificationProvider");
  }
  return context;
}
