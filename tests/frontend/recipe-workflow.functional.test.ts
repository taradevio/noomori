// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { QueryClient } from "@tanstack/react-query";

import { formatIngredientMeasurement } from "@/shared/components/recipe/recipe-calculations";
import { toRecipeCreatePayload } from "@/shared/components/recipe/recipe-payload";
import {
  cacheCreatedRecipe,
  cacheDeletedRecipe,
  cacheUpdatedRecipe,
  recipeKeys,
} from "@/shared/components/recipe/recipe-query";
import {
  toRecipeDetail,
  toRecipeDraft,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import type { RecipeDraft } from "@/shared/types";

const draft: RecipeDraft = {
  title: "  Family soup  ",
  photo: null,
  prepMinutes: 10,
  cookMinutes: 20,
  servings: 2,
  ingredientGroups: [{
    id: "group",
    title: null,
    ingredients: [{ id: "ingredient", amount: "1 1/2", unit: "cup", name: "stock", note: "warm" }],
  }],
  instructionGroups: [{ id: "steps", title: null, steps: [{ id: "step", text: " Simmer. " }] }],
  notes: " Serve hot. ",
  nutrition: {
    calories: "120",
    fatGrams: "",
    saturatedFatGrams: "",
    cholesterolMilligrams: "",
    sodiumMilligrams: "",
    carbohydrateGrams: "",
    dietaryFiberGrams: "",
    sugarGrams: "",
    proteinGrams: "5",
  },
  source: { type: "family-friend", name: " Grandma ", url: "" },
};

function apiRecipe(changes: Partial<ApiRecipe> = {}): ApiRecipe {
  return {
    id: "recipe-1",
    owner_user_id: "owner",
    is_shared: false,
    title: "Family soup",
    description: "Serve hot.",
    image_path: null,
    image_url: null,
    ingredients: [{ title: null, items: [{ name: "stock", quantity: 1.5, unit: "cup", note: "warm" }] }],
    instructions: [{ title: null, steps: [{ text: "Simmer." }] }],
    servings: 2,
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    nutrition_per_serving: { calories_kcal: 120, protein_g: 5 },
    source_type: "family",
    source_person_name: "Grandma",
    source_url: null,
    ...changes,
  };
}

describe("recipe functional workflow", () => {
  it("validates and serializes a draft, then restores editable API data", () => {
    const payload = toRecipeCreatePayload(draft);
    expect(payload).toMatchObject({
      title: "Family soup",
      servings: 2,
      source_type: "family",
      source_person_name: "Grandma",
      ingredients: [{ items: [{ quantity: 1.5, unit: "cup" }] }],
      instructions: [{ steps: [{ text: "Simmer." }] }],
    });

    expect(toRecipeDraft(apiRecipe())).toMatchObject({
      title: "Family soup",
      servings: 2,
      source: { type: "family-friend", name: "Grandma" },
    });
    expect(toRecipeDetail(apiRecipe()).prepMinutes).toBe(10);
  });

  it("adjusts servings and converts measurements without changing saved data", () => {
    expect(formatIngredientMeasurement("1 1/2", "cup", 2, 4, "original")).toEqual({
      amount: "3",
      unit: "cups",
    });
    expect(formatIngredientMeasurement("1", "cup", 2, 2, "metric")).toEqual({
      amount: "240",
      unit: "ml",
    });
  });

  it("keeps personal and household caches synchronized through create, share, edit, and delete", () => {
    const client = new QueryClient();
    client.setQueryData<ApiRecipe[]>(recipeKeys.list, []);
    client.setQueryData<ApiRecipe[]>(recipeKeys.householdList, []);

    cacheCreatedRecipe(client, apiRecipe());
    cacheUpdatedRecipe(client, apiRecipe({ is_shared: true, title: "Shared soup" }));

    expect(client.getQueryData<ApiRecipe[]>(recipeKeys.list)?.[0]).toMatchObject({ title: "Shared soup" });
    expect(client.getQueryData<ApiRecipe[]>(recipeKeys.householdList)?.[0]).toMatchObject({ is_shared: true });

    cacheDeletedRecipe(client, "recipe-1");
    expect(client.getQueryData(recipeKeys.list)).toEqual([]);
    expect(client.getQueryData(recipeKeys.householdList)).toEqual([]);
    client.clear();
  });

  it("rejects invalid core form fields before a request is made", () => {
    expect(() => toRecipeCreatePayload({ ...draft, title: "" })).toThrow("Invalid recipe draft");
    expect(() => toRecipeCreatePayload({
      ...draft,
      ingredientGroups: [{ ...draft.ingredientGroups[0], ingredients: [{ ...draft.ingredientGroups[0].ingredients[0], amount: "many" }] }],
    })).toThrow("Invalid recipe draft");
  });
});
