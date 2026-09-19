import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import HouseholdSettingsScreen from "@/app/household/settings";

const mockScrollTo = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCancelQueries = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockRefreshUserState = jest.fn();

jest.mock("react-native", () => {
  const React = jest.requireActual("react");
  const ReactNative = jest.requireActual("react-native");
  const MockScrollView = React.forwardRef(
    (
      { children, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref: React.ForwardedRef<{ scrollTo: typeof mockScrollTo }>,
    ) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return React.createElement(ReactNative.View, props, children);
    },
  );
  MockScrollView.displayName = "MockScrollView";

  return new Proxy(ReactNative, {
    get(target, property) {
      return property === "ScrollView"
        ? MockScrollView
        : Reflect.get(target, property, target);
    },
  });
});

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({
    cancelQueries: mockCancelQueries,
    invalidateQueries: mockInvalidateQueries,
    removeQueries: mockRemoveQueries,
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    refreshUserState: mockRefreshUserState,
    session: { access_token: "access-token", user: { id: "owner-id" } },
  }),
}));

jest.mock("@/shared/ui", () => ({
  toast: { success: jest.fn() },
}));

const ownerSettings = {
  active_code_expires_at: null,
  household_id: "household-id",
  household_name: "Home",
  member_count: 1,
  members: [{ display_name: "Sarah", role: "owner", user_id: "owner-id" }],
  role: "owner",
};

describe("Household invite route target", () => {
  beforeEach(() => {
    mockCancelQueries.mockResolvedValue(undefined);
    mockRefreshUserState.mockResolvedValue(undefined);
    mockUseMutation.mockReturnValue({
      isPending: false,
      mutate: jest.fn(),
    });
    mockUseLocalSearchParams.mockReturnValue({ section: "invite" });
    mockUseQuery.mockReturnValue({
      data: ownerSettings,
      isError: false,
      isPending: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    jest
      .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
      .mockImplementation(() => undefined);
    jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback: (time: number) => void) => {
        callback(0);
        return 1;
      });
    jest
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
  });

  it("scrolls and focuses the owner invite section once", async () => {
    const view = await render(<HouseholdSettingsScreen />);

    await fireEvent(screen.getByText("Invite someone"), "layout", {
      nativeEvent: { layout: { y: 360 } },
    });

    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, y: 344 });
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(
      expect.anything(),
      "focus",
    );

    await view.rerender(<HouseholdSettingsScreen />);
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
  });

  it("does not jump without the invite target", async () => {
    mockUseLocalSearchParams.mockReturnValue({});
    await render(<HouseholdSettingsScreen />);

    await fireEvent(screen.getByText("Invite someone"), "layout", {
      nativeEvent: { layout: { y: 360 } },
    });

    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("refreshes household settings from the native refresh control", async () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data: ownerSettings,
      isError: false,
      isPending: false,
      isRefetching: true,
      refetch,
    });
    await render(<HouseholdSettingsScreen />);

    const refreshControl = screen.getByTestId("household-settings-scroll").props
      .refreshControl;
    expect(refreshControl.props.refreshing).toBe(true);
    await act(() => refreshControl.props.onRefresh());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not jump for a non-owner", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...ownerSettings, role: "member" },
      isError: false,
      isPending: false,
      refetch: jest.fn(),
    });
    await render(<HouseholdSettingsScreen />);

    expect(
      screen.getByText("Only the household owner can invite people."),
    ).toBeTruthy();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("offers authenticated household switching only to a solo owner", async () => {
    await render(<HouseholdSettingsScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Join another household" }),
    );

    expect(
      screen.getByText(/household and its shared recipes will stay saved/i),
    ).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith("/household/join");

    mockUseQuery.mockReturnValue({
      data: { ...ownerSettings, member_count: 2 },
      isError: false,
      isPending: false,
      refetch: jest.fn(),
    });
    const view = await render(<HouseholdSettingsScreen />);
    expect(
      view.queryByRole("button", { name: "Join another household" }),
    ).toBeNull();
  });

  it("restores a parked household and replaces settings with the household tab", async () => {
    await render(<HouseholdSettingsScreen />);
    const leaveOptions = mockUseMutation.mock.calls[1]?.[0] as {
      onSuccess: (result: {
        status: "RESTORED";
        household: { id: string; name: string };
      }) => Promise<void>;
    };

    await act(async () => {
      await leaveOptions.onSuccess({
        status: "RESTORED",
        household: { id: "owned-home", name: "My kitchen" },
      });
    });

    expect(mockCancelQueries).toHaveBeenCalledWith({
      queryKey: ["household"],
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["recipes"],
    });
    expect(mockReplace).toHaveBeenCalledWith("/household");
    expect(mockRefreshUserState).not.toHaveBeenCalled();
  });

  it("continues to onboarding after an ordinary member leaves", async () => {
    await render(<HouseholdSettingsScreen />);
    const leaveOptions = mockUseMutation.mock.calls[1]?.[0] as {
      onSuccess: (result: { status: "LEFT"; household: null }) => Promise<void>;
    };

    await act(async () => {
      await leaveOptions.onSuccess({ status: "LEFT", household: null });
    });

    expect(mockRefreshUserState).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
