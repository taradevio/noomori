import type { RecipeDraft } from "@/shared/types";

import { createBlankRecipeDraft } from "./recipe-draft";

export type ImportedRecipeTextDraft = {
  title: string | null;
  description: string | null;
  ingredients: {
    title: string | null;
    items: {
      name: string;
      quantity: number | null;
      unit: string | null;
      note: string | null;
    }[];
  }[];
  instructions: {
    title: string | null;
    steps: { text: string }[];
  }[];
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  nutrition_per_serving: {
    calories_kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    saturated_fat_g: number | null;
    cholesterol_mg: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
  } | null;
  // NOTE: Only website imports populate this transient acquisition URL.
  image_url: string | null;
};

function textNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

export function toImportedRecipeDraft(
  imported: ImportedRecipeTextDraft,
): RecipeDraft {
  const blank = createBlankRecipeDraft();
  return {
    ...blank,
    title: imported.title ?? "",
    prepMinutes: imported.prep_time_minutes,
    cookMinutes: imported.cook_time_minutes,
    servings: imported.servings ?? blank.servings,
    notes: imported.description ?? "",
    // NOTE: Imported nutrition uses the existing editable fields; missing or
    // unsupported source values remain blank for review before saving.
    nutrition: {
      calories: textNumber(imported.nutrition_per_serving?.calories_kcal),
      fatGrams: textNumber(imported.nutrition_per_serving?.fat_g),
      saturatedFatGrams: textNumber(
        imported.nutrition_per_serving?.saturated_fat_g,
      ),
      cholesterolMilligrams: textNumber(
        imported.nutrition_per_serving?.cholesterol_mg,
      ),
      sodiumMilligrams: textNumber(imported.nutrition_per_serving?.sodium_mg),
      carbohydrateGrams: textNumber(imported.nutrition_per_serving?.carbs_g),
      dietaryFiberGrams: textNumber(imported.nutrition_per_serving?.fiber_g),
      sugarGrams: textNumber(imported.nutrition_per_serving?.sugar_g),
      proteinGrams: textNumber(imported.nutrition_per_serving?.protein_g),
    },
    ingredientGroups: imported.ingredients.map((group, groupIndex) => ({
      id: `import-ingredient-group-${groupIndex}`,
      title: group.title,
      ingredients: group.items.map((ingredient, ingredientIndex) => ({
        id: `import-ingredient-${groupIndex}-${ingredientIndex}`,
        amount: textNumber(ingredient.quantity),
        unit: ingredient.unit ?? "",
        name: ingredient.name,
        note: ingredient.note ?? "",
      })),
    })),
    instructionGroups: imported.instructions.map((group, groupIndex) => ({
      id: `import-instruction-group-${groupIndex}`,
      title: group.title,
      steps: group.steps.map((step, stepIndex) => ({
        id: `import-instruction-${groupIndex}-${stepIndex}`,
        text: step.text,
      })),
    })),
  };
}
