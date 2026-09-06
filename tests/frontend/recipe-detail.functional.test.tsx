import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

import { RecipeDetailView } from "@/shared/components/recipe/recipe-detail-view";
import type { RecipeDetailModel } from "@/shared/types";

jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetModal: () => null,
  BottomSheetView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("expo-linking", () => ({ openURL: jest.fn() }));

jest.mock("expo-router", () => ({
  Link: ({
    children,
    onPress,
  }: {
    children: React.ReactElement;
    onPress?: (event: { preventDefault: () => void }) => void;
  }) => {
    const React = jest.requireActual("react");
    return React.cloneElement(children, { onPress });
  },
}));

const mockedOpenUrl = jest.requireMock("expo-linking").openURL as jest.Mock;

const recipe: RecipeDetailModel = {
  id: "recipe-1",
  title: "Tomato soup",
  imagePath: null,
  imageUrl: null,
  isShared: false,
  prepMinutes: null,
  cookMinutes: null,
  servings: 2,
  ingredientGroups: [],
  instructionGroups: [],
  notes: "",
  nutrition: {
    calories: "",
    fatGrams: "",
    saturatedFatGrams: "",
    cholesterolMilligrams: "",
    sodiumMilligrams: "",
    carbohydrateGrams: "",
    dietaryFiberGrams: "",
    sugarGrams: "",
    proteinGrams: "",
  },
  source: {
    type: "website",
    name: "",
    url: "https://www.example.com/recipes/tomato-soup",
  },
};

const originalExpoOs = process.env.EXPO_OS;

beforeEach(() => {
  process.env.EXPO_OS = "android";
  mockedOpenUrl.mockReset();
  mockedOpenUrl.mockResolvedValue(true);
});

afterAll(() => {
  if (originalExpoOs === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOs;
});

describe("recipe source details", () => {
  it("opens a website source with an external-link affordance", async () => {
    await render(<RecipeDetailView onBack={jest.fn()} recipe={recipe} />);

    const sourceLinks = screen.getAllByRole("link", {
      name: "Open example.com in browser",
    });
    expect(sourceLinks).toHaveLength(2);
    const sourceIcons = screen.getAllByTestId("recipe-source-external-icon");
    expect(sourceIcons).toHaveLength(2);
    for (const icon of sourceIcons) {
      expect(icon.props.name).toEqual({
        ios: "arrow.up.right.square",
        android: "open_in_new",
        web: "open_in_new",
      });
    }

    await fireEvent.press(sourceLinks[0]);
    await fireEvent.press(sourceLinks[1]);

    await waitFor(() => {
      expect(mockedOpenUrl).toHaveBeenCalledTimes(2);
      expect(mockedOpenUrl).toHaveBeenNthCalledWith(
        1,
        "https://www.example.com/recipes/tomato-soup",
      );
      expect(mockedOpenUrl).toHaveBeenNthCalledWith(
        2,
        "https://www.example.com/recipes/tomato-soup",
      );
    });
  });

  it.each([
    ["my-recipe", "", "My recipe"],
    ["family-friend", "Grandma", "Grandma"],
  ] as const)("keeps %s sources as plain text", async (type, name, label) => {
    await render(
      <RecipeDetailView
        onBack={jest.fn()}
        recipe={{ ...recipe, source: { type, name, url: "" } }}
      />,
    );

    expect(screen.getAllByText(label)).toHaveLength(2);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows an alert when the browser cannot open the source", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockedOpenUrl.mockRejectedValue(new Error("No browser"));
    await render(<RecipeDetailView onBack={jest.fn()} recipe={recipe} />);

    await fireEvent.press(
      screen.getAllByRole("link", {
        name: "Open example.com in browser",
      })[0],
    );

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Couldn’t open link",
        "Check that a browser is available and try again.",
      ),
    );
  });
});
