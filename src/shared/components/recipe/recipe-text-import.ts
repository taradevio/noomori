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
};

function textNumber(value: number | null) {
  return value === null ? "" : String(value);
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
