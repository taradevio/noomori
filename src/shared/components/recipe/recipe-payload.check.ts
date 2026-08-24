import type { RecipeDraft } from "@/shared/types";

import { toRecipeCreatePayload } from "./recipe-payload";

const draft: RecipeDraft = {
  title: "  Grandma's Soup  ",
  photo: {
    uri: "file:///local-only.jpg",
    width: 1200,
    height: 800,
    fileName: "local-only.jpg",
    mimeType: "image/jpeg",
  },
  prepMinutes: 15,
  cookMinutes: 45,
  servings: 1,
  ingredientGroups: [
    {
      id: "ingredient-group-1",
      title: null,
      ingredients: [
        {
          id: "ingredient-1",
          amount: "1 1/2",
          unit: " cups ",
          name: " Stock ",
          note: " ",
        },
      ],
    },
  ],
  instructionGroups: [
    {
      id: "instruction-group-1",
      title: " Cooking ",
      steps: [{ id: "instruction-1", text: " Simmer. " }],
    },
  ],
  notes: " Family favorite ",
  nutrition: {
    calories: "120",
    fatGrams: "",
    saturatedFatGrams: "9",
    cholesterolMilligrams: "30",
    sodiumMilligrams: "250",
    carbohydrateGrams: "12",
    dietaryFiberGrams: "2",
    sugarGrams: "3",
    proteinGrams: "7",
  },
  source: { type: "family-friend", name: " Grandma ", url: "" },
};

const payload = toRecipeCreatePayload(draft);
const serialized = JSON.stringify(payload);

if (
  payload.title !== "Grandma's Soup" ||
  payload.ingredients[0]?.items[0]?.quantity !== 1.5 ||
  payload.ingredients[0]?.items[0]?.unit !== "cups" ||
  payload.ingredients[0]?.items[0]?.note !== null ||
  payload.instructions[0]?.steps[0]?.text !== "Simmer." ||
  payload.servings !== 1 ||
  payload.prep_time_minutes !== 15 ||
  payload.cook_time_minutes !== 45 ||
  payload.nutrition_per_serving?.calories_kcal !== 120 ||
  payload.nutrition_per_serving?.saturated_fat_g !== 9 ||
  payload.nutrition_per_serving?.cholesterol_mg !== 30 ||
  payload.source_type !== "family" ||
  payload.source_person_name !== "Grandma" ||
  serialized.includes("photo") ||
  serialized.includes("image_path") ||
  serialized.includes("ingredient-group-1")
) {
  throw new Error("Recipe create payload check failed.");
}

function expectRejected(update: Partial<RecipeDraft>) {
  let rejected = false;
  try {
    toRecipeCreatePayload({ ...draft, ...update });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Invalid recipe draft was accepted.");
}

expectRejected({
  ingredientGroups: [
    {
      ...draft.ingredientGroups[0],
      ingredients: [
        { ...draft.ingredientGroups[0].ingredients[0], amount: "many" },
      ],
    },
  ],
});
expectRejected({ title: "  " });
expectRejected({ source: { type: null, name: "", url: "" } });
expectRejected({
  source: { type: "family-friend", name: "  ", url: "" },
});
expectRejected({
  source: { type: "website", name: "", url: "not a url" },
});
expectRejected({
  nutrition: { ...draft.nutrition, sodiumMilligrams: "-1" },
});
expectRejected({
  nutrition: { ...draft.nutrition, proteinGrams: "many" },
});
