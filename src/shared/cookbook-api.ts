import { apiConfig } from "@/config/api";
import {
  toRecipeCard,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import type { CookbookCardModel, CookbookDetailModel } from "@/shared/types";

export type ApiCookbookSummary = {
  id: string;
  title: string;
  recipe_count: number;
  cover_image_urls: string[];
};

export type ApiCookbookDetail = {
  id: string;
  title: string;
  recipe_count: number;
  recipes: ApiRecipe[];
};

export type CreateCookbookPayload = {
  title: string;
  recipe_ids: string[];
};

export type RenameCookbookPayload = { title: string };
export type ReplaceCookbookRecipesPayload = { recipe_ids: string[] };

export class CookbookApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function cookbookRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiConfig.backendUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(apiConfig.timeout),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CookbookApiError(
      typeof body?.detail === "string"
        ? body.detail
        : "Could not complete the cookbook request",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function toCookbookCard(
  cookbook: ApiCookbookSummary,
): CookbookCardModel {
  return {
    id: cookbook.id,
    title: cookbook.title,
    recipeCount: cookbook.recipe_count,
    coverImageUrls: cookbook.cover_image_urls,
  };
}

export function toCookbookDetail(
  cookbook: ApiCookbookDetail,
): CookbookDetailModel {
  return {
    id: cookbook.id,
    title: cookbook.title,
    recipeCount: cookbook.recipe_count,
    recipes: cookbook.recipes.map(toRecipeCard),
  };
}

export function getCookbooks(accessToken: string) {
  return cookbookRequest<ApiCookbookSummary[]>(
    accessToken,
    apiConfig.endpoints.cookbooks,
  );
}

export function getCookbook(accessToken: string, cookbookId: string) {
  return cookbookRequest<ApiCookbookDetail>(
    accessToken,
    apiConfig.endpoints.cookbook(cookbookId),
  );
}

export function createCookbook(
  accessToken: string,
  payload: CreateCookbookPayload,
) {
  return cookbookRequest<ApiCookbookDetail>(
    accessToken,
    apiConfig.endpoints.cookbooks,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function renameCookbook(
  accessToken: string,
  cookbookId: string,
  payload: RenameCookbookPayload,
) {
  return cookbookRequest<ApiCookbookDetail>(
    accessToken,
    apiConfig.endpoints.cookbook(cookbookId),
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function replaceCookbookRecipes(
  accessToken: string,
  cookbookId: string,
  payload: ReplaceCookbookRecipesPayload,
) {
  return cookbookRequest<ApiCookbookDetail>(
    accessToken,
    apiConfig.endpoints.cookbookRecipes(cookbookId),
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function deleteCookbook(accessToken: string, cookbookId: string) {
  return cookbookRequest<void>(
    accessToken,
    apiConfig.endpoints.cookbook(cookbookId),
    { method: "DELETE" },
  );
}
