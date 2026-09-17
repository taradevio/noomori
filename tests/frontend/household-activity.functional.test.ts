import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import HouseholdActivityScreen from "@/app/activity";
import { formatHouseholdActivityTime } from "@/shared/household-activity";

const mockRefetch = jest.fn();
const mockMarkActivityRead = jest.fn();

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useFocusEffect: jest.fn(),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ session: { access_token: "access-token" } }),
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: mockMarkActivityRead }),
  useQuery: () => ({
    data: {
      activities: [],
      latest_activity_id: null,
      member_count: 2,
      unread_count: 0,
    },
    isError: false,
    isPending: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));

const now = new Date("2026-08-29T12:00:00Z");

describe("household activity time formatting", () => {
  it.each([
    ["2026-08-29T11:59:45Z", "Just now"],
    ["2026-08-29T11:59:00Z", "1 minute ago"],
    ["2026-08-29T11:55:00Z", "5 minutes ago"],
    ["2026-08-29T11:00:00Z", "1 hour ago"],
    ["2026-08-29T10:00:00Z", "2 hours ago"],
    ["2026-08-28T12:00:00Z", "yesterday"],
    ["2026-08-27T12:00:00Z", "2 days ago"],
    ["2026-08-29T12:01:00Z", "Just now"],
    ["not-a-date", ""],
  ])("formats %s as %s", (createdAt, expected) => {
    expect(formatHouseholdActivityTime(createdAt, now, "en")).toBe(expected);
  });

  it("formats older activity as a date", () => {
    expect(formatHouseholdActivityTime("2026-08-20T12:00:00Z", now, "en")).toBe(
      "Aug 20",
    );
  });

  it("does not require Intl.RelativeTimeFormat", () => {
    const original = Intl.RelativeTimeFormat;
    Object.defineProperty(Intl, "RelativeTimeFormat", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(
        formatHouseholdActivityTime("2026-08-29T11:55:00Z", now, "en"),
      ).toBe("5 minutes ago");
    } finally {
      Object.defineProperty(Intl, "RelativeTimeFormat", {
        configurable: true,
        value: original,
      });
    }
  });

  it("refreshes an empty activity list and marks the newest item read", async () => {
    mockRefetch.mockResolvedValue({
      data: {
        activities: [],
        latest_activity_id: 42,
        member_count: 2,
        unread_count: 1,
      },
    });
    await render(React.createElement(HouseholdActivityScreen));

    await act(async () => {
      fireEvent(screen.getByTestId("household-activity-list"), "refresh");
      await Promise.resolve();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockMarkActivityRead).toHaveBeenCalledWith(42);
  });
});
