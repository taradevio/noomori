import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  Text,
  type AppStateStatus,
} from "react-native";

import {
  NotificationProvider,
  useNotifications,
} from "@/shared/providers/notification-provider";

const mockPush = jest.fn();
const mockInvalidate = jest.fn();
const mockRegister = jest.fn();
const mockUnregister = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: "project-id" } } },
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    session: { access_token: "access-token" },
    state: "ready",
  }),
}));

jest.mock("@/shared/household-api", () => ({
  householdActivityKey: ["household", "activity"],
  registerNotificationDevice: (...args: unknown[]) => mockRegister(...args),
  unregisterNotificationDevice: (...args: unknown[]) => mockUnregister(...args),
}));

let controls: ReturnType<typeof useNotifications>;

function Harness() {
  const notifications = useNotifications();
  controls = notifications;
  return (
    <>
      <Text testID="notification-state">
        {notifications.enabled ? "on" : "off"}
      </Text>
      <Text testID="notification-error">{notifications.error ?? ""}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void notifications
            .setEnabled(!notifications.enabled)
            .catch(() => undefined);
        }}
      >
        <Text>Toggle notifications</Text>
      </Pressable>
    </>
  );
}

const enabledKey = "household-recipe-notifications-enabled";
const tokenKey = "household-recipe-notifications-token";
const token = "ExponentPushToken[test-token]";

describe("NotificationProvider", () => {
  let storage: Record<string, string>;
  let appStateListener: (state: AppStateStatus) => void;

  async function mount() {
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() => expect(controls.isPending).toBe(false));
  }

  async function resume() {
    await act(async () => {
      appStateListener("background");
      appStateListener("active");
    });
    await waitFor(() => expect(controls.isPending).toBe(false));
  }

  function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    storage = {};
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    mockRegister.mockResolvedValue(undefined);
    mockUnregister.mockResolvedValue(undefined);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => storage[key] ?? null,
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        storage[key] = value;
      },
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(
      async (key: string) => {
        delete storage[key];
      },
    );
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      null,
    );
    (
      Notifications.clearLastNotificationResponse as jest.Mock
    ).mockImplementation(() => {
      (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
        null,
      );
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: token,
    });
  });

  it("starts off and registers only after permission is granted", async () => {
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    expect(screen.getByTestId("notification-state")).toHaveTextContent("off");

    await fireEvent.press(
      screen.getByRole("button", { name: "Toggle notifications" }),
    );

    await waitFor(() => expect(mockRegister).toHaveBeenCalled());
    expect(mockRegister).toHaveBeenCalledWith(
      "access-token",
      token,
      expect.stringMatching(/^(android|ios)$/),
      null,
    );
    expect(storage).toMatchObject({ [enabledKey]: "true", [tokenKey]: token });
    expect(screen.getByTestId("notification-state")).toHaveTextContent("on");
  });

  it("shows enabling immediately without duplicating registration on resume", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    const permission = deferred<{ granted: boolean }>();
    (Notifications.requestPermissionsAsync as jest.Mock).mockReturnValueOnce(
      permission.promise,
    );
    await mount();

    let enabling!: Promise<void>;
    await act(async () => {
      enabling = controls.setEnabled(true);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1),
    );
    expect(controls.enabled).toBe(true);
    expect(controls.isPending).toBe(true);
    expect(mockRegister).not.toHaveBeenCalled();

    let duplicate!: Promise<void>;
    await act(async () => {
      appStateListener("background");
      appStateListener("active");
      duplicate = controls.setEnabled(true);
      await duplicate;
    });

    await act(async () => {
      permission.resolve({ granted: true });
      await enabling;
    });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(controls.enabled).toBe(true);
    expect(controls.isPending).toBe(false);
    expect(controls.error).toBeNull();
  });

  it("keeps the preference off when permission is denied", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Toggle notifications" }),
    );

    await waitFor(() =>
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledWith({
        ios: { allowAlert: true, allowBadge: false, allowSound: false },
      }),
    );
    expect(mockRegister).not.toHaveBeenCalled();
    expect(storage[enabledKey]).toBeUndefined();
    expect(screen.getByTestId("notification-state")).toHaveTextContent("off");
  });

  it("rolls back the switch when device registration fails", async () => {
    mockRegister.mockRejectedValueOnce(new Error("offline"));
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Toggle notifications" }),
    );
    expect(screen.getByTestId("notification-state")).toHaveTextContent("on");
    expect(controls.isPending).toBe(true);

    await waitFor(() =>
      expect(screen.getByTestId("notification-error")).toHaveTextContent(
        "Couldn’t update notifications. Check your connection and try again.",
      ),
    );
    expect(storage[enabledKey]).toBeUndefined();
    expect(storage[tokenKey]).toBeUndefined();
    expect(screen.getByTestId("notification-state")).toHaveTextContent("off");
  });

  it("unregisters before clearing an enabled device", async () => {
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Toggle notifications" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("notification-state")).toHaveTextContent("on"),
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Toggle notifications" }),
    );

    await waitFor(() =>
      expect(mockUnregister).toHaveBeenCalledWith("access-token", token),
    );
    expect(storage[enabledKey]).toBeUndefined();
    expect(storage[tokenKey]).toBeUndefined();
    expect(screen.getByTestId("notification-state")).toHaveTextContent("off");
  });

  it("refreshes a changed token on startup without requesting permission", async () => {
    storage[enabledKey] = "true";
    storage[tokenKey] = "ExponentPushToken[old-token]";
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        "access-token",
        token,
        expect.stringMatching(/^(android|ios)$/),
        "ExponentPushToken[old-token]",
      ),
    );
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(storage[tokenKey]).toBe(token);
  });

  it("finishes enabling after Open settings without prompting again", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await mount();
    await act(async () => controls.setEnabled(true));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await act(async () =>
      buttons
        .find((button: { text: string }) => button.text === "Open settings")
        .onPress(),
    );
    await waitFor(() => expect(Linking.openSettings).toHaveBeenCalled());
    expect(storage[enabledKey]).toBe("true");

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    await resume();
    expect(controls.enabled).toBe(true);
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("does not opt in on return after cancelling the settings alert", async () => {
    storage[enabledKey] = "true";
    storage[tokenKey] = token;
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await mount();
    await act(async () => controls.setEnabled(true));
    const cancel = (Alert.alert as jest.Mock).mock.calls[0][2][0];
    expect(cancel.style).toBe("cancel");
    await act(async () => cancel.onPress?.());
    await waitFor(() => expect(controls.isPending).toBe(false));
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    await resume();
    expect(storage[enabledKey]).toBeUndefined();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(controls.enabled).toBe(false);
  });

  it("preserves intent through OS revocation and restores registration", async () => {
    storage[enabledKey] = "true";
    storage[tokenKey] = token;
    await mount();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await resume();
    expect(controls.enabled).toBe(false);
    expect(mockUnregister).toHaveBeenCalledWith("access-token", token);
    expect(storage[tokenKey]).toBeUndefined();
    expect(storage[enabledKey]).toBe("true");

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    await resume();
    expect(controls.enabled).toBe(true);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    await act(async () => controls.setEnabled(false));
    await resume();
    expect(controls.enabled).toBe(false);
    expect(storage[enabledKey]).toBeUndefined();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it("retains revoked tokens after failed cleanup and retries on return", async () => {
    storage[enabledKey] = "true";
    storage[tokenKey] = token;
    await mount();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    mockUnregister.mockRejectedValueOnce(new Error("offline"));
    await resume();
    expect(controls.enabled).toBe(false);
    expect(controls.error).not.toBeNull();
    expect(storage[tokenKey]).toBe(token);
    expect(storage[enabledKey]).toBe("true");
    await resume();
    expect(mockUnregister).toHaveBeenCalledTimes(2);
    expect(storage[tokenKey]).toBeUndefined();
    expect(controls.error).toBeNull();
  });

  it.each(["startup", "foreground"])(
    "waits for %s registration before signing out",
    async (source) => {
      storage[enabledKey] = "true";
      storage[tokenKey] = token;
      const registration = deferred();
      if (source === "foreground") await mount();
      mockRegister.mockReturnValueOnce(registration.promise);
      if (source === "startup") {
        await render(
          <NotificationProvider>
            <Harness />
          </NotificationProvider>,
        );
      } else {
        await act(async () => {
          appStateListener("background");
          appStateListener("active");
        });
      }
      await waitFor(() =>
        expect(mockRegister).toHaveBeenCalledTimes(
          source === "startup" ? 1 : 2,
        ),
      );
      let signingOut!: Promise<void>;
      await act(async () => {
        signingOut = controls.prepareForSignOut();
        appStateListener("background");
        appStateListener("active");
        await controls.setEnabled(true);
      });
      expect(mockUnregister).not.toHaveBeenCalled();
      await act(async () => {
        registration.resolve();
        await signingOut;
      });
      expect(mockUnregister).toHaveBeenCalledWith("access-token", token);
      expect(storage[tokenKey]).toBeUndefined();
      expect(storage[enabledKey]).toBeUndefined();
      expect(controls.enabled).toBe(false);
      await resume();
      expect(mockRegister).toHaveBeenCalledTimes(source === "startup" ? 1 : 2);
    },
  );

  it("orders disable after in-flight registration", async () => {
    await mount();
    const registration = deferred();
    mockRegister.mockReturnValueOnce(registration.promise);
    let enabling!: Promise<void>;
    let disabling!: Promise<void>;
    await act(async () => {
      enabling = controls.setEnabled(true);
    });
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    await act(async () => {
      disabling = controls.setEnabled(false);
    });
    expect(mockUnregister).not.toHaveBeenCalled();
    await act(async () => {
      registration.resolve();
      await Promise.all([enabling, disabling]);
    });
    await resume();
    expect(controls.enabled).toBe(false);
    expect(storage[enabledKey]).toBeUndefined();
    expect(mockUnregister).toHaveBeenCalledWith("access-token", token);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("cleans up uncertain registration during sign-out even with no saved opt-in", async () => {
    await mount();
    mockRegister.mockRejectedValueOnce(new Error("response lost"));
    await act(async () => {
      await expect(controls.setEnabled(true)).rejects.toThrow();
    });
    expect(controls.enabled).toBe(false);
    expect(storage[enabledKey]).toBeUndefined();
    mockUnregister.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(controls.prepareForSignOut()).rejects.toThrow();
    });
    await act(async () => controls.prepareForSignOut());
    expect(mockUnregister).toHaveBeenCalledTimes(2);
    expect(mockUnregister).toHaveBeenLastCalledWith("access-token", token);
  });

  it.each([false, true])(
    "rolls back a storage failure and retains cleanup retries (offline: %s)",
    async (offline) => {
      await mount();
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("storage unavailable"),
      );
      if (offline) mockUnregister.mockRejectedValueOnce(new Error("offline"));
      await act(async () => {
        await expect(controls.setEnabled(true)).rejects.toThrow();
      });
      expect(controls.enabled).toBe(false);
      expect(storage[enabledKey]).toBeUndefined();
      expect(mockUnregister).toHaveBeenCalledWith("access-token", token);
      await act(async () => controls.prepareForSignOut());
      expect(mockUnregister).toHaveBeenCalledTimes(offline ? 2 : 1);
      expect(storage[tokenKey]).toBeUndefined();
    },
  );

  it("ignores an old Settings action after sign-out cleanup", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await mount();
    await act(async () => controls.setEnabled(true));
    const openSettings = (Alert.alert as jest.Mock).mock.calls[0][2][1].onPress;
    await act(async () => controls.prepareForSignOut());
    await act(async () => openSettings());
    await waitFor(() => expect(controls.isPending).toBe(false));
    expect(Linking.openSettings).not.toHaveBeenCalled();
    expect(storage[enabledKey]).toBeUndefined();
  });

  it("invalidates activity and handles a cold-start response once", async () => {
    const recipeId = "22222222-2222-4222-8222-222222222222";
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue({
      notification: {
        request: {
          content: {
            data: {
              kind: "household_recipe_activity",
              action: "edited",
              recipe_id: recipeId,
            },
          },
        },
      },
    });

    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/recipe/${recipeId}`),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(
      1,
    );
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["household", "activity"],
    });
  });

  it("invalidates activity when a foreground notification arrives", async () => {
    await render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    const listener = (
      Notifications.addNotificationReceivedListener as jest.Mock
    ).mock.calls[0][0];

    await act(async () => listener({}));

    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["household", "activity"],
    });
  });
});
