import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, StyleSheet } from "react-native";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
import * as Reanimated from "react-native-reanimated";

import { shouldDismissToast, ToastHost, toast } from "@/shared/ui/toast";

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

  it("exposes an accessible dismiss action without a visible close button", async () => {
    await renderHost();
    await act(() => {
      toast.success("Cookbook created");
    });

    expect(
      screen.queryByRole("button", { name: "Dismiss notification" }),
    ).toBeNull();

    await fireEvent(screen.getByTestId("toast-card"), "accessibilityAction", {
      nativeEvent: { actionName: "dismiss" },
    });

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
        { state: State.BEGAN, translationX: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -0.2, velocityX: -120 },
        { state: State.END, translationX: -0.2, velocityX: -120 },
      ]);
    });
    expect(screen.getByText("Couldn’t save")).toBeTruthy();

    await act(() => {
      fireGestureHandler(gesture, [
        { state: State.BEGAN, translationX: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -0.2, velocityX: -900 },
        { state: State.END, translationX: -0.2, velocityX: -900 },
      ]);
    });

    expect(screen.queryByText("Couldn’t save")).toBeNull();

    await act(() => {
      toast.success("Saved on the right");
    });
    await act(() => {
      fireGestureHandler(getByGestureTestId("toast-pan"), [
        { state: State.BEGAN, translationX: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: 0.2, velocityX: 900 },
        { state: State.END, translationX: 0.2, velocityX: 900 },
      ]);
    });

    expect(screen.queryByText("Saved on the right")).toBeNull();
  });

  it("dismisses left or right by measured distance or velocity", () => {
    expect(shouldDismissToast(-35, 100, -699)).toBe(true);
    expect(shouldDismissToast(35, 100, 699)).toBe(true);
    expect(shouldDismissToast(-34, 100, -700)).toBe(true);
    expect(shouldDismissToast(34, 100, 700)).toBe(true);
    expect(shouldDismissToast(-34, 100, -699)).toBe(false);
    expect(shouldDismissToast(34, 100, 699)).toBe(false);
  });

  it("keeps swipe dismissal under reduced motion", async () => {
    jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
    await renderHost();
    await act(() => {
      toast.success("Recipe updated");
    });

    await act(() => {
      fireGestureHandler(getByGestureTestId("toast-pan"), [
        { state: State.BEGAN, translationX: 0, velocityX: 0 },
        { state: State.END, translationX: 1, velocityX: 1_000 },
      ]);
    });
    expect(screen.queryByText("Recipe updated")).toBeNull();
  });
});
