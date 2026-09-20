import React from "react";
import { act, render } from "@testing-library/react-native";

import {
  RecipeDurationPicker,
  RecipeUnitPicker,
} from "@/shared/components/recipe/recipe-form-pickers";

const mockBottomSheetProps = jest.fn();

jest.mock("@expo/ui/community/bottom-sheet", () => {
  const React = jest.requireActual("react");
  const { ScrollView, TextInput, View } = jest.requireActual("react-native");

  return {
    BottomSheet: (props: React.PropsWithChildren) => {
      mockBottomSheetProps(props);
      return React.createElement(View, null, props.children);
    },
    BottomSheetScrollView: ScrollView,
    BottomSheetTextInput: TextInput,
    BottomSheetView: View,
  };
});

it("enables native cancellation for every recipe form picker", async () => {
  const onDismiss = jest.fn();
  const onSelectDuration = jest.fn();
  const onSelectUnit = jest.fn();

  await render(
    <>
      <RecipeDurationPicker
        isOpen
        label="Prep time"
        onDismiss={onDismiss}
        onSelect={onSelectDuration}
        value={null}
      />
      <RecipeUnitPicker
        isOpen
        onDismiss={onDismiss}
        onSelect={onSelectUnit}
        value=""
      />
    </>,
  );

  const sheets = mockBottomSheetProps.mock.calls.map(
    ([props]) =>
      props as {
        enablePanDownToClose?: boolean;
        onDismiss?: () => void;
      },
  );
  expect(sheets).toHaveLength(2);
  expect(sheets.every(({ enablePanDownToClose }) => enablePanDownToClose)).toBe(
    true,
  );

  await act(() => {
    sheets.forEach(({ onDismiss: dismiss }) => dismiss?.());
  });
  expect(onDismiss).toHaveBeenCalledTimes(2);
  expect(onSelectDuration).not.toHaveBeenCalled();
  expect(onSelectUnit).not.toHaveBeenCalled();
});
