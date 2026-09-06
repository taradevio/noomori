import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import { AppTabs } from "@/routes/app-tabs.shared";

const mockPush = jest.fn();
let mockGlobalSearchParams: { section?: string } = {};
let mockPathname = "/";
let mockTabOptions: unknown;
const mockKeyboardListeners: Record<string, () => void> = {};
const mockWindowDimensions = {
  fontScale: 1,
  height: 844,
  scale: 1,
  width: 390,
};

jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"),
  useWindowDimensions: () => mockWindowDimensions,
}));

jest.mock("expo-router", () => ({
  useGlobalSearchParams: () => mockGlobalSearchParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-router/ui", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");

  const MockTabTrigger = ({
    children,
    href,
    name,
  }: React.PropsWithChildren<{ href: string; name: string }>) => (
    <View accessibilityLabel={href} testID={`tab-trigger-${name}`}>
      {React.cloneElement(children as React.ReactElement, {
        isFocused: name === "recipes",
      })}
    </View>
  );

  const MockTabList = ({ children }: React.PropsWithChildren) => children;

  const isElementOfType = (child: React.ReactNode, type: unknown) =>
    React.isValidElement(child) && (child as React.ReactElement).type === type;

  const MockTabs = ({
    children,
    options,
  }: React.PropsWithChildren<{ options: unknown }>) => {
    mockTabOptions = options;

    const directTabList = React.Children.toArray(children).find(
      (child: React.ReactNode) => isElementOfType(child, MockTabList),
    ) as
      | React.ReactElement<{ asChild?: boolean; children?: React.ReactNode }>
      | undefined;
    const listChildren = directTabList?.props.asChild
      ? (
          directTabList.props.children as React.ReactElement<{
            children?: React.ReactNode;
          }>
        )?.props.children
      : directTabList?.props.children;
    const registeredTriggers = React.Children.toArray(listChildren).filter(
      (child: React.ReactNode) => isElementOfType(child, MockTabTrigger),
    );

    if (registeredTriggers.length === 0) {
      throw new Error("Couldn't find any screens for the navigator.");
    }

    return <View testID="tabs-root">{children}</View>;
  };

  return {
    Tabs: MockTabs,
    TabSlot: ({ style }: { style: unknown }) => (
      <View style={style} testID="tab-slot" />
    ),
    TabList: MockTabList,
    TabTrigger: MockTabTrigger,
  };
});

jest.mock("@/shared/components/recipe/add-recipe-bottom-sheet", () => ({
  AddRecipeBottomSheet: ({
    isOpen,
    onDismiss,
    onImportFromText,
    onImportFromWebsite,
    onWriteFromScratch,
  }: {
    isOpen: boolean;
    onDismiss: () => void;
    onImportFromText: () => void;
    onImportFromWebsite: () => void;
    onWriteFromScratch: () => void;
  }) =>
    isOpen ? (
      <View testID="add-recipe-sheet">
        <Pressable accessibilityLabel="Close sheet" onPress={onDismiss} />
        <Pressable
          accessibilityLabel="Write from scratch"
          onPress={onWriteFromScratch}
        />
        <Pressable
          accessibilityLabel="Import from text"
          onPress={onImportFromText}
        />
        <Pressable
          accessibilityLabel="Import from website"
          onPress={onImportFromWebsite}
        />
      </View>
    ) : null,
}));

describe("custom primary navigation", () => {
  beforeEach(() => {
    mockGlobalSearchParams = {};
    mockPathname = "/";
    mockWindowDimensions.fontScale = 1;
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((event, listener) => {
        mockKeyboardListeners[event] = () =>
          listener({
            duration: 0,
            easing: "keyboard",
            endCoordinates: {
              screenX: 0,
              screenY: 0,
              width: 0,
              height: 0,
            },
          });
        return { remove: jest.fn() } as unknown as ReturnType<
          typeof Keyboard.addListener
        >;
      });
  });

  it("defines three real destinations with history and selected semantics", async () => {
    await render(<AppTabs />);

    expect(mockTabOptions).toEqual({ backBehavior: "history" });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(
      screen.getByTestId("tab-trigger-recipes").props.accessibilityLabel,
    ).toBe("/");
    expect(
      screen.getByTestId("tab-trigger-household").props.accessibilityLabel,
    ).toBe("/household");
    expect(
      screen.getByTestId("tab-trigger-account").props.accessibilityLabel,
    ).toBe("/account");
    expect(
      screen.getByRole("tab", { name: "Recipes" }).props.accessibilityState,
    ).toEqual({
      selected: true,
    });
  });

  it("floats Add Recipe above the trailing edge of the three-track bar", async () => {
    await render(<AppTabs />);

    expect(
      StyleSheet.flatten(
        screen.getByTestId("tab-add-recipe-position").props.style,
      ),
    ).toMatchObject({ right: 20, top: 0 });
    expect(
      StyleSheet.flatten(screen.getByTestId("primary-tab-bar").props.style)
        .height,
    ).toBe(132);
  });

  it("reserves only the measured bar surface below content", async () => {
    await render(<AppTabs />);

    await fireEvent(screen.getByTestId("primary-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 132 } },
    });
    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(64);

    await fireEvent(screen.getByTestId("primary-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 0 } },
    });
    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(64);
  });

  it("keeps a 24dp bottom safe area below top-aligned tab controls", async () => {
    await render(<AppTabs />);

    await fireEvent(screen.getByTestId("primary-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 156 } },
    });
    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(88);
    expect(
      StyleSheet.flatten(
        screen.getByRole("tab", { name: "Recipes" }).props.style,
      ).marginTop,
    ).toBe(68);
    expect(
      StyleSheet.flatten(screen.getByTestId("primary-tab-bar").props.style)
        .alignItems,
    ).toBe("flex-start");
  });

  it("grows the bar and permits wrapped labels at 2x text size", async () => {
    mockWindowDimensions.fontScale = 2;
    await render(<AppTabs />);

    expect(
      StyleSheet.flatten(screen.getByTestId("primary-tab-bar").props.style)
        .height,
    ).toBe(168);
    expect(screen.getByText("Household").props.numberOfLines).toBe(2);

    await fireEvent(screen.getByTestId("primary-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 168 } },
    });
    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(100);
  });

  it("hides the measured bar for the keyboard without unregistering tabs", async () => {
    await render(<AppTabs />);

    await fireEvent(screen.getByTestId("primary-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 132 } },
    });
    await act(() => mockKeyboardListeners.keyboardDidShow());

    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(0);
    expect(
      StyleSheet.flatten(screen.getByTestId("primary-tab-bar").props.style)
        .display,
    ).toBe("none");
    expect(screen.getByTestId("tab-trigger-recipes")).toBeTruthy();
    expect(screen.getByTestId("tab-trigger-household")).toBeTruthy();
    expect(screen.getByTestId("tab-trigger-account")).toBeTruthy();

    await act(() => mockKeyboardListeners.keyboardDidHide());
    expect(screen.getByTestId("tab-slot").props.style.paddingBottom).toBe(64);
    expect(
      StyleSheet.flatten(screen.getByTestId("primary-tab-bar").props.style)
        .display,
    ).toBeUndefined();
  });

  it.each([
    ["Write from scratch", "/recipe/new"],
    ["Import from text", "/recipe/import-text"],
    ["Import from website", "/recipe/import-url"],
  ])(
    "opens Add Recipe without selecting a route and handles %s",
    async (label, route) => {
      await render(<AppTabs />);

      await fireEvent.press(screen.getByRole("button", { name: "Add recipe" }));
      expect(screen.getByTestId("add-recipe-sheet")).toBeTruthy();
      expect(
        screen.getByRole("tab", { name: "Recipes" }).props.accessibilityState,
      ).toEqual({
        selected: true,
      });

      await fireEvent.press(screen.getByLabelText(label));
      expect(mockPush).toHaveBeenCalledWith(route);
      expect(screen.queryByTestId("add-recipe-sheet")).toBeNull();
    },
  );

  it("dismisses the Add Recipe sheet", async () => {
    await render(<AppTabs />);

    await fireEvent.press(screen.getByRole("button", { name: "Add recipe" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    expect(screen.queryByTestId("add-recipe-sheet")).toBeNull();
  });

  it("changes the add action with the selected library section", async () => {
    const view = await render(<AppTabs />);

    expect(screen.getByRole("button", { name: "Add recipe" })).toBeTruthy();

    mockGlobalSearchParams = { section: "cookbooks" };
    await view.rerender(<AppTabs />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Create cookbook" }),
    );

    expect(mockPush).toHaveBeenCalledWith("/cookbook/new");
    expect(screen.queryByTestId("add-recipe-sheet")).toBeNull();
  });

  it("keeps Add Recipe on the Household tab", async () => {
    mockPathname = "/household";
    await render(<AppTabs />);

    await fireEvent.press(screen.getByRole("button", { name: "Add recipe" }));
    expect(screen.getByTestId("add-recipe-sheet")).toBeTruthy();
  });

  it("hides the add action on Settings", async () => {
    mockPathname = "/account";
    await render(<AppTabs />);

    expect(
      screen.queryByTestId("tab-add-recipe-position"),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Add recipe" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create cookbook" }),
    ).toBeNull();
  });
});
