import { env } from "./env";

export const apiConfig = {
  backendUrl: env.backendUrl,
  timeout: 10_000,

  endpoints: {
    health: "/health",
    addRecipes: "/add-recipes",
    households: "/household",
  },
} as const;
