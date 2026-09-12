import { fireEvent, render, screen } from "@testing-library/react-native";

import { RootNavigator } from "@/app/_layout";

const mockRefreshUserState = jest.fn();
const mockSignOut = jest.fn();
let mockSessionState = "error";
let mockIsSigningOut = false;
let mockSignOutError: string | null = null;

jest.mock("@/global.css", () => ({}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  setOptions: jest.fn(),
}));

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  Stack: () => null,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    refreshUserState: mockRefreshUserState,
    state: mockSessionState,
  }),
}));

jest.mock("@/shared/providers/use-local-sign-out", () => ({
  useLocalSignOut: () => ({
    isSigningOut: mockIsSigningOut,
    signOut: mockSignOut,
    signOutError: mockSignOutError,
  }),
}));

describe("auth gate", () => {
  beforeEach(() => {
    mockSessionState = "error";
    mockIsSigningOut = false;
    mockSignOutError = null;
    mockRefreshUserState.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
  });

  it("offers retry and sign out after account loading fails", async () => {
    await render(<RootNavigator />);

    expect(screen.getByText("Couldn’t load your account")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

    expect(mockRefreshUserState).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("disables recovery actions and reports a sign-out failure", async () => {
    mockIsSigningOut = true;
    mockSignOutError =
      "Couldn’t sign out. Check your connection and try again.";
    await render(<RootNavigator />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
    expect(
      screen.getByText(
        "Couldn’t sign out. Check your connection and try again.",
      ),
    ).toBeTruthy();
  });

  it("shows in-app progress for later loading transitions", async () => {
    mockSessionState = "loading";
    await render(<RootNavigator />);

    expect(screen.getByText("Loading your account…")).toBeTruthy();
  });
});
