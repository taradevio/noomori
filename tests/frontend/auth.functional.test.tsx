// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import AuthScreen from "@/shared/components/auth/auth-screen";
import Onboarding from "@/app/onboarding";
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
  it("uses Google's official light button treatment", async () => {
    await render(<GoogleSignInButton />);

    const button = screen.getByRole("button", {
      name: "Sign in with Google",
    });
    const surface = screen.getByTestId("google-sign-in-surface");
    const label = screen.getByText("Sign in with Google");

    expect(button.props.className).toContain("h-[52px] w-[220px]");
    expect(button.props.className).toContain("focus:border-primary");
    expect(button.props.className).toContain("active:scale-[0.99]");
    expect(surface.props.className).toContain("h-12 w-[216px]");
    expect(surface.props.className).toContain("border-[#747775] bg-white");
    expect(surface.props.className).toContain("android:gap-[10px] android:px-3");
    expect(surface.props.className).toContain("ios:gap-3 ios:px-4");
    expect(surface.props.className).toContain("web:gap-[10px] web:px-3");
    expect(label.props.className).toContain(
      "text-sm font-medium leading-5 text-[#1F1F1F]",
    );
    expect(screen.getByTestId("google-sign-in-logo")).toHaveStyle({
      height: 20,
      width: 20,
    });
  });

  it("uses the welcome copy without a wordmark", async () => {
    await render(<AuthScreen />);

    expect(screen.getByText("Your recipes. A little more home.")).toBeTruthy();
    expect(
      screen.getByText(
        "Save the dishes you love, make them your own, and share them with your household.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("noomori")).toBeNull();
  });

  it("introduces household sharing with both existing actions", async () => {
    await render(<Onboarding />);

    expect(screen.getByText("Good food brings us together.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create household" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join household" })).toBeTruthy();
    expect(screen.queryByText("Your household")).toBeNull();
  });

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

  it("keeps the light surface while submitting and ignores duplicate presses", async () => {
    let resolveBrowser!: (result: { type: "cancel" }) => void;
    mockOpenAuthSessionAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBrowser = resolve;
        }),
    );

    await render(<GoogleSignInButton />);
    const idleSurfaceClasses = screen.getByTestId("google-sign-in-surface")
      .props.className;

    await fireEvent.press(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );

    const submittingButton = await screen.findByRole("button", {
      name: "Signing in with Google",
    });
    expect(submittingButton).toBeDisabled();
    expect(submittingButton).toHaveProp("accessibilityState", {
      busy: true,
      disabled: true,
    });
    expect(screen.getByText("Signing you in…")).toBeTruthy();
    expect(screen.getByTestId("google-sign-in-surface").props.className).toBe(
      idleSurfaceClasses,
    );

    await fireEvent.press(submittingButton);
    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1);

    await act(async () => resolveBrowser({ type: "cancel" }));
    await screen.findByRole("button", { name: "Sign in with Google" });
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
