import type { RecipeDraft, RecipeNutrition } from "@/shared/types";

import { nutritionFields } from "./recipe-calculations";

export function createBlankRecipeDraft(): RecipeDraft {
  return {
    title: "",
    photo: null,
    prepMinutes: null,
    cookMinutes: null,
    servings: 1,
    ingredientGroups: [],
    instructionGroups: [],
    notes: "",
    nutrition: Object.fromEntries(
      nutritionFields.map(([key]) => [key, ""]),
    ) as RecipeNutrition,
    source: { type: null, name: "", url: "" },
  };
}
