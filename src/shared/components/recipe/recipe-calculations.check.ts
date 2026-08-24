import type { RecipeNutrition } from "@/shared/types";

import { calculateNutritionPerServing } from "./recipe-calculations";

const nutrition: RecipeNutrition = {
  calories: "400",
  fatGrams: "12.5",
  saturatedFatGrams: "",
  cholesterolMilligrams: "0",
  sodiumMilligrams: "300",
  carbohydrateGrams: "40",
  dietaryFiberGrams: "4",
  sugarGrams: "8",
  proteinGrams: "20",
};
const original = { ...nutrition };
const increased = calculateNutritionPerServing(nutrition, 4, 8);
const decreased = calculateNutritionPerServing(nutrition, 4, 2);
const clamped = calculateNutritionPerServing(nutrition, 0, 0);

if (
  increased.calories !== "200" ||
  decreased.fatGrams !== "25" ||
  clamped.calories !== "400" ||
  increased.saturatedFatGrams !== "" ||
  JSON.stringify(nutrition) !== JSON.stringify(original)
) {
  throw new Error("Recipe nutrition calculation check failed.");
}
