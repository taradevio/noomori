import { act, render, screen } from "@testing-library/react-native";

import AuthenticatedJoinHousehold from "@/app/household/join";
import { joinErrorMessage } from "@/app/onboarding/join-household";
import { HouseholdApiError } from "@/shared/household-api";

const mockUseMutation = jest.fn();
const mockReplace = jest.fn();
const mockCancelQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockRefreshUserState = jest.fn();

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()) }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({
    cancelQueries: mockCancelQueries,
    invalidateQueries: jest.fn(),
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

describe("authenticated household switching", () => {
  beforeEach(() => {
    mockCancelQueries.mockResolvedValue(undefined);
    mockUseMutation.mockReturnValue({
      error: null,
      isError: false,
      isPending: false,
      mutate: jest.fn(),
      reset: jest.fn(),
    });
  });

  it("reuses the join form with parked-household context", async () => {
    await render(<AuthenticatedJoinHousehold />);

    expect(screen.getByText("Join another household")).toBeTruthy();
    expect(screen.getByText(/household will stay saved/i)).toBeTruthy();
  });

  it("clears household-dependent recipe state before replacing the route", async () => {
    await render(<AuthenticatedJoinHousehold />);
    const joinOptions = mockUseMutation.mock.calls[1]?.[0] as {
      onSuccess: () => Promise<void>;
    };

    await act(async () => {
      await joinOptions.onSuccess();
    });

    expect(mockCancelQueries).toHaveBeenCalledWith({
      queryKey: ["household"],
    });
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["recipes"] });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["household"],
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["recipes"] });
    expect(mockReplace).toHaveBeenCalledWith("/household");
    expect(mockRefreshUserState).not.toHaveBeenCalled();
  });

  it("explains why a household with another member cannot switch", () => {
    expect(
      joinErrorMessage(
        new HouseholdApiError(
          "Your household must have only you before you can join another",
          409,
          null,
        ),
      ),
    ).toBe("You can only join another household when no one else is in yours.");
  });
});
