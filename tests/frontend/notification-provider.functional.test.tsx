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
import { Pressable, Text } from "react-native";

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

function Harness() {
  const notifications = useNotifications();
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

  beforeEach(() => {
    storage = {};
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
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(null);
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

    await fireEvent.press(screen.getByRole("button", { name: "Toggle notifications" }));

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

    await fireEvent.press(screen.getByRole("button", { name: "Toggle notifications" }));

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

    await fireEvent.press(screen.getByRole("button", { name: "Toggle notifications" }));

    await waitFor(() =>
      expect(screen.getByTestId("notification-error")).toHaveTextContent(
        "Couldn’t update notifications",
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
    await fireEvent.press(screen.getByRole("button", { name: "Toggle notifications" }));
    await waitFor(() => expect(screen.getByTestId("notification-state")).toHaveTextContent("on"));

    await fireEvent.press(screen.getByRole("button", { name: "Toggle notifications" }));

    await waitFor(() => expect(mockUnregister).toHaveBeenCalledWith("access-token", token));
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

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/recipe/${recipeId}`));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
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
    const listener = (Notifications.addNotificationReceivedListener as jest.Mock)
      .mock.calls[0][0];

    await act(async () => listener({}));

    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["household", "activity"],
    });
  });
});
