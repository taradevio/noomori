import { env } from "./env";

export const apiConfig = {
  backendUrl: env.backendUrl,
  timeout: 10_000,

  endpoints: {
    health: "/health",
    addRecipes: "/add-recipes",
    importRecipeText: "/recipes/import/text",
    importRecipeUrl: "/recipes/import/url",
    importRecipeImage: "/recipes/import/image",
    recipes: "/recipes",
    recipe: (recipeId: string) => `/recipes/${recipeId}`,
    recipeShare: (recipeId: string) => `/recipes/${recipeId}/share`,
    recipeImage: (recipeId: string) => `/recipes/${recipeId}/image`,
    cookbooks: "/cookbooks",
    cookbook: (cookbookId: string) => `/cookbooks/${cookbookId}`,
    cookbookRecipes: (cookbookId: string) =>
      `/cookbooks/${cookbookId}/recipes`,
    households: "/household",
    householdActivity: "/household/activity",
    householdActivityRead: "/household/activity/read",
    householdRecipes: "/household/recipes",
    householdInvite: "/household/invite",
    householdJoinPreview: "/household/join/preview",
    householdJoin: "/household/join",
  },
} as const;
