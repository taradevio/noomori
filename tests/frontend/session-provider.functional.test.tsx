import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";
import { Pressable, Text } from "react-native";

import {
  SessionProvider,
  useSession,
} from "@/shared/providers/session-providers";

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockProfileRead = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: () => mockProfileRead(userId),
        }),
      }),
    }),
  },
}));

type AuthListener = (event: string, session: Session | null) => void;

let authListener: AuthListener = () => undefined;

function session(userId: string, accessToken = `${userId}-token`) {
  return {
    access_token: accessToken,
    user: { id: userId },
  } as Session;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Probe() {
  const { refreshUserState, session: currentSession, state } = useSession();
  return (
    <>
      <Text testID="session-state">{state}</Text>
      <Text testID="session-user">{currentSession?.user.id ?? "none"}</Text>
      <Text testID="session-token">
        {currentSession?.access_token ?? "none"}
      </Text>
      <Pressable
        accessibilityLabel="Refresh user state"
        accessibilityRole="button"
        onPress={() => void refreshUserState()}
      />
    </>
  );
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function emit(event: string, nextSession: Session | null) {
  await act(async () => {
    authListener(event, nextSession);
    jest.advanceTimersByTime(0);
    await flush();
  });
}

describe("SessionProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockProfileRead.mockReset();
    mockUnsubscribe.mockReset();
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    mockOnAuthStateChange.mockImplementation((listener: AuthListener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves an empty initial session to signed out", async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await emit("INITIAL_SESSION", null);

    expect(screen.getByTestId("session-state")).toHaveTextContent("signed-out");
    expect(mockProfileRead).not.toHaveBeenCalled();
  });

  it("loads a profile once and only updates the token for duplicate events", async () => {
    mockProfileRead.mockResolvedValue({
      data: { onboarding_completed_at: "2026-09-07T00:00:00Z" },
      error: null,
    });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await emit("INITIAL_SESSION", session("user-a", "first-token"));
    expect(screen.getByTestId("session-state")).toHaveTextContent("ready");

    await emit("TOKEN_REFRESHED", session("user-a", "fresh-token"));

    expect(screen.getByTestId("session-state")).toHaveTextContent("ready");
    expect(screen.getByTestId("session-token")).toHaveTextContent(
      "fresh-token",
    );
    expect(mockProfileRead).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale user failure after the next user becomes ready", async () => {
    const userA = deferred<{
      data: null;
      error: { code: string; message: string };
    }>();
    const userB = deferred<{
      data: { onboarding_completed_at: string };
      error: null;
    }>();
    mockProfileRead.mockImplementation((userId: string) =>
      userId === "user-a" ? userA.promise : userB.promise,
    );
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await emit("SIGNED_IN", session("user-a"));
    await emit("SIGNED_IN", session("user-b"));
    await act(async () => {
      userB.resolve({
        data: { onboarding_completed_at: "2026-09-07T00:00:00Z" },
        error: null,
      });
      await flush();
    });
    await act(async () => {
      userA.resolve({
        data: null,
        error: { code: "PGRST301", message: "Invalid JWT" },
      });
      await flush();
    });

    expect(screen.getByTestId("session-user")).toHaveTextContent("user-b");
    expect(screen.getByTestId("session-state")).toHaveTextContent("ready");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shows a controlled error and recovers through manual retry", async () => {
    const currentSession = session("user-a");
    mockProfileRead
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST301", message: "Invalid JWT" },
      })
      .mockResolvedValueOnce({
        data: { onboarding_completed_at: "2026-09-07T00:00:00Z" },
        error: null,
      });
    mockGetSession.mockResolvedValue({
      data: { session: currentSession },
      error: null,
    });
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await emit("SIGNED_IN", currentSession);
    expect(screen.getByTestId("session-state")).toHaveTextContent("error");

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Refresh user state" }),
      );
      await flush();
    });

    expect(screen.getByTestId("session-state")).toHaveTextContent("ready");
    expect(mockProfileRead).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalled();
  });
});
