import { forwardRef, type PropsWithChildren } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

type KeyboardProviderProps = PropsWithChildren<{
  navigationBarTranslucent?: boolean;
  preserveEdgeToEdge?: boolean;
  statusBarTranslucent?: boolean;
}>;

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  bottomOffset?: number;
  mode?: "insets" | "layout";
};

export function KeyboardProvider({ children }: KeyboardProviderProps) {
  return <>{children}</>;
}

export const KeyboardAwareScrollView = forwardRef<
  ScrollView,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  { bottomOffset: _bottomOffset, mode: _mode, ...props },
  ref,
) {
  return <ScrollView ref={ref} {...props} />;
});
