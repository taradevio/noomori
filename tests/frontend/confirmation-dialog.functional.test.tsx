import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { ConfirmationDialog } from "@/shared/ui";

const baseProps = {
  cancelLabel: "Keep editing",
  confirmLabel: "Discard changes",
  message: "Your unsaved changes will be lost.",
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
  title: "Discard changes?",
  tone: "destructive" as const,
  visible: true,
};

describe("ConfirmationDialog", () => {
  beforeEach(() => {
    baseProps.onCancel.mockReset();
    baseProps.onConfirm.mockReset();
  });

  it("renders the supplied copy and destructive treatment", async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
      .mockImplementation(() => undefined);

    await render(<ConfirmationDialog {...baseProps} />);
    await fireEvent(screen.getByTestId("confirmation-dialog-modal"), "show");

    expect(screen.getByText("Discard changes?")).toHaveProp(
      "accessibilityRole",
      "header",
    );
    expect(screen.getByText("Your unsaved changes will be lost.")).toBeTruthy();
    expect(screen.getByTestId("confirmation-dialog")).toHaveProp(
      "accessibilityViewIsModal",
      true,
    );
    expect(
      screen.getByTestId("confirmation-dialog-confirm").props.className,
    ).toContain("bg-error");
    expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
  });

  it("uses primary treatment without changing the action labels", async () => {
    await render(
      <ConfirmationDialog
        {...baseProps}
        cancelLabel="Keep current code"
        confirmLabel="Create new code"
        tone="primary"
      />,
    );

    expect(
      screen.getByTestId("confirmation-dialog-confirm").props.className,
    ).toContain("bg-primary-strong");
    expect(
      screen.getByRole("button", { name: "Keep current code" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create new code" }),
    ).toBeTruthy();
  });

  it("confirms only from the confirm action", async () => {
    await render(<ConfirmationDialog {...baseProps} />);

    await fireEvent.press(screen.getByTestId("confirmation-dialog-confirm"));

    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(baseProps.onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ["safe action", "confirmation-dialog-cancel", "press"],
    ["backdrop", "confirmation-dialog-backdrop", "press"],
    ["accessibility escape", "confirmation-dialog", "accessibilityEscape"],
    ["Android request close", "confirmation-dialog-modal", "requestClose"],
  ] as const)("cancels from the %s", async (_name, testId, eventName) => {
    await render(<ConfirmationDialog {...baseProps} />);

    const target = screen.getByTestId(
      testId,
      testId === "confirmation-dialog-backdrop"
        ? { includeHiddenElements: true }
        : undefined,
    );
    await fireEvent(target, eventName);

    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });
});
