import type { RecipeNutrition } from "@/shared/types";

import { parseRecipeAmount } from "./recipe-payload";

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

export type MeasurementDisplayMode = "original" | "metric" | "us";

type ConvertibleUnit = {
  dimension: "mass" | "volume";
  system: Exclude<MeasurementDisplayMode, "original">;
  toBase: number;
  unit: string;
};

const convertibleUnits: Record<string, ConvertibleUnit> = {
  mg: { dimension: "mass", system: "metric", toBase: 0.001, unit: "mg" },
  g: { dimension: "mass", system: "metric", toBase: 1, unit: "g" },
  kg: { dimension: "mass", system: "metric", toBase: 1_000, unit: "kg" },
  oz: {
    dimension: "mass",
    system: "us",
    toBase: 28.349523125,
    unit: "oz",
  },
  lb: {
    dimension: "mass",
    system: "us",
    toBase: 453.59237,
    unit: "lb",
  },
  ml: { dimension: "volume", system: "metric", toBase: 1, unit: "ml" },
  l: {
    dimension: "volume",
    system: "metric",
    toBase: 1_000,
    unit: "L",
  },
  tsp: {
    dimension: "volume",
    system: "us",
    toBase: 4.92892159375,
    unit: "tsp",
  },
  tbsp: {
    dimension: "volume",
    system: "us",
    toBase: 14.78676478125,
    unit: "tbsp",
  },
  "fl oz": {
    dimension: "volume",
    system: "us",
    toBase: 29.5735295625,
    unit: "fl oz",
  },
  cup: {
    dimension: "volume",
    system: "us",
    toBase: 236.5882365,
    unit: "cup",
  },
};

const cookingFractions = [
  { value: 0, label: "" },
  { value: 1 / 8, label: "⅛" },
  { value: 1 / 4, label: "¼" },
  { value: 1 / 3, label: "⅓" },
  { value: 1 / 2, label: "½" },
  { value: 2 / 3, label: "⅔" },
  { value: 3 / 4, label: "¾" },
  { value: 1, label: "" },
] as const;

function decimal(value: number, maximumDigits: number) {
  return Number(value.toFixed(maximumDigits)).toString();
}

function targetUnit(
  source: ConvertibleUnit,
  baseAmount: number,
  mode: "metric" | "us",
) {
  if (source.dimension === "mass") {
    if (mode === "metric") {
      if (baseAmount > 0 && baseAmount < 1) return convertibleUnits.mg;
      return baseAmount >= 1_000 ? convertibleUnits.kg : convertibleUnits.g;
    }

    const ounces = baseAmount / convertibleUnits.oz.toBase;
    return ounces >= 16 ? convertibleUnits.lb : convertibleUnits.oz;
  }

  if (mode === "metric") {
    return baseAmount >= 1_000 ? convertibleUnits.l : convertibleUnits.ml;
  }

  const teaspoons = baseAmount / convertibleUnits.tsp.toBase;
  if (teaspoons < 3) return convertibleUnits.tsp;
  const tablespoons = baseAmount / convertibleUnits.tbsp.toBase;
  return tablespoons < 4 ? convertibleUnits.tbsp : convertibleUnits.cup;
}

function cookingAmount(value: number) {
  if (value === 0) return "0";

  const whole = Math.floor(value);
  const fraction = value - whole;
  const nearest = cookingFractions.reduce((best, candidate) =>
    Math.abs(candidate.value - fraction) < Math.abs(best.value - fraction)
      ? candidate
      : best,
  );
  const snapped = whole + nearest.value;
  const absoluteError = Math.abs(value - snapped);
  const relativeError = absoluteError / value;

  // NOTE: Fractions are display-only and require both tolerances so a readable
  // fraction never materially changes a small converted measurement.
  if (absoluteError <= 0.005 && relativeError <= 0.01) {
    const snappedWhole = nearest.value === 1 ? whole + 1 : whole;
    return [snappedWhole || "", nearest.label].filter(Boolean).join(" ");
  }

  return decimal(value, 3);
}

function convertedAmount(value: number, target: ConvertibleUnit) {
  if (target.system === "us") {
    return target.dimension === "volume" && target.unit !== "fl oz"
      ? cookingAmount(value)
      : decimal(value, 3);
  }

  if (target.unit === "ml") {
    return decimal(value, value >= 10 ? 1 : value >= 1 ? 2 : 4);
  }
  if (target.unit === "g") {
    return decimal(value, value >= 10 ? 2 : value >= 1 ? 3 : 4);
  }
  return decimal(value, 3);
}

export function formatIngredientMeasurement(
  amount: string,
  unit: string,
  savedServings: number,
  displayedServings: number,
  mode: MeasurementDisplayMode,
) {
  // NOTE: Always derive from the saved amount, then scale, convert, and format.
  // No displayed value is fed back into this calculation, preventing rounding drift.
  const parsed = parseRecipeAmount(amount);
  if (parsed === null) return { amount, unit };

  const baseServings = Math.max(1, savedServings);
  const servings = Math.max(1, displayedServings);
  const scaled = (parsed * servings) / baseServings;
  const source = convertibleUnits[unit.trim().toLowerCase()];

  if (mode === "original" || !source) {
    return {
      amount: servings === baseServings ? amount : decimal(scaled, 4),
      unit,
    };
  }

  const baseAmount = scaled * source.toBase;
  const target = targetUnit(source, baseAmount, mode);
  if (servings === baseServings && target.unit === source.unit) {
    return { amount, unit };
  }

  return {
    amount: convertedAmount(baseAmount / target.toBase, target),
    unit: target.unit,
  };
}
