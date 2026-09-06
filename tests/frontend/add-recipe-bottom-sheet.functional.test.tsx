import React from "react";
import { act, render } from "@testing-library/react-native";

import { AddRecipeBottomSheet } from "@/shared/components/recipe/add-recipe-bottom-sheet";

const mockBottomSheetProps = jest.fn();

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");

  return {
    BottomSheet: (props: React.PropsWithChildren) => {
      mockBottomSheetProps(props);
      return React.createElement(View, null, props.children);
    },
    BottomSheetView: ({ children }: React.PropsWithChildren) =>
      React.createElement(View, null, children),
  };
});

it("enables native outside dismissal and forwards it to the parent", async () => {
  const onDismiss = jest.fn();

  await render(<AddRecipeBottomSheet isOpen onDismiss={onDismiss} />);

  const sheetProps = mockBottomSheetProps.mock.calls[0]?.[0] as {
    enablePanDownToClose?: boolean;
    onDismiss?: () => void;
  };
  expect(sheetProps.enablePanDownToClose).toBe(true);

  await act(() => sheetProps.onDismiss?.());
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
