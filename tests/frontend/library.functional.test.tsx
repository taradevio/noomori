// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { fireEvent, render, screen } from "@testing-library/react-native";

import { RecipesLibraryView } from "@/shared/components/recipe/recipes-library-view";

const recipes = {
  status: "ready" as const,
  data: [
    { id: "soup", title: "Tomato soup", cookingTimeMinutes: 30, isShared: false },
    { id: "cake", title: "Chocolate cake", cookingTimeMinutes: 50, isShared: true },
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

    await fireEvent.changeText(screen.getByTestId("library-recipes-search-input"), "cake");
    expect(screen.queryByTestId("recipe-card-soup")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Chocolate cake/ }));
    expect(onRecipePress).toHaveBeenCalledWith("cake");
    expect(onSearchQueryChange).toHaveBeenCalledWith("recipes", "cake");

    await fireEvent.press(screen.getByRole("button", { name: "Clear recipes search" }));
    expect(screen.getByTestId("recipe-card-soup")).toBeTruthy();
  });

  it("switches to cookbooks and starts create/open actions", async () => {
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
    await fireEvent.press(screen.getByRole("button", { name: "Favorites, 2 recipes" }));
    await fireEvent.press(screen.getByTestId("library-create-cookbook-fab"));
    expect(onCookbookPress).toHaveBeenCalledWith("favorites");
    expect(onCreateCookbook).toHaveBeenCalledTimes(1);
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
});
