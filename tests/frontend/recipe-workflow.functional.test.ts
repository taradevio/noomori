// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import { QueryClient } from "@tanstack/react-query";

import { formatIngredientMeasurement } from "@/shared/components/recipe/recipe-calculations";
import {
  toRecipeCreatePayload,
  validateRecipeDraft,
} from "@/shared/components/recipe/recipe-payload";
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
  ingredientGroups: [
    {
      id: "group",
      title: null,
      ingredients: [
        {
          id: "ingredient",
          amount: "1 1/2",
          unit: "cup",
          name: "stock",
          note: "warm",
        },
      ],
    },
  ],
  instructionGroups: [
    { id: "steps", title: null, steps: [{ id: "step", text: " Simmer. " }] },
  ],
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
    ingredients: [
      {
        title: null,
        items: [{ name: "stock", quantity: 1.5, unit: "cup", note: "warm" }],
      },
    ],
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
    expect(
      formatIngredientMeasurement("1 1/2", "cup", 2, 4, "original"),
    ).toEqual({
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
    cacheUpdatedRecipe(
      client,
      apiRecipe({ is_shared: true, title: "Shared soup" }),
    );

    expect(
      client.getQueryData<ApiRecipe[]>(recipeKeys.list)?.[0],
    ).toMatchObject({ title: "Shared soup" });
    expect(
      client.getQueryData<ApiRecipe[]>(recipeKeys.householdList)?.[0],
    ).toMatchObject({ is_shared: true });

    cacheDeletedRecipe(client, "recipe-1");
    expect(client.getQueryData(recipeKeys.list)).toEqual([]);
    expect(client.getQueryData(recipeKeys.householdList)).toEqual([]);
    client.clear();
  });

  it("rejects invalid core form fields before a request is made", () => {
    expect(() => toRecipeCreatePayload({ ...draft, title: "" })).toThrow(
      "Invalid recipe draft",
    );
    expect(() =>
      toRecipeCreatePayload({
        ...draft,
        ingredientGroups: [
          {
            ...draft.ingredientGroups[0],
            ingredients: [
              { ...draft.ingredientGroups[0].ingredients[0], amount: "many" },
            ],
          },
        ],
      }),
    ).toThrow("Invalid recipe draft");
  });

  it("validates backend text limits after trimming", () => {
    const sourceUrl = (length: number) => {
      const prefix = "https://example.com/";
      return `${prefix}${"a".repeat(length - prefix.length)}`;
    };
    const cases: {
      label: string;
      max: number;
      value?: (length: number) => string;
      update: (value: string) => RecipeDraft;
    }[] = [
      {
        label: "recipe title",
        max: 200,
        update: (value) => ({ ...draft, title: value }),
      },
      {
        label: "ingredient section title",
        max: 200,
        update: (value) => ({
          ...draft,
          ingredientGroups: [{ ...draft.ingredientGroups[0], title: value }],
        }),
      },
      {
        label: "ingredient name",
        max: 300,
        update: (value) => ({
          ...draft,
          ingredientGroups: [
            {
              ...draft.ingredientGroups[0],
              ingredients: [
                { ...draft.ingredientGroups[0].ingredients[0], name: value },
              ],
            },
          ],
        }),
      },
      {
        label: "ingredient unit",
        max: 100,
        update: (value) => ({
          ...draft,
          ingredientGroups: [
            {
              ...draft.ingredientGroups[0],
              ingredients: [
                { ...draft.ingredientGroups[0].ingredients[0], unit: value },
              ],
            },
          ],
        }),
      },
      {
        label: "ingredient note",
        max: 500,
        update: (value) => ({
          ...draft,
          ingredientGroups: [
            {
              ...draft.ingredientGroups[0],
              ingredients: [
                { ...draft.ingredientGroups[0].ingredients[0], note: value },
              ],
            },
          ],
        }),
      },
      {
        label: "instruction section title",
        max: 200,
        update: (value) => ({
          ...draft,
          instructionGroups: [{ ...draft.instructionGroups[0], title: value }],
        }),
      },
      {
        label: "instruction text",
        max: 2_000,
        update: (value) => ({
          ...draft,
          instructionGroups: [
            {
              ...draft.instructionGroups[0],
              steps: [{ ...draft.instructionGroups[0].steps[0], text: value }],
            },
          ],
        }),
      },
      {
        label: "family source name",
        max: 200,
        update: (value) => ({
          ...draft,
          source: { type: "family-friend", name: value, url: "" },
        }),
      },
      {
        label: "source URL",
        max: 2_083,
        value: sourceUrl,
        update: (value) => ({
          ...draft,
          source: { type: "website", name: "", url: value },
        }),
      },
    ];

    for (const testCase of cases) {
      const value = testCase.value ?? ((length: number) => "x".repeat(length));
      expect(() =>
        toRecipeCreatePayload(testCase.update(`  ${value(testCase.max)}  `)),
      ).not.toThrow();
      expect(() =>
        toRecipeCreatePayload(testCase.update(value(testCase.max + 1))),
      ).toThrow("Invalid recipe draft");
    }
  });

  it("rejects normalized blank required text while allowing blank instructions", () => {
    expect(validateRecipeDraft({ ...draft, title: "   " }).title).toBe(
      "Enter a recipe name.",
    );
    expect(
      validateRecipeDraft({
        ...draft,
        ingredientGroups: [
          {
            ...draft.ingredientGroups[0],
            ingredients: [
              { ...draft.ingredientGroups[0].ingredients[0], name: "   " },
            ],
          },
        ],
      }).ingredientNames.ingredient,
    ).toBe("Enter an ingredient name.");
    expect(
      validateRecipeDraft({
        ...draft,
        source: { type: "family-friend", name: "   ", url: "" },
      }).sourceName,
    ).toBe("Add who this recipe came from.");
    expect(() =>
      toRecipeCreatePayload({
        ...draft,
        instructionGroups: [
          {
            ...draft.instructionGroups[0],
            steps: [{ ...draft.instructionGroups[0].steps[0], text: "   " }],
          },
        ],
      }),
    ).not.toThrow();
  });
});
