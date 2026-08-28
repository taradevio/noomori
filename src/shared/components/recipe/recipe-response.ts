import type {
  RecipeCardModel,
  RecipeDraft,
  RecipeDetailModel,
  RecipeNutrition,
  RecipeSource,
} from "@/shared/types";

type ApiRecipe = {
  id: string;
  is_shared: boolean;
  owner_user_id: string;
  title: string;
  description: string | null;
  image_path: string | null;
  image_url: string | null;
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
  nutrition_per_serving: Partial<
    Record<
      | "calories_kcal"
      | "protein_g"
      | "carbs_g"
      | "fat_g"
      | "saturated_fat_g"
      | "cholesterol_mg"
      | "fiber_g"
      | "sugar_g"
      | "sodium_mg",
      number | null
    >
  > | null;
  source_type: "my_recipe" | "family" | "website";
  source_person_name: string | null;
  source_url: string | null;
};

function textNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function sourceFromApi(recipe: ApiRecipe): RecipeSource {
  if (recipe.source_type === "family") {
    return {
      type: "family-friend",
      name: recipe.source_person_name ?? "",
      url: "",
    };
  }
  if (recipe.source_type === "website") {
    return { type: "website", name: "", url: recipe.source_url ?? "" };
  }
  return { type: "my-recipe", name: "", url: "" };
}

function nutritionFromApi(recipe: ApiRecipe): RecipeNutrition {
  const nutrition = recipe.nutrition_per_serving;
  return {
    calories: textNumber(nutrition?.calories_kcal),
    fatGrams: textNumber(nutrition?.fat_g),
    saturatedFatGrams: textNumber(nutrition?.saturated_fat_g),
    cholesterolMilligrams: textNumber(nutrition?.cholesterol_mg),
    sodiumMilligrams: textNumber(nutrition?.sodium_mg),
    carbohydrateGrams: textNumber(nutrition?.carbs_g),
    dietaryFiberGrams: textNumber(nutrition?.fiber_g),
    sugarGrams: textNumber(nutrition?.sugar_g),
    proteinGrams: textNumber(nutrition?.protein_g),
  };
}

export function toRecipeCard(recipe: ApiRecipe): RecipeCardModel {
  const prep = recipe.prep_time_minutes ?? 0;
  const cook = recipe.cook_time_minutes ?? 0;
  return {
    id: recipe.id,
    title: recipe.title,
    imagePath: recipe.image_path,
    imageUrl: recipe.image_url,
    cookingTimeMinutes: prep + cook || null,
    isShared: recipe.is_shared,
  };
}

export function toRecipeDetail(recipe: ApiRecipe): RecipeDetailModel {
  return {
    id: recipe.id,
    title: recipe.title,
    imagePath: recipe.image_path,
    imageUrl: recipe.image_url,
    isShared: recipe.is_shared,
    prepMinutes: recipe.prep_time_minutes,
    cookMinutes: recipe.cook_time_minutes,
    servings: recipe.servings,
    notes: recipe.description ?? "",
    nutrition: nutritionFromApi(recipe),
    source: sourceFromApi(recipe),
    ingredientGroups: recipe.ingredients.map((group, groupIndex) => ({
      id: `ingredient-group-${groupIndex}`,
      title: group.title,
      ingredients: group.items.map((ingredient, ingredientIndex) => ({
        id: `ingredient-${groupIndex}-${ingredientIndex}`,
        amount: textNumber(ingredient.quantity),
        unit: ingredient.unit ?? "",
        name: ingredient.name,
        note: ingredient.note ?? "",
      })),
    })),
    instructionGroups: recipe.instructions.map((group, groupIndex) => ({
      id: `instruction-group-${groupIndex}`,
      title: group.title,
      steps: group.steps.map((step, stepIndex) => ({
        id: `instruction-${groupIndex}-${stepIndex}`,
        text: step.text,
      })),
    })),
  };
}

export function toRecipeDraft(recipe: ApiRecipe): RecipeDraft {
  const {
    id: _id,
    imagePath,
    imageUrl,
    isShared: _isShared,
    ...draft
  } = toRecipeDetail(recipe);
  return {
    ...draft,
    photo: imagePath
      ? {
          uri: imageUrl ?? "",
          width: 1,
          height: 1,
          fileName: null,
          mimeType: "image/webp",
          imagePath,
        }
      : null,
  };
}

export type { ApiRecipe };
