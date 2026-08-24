import { apiConfig } from "@/config/api";
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";

import { debugRecipeImage, type PreparedRecipePhoto } from "./recipe-image";
import type { ApiRecipe } from "./recipe-response";

const bucket = "noomori-recipe-images";

export async function attachRecipeImage(
  recipeId: string,
  ownerId: string,
  accessToken: string,
  photo: PreparedRecipePhoto,
): Promise<ApiRecipe> {
  const imagePath = `recipes/${ownerId}/${recipeId}/${Crypto.randomUUID()}.webp`;
  // PERFORMANCE: Separate timings reveal whether upload or activation dominates.
  const uploadStartedAt = Date.now();
  debugRecipeImage("upload_started", {
    recipeId,
    byteLength: photo.bytes.byteLength,
  });
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(imagePath, photo.bytes, {
        contentType: "image/webp",
        upsert: false,
      });
    if (error) throw error;
  } catch (error) {
    debugRecipeImage("upload_failed", {
      recipeId,
      durationMs: Date.now() - uploadStartedAt,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
  debugRecipeImage("upload_completed", {
    recipeId,
    durationMs: Date.now() - uploadStartedAt,
  });

  const activationStartedAt = Date.now();
  debugRecipeImage("activation_started", { recipeId });
  const response = await fetch(
    `${apiConfig.backendUrl}${apiConfig.endpoints.recipeImage(recipeId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_path: imagePath }),
    },
  );
  if (response.ok) {
    debugRecipeImage("activation_completed", {
      recipeId,
      durationMs: Date.now() - activationStartedAt,
    });
    // PERFORMANCE: Reuse the full activation response for navigation caches;
    // avoid a follow-up detail request just to obtain the signed image URL.
    return (await response.json()) as ApiRecipe;
  }

  debugRecipeImage("activation_failed", {
    recipeId,
    durationMs: Date.now() - activationStartedAt,
    status: response.status,
  });

  try {
    const { error } = await supabase.storage.from(bucket).remove([imagePath]);
    debugRecipeImage(error ? "cleanup_failed" : "cleanup_completed", {
      recipeId,
      ...(error ? { message: error.message } : {}),
    });
  } catch (error) {
    debugRecipeImage("cleanup_failed", {
      recipeId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
  throw new Error("Photo activation failed.");
}

export async function removeRecipeImage(
  recipeId: string,
  accessToken: string,
): Promise<ApiRecipe> {
  const startedAt = Date.now();
  debugRecipeImage("removal_started", { recipeId });
  const response = await fetch(
    `${apiConfig.backendUrl}${apiConfig.endpoints.recipeImage(recipeId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    debugRecipeImage("removal_failed", {
      recipeId,
      durationMs: Date.now() - startedAt,
      status: response.status,
    });
    throw new Error("Photo removal failed.");
  }
  debugRecipeImage("removal_completed", {
    recipeId,
    durationMs: Date.now() - startedAt,
  });
  // PERFORMANCE: The full removal response can replace both caches directly.
  return (await response.json()) as ApiRecipe;
}
