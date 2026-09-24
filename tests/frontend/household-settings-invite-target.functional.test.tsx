import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { AccessibilityInfo, Alert } from "react-native";

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
const mockGenerateHouseholdCode = jest.fn();
const mockRevokeMutate = jest.fn();
const mockLeaveMutate = jest.fn();
let mockMutationCallIndex = 0;

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

jest.mock("@/shared/household-api", () => ({
  generateHouseholdCode: (...args: unknown[]) =>
    mockGenerateHouseholdCode(...args),
  getHouseholdSettings: jest.fn(),
  leaveHousehold: jest.fn(),
  revokeHouseholdCode: jest.fn(),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    refreshUserState: mockRefreshUserState,
    session: { access_token: "access-token", user: { id: "owner-id" } },
  }),
}));

jest.mock("@/shared/ui", () => ({
  ...jest.requireActual("@/shared/ui"),
  toast: { success: jest.fn() },
}));

const ownerSettings = {
  active_code_expires_at: null,
  household_id: "household-id",
  household_name: "Home",
  member_count: 1,
  members: [{ display_name: "Sarah", role: "owner", user_id: "owner-id" }],
  role: "owner",
  shared_recipe_count: 0,
  pending_handoff_recipe_count: 0,
};

describe("Household invite route target", () => {
  beforeEach(() => {
    mockMutationCallIndex = 0;
    mockCancelQueries.mockResolvedValue(undefined);
    mockGenerateHouseholdCode.mockResolvedValue({
      code: "123456",
      expires_at: "2026-09-23T12:00:00Z",
    });
    mockRefreshUserState.mockResolvedValue(undefined);
    mockUseMutation.mockImplementation(() => {
      const mutation =
        mockMutationCallIndex % 2 === 0
          ? {
              isPending: false,
              mutate: mockRevokeMutate,
            }
          : {
              isPending: false,
              mutate: mockLeaveMutate,
            };
      mockMutationCallIndex += 1;
      return mutation;
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

  it("uses branded confirmation and specific safe copy when replacing a code", async () => {
    const nativeAlert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockUseQuery.mockReturnValue({
      data: {
        ...ownerSettings,
        active_code_expires_at: "2026-09-23T12:00:00Z",
      },
      isError: false,
      isPending: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    await render(<HouseholdSettingsScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Create new code" }),
    );

    expect(screen.getByText("Create a new join code?")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Keep current code" }),
    ).toBeTruthy();
    expect(screen.getByTestId("confirmation-dialog-confirm")).toHaveProp(
      "accessibilityLabel",
      "Create new code",
    );
    expect(nativeAlert).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("confirmation-dialog-cancel"));
    expect(mockGenerateHouseholdCode).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("button", { name: "Create new code" }),
    );
    await fireEvent.press(screen.getByTestId("confirmation-dialog-confirm"));

    await waitFor(() =>
      expect(mockGenerateHouseholdCode).toHaveBeenCalledWith("access-token"),
    );
    expect(mockRevokeMutate).not.toHaveBeenCalled();
    expect(mockLeaveMutate).not.toHaveBeenCalled();
  });

  it("uses branded destructive confirmation when deactivating a code", async () => {
    const nativeAlert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockUseQuery.mockReturnValue({
      data: {
        ...ownerSettings,
        active_code_expires_at: "2026-09-23T12:00:00Z",
      },
      isError: false,
      isPending: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    await render(<HouseholdSettingsScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Deactivate code" }),
    );

    expect(screen.getByText("Deactivate this join code?")).toBeTruthy();
    expect(screen.getByText("This join code will stop working.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep code" })).toBeTruthy();
    expect(screen.getByTestId("confirmation-dialog-confirm")).toHaveProp(
      "accessibilityLabel",
      "Deactivate code",
    );
    expect(nativeAlert).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("confirmation-dialog-confirm"));
    expect(mockRevokeMutate).toHaveBeenCalledTimes(1);
    expect(mockLeaveMutate).not.toHaveBeenCalled();
  });

  it("uses branded destructive confirmation with the leave consequences", async () => {
    const nativeAlert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockUseQuery.mockReturnValue({
      data: {
        ...ownerSettings,
        role: "member",
        shared_recipe_count: 3,
      },
      isError: false,
      isPending: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
    await render(<HouseholdSettingsScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Leave household" }),
    );

    expect(screen.getByText("Leave “Home”?")).toBeTruthy();
    expect(
      screen.getByText(/3 recipes you shared will stay behind/i),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("confirmation-dialog")).getByText(
        /Your own recipes will stay with you\./i,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/create or join another household afterward/i),
    ).toBeNull();
    expect(screen.getByTestId("confirmation-dialog-cancel")).toHaveProp(
      "accessibilityLabel",
      "Cancel",
    );
    expect(screen.getByTestId("confirmation-dialog-confirm")).toHaveProp(
      "accessibilityLabel",
      "Leave household",
    );
    expect(nativeAlert).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("confirmation-dialog-confirm"));
    expect(mockLeaveMutate).toHaveBeenCalledTimes(1);
    expect(mockRevokeMutate).not.toHaveBeenCalled();
  });
});
