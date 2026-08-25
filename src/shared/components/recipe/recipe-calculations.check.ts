import type { RecipeNutrition } from "@/shared/types";

import {
  formatIngredientMeasurement,
  type MeasurementDisplayMode,
} from "./recipe-calculations";

type Case = {
  amount: string;
  displayedServings?: number;
  expected: { amount: string; unit: string };
  mode: MeasurementDisplayMode;
  savedServings?: number;
  unit: string;
};

const cases: Case[] = [
  {
    amount: "2",
    displayedServings: 8,
    expected: { amount: "4", unit: "cup" },
    mode: "original",
    savedServings: 4,
    unit: "cup",
  },
  {
    amount: "2",
    displayedServings: 8,
    expected: { amount: "946.4", unit: "ml" },
    mode: "metric",
    savedServings: 4,
    unit: "cup",
  },
  {
    amount: "1",
    expected: { amount: "236.6", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "1",
    expected: { amount: "4.93", unit: "ml" },
    mode: "metric",
    unit: "tsp",
  },
  {
    amount: "1",
    expected: { amount: "14.8", unit: "ml" },
    mode: "metric",
    unit: "tbsp",
  },
  {
    amount: "1",
    expected: { amount: "29.6", unit: "ml" },
    mode: "metric",
    unit: "fl oz",
  },
  {
    amount: "1",
    expected: { amount: "28.35", unit: "g" },
    mode: "metric",
    unit: "oz",
  },
  {
    amount: "1",
    expected: { amount: "453.59", unit: "g" },
    mode: "metric",
    unit: "lb",
  },
  {
    amount: "0.00881849",
    expected: { amount: "250", unit: "mg" },
    mode: "metric",
    unit: "oz",
  },
  {
    amount: "1000",
    expected: { amount: "1", unit: "g" },
    mode: "metric",
    unit: "mg",
  },
  {
    amount: "1000",
    expected: { amount: "1", unit: "kg" },
    mode: "metric",
    unit: "g",
  },
  {
    amount: "1000",
    expected: { amount: "1", unit: "L" },
    mode: "metric",
    unit: "ml",
  },
  {
    amount: "500",
    expected: { amount: "1.102", unit: "lb" },
    mode: "us",
    unit: "g",
  },
  {
    amount: "1",
    expected: { amount: "2.205", unit: "lb" },
    mode: "us",
    unit: "kg",
  },
  {
    amount: "200",
    expected: { amount: "7.055", unit: "oz" },
    mode: "us",
    unit: "g",
  },
  {
    amount: "453.59237",
    expected: { amount: "1", unit: "lb" },
    mode: "us",
    unit: "g",
  },
  {
    amount: "14.78676478125",
    expected: { amount: "1", unit: "tbsp" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "59.147059125",
    expected: { amount: "¼", unit: "cup" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "1000",
    expected: { amount: "4.227", unit: "cup" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "1",
    expected: { amount: "4.227", unit: "cup" },
    mode: "us",
    unit: "L",
  },
  {
    amount: "59.194",
    expected: { amount: "¼", unit: "cup" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "68.610588585",
    expected: { amount: "0.29", unit: "cup" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "1/2",
    displayedServings: 3,
    expected: { amount: "0.75", unit: "clove" },
    mode: "metric",
    savedServings: 2,
    unit: "clove",
  },
  {
    amount: "2.125",
    displayedServings: 3,
    expected: { amount: "3.1875", unit: "scoop" },
    mode: "us",
    savedServings: 2,
    unit: "scoop",
  },
  {
    amount: "to taste",
    displayedServings: 8,
    expected: { amount: "to taste", unit: "" },
    mode: "metric",
    savedServings: 4,
    unit: "",
  },
];

for (const testCase of cases) {
  const result = formatIngredientMeasurement(
    testCase.amount,
    testCase.unit,
    testCase.savedServings ?? 1,
    testCase.displayedServings ?? testCase.savedServings ?? 1,
    testCase.mode,
  );
  if (JSON.stringify(result) !== JSON.stringify(testCase.expected)) {
    throw new Error(
      `Ingredient measurement check failed for ${JSON.stringify(testCase)}: ${JSON.stringify(result)}`,
    );
  }
}

const canonical = { amount: "2", unit: "cup" };
formatIngredientMeasurement(canonical.amount, canonical.unit, 4, 8, "metric");
formatIngredientMeasurement(canonical.amount, canonical.unit, 4, 2, "us");
const restored = formatIngredientMeasurement(
  canonical.amount,
  canonical.unit,
  4,
  4,
  "original",
);
if (
  JSON.stringify(restored) !== JSON.stringify(canonical) ||
  canonical.amount !== "2" ||
  canonical.unit !== "cup"
) {
  throw new Error("Ingredient measurement calculation mutated canonical data.");
}

const nutrition: RecipeNutrition = {
  calories: "410",
  fatGrams: "12",
  saturatedFatGrams: "6",
  cholesterolMilligrams: "630",
  sodiumMilligrams: "2802",
  carbohydrateGrams: "20",
  dietaryFiberGrams: "",
  sugarGrams: "17",
  proteinGrams: "52",
};
const ingredient = {
  amount: "500",
  unit: "g",
  name: "prawns / shrimp",
  note: "peeled and deveined",
};
const nutritionBefore = JSON.stringify(nutrition);
const displayedIngredient = {
  ...ingredient,
  ...formatIngredientMeasurement(
    ingredient.amount,
    ingredient.unit,
    1,
    4,
    "us",
  ),
};
if (
  JSON.stringify(nutrition) !== nutritionBefore ||
  displayedIngredient.name !== ingredient.name ||
  displayedIngredient.note !== ingredient.note
) {
  throw new Error("Serving display changed nutrition or ingredient wording.");
}
