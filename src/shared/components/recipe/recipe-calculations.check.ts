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
    expected: { amount: "4", unit: "cups" },
    mode: "original",
    savedServings: 4,
    unit: "cup",
  },
  {
    amount: "2",
    displayedServings: 8,
    expected: { amount: "950", unit: "ml" },
    mode: "metric",
    savedServings: 4,
    unit: "cup",
  },
  {
    amount: "1",
    expected: { amount: "240", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "0.1",
    expected: { amount: "24", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "0.25",
    expected: { amount: "60", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "1/3",
    expected: { amount: "80", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "0.5",
    expected: { amount: "120", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "0.75",
    expected: { amount: "180", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "1.5",
    expected: { amount: "360", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "4",
    expected: { amount: "950", unit: "ml" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "8",
    expected: { amount: "1.95", unit: "L" },
    mode: "metric",
    unit: "cup",
  },
  {
    amount: "0.25",
    expected: { amount: "1.25", unit: "ml" },
    mode: "metric",
    unit: "tsp",
  },
  {
    amount: "0.5",
    expected: { amount: "2.5", unit: "ml" },
    mode: "metric",
    unit: "tsp",
  },
  {
    amount: "1",
    expected: { amount: "5", unit: "ml" },
    mode: "metric",
    unit: "tsp",
  },
  {
    amount: "2.5",
    expected: { amount: "12.5", unit: "ml" },
    mode: "metric",
    unit: "tsp",
  },
  {
    amount: "1",
    expected: { amount: "15", unit: "ml" },
    mode: "metric",
    unit: "tbsp",
  },
  {
    amount: "1",
    expected: { amount: "30", unit: "ml" },
    mode: "metric",
    unit: "fl oz",
  },
  {
    amount: "32",
    expected: { amount: "950", unit: "ml" },
    mode: "metric",
    unit: "fl oz",
  },
  {
    amount: "64",
    expected: { amount: "1.95", unit: "L" },
    mode: "metric",
    unit: "fl oz",
  },
  {
    amount: "1",
    expected: { amount: "28", unit: "g" },
    mode: "metric",
    unit: "oz",
  },
  {
    amount: "4",
    expected: { amount: "114", unit: "g" },
    mode: "metric",
    unit: "oz",
  },
  {
    amount: "16",
    expected: { amount: "454", unit: "g" },
    mode: "metric",
    unit: "oz",
  },
  {
    amount: "0.25",
    expected: { amount: "114", unit: "g" },
    mode: "metric",
    unit: "lb",
  },
  {
    amount: "1",
    expected: { amount: "454", unit: "g" },
    mode: "metric",
    unit: "lb",
  },
  {
    amount: "2.2",
    expected: { amount: "1", unit: "kg" },
    mode: "metric",
    unit: "lb",
  },
  {
    amount: "0.00881849",
    expected: { amount: "246.918", unit: "mg" },
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
    expected: { amount: "1/4", unit: "cup" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "1000",
    expected: { amount: "4.227", unit: "cups" },
    mode: "us",
    unit: "ml",
  },
  {
    amount: "1",
    expected: { amount: "4.227", unit: "cups" },
    mode: "us",
    unit: "L",
  },
  {
    amount: "59.194",
    expected: { amount: "1/4", unit: "cup" },
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
    amount: "0.125",
    expected: { amount: "1/8", unit: "tsp" },
    mode: "original",
    unit: "tsp",
  },
  {
    amount: "0.25",
    expected: { amount: "1/4", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.3333333333333333",
    expected: { amount: "1/3", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.5",
    expected: { amount: "1/2", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.6666666666666666",
    expected: { amount: "2/3", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.75",
    expected: { amount: "3/4", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "1.5",
    expected: { amount: "1 1/2", unit: "cups" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.2498",
    expected: { amount: "1/4", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.29",
    expected: { amount: "0.29", unit: "cup" },
    mode: "original",
    unit: "cup",
  },
  {
    amount: "0.75",
    expected: { amount: "3/4", unit: "cup" },
    mode: "us",
    unit: "cup",
  },
  {
    amount: "2",
    expected: { amount: "2", unit: "cloves" },
    mode: "metric",
    unit: "clove",
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
  {
    amount: "179.9999999997",
    expected: { amount: "180", unit: "ml" },
    mode: "metric",
    unit: "ml",
  },
  {
    amount: "0.000000000001",
    expected: { amount: "2.4e-10", unit: "ml" },
    mode: "metric",
    unit: "cup",
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
const canonicalBefore = JSON.stringify(canonical);
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
  JSON.stringify(restored) !== JSON.stringify({ amount: "2", unit: "cups" }) ||
  JSON.stringify(canonical) !== canonicalBefore ||
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
