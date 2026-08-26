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
  instructions: [{ title: null, steps: [{ text: "Stir and serve." }] }],
  servings: null,
  prep_time_minutes: 10,
  cook_time_minutes: null,
  nutrition_per_serving: {
    calories_kcal: 480,
    protein_g: 36,
    carbs_g: 4,
    fat_g: 34,
    saturated_fat_g: 12,
    cholesterol_mg: 125,
    fiber_g: 0.5,
    sugar_g: 2,
    sodium_mg: 420,
  },
  image_url: null,
};

const draft = toImportedRecipeDraft(imported);
const withoutNutrition = toImportedRecipeDraft({
  ...imported,
  nutrition_per_serving: null,
});
if (
  draft.title !== imported.title ||
  draft.servings !== 1 ||
  draft.photo !== null ||
  draft.source.type !== null ||
  draft.nutrition.calories !== "480" ||
  draft.nutrition.proteinGrams !== "36" ||
  draft.nutrition.dietaryFiberGrams !== "0.5" ||
  draft.nutrition.sodiumMilligrams !== "420" ||
  withoutNutrition.nutrition.calories !== "" ||
  draft.ingredientGroups[0]?.id !== "import-ingredient-group-0" ||
  draft.ingredientGroups[0]?.ingredients[0]?.amount !== "2" ||
  draft.instructionGroups[0]?.steps[0]?.id !== "import-instruction-0-0"
) {
  throw new Error("Recipe text import adapter check failed.");
}
