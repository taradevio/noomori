import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import HouseholdSettingsScreen from "@/app/household/settings";

const mockScrollTo = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseQuery = jest.fn();

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
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutate: jest.fn() }),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    refreshUserState: jest.fn(),
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
  members: [
    { display_name: "Sarah", role: "owner", user_id: "owner-id" },
  ],
  role: "owner",
};

describe("Household invite route target", () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ section: "invite" });
    mockUseQuery.mockReturnValue({
      data: ownerSettings,
      isError: false,
      isPending: false,
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

    await fireEvent(screen.getByText("Invite member"), "layout", {
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

    await fireEvent(screen.getByText("Invite member"), "layout", {
      nativeEvent: { layout: { y: 360 } },
    });

    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("does not jump for a non-owner", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...ownerSettings, role: "member" },
      isError: false,
      isPending: false,
      refetch: jest.fn(),
    });
    await render(<HouseholdSettingsScreen />);

    expect(screen.getByText(/invitations are managed by the Owner/)).toBeTruthy();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});
