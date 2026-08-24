import { env } from "./env";

export const apiConfig = {
  backendUrl: env.backendUrl,
  timeout: 10_000,

  endpoints: {
    health: "/health",
    addRecipes: "/add-recipes",
    recipes: "/recipes",
    recipe: (recipeId: string) => `/recipes/${recipeId}`,
    recipeImage: (recipeId: string) => `/recipes/${recipeId}/image`,
    households: "/household",
  },
} as const;
