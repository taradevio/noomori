import type {
  RecipeDraft,
  RecipeNutrition,
  RecipeSource,
} from "@/shared/types";

type RecipeCreateNutrition = {
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  cholesterol_mg: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

export type RecipeCreatePayload = {
  title: string;
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
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  nutrition_per_serving: RecipeCreateNutrition | null;
  source_type: "my_recipe" | "family" | "website";
  source_person_name: string | null;
  source_url: string | null;
};

function nullableText(value: string) {
  return value.trim() || null;
}

export function isValidRecipeWebsiteUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseRecipeAmount(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (!denominator) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (!denominator) return null;
    return Number(fraction[1]) / denominator;
  }

  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantityFromDraft(value: string) {
  const quantity = parseRecipeAmount(value);
  if (value.trim() && quantity === null) {
    throw new Error(`Invalid ingredient amount: ${value}`);
  }
  return quantity;
}

function nutritionValue(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return parsed;
}

export type RecipeDraftErrors = {
  title?: string;
  source?: string;
  sourceName?: string;
  sourceUrl?: string;
  ingredientAmounts: Record<string, string>;
  nutrition: Partial<Record<keyof RecipeNutrition, string>>;
};

export function validateRecipeDraft(draft: RecipeDraft): RecipeDraftErrors {
  const errors: RecipeDraftErrors = {
    ingredientAmounts: {},
    nutrition: {},
  };

  if (!draft.title.trim()) errors.title = "Enter a recipe name.";

  if (!draft.source.type) {
    errors.source = "Choose where this recipe came from.";
  } else if (
    draft.source.type === "family-friend" &&
    !draft.source.name.trim()
  ) {
    errors.sourceName = "Add who this recipe came from.";
  } else if (
    draft.source.type === "website" &&
    !isValidRecipeWebsiteUrl(draft.source.url)
  ) {
    errors.sourceUrl = "Enter a valid website URL.";
  }

  for (const group of draft.ingredientGroups) {
    for (const ingredient of group.ingredients) {
      if (
        ingredient.amount.trim() &&
        parseRecipeAmount(ingredient.amount) === null
      ) {
        errors.ingredientAmounts[ingredient.id] =
          "Use a number, decimal, or fraction.";
      }
    }
  }

  for (const key of Object.keys(draft.nutrition) as (keyof RecipeNutrition)[]) {
    const value = draft.nutrition[key].trim();
    const parsed = Number(value);
    if (value && (!Number.isFinite(parsed) || parsed < 0)) {
      errors.nutrition[key] = "Enter zero or a positive number.";
    }
  }

  return errors;
}

export function hasRecipeDraftErrors(errors: RecipeDraftErrors) {
  return Boolean(
    errors.title ||
    errors.source ||
    errors.sourceName ||
    errors.sourceUrl ||
    Object.keys(errors.ingredientAmounts).length ||
    Object.keys(errors.nutrition).length,
  );
}

function sourcePayload(source: RecipeSource) {
  if (source.type === "family-friend") {
    return {
      source_type: "family" as const,
      source_person_name: nullableText(source.name),
      source_url: null,
    };
  }
  if (source.type === "website") {
    return {
      source_type: "website" as const,
      source_person_name: null,
      source_url: nullableText(source.url),
    };
  }
  return {
    source_type: "my_recipe" as const,
    source_person_name: null,
    source_url: null,
  };
}

export function toRecipeCreatePayload(draft: RecipeDraft): RecipeCreatePayload {
  if (hasRecipeDraftErrors(validateRecipeDraft(draft))) {
    throw new Error("Invalid recipe draft.");
  }

  const nutrition: RecipeCreateNutrition = {
    calories_kcal: nutritionValue(draft.nutrition.calories, "calories"),
    protein_g: nutritionValue(draft.nutrition.proteinGrams, "protein"),
    carbs_g: nutritionValue(draft.nutrition.carbohydrateGrams, "carbohydrate"),
    fat_g: nutritionValue(draft.nutrition.fatGrams, "fat"),
    saturated_fat_g: nutritionValue(
      draft.nutrition.saturatedFatGrams,
      "saturated fat",
    ),
    cholesterol_mg: nutritionValue(
      draft.nutrition.cholesterolMilligrams,
      "cholesterol",
    ),
    fiber_g: nutritionValue(draft.nutrition.dietaryFiberGrams, "fiber"),
    sugar_g: nutritionValue(draft.nutrition.sugarGrams, "sugar"),
    sodium_mg: nutritionValue(draft.nutrition.sodiumMilligrams, "sodium"),
  };

  return {
    title: draft.title.trim(),
    description: nullableText(draft.notes),
    ingredients: draft.ingredientGroups.map((group) => ({
      title: group.title === null ? null : nullableText(group.title),
      items: group.ingredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        quantity: quantityFromDraft(ingredient.amount),
        unit: nullableText(ingredient.unit),
        note: nullableText(ingredient.note),
      })),
    })),
    instructions: draft.instructionGroups.map((group) => ({
      title: group.title === null ? null : nullableText(group.title),
      steps: group.steps.map((step) => ({ text: step.text.trim() })),
    })),
    servings: draft.servings,
    prep_time_minutes: draft.prepMinutes,
    cook_time_minutes: draft.cookMinutes,
    nutrition_per_serving: Object.values(nutrition).every(
      (value) => value === null,
    )
      ? null
      : nutrition,
    ...sourcePayload(draft.source),
  };
}
