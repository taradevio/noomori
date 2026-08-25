import { RecipeCreateScreen } from "@/shared/components/recipe/recipe-create-screen";
import { createBlankRecipeDraft } from "@/shared/components/recipe/recipe-draft";

const blankRecipe = createBlankRecipeDraft();

export default function NewRecipeRoute() {
  return <RecipeCreateScreen initialDraft={blankRecipe} />;
}
