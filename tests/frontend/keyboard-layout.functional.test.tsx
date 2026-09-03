import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import RootLayout from "@/app/_layout";
import {
  KeyboardAwareScrollView as WebKeyboardAwareScrollView,
  KeyboardProvider as WebKeyboardProvider,
} from "@/shared/components/keyboard-layout.web";
import {
  createBlankRecipeDraft,
  RecipeForm,
} from "@/shared/components/recipe/recipe-form";

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  setOptions: jest.fn(),
}));

jest.mock("expo-router", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/shared/components/splash-screen-controller", () => ({
  SplashScreenController: () => null,
}));

jest.mock("@/shared/providers/session-providers", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ state: "loading" }),
}));

describe("keyboard layout", () => {
  it("configures the native app provider for the existing edge-to-edge layout", async () => {
    await render(<RootLayout />);

    const provider = screen.getByTestId("keyboard-provider");
    expect(provider).toHaveProp("navigationBarTranslucent", true);
    expect(provider).toHaveProp("preserveEdgeToEdge", true);
    expect(provider).toHaveProp("statusBarTranslucent", true);
  });

  it("uses the shared keyboard-aware form in edit mode", async () => {
    await render(
      <RecipeForm
        initialDraft={createBlankRecipeDraft()}
        mode="edit"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByText("Edit recipe")).toBeTruthy();
    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "bottomOffset",
      24,
    );
    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "mode",
      "insets",
    );
  });

  it("keeps the web adapter on the ordinary ScrollView path", async () => {
    await render(
      <WebKeyboardProvider
        navigationBarTranslucent
        preserveEdgeToEdge
        statusBarTranslucent
      >
        <WebKeyboardAwareScrollView
          bottomOffset={24}
          mode="insets"
          testID="web-recipe-form-scroll"
        >
          <View />
        </WebKeyboardAwareScrollView>
      </WebKeyboardProvider>,
    );

    const scrollView = screen.getByTestId("web-recipe-form-scroll");
    expect(scrollView).not.toHaveProp("bottomOffset");
    expect(scrollView).not.toHaveProp("mode");
  });
});
