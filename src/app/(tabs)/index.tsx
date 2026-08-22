import { useRouter } from "expo-router";
import { useState } from "react";

import { AddRecipeBottomSheet } from "@/shared/components/recipe/add-recipe-bottom-sheet";
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

/** Route controller placeholder until the real recipe data source is connected. */
export default function RecipesScreen() {
  const router = useRouter();
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);

  return (
    <>
      <RecipesLibraryView
        recipes={emptyRecipes}
        cookbooks={emptyCookbooks}
        onAddRecipe={() => setIsAddRecipeOpen(true)}
      />
      <AddRecipeBottomSheet
        isOpen={isAddRecipeOpen}
        onDismiss={() => setIsAddRecipeOpen(false)}
        onWriteFromScratch={() => {
          // NOTE: Close the native chooser before entering the full-screen form.
          setIsAddRecipeOpen(false);
          router.push("/recipe/new");
        }}
      />
    </>
  );
}
