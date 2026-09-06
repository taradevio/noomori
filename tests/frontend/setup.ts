import "react-native-gesture-handler/jestSetup";

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
    fn(...args),
}));

jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual("react");
  const ReactNative = jest.requireActual("react-native");

  const builder = {
    delay: () => builder,
    duration: () => builder,
    easing: () => builder,
    reduceMotion: () => builder,
    withInitialValues: () => builder,
  };

  class Keyframe {
    delay() {
      return this;
    }

    duration() {
      return this;
    }

    reduceMotion() {
      return this;
    }
  }

  const useSharedValue = (initial: unknown) => {
    const ref = React.useRef(initial);
    return React.useMemo(
      () => ({
        get: () => ref.current,
        set: (next: unknown) => {
          ref.current =
            typeof next === "function"
              ? (next as (mockCurrent: unknown) => unknown)(ref.current)
              : next;
        },
      }),
      [],
    );
  };

  const finishImmediately = (
    target: unknown,
    _config?: unknown,
    callback?: (finished: boolean) => void,
  ) => {
    callback?.(true);
    return target;
  };

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: {
      createAnimatedComponent: (component: unknown) => component,
      FlatList: ReactNative.FlatList,
      Image: ReactNative.Image,
      ScrollView: ReactNative.ScrollView,
      Text: ReactNative.Text,
      View: ReactNative.View,
    },
    Easing: {
      bezier: () => (value: number) => value,
      elastic: () => (value: number) => value,
    },
    FadeIn: builder,
    Keyframe,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useEvent: (handler: unknown) => handler,
    useReducedMotion: () => false,
    useSharedValue,
    withSpring: finishImmediately,
    withTiming: finishImmediately,
  };
});

jest.mock("expo-symbols", () => {
  const { View } = jest.requireActual("react-native");
  return { SymbolView: View };
});

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponse: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: "ExponentPushToken[test-token]",
  })),
  getLastNotificationResponse: jest.fn(() => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

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
