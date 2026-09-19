import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, StyleSheet } from "react-native";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
import * as Reanimated from "react-native-reanimated";

import {
  getToastDragOffset,
  shouldDismissToast,
  ToastHost,
  toast,
} from "@/shared/ui/toast";

function renderHost() {
  return render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastHost />
    </GestureHandlerRootView>,
  );
}

describe("global toast feedback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    toast.dismiss();
    jest
      .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
      .mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(() => toast.dismiss());
    jest.useRealTimers();
  });

  it("renders branded success and error states and ignores empty messages", async () => {
    await renderHost();

    let successId = 0;
    await act(() => {
      successId = toast.success("  Recipe saved  ");
    });

    expect(successId).toBeGreaterThan(0);
    expect(screen.getByText("Recipe saved")).toBeTruthy();
    expect(screen.getByTestId("toast-icon-success")).toBeTruthy();
    expect(screen.getByTestId("toast-status").props.className).toContain(
      "bg-success",
    );
    expect(screen.getByText("Recipe saved").props.className).toContain(
      "text-text-primary",
    );
    expect(screen.getByTestId("toast-surface").props.className).toContain(
      "rounded-[18px]",
    );
    expect(screen.getByTestId("toast-card").props.accessibilityLabel).toBe(
      "Success: Recipe saved",
    );
    expect(
      AccessibilityInfo.announceForAccessibilityWithOptions,
    ).toHaveBeenLastCalledWith("Success: Recipe saved", {
      priority: "low",
      queue: true,
    });
    expect(
      StyleSheet.flatten(screen.getByTestId("toast-viewport").props.style).top,
    ).toBe(12);

    await act(() => {
      toast.error("Recipe not saved");
    });

    expect(screen.queryByText("Recipe saved")).toBeNull();
    expect(screen.getByText("Recipe not saved")).toBeTruthy();
    expect(screen.getByTestId("toast-icon-error")).toBeTruthy();
    expect(screen.getByTestId("toast-status").props.className).toContain(
      "bg-error",
    );
    expect(screen.getByText("Recipe not saved").props.className).toContain(
      "text-on-primary",
    );
    expect(
      AccessibilityInfo.announceForAccessibilityWithOptions,
    ).toHaveBeenLastCalledWith("Error: Recipe not saved", {
      priority: "high",
      queue: false,
    });
    expect(toast.success("   ")).toBe(0);
    expect(screen.getByText("Recipe not saved")).toBeTruthy();
  });

  it("keeps the latest toast when an older dismissal arrives", async () => {
    await renderHost();

    let olderId = 0;
    await act(() => {
      olderId = toast.success("First result");
      toast.error("Latest result");
      toast.dismiss(olderId);
    });

    expect(screen.queryByText("First result")).toBeNull();
    expect(screen.getByText("Latest result")).toBeTruthy();

    await act(() => jest.advanceTimersByTime(5_999));
    expect(screen.getByText("Latest result")).toBeTruthy();

    await act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText("Latest result")).toBeNull();
  });

  it("dismisses with the close button", async () => {
    await renderHost();
    await act(() => {
      toast.success("Cookbook created");
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(screen.queryByText("Cookbook created")).toBeNull();
  });

  it("pauses the countdown while the app is inactive", async () => {
    let onAppStateChange: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_, listener) => {
        onAppStateChange = listener as (state: string) => void;
        return { remove: jest.fn() };
      });
    await renderHost();
    await act(() => {
      toast.success("Household created");
    });

    await act(() => jest.advanceTimersByTime(1_000));
    await act(() => onAppStateChange?.("background"));
    await act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByText("Household created")).toBeTruthy();

    await act(() => onAppStateChange?.("active"));
    await act(() => jest.advanceTimersByTime(2_999));
    expect(screen.getByText("Household created")).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText("Household created")).toBeNull();
  });

  it("dismisses on distance or velocity and springs back otherwise", async () => {
    await renderHost();
    await act(() => {
      toast.error("Couldn’t save");
    });

    const gesture = getByGestureTestId("toast-pan");
    await act(() => {
      fireGestureHandler(gesture, [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.ACTIVE, translationY: -10, velocityY: -120 },
        { state: State.END, translationY: -10, velocityY: -120 },
      ]);
    });
    expect(screen.getByText("Couldn’t save")).toBeTruthy();

    await act(() => {
      fireGestureHandler(gesture, [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.ACTIVE, translationY: -10, velocityY: -900 },
        { state: State.END, translationY: -10, velocityY: -900 },
      ]);
    });

    expect(screen.queryByText("Couldn’t save")).toBeNull();
  });

  it("uses measured distance, velocity, and downward resistance", () => {
    expect(shouldDismissToast(-35, 100, -699)).toBe(true);
    expect(shouldDismissToast(-34, 100, -700)).toBe(true);
    expect(shouldDismissToast(-34, 100, -699)).toBe(false);
    expect(getToastDragOffset(-20, 100)).toBe(-20);
    expect(getToastDragOffset(50, 100)).toBeGreaterThan(0);
    expect(getToastDragOffset(50, 100)).toBeLessThan(50);
  });

  it("keeps close dismissal but disables swipe under reduced motion", async () => {
    jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
    await renderHost();
    await act(() => {
      toast.success("Recipe updated");
    });

    await act(() => {
      fireGestureHandler(getByGestureTestId("toast-pan"), [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.END, translationY: -80, velocityY: -1_000 },
      ]);
    });
    expect(screen.getByText("Recipe updated")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByText("Recipe updated")).toBeNull();
  });
});
