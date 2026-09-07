// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  getLibraryColumnCount,
  RecipesLibraryView,
} from "@/shared/components/recipe/recipes-library-view";

const recipes = {
  status: "ready" as const,
  data: [
    {
      id: "soup",
      title: "Tomato soup",
      cookingTimeMinutes: 30,
      servings: 1,
      isShared: false,
    },
    {
      id: "cake",
      title: "Chocolate cake",
      cookingTimeMinutes: 50,
      servings: 8,
      isShared: true,
    },
  ],
};
const cookbooks = {
  status: "ready" as const,
  data: [{ id: "favorites", title: "Favorites", recipeCount: 2 }],
};

describe("recipe and cookbook library workflow", () => {
  it("searches recipes, clears search, and opens the selected result", async () => {
    const onRecipePress = jest.fn();
    const onSearchQueryChange = jest.fn();
    await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        onRecipePress={onRecipePress}
        onSearchQueryChange={onSearchQueryChange}
        recipes={recipes}
      />,
    );

    expect(screen.getByText("Your recipes")).toBeTruthy();
    expect(screen.queryByText(/recently saved/i)).toBeNull();
    expect(
      screen.getByTestId("library-segment-recipes").props.accessibilityState,
    ).toEqual({
      selected: true,
    });
    expect(
      screen.getByRole("button", {
        name: /Tomato soup, 30 minutes, 1 serving$/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Chocolate cake, 50 minutes, 8 servings, Shared/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "cake",
    );
    expect(screen.queryByTestId("recipe-card-soup")).toBeNull();
    expect(screen.getByText("1 item")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: /Chocolate cake/ }),
    );
    expect(onRecipePress).toHaveBeenCalledWith("cake");
    expect(onSearchQueryChange).toHaveBeenCalledWith("recipes", "cake");

    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "bread",
    );
    expect(screen.getByText("0 items")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Clear recipes search" }),
    );
    expect(screen.getByTestId("recipe-card-soup")).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();
  });

  it("counts filtered cookbooks and household shared recipes", async () => {
    const view = await render(
      <RecipesLibraryView
        cookbooks={{
          status: "ready",
          data: [
            ...cookbooks.data,
            { id: "desserts", title: "Desserts", recipeCount: 1 },
          ],
        }}
        recipes={recipes}
        section="cookbooks"
      />,
    );

    expect(screen.getByText("2 items")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId("library-cookbooks-search-input"),
      "favorites",
    );
    expect(screen.getByText("1 item")).toBeTruthy();

    await view.rerender(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        mode="household"
        recipes={recipes}
      />,
    );
    expect(screen.getByText("2 items")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "tomato",
    );
    expect(screen.getByText("1 item")).toBeTruthy();
  });

  it("switches to cookbooks without duplicating the create action", async () => {
    const onSectionChange = jest.fn();
    const onCreateCookbook = jest.fn();
    const onCookbookPress = jest.fn();
    const view = await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        onCookbookPress={onCookbookPress}
        onCreateCookbook={onCreateCookbook}
        onSectionChange={onSectionChange}
        recipes={recipes}
        section="recipes"
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Cookbooks" }));
    expect(onSectionChange).toHaveBeenCalledWith("cookbooks");

    await view.rerender(
      <RecipesLibraryView
        cookbooks={cookbooks}
        onCookbookPress={onCookbookPress}
        onCreateCookbook={onCreateCookbook}
        onSectionChange={onSectionChange}
        recipes={recipes}
        section="cookbooks"
      />,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Favorites, 2 recipes" }),
    );
    expect(onCookbookPress).toHaveBeenCalledWith("favorites");
    expect(screen.queryByText("New cookbook")).toBeNull();
    expect(onCreateCookbook).not.toHaveBeenCalled();

    await view.rerender(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        onCookbookPress={onCookbookPress}
        onCreateCookbook={onCreateCookbook}
        onSectionChange={onSectionChange}
        recipes={recipes}
        section="cookbooks"
      />,
    );
    await fireEvent.press(screen.getByText("Create a cookbook"));
    expect(onCreateCookbook).toHaveBeenCalledTimes(1);
  });

  it("shows concise real metadata, shared status, and a missing-image state", async () => {
    await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        recipes={{
          status: "ready",
          data: [
            {
              id: "shared-missing",
              title: "A very long family recipe title that needs two lines",
              cookingTimeMinutes: 35,
              servings: 4,
              cookbookName: "Weeknight favorites",
              isShared: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("35 min")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Weeknight favorites")).toBeTruthy();
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(
      screen.getByTestId("recipe-card-missing-image-shared-missing", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/A very long family recipe/).props.numberOfLines,
    ).toBe(2);
  });

  it.each([360, 375, 390, 430])(
    "uses two columns at %ipx with the default font scale",
    (width) => {
      expect(getLibraryColumnCount({ fontScale: 1, height: 800, width })).toBe(
        2,
      );
    },
  );

  it.each([1.3, 2])("uses one column at font scale %s", (fontScale) => {
    expect(getLibraryColumnCount({ fontScale, height: 1024, width: 768 })).toBe(
      1,
    );
  });

  it("uses three columns on a tablet at the default font scale", () => {
    expect(
      getLibraryColumnCount({ fontScale: 1, height: 1024, width: 768 }),
    ).toBe(3);
  });

  it("shows recoverable errors and the household empty sharing action", async () => {
    const onRetryRecipes = jest.fn();
    const onShareRecipe = jest.fn();
    const view = await render(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        onRetryRecipes={onRetryRecipes}
        recipes={{ status: "error", message: "Offline" }}
      />,
    );

    await fireEvent.press(screen.getByText("Try again"));
    expect(onRetryRecipes).toHaveBeenCalledTimes(1);

    await view.rerender(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        mode="household"
        onShareRecipe={onShareRecipe}
        recipes={{ status: "ready", data: [] }}
      />,
    );
    await fireEvent.press(screen.getByText("Share a recipe"));
    expect(onShareRecipe).toHaveBeenCalledTimes(1);
  });

  it("shows loading, empty, and conditional activity states", async () => {
    const onAddRecipe = jest.fn();
    const onActivityPress = jest.fn();
    const view = await render(
      <RecipesLibraryView
        cookbooks={{ status: "loading" }}
        recipes={{ status: "loading" }}
      />,
    );

    expect(
      screen.getAllByTestId("library-skeleton-card", {
        includeHiddenElements: true,
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("recipe-activity-button")).toBeNull();

    await view.rerender(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        onActivityPress={onActivityPress}
        onAddRecipe={onAddRecipe}
        recipes={{ status: "ready", data: [] }}
        showActivity
        unreadActivityCount={2}
      />,
    );
    expect(screen.getByTestId("library-recipes-empty")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add your first recipe"));
    await fireEvent.press(screen.getByTestId("recipe-activity-button"));
    expect(onAddRecipe).toHaveBeenCalledTimes(1);
    expect(onActivityPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("recipe-activity-unread-dot")).toBeTruthy();
  });
});
