import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import AccountScreen from "@/app/(tabs)/account";

const mockPush = jest.fn();
const mockClear = jest.fn();
const mockSignOut = jest.fn();
const mockUseQuery = jest.fn();
const mockSetNotificationsEnabled = jest.fn();
const mockPrepareForSignOut = jest.fn();
const mockNotifications = {
  available: false,
  enabled: false,
  error: null as string | null,
  isPending: false,
};
const mockSession = {
  access_token: "access-token",
  user: {
    email: "sarah@noomori.test",
    user_metadata: { full_name: "Sarah Mitchell" },
  },
};

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.0" } },
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({ clear: mockClear }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  },
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ session: mockSession }),
}));

jest.mock("@/shared/providers/notification-provider", () => ({
  useNotifications: () => ({
    ...mockNotifications,
    setEnabled: mockSetNotificationsEnabled,
    prepareForSignOut: mockPrepareForSignOut,
  }),
}));

describe("Account settings", () => {
  beforeEach(() => {
    mockSignOut.mockResolvedValue({ error: null });
    mockPrepareForSignOut.mockResolvedValue(undefined);
    mockSetNotificationsEnabled.mockResolvedValue(undefined);
    mockUseQuery.mockReturnValue({ data: undefined });
    Object.assign(mockNotifications, {
      available: false,
      enabled: false,
      error: null,
      isPending: false,
    });
  });

  it("shows real account capabilities in the compact settings layout", async () => {
    await render(<AccountScreen />);

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Sarah Mitchell")).toBeTruthy();
    expect(screen.getByText("sarah@noomori.test")).toBeTruthy();
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.queryByText("Send feedback")).toBeNull();
    expect(screen.queryByText("Report a problem")).toBeNull();
    expect(screen.queryByText("Privacy Policy")).toBeNull();
    expect(screen.queryByText("Terms of Service")).toBeNull();
  });

  it("opens the existing household settings route", async () => {
    await render(<AccountScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Household settings" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/household/settings");
  });

  it("shows one device notification switch for a multi-member household", async () => {
    mockNotifications.available = true;
    mockUseQuery.mockReturnValue({ data: { member_count: 2 } });
    await render(<AccountScreen />);

    const toggle = screen.getByRole("switch", {
      name: "Recipe activity",
    });
    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByText("Recipe activity")).toBeTruthy();
    expect(toggle).not.toBeChecked();

    await fireEvent(toggle, "valueChange", true);
    expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(true);
  });

  it("shows a pending notification enable as checked and disabled", async () => {
    Object.assign(mockNotifications, {
      available: true,
      enabled: true,
      isPending: true,
    });
    mockUseQuery.mockReturnValue({ data: { member_count: 2 } });
    await render(<AccountScreen />);

    const toggle = screen.getByRole("switch", {
      name: "Recipe activity",
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
  });

  it("keeps notification settings hidden for a solo household", async () => {
    mockNotifications.available = true;
    mockUseQuery.mockReturnValue({ data: { member_count: 1 } });
    await render(<AccountScreen />);

    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("signs out locally once and clears private cached data", async () => {
    let finishSignOut: (value: { error: null }) => void = () => undefined;
    mockSignOut.mockReturnValue(
      new Promise((resolve) => {
        finishSignOut = resolve;
      }),
    );
    await render(<AccountScreen />);

    const signOut = screen.getByRole("button", { name: "Sign out" });
    await fireEvent.press(signOut);
    await fireEvent.press(signOut);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockPrepareForSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByText("Signing out…")).toBeTruthy();

    await act(async () => finishSignOut({ error: null }));
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("reports a sign-out failure and allows recovery", async () => {
    mockSignOut
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValueOnce({ error: null });
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText(
        "Couldn’t sign out. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
  });

  it("retains the session when notification cleanup fails", async () => {
    mockPrepareForSignOut.mockRejectedValueOnce(new Error("offline"));
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Couldn’t sign out. Check your connection and try again.",
      ),
    ).toBeTruthy();
  });
});
