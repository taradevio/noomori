import { RecipesLibraryView } from "@/shared/components/recipe/recipes-library-view";
import type {
  CookbookCardModel,
  LibraryResource,
  RecipeCardModel,
} from "@/shared/types";

const emptyRecipes: LibraryResource<RecipeCardModel> = {
  status: "ready",
  data: [],
};

const emptyCookbooks: LibraryResource<CookbookCardModel> = {
  status: "ready",
  data: [],
};

/** Personal cookbook collections. Backend ownership arrives with cookbook APIs. */
export default function CookbooksScreen() {
  return (
    <RecipesLibraryView
      cookbooks={emptyCookbooks}
      initialSection="cookbooks"
      recipes={emptyRecipes}
    />
  );
}
