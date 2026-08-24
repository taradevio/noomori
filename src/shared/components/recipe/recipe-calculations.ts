import type { RecipeNutrition } from "@/shared/types";

export const nutritionFields = [
  ["calories", "Calories", ""],
  ["fatGrams", "Fat", "g"],
  ["saturatedFatGrams", "Saturated fat", "g"],
  ["cholesterolMilligrams", "Cholesterol", "mg"],
  ["sodiumMilligrams", "Sodium", "mg"],
  ["carbohydrateGrams", "Carbohydrate", "g"],
  ["dietaryFiberGrams", "Dietary fiber", "g"],
  ["sugarGrams", "Sugar", "g"],
  ["proteinGrams", "Protein", "g"],
] as const satisfies readonly (readonly [
  keyof RecipeNutrition,
  string,
  string,
])[];

export function calculateNutritionPerServing(
  nutrition: RecipeNutrition,
  baseServings: number,
  displayedServings: number,
): RecipeNutrition {
  const base = Math.max(1, baseServings);
  const displayed = Math.max(1, displayedServings);

  // NOTE: Detail treats the saved batch as fixed, so only the displayed
  // per-serving values change when the viewer adjusts servings.
  return Object.fromEntries(
    nutritionFields.map(([key]) => {
      const raw = nutrition[key].trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed < 0) return [key, ""];
      return [key, Number(((parsed * base) / displayed).toFixed(2)).toString()];
    }),
  ) as RecipeNutrition;
}
