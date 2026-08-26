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
  kitchenEquivalents?: readonly (readonly [number, number])[];
  kitchenToBase?: number;
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
    kitchenEquivalents: [
      [4, 114],
      [16, 454],
    ],
    kitchenToBase: 28,
    system: "us",
    toBase: 28.349523125,
    unit: "oz",
  },
  lb: {
    dimension: "mass",
    kitchenEquivalents: [
      [0.25, 114],
      [2.2, 1_000],
    ],
    kitchenToBase: 454,
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
    kitchenToBase: 5,
    system: "us",
    toBase: 4.92892159375,
    unit: "tsp",
  },
  tbsp: {
    dimension: "volume",
    kitchenToBase: 15,
    system: "us",
    toBase: 14.78676478125,
    unit: "tbsp",
  },
  "fl oz": {
    dimension: "volume",
    kitchenEquivalents: [
      [32, 950],
      [64, 1_950],
    ],
    kitchenToBase: 30,
    system: "us",
    toBase: 29.5735295625,
    unit: "fl oz",
  },
  cup: {
    dimension: "volume",
    kitchenEquivalents: [
      [4, 950],
      [8, 1_950],
    ],
    kitchenToBase: 240,
    system: "us",
    toBase: 236.5882365,
    unit: "cup",
  },
};

const cookingFractions = [
  { value: 0, label: "" },
  { value: 1 / 8, label: "1/8" },
  { value: 1 / 4, label: "1/4" },
  { value: 1 / 3, label: "1/3" },
  { value: 1 / 2, label: "1/2" },
  { value: 2 / 3, label: "2/3" },
  { value: 3 / 4, label: "3/4" },
  { value: 1, label: "" },
] as const;

const pluralUnits: Record<string, string> = {
  bunch: "bunches",
  can: "cans",
  clove: "cloves",
  cup: "cups",
  pack: "packs",
  piece: "pieces",
  pinch: "pinches",
  slice: "slices",
};

function decimal(value: number, maximumDigits: number) {
  const rounded = Number(value.toFixed(maximumDigits));
  return (
    value > 0 && rounded === 0 ? Number(value.toPrecision(3)) : rounded
  ).toString();
}

function displayUnit(unit: string, value: number) {
  return value > 1 ? (pluralUnits[unit.trim().toLowerCase()] ?? unit) : unit;
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

function baseAmountForMode(
  value: number,
  source: ConvertibleUnit,
  mode: "metric" | "us",
) {
  if (mode !== "metric" || source.system !== "us") {
    return value * source.toBase;
  }

  const equivalent = source.kitchenEquivalents?.find(
    ([quantity]) => Math.abs(value - quantity) <= 1e-9,
  );
  return equivalent?.[1] ?? value * (source.kitchenToBase ?? source.toBase);
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

  if (!source) {
    return {
      amount: servings === baseServings ? amount : decimal(scaled, 4),
      unit: displayUnit(unit, scaled),
    };
  }

  if (mode === "original") {
    const usesCookingFractions = ["tsp", "tbsp", "cup"].includes(source.unit);
    return {
      amount: usesCookingFractions ? cookingAmount(scaled) : decimal(scaled, 4),
      unit: displayUnit(unit, scaled),
    };
  }

  const baseAmount = baseAmountForMode(scaled, source, mode);
  const target = targetUnit(source, baseAmount, mode);
  const converted = baseAmount / target.toBase;

  return {
    amount: convertedAmount(converted, target),
    unit: displayUnit(target.unit, converted),
  };
}
