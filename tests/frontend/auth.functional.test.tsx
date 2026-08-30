// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { GoogleSignInButton } from "@/shared/components/auth/google-sign-in-button";

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), setSession: jest.fn() } },
}));

jest.mock("expo-linking", () => ({ createURL: () => "noomori://" }));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

const mockedSupabase = jest.requireMock("@/lib/supabase").supabase;
const mockedWebBrowser = jest.requireMock("expo-web-browser");
const mockSignInWithOAuth = mockedSupabase.auth.signInWithOAuth as jest.Mock;
const mockSetSession = mockedSupabase.auth.setSession as jest.Mock;
const mockOpenAuthSessionAsync = mockedWebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  mockSignInWithOAuth.mockReset();
  mockSetSession.mockReset();
  mockOpenAuthSessionAsync.mockReset();
  mockSignInWithOAuth.mockResolvedValue({
    data: { url: "https://accounts.google.test" },
    error: null,
  });
});

describe("authentication workflow", () => {
  it("opens Google and establishes the returned session", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "noomori://#access_token=access&refresh_token=refresh",
    });
    mockSetSession.mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });

    await render(<GoogleSignInButton />);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "access",
        refresh_token: "refresh",
      });
    });
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      "https://accounts.google.test",
      "noomori://",
      { showInRecents: true },
    );
  });

  it("returns to idle without an error when authentication is cancelled", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "cancel" });

    await render(<GoogleSignInButton />);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with Google" }));

    await screen.findByRole("button", { name: "Sign in with Google" });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn.t sign you in/i)).toBeNull();
  });

  it("shows an actionable offline error and allows retry", async () => {
    mockSignInWithOAuth.mockRejectedValue(new TypeError("Network request failed"));

    await render(<GoogleSignInButton />);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(await screen.findByText("You’re offline. Connect to the internet and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  });
});
