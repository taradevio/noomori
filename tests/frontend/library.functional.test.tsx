// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FlatList } from "react-native";

import {
  getLibraryColumnCount,
  RecipesLibraryView,
} from "@/shared/components/recipe/recipes-library-view";
import { RecipeCard } from "@/shared/components/recipe/recipe-card";

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

const libraryContexts = [
  {
    mode: "personal",
    section: "recipes",
    noun: "recipes",
    stateKey: "recipes",
    action: "Add your first recipe",
  },
  {
    mode: "household",
    section: "recipes",
    noun: "shared recipes",
    stateKey: "shared-recipes",
    action: "Share a recipe",
  },
  {
    mode: "personal",
    section: "cookbooks",
    noun: "cookbooks",
    stateKey: "cookbooks",
    action: "Create a cookbook",
  },
] as const;

function recipeOrder() {
  return screen
    .getAllByTestId(/^recipe-card-(?!missing-image-)/)
    .map((card) => card.props.testID.replace("recipe-card-", ""));
}

describe("recipe and cookbook library workflow", () => {
  it("uses the native list refresh control", async () => {
    const onRefresh = jest.fn();
    await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        onRefresh={onRefresh}
        recipes={recipes}
        refreshing
      />,
    );

    const list = screen.getByTestId("library-grid-recipes");
    expect(list.props.refreshing).toBe(true);
    await fireEvent(list, "refresh");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows pending recipe handoffs only when the household has work", async () => {
    const onReview = jest.fn();
    const view = await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        handoffCount={2}
        mode="household"
        onReviewHandoffs={onReview}
        recipes={recipes}
      />,
    );

    await fireEvent.press(screen.getByTestId("recipe-handoff-banner"));
    expect(screen.getByText("Recipes from someone who left")).toBeTruthy();
    expect(screen.getByText("Choose which ones you’d like to keep.")).toBeTruthy();
    expect(onReview).toHaveBeenCalledTimes(1);

    await view.rerender(
      <RecipesLibraryView
        cookbooks={cookbooks}
        handoffCount={0}
        mode="household"
        onReviewHandoffs={onReview}
        recipes={recipes}
      />,
    );
    expect(screen.queryByTestId("recipe-handoff-banner")).toBeNull();
  });

  it.each(libraryContexts)(
    "distinguishes no matches from an empty $noun collection",
    async ({ mode, section, noun, stateKey, action }) => {
      const onAction = jest.fn();
      const props = {
        mode,
        section,
        onAddRecipe: onAction,
        onCreateCookbook: onAction,
        onShareRecipe: onAction,
      };
      const view = await render(
        <RecipesLibraryView
          {...props}
          cookbooks={cookbooks}
          recipes={recipes}
        />,
      );
      const sourceCount = section === "recipes" ? 2 : 1;

      await fireEvent.changeText(
        screen.getByTestId(`library-${section}-search-input`),
        "   ",
      );
      expect(
        screen.getByText(
          `${sourceCount} ${section === "recipes" ? (sourceCount === 1 ? "recipe" : "recipes") : sourceCount === 1 ? "cookbook" : "cookbooks"}`,
        ),
      ).toBeTruthy();
      await fireEvent.changeText(
        screen.getByTestId(`library-${section}-search-input`),
        "missing recipe",
      );
      expect(screen.getByTestId(`library-${stateKey}-no-results`)).toBeTruthy();
      expect(
        screen.getByText(`No ${noun} found for “missing recipe”`),
      ).toBeTruthy();
      expect(
        screen.getByText(section === "recipes" ? "0 recipes" : "0 cookbooks"),
      ).toBeTruthy();
      expect(screen.queryByTestId(`library-${stateKey}-empty`)).toBeNull();
      expect(screen.queryByRole("button", { name: action })).toBeNull();
      expect(Boolean(screen.queryByRole("button", { name: "Newest" }))).toBe(
        section === "recipes",
      );

      await fireEvent.press(
        screen.getByRole("button", { name: "Clear search" }),
      );
      expect(
        screen.getByTestId(`library-${section}-search-input`).props.value,
      ).toBe("");
      expect(
        screen.getByText(
          `${sourceCount} ${section === "recipes" ? (sourceCount === 1 ? "recipe" : "recipes") : sourceCount === 1 ? "cookbook" : "cookbooks"}`,
        ),
      ).toBeTruthy();

      await fireEvent.changeText(
        screen.getByTestId(`library-${section}-search-input`),
        "missing recipe",
      );
      await view.rerender(
        <RecipesLibraryView
          {...props}
          cookbooks={{ status: "ready", data: [] }}
          recipes={{ status: "ready", data: [] }}
        />,
      );
      expect(screen.getByTestId(`library-${stateKey}-empty`)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Newest" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: action }));
      expect(onAction).toHaveBeenCalledTimes(1);

      await view.rerender(
        <RecipesLibraryView
          {...props}
          cookbooks={{ status: "loading" }}
          recipes={{ status: "loading" }}
        />,
      );
      expect(screen.getByText("Loading…")).toBeTruthy();
      expect(screen.queryByTestId(`library-${stateKey}-no-results`)).toBeNull();
      expect(screen.queryByRole("button", { name: "Newest" })).toBeNull();
      await view.rerender(
        <RecipesLibraryView
          {...props}
          cookbooks={{ status: "error", message: "Offline" }}
          recipes={{ status: "error", message: "Offline" }}
          onRetryCookbooks={onAction}
          onRetryRecipes={onAction}
        />,
      );
      expect(screen.getByText("Offline")).toBeTruthy();
      expect(screen.queryByTestId(`library-${stateKey}-no-results`)).toBeNull();
      expect(screen.queryByRole("button", { name: "Newest" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(onAction).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["personal", "household"] as const)(
    "sorts the %s library without mutating source data and preserves sorting through search and refresh",
    async (mode) => {
      const data = Object.freeze(
        [
          { ...recipes.data[0], id: "z", title: "Zucchini" },
          { ...recipes.data[0], id: "ten", title: "Soup 10" },
          { ...recipes.data[0], id: "accent", title: "Ápple" },
          { ...recipes.data[0], id: "two", title: "Soup 2" },
          { ...recipes.data[0], id: "plain", title: "apple" },
        ].map((recipe) => Object.freeze(recipe)),
      );
      const source = { status: "ready" as const, data };
      const view = await render(
        <RecipesLibraryView
          mode={mode}
          cookbooks={cookbooks}
          recipes={source}
        />,
      );
      expect(recipeOrder()).toEqual(["z", "ten", "accent", "two", "plain"]);
      expect(
        screen.getByRole("button", { name: "Newest", selected: true }),
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "A–Z" }));
      expect(recipeOrder()).toEqual(["accent", "plain", "two", "ten", "z"]);
      expect(
        screen.getByRole("button", { name: "A–Z", selected: true }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Newest", selected: false }),
      ).toBeTruthy();

      await fireEvent.changeText(
        screen.getByTestId("library-recipes-search-input"),
        "  SOUP  ",
      );
      expect(recipeOrder()).toEqual(["two", "ten"]);
      await fireEvent.changeText(
        screen.getByTestId("library-recipes-search-input"),
        "missing",
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Clear search" }),
      );
      expect(recipeOrder()).toEqual(["accent", "plain", "two", "ten", "z"]);

      const refreshed = {
        status: "ready" as const,
        data: [{ ...data[0], id: "banana", title: "Banana" }, ...data],
      };
      await view.rerender(
        <RecipesLibraryView
          mode={mode}
          cookbooks={cookbooks}
          recipes={refreshed}
        />,
      );
      expect(recipeOrder()).toEqual([
        "accent",
        "plain",
        "banana",
        "two",
        "ten",
        "z",
      ]);
      await fireEvent.press(screen.getByRole("button", { name: "Newest" }));
      expect(recipeOrder()).toEqual([
        "banana",
        "z",
        "ten",
        "accent",
        "two",
        "plain",
      ]);
      expect(data.map((recipe) => recipe.id)).toEqual([
        "z",
        "ten",
        "accent",
        "two",
        "plain",
      ]);
      expect(refreshed.data.map((recipe) => recipe.id)).toEqual([
        "banana",
        "z",
        "ten",
        "accent",
        "two",
        "plain",
      ]);
    },
  );

  it("preserves sorting across sections, leaves cookbooks in source order, and defaults to Newest on remount", async () => {
    const collections = {
      status: "ready" as const,
      data: [
        ...cookbooks.data,
        { id: "breakfast", title: "Breakfast", recipeCount: 1 },
      ],
    };
    const view = await render(
      <RecipesLibraryView cookbooks={collections} recipes={recipes} />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "A–Z" }));
    await view.rerender(
      <RecipesLibraryView
        cookbooks={collections}
        recipes={recipes}
        section="cookbooks"
      />,
    );
    expect(screen.queryByRole("button", { name: "A–Z" })).toBeNull();
    expect(
      screen.getAllByTestId(/^cookbook-card-/).map((card) => card.props.testID),
    ).toEqual(["cookbook-card-favorites", "cookbook-card-breakfast"]);
    await view.rerender(
      <RecipesLibraryView
        cookbooks={collections}
        recipes={recipes}
        section="recipes"
      />,
    );
    expect(
      screen.getByRole("button", { name: "A–Z", selected: true }),
    ).toBeTruthy();
    expect(recipeOrder()).toEqual(["cake", "soup"]);
    await view.unmount();
    await render(
      <RecipesLibraryView
        cookbooks={cookbooks}
        recipes={recipes}
        mode="household"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Newest", selected: true }),
    ).toBeTruthy();
    expect(recipeOrder()).toEqual(["soup", "cake"]);
  });

  it("resets scroll for normalized search, sort, and section changes but not refreshes", async () => {
    const scroll = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    const view = await render(
      <RecipesLibraryView cookbooks={cookbooks} recipes={recipes} />,
    );
    scroll.mockClear();
    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "cake",
    );
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: false });
    scroll.mockClear();
    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "  CAKE ",
    );
    expect(scroll).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "A–Z" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "A–Z" }));
    await view.rerender(
      <RecipesLibraryView
        cookbooks={cookbooks}
        recipes={{ ...recipes, data: [...recipes.data] }}
      />,
    );
    expect(scroll).not.toHaveBeenCalled();
    await view.rerender(
      <RecipesLibraryView
        cookbooks={cookbooks}
        recipes={recipes}
        section="cookbooks"
      />,
    );
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: false });
  });

  it("omits serving metadata when the base is unknown", async () => {
    await render(
      <RecipeCard
        item={{
          id: "unknown-servings",
          title: "Flexible soup",
          cookingTimeMinutes: 30,
          servings: null,
        }}
        onPress={jest.fn()}
        width={280}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Flexible soup, 30 minutes" }),
    ).toBeTruthy();
    expect(screen.queryByText("null")).toBeNull();
  });

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
        name: /Chocolate cake, 50 minutes, 8 servings, Shared with household/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("2 recipes")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "cake",
    );
    expect(screen.queryByTestId("recipe-card-soup")).toBeNull();
    expect(screen.getByText("1 recipe")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: /Chocolate cake/ }),
    );
    expect(onRecipePress).toHaveBeenCalledWith("cake");
    expect(onSearchQueryChange).toHaveBeenCalledWith("recipes", "cake");

    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "bread",
    );
    expect(screen.getByText("0 recipes")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Clear recipes search" }),
    );
    expect(screen.getByTestId("recipe-card-soup")).toBeTruthy();
    expect(screen.getByText("2 recipes")).toBeTruthy();
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

    expect(screen.getByText("2 cookbooks")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId("library-cookbooks-search-input"),
      "favorites",
    );
    expect(screen.getByText("1 cookbook")).toBeTruthy();

    await view.rerender(
      <RecipesLibraryView
        cookbooks={{ status: "ready", data: [] }}
        mode="household"
        recipes={recipes}
      />,
    );
    expect(screen.getByText("2 recipes")).toBeTruthy();
    expect(screen.queryByText("Shared with household")).toBeNull();
    await fireEvent.changeText(
      screen.getByTestId("library-recipes-search-input"),
      "tomato",
    );
    expect(screen.getByText("1 recipe")).toBeTruthy();
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
    expect(screen.getByText("Shared with household")).toBeTruthy();
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
