import {
  toImportedRecipeDraft,
  type ImportedRecipeTextDraft,
} from "./recipe-text-import";

const imported: ImportedRecipeTextDraft = {
  title: "Miso noodles",
  description: "Serve immediately.",
  ingredients: [
    {
      title: "Sauce",
      items: [
        {
          name: "soy sauce",
          quantity: 2,
          unit: "tbsp",
          note: null,
        },
      ],
    },
  ],
  instructions: [
    { title: null, steps: [{ text: "Stir and serve." }] },
  ],
  servings: null,
  prep_time_minutes: 10,
  cook_time_minutes: null,
};

const draft = toImportedRecipeDraft(imported);
if (
  draft.title !== imported.title ||
  draft.servings !== 1 ||
  draft.photo !== null ||
  draft.source.type !== null ||
  draft.nutrition.calories !== "" ||
  draft.ingredientGroups[0]?.id !== "import-ingredient-group-0" ||
  draft.ingredientGroups[0]?.ingredients[0]?.amount !== "2" ||
  draft.instructionGroups[0]?.steps[0]?.id !== "import-instruction-0-0"
) {
  throw new Error("Recipe text import adapter check failed.");
}
