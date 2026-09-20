import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
import { toImportedRecipeDraft } from "@/shared/components/recipe/recipe-text-import";

jest.mock("@/global.css", () => ({}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  setOptions: jest.fn(),
}));

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/shared/components/splash-screen-controller", () => ({
  SplashScreenController: () => null,
}));

jest.mock("@/shared/providers/session-providers", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ state: "loading" }),
}));

describe("keyboard layout", () => {
  it.each(["ingredients", "instructions"] as const)(
    "lets a partial imported recipe add its missing %s",
    async (missing) => {
      const draft = toImportedRecipeDraft({
        title: "Soup",
        description: "Serve cold.\nRest: 30 min\nProof: 1 hr",
        ingredients: missing === "ingredients" ? [] : [{
          title: null, items: [{ name: "stock", quantity: 1, unit: "cup", note: null }],
        }],
        instructions: missing === "instructions" ? [] : [{
          title: null, steps: [{ text: "Stir." }],
        }],
        servings: null,
        prep_time_minutes: 5,
        cook_time_minutes: null,
        total_time_minutes: 5,
        additional_time_label: null,
        additional_time_minutes: null,
        nutrition_per_serving: null,
        image_url: null,
      });
      await render(<RecipeForm initialDraft={draft} mode="edit" onClose={jest.fn()} onSubmit={jest.fn()} />);
      const ingredient = missing === "ingredients";
      await fireEvent.press(screen.getByRole("button", {
        name: ingredient ? "Add ingredient" : "Add step",
      }));
      const field = screen.getByLabelText(ingredient ? "Ingredient 1 name" : "Step 1");
      await fireEvent.changeText(field, ingredient ? "water" : "Simmer.");
      expect(field).toHaveProp("value", ingredient ? "water" : "Simmer.");
    },
  );

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

  it("applies every serving increase queued before the form rerenders", async () => {
    const draft = createBlankRecipeDraft();
    draft.servings = 2;
    draft.ingredientGroups = [
      {
        id: "group",
        title: null,
        ingredients: [
          {
            id: "ingredient",
            amount: "1",
            unit: "cup",
            name: "stock",
            note: "",
          },
        ],
      },
    ];

    await render(
      <RecipeForm
        initialDraft={draft}
        mode="edit"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    const increase = screen.getByLabelText("Increase servings");
    let fiber = increase.unstable_fiber;
    let onPress: (() => void) | undefined;
    while (fiber && !onPress) {
      if (typeof fiber.memoizedProps?.onPress === "function") {
        onPress = fiber.memoizedProps.onPress;
      }
      fiber = fiber.return;
    }
    if (!onPress) throw new Error("Serving button has no handler");

    await act(() => {
      onPress();
      onPress();
    });

    expect(screen.getByLabelText("4 servings")).toBeTruthy();
    expect(screen.getByLabelText("Ingredient 1 amount")).toHaveProp(
      "value",
      "2",
    );
  });

  it("scales cooking fractions from the stable canonical amount", async () => {
    const draft = createBlankRecipeDraft();
    draft.servings = 2;
    draft.ingredientGroups = [
      {
        id: "group",
        title: null,
        ingredients: [
          {
            id: "ingredient",
            amount: "1/3",
            unit: "cup",
            name: "stock",
            note: "",
          },
        ],
      },
    ];

    await render(
      <RecipeForm
        initialDraft={draft}
        mode="edit"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    const amount = screen.getByLabelText("Ingredient 1 amount");
    await fireEvent.press(screen.getByLabelText("Decrease servings"));
    expect(amount).toHaveProp("value", "1/6");
    await fireEvent.press(screen.getByLabelText("Increase servings"));
    expect(amount).toHaveProp("value", "1/3");
    await fireEvent.press(screen.getByLabelText("Decrease servings"));
    expect(amount).toHaveProp("value", "1/6");
    expect(screen.getByLabelText("Ingredient 1 unit")).toHaveTextContent("cup");
  });

  it("establishes an unknown serving baseline before scaling", async () => {
    const draft = createBlankRecipeDraft();
    draft.servings = null;
    draft.ingredientGroups = [
      {
        id: "group",
        title: null,
        ingredients: [
          {
            id: "ingredient",
            amount: "1",
            unit: "cup",
            name: "stock",
            note: "",
          },
        ],
      },
    ];

    await render(
      <RecipeForm
        initialDraft={draft}
        mode="edit"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    const setBase = screen.getByRole("button", { name: "Set servings" });
    expect(setBase).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Servings"), "0");
    expect(setBase).toBeDisabled();
    expect(screen.queryByLabelText("0 servings")).toBeNull();

    await fireEvent.changeText(
      screen.getByLabelText("Ingredient 1 amount"),
      "3",
    );
    await fireEvent.changeText(screen.getByLabelText("Servings"), "4");
    expect(setBase).not.toBeDisabled();
    await fireEvent.press(setBase);

    expect(screen.getByLabelText("4 servings")).toBeTruthy();
    expect(screen.getByLabelText("Ingredient 1 amount")).toHaveProp(
      "value",
      "3",
    );

    const increase = screen.getByLabelText("Increase servings");
    for (let press = 0; press < 4; press += 1) {
      await fireEvent.press(increase);
    }
    expect(screen.getByLabelText("8 servings")).toBeTruthy();
    expect(screen.getByLabelText("Ingredient 1 amount")).toHaveProp(
      "value",
      "6",
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
