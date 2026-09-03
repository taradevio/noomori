jest.mock("expo-symbols", () => {
  const { View } = jest.requireActual("react-native");
  return { SymbolView: View };
});

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("react-native-keyboard-controller", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const keyboardControllerMock = jest.requireActual(
    "react-native-keyboard-controller/jest",
  );

  return {
    ...keyboardControllerMock,
    KeyboardProvider: ({ children, ...props }: React.PropsWithChildren) =>
      React.createElement(
        View,
        { ...props, testID: "keyboard-provider" },
        children,
      ),
  };
});

jest.mock("expo-image", () => {
  const { Image } = jest.requireActual("react-native");
  return { Image };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});
