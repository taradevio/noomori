import type { RecipePhotoDraft } from "@/shared/types";

export const RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const RECIPE_IMAGE_MAX_EDGE = 1600;

export type PreparedRecipePhoto = {
  uri: string;
  width: number;
  height: number;
  bytes: ArrayBuffer;
};

export function debugRecipeImage(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (__DEV__) console.debug(`[recipe-image] ${event}`, details);
}

export function getRecipeImageResize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    throw new Error("This photo couldn’t be used. Choose another photo.");
  }
  if (Math.max(width, height) <= RECIPE_IMAGE_MAX_EDGE) return null;
  return width >= height
    ? { width: RECIPE_IMAGE_MAX_EDGE, height: null }
    : { width: null, height: RECIPE_IMAGE_MAX_EDGE };
}

export async function prepareRecipeImage(
  photo: RecipePhotoDraft,
): Promise<PreparedRecipePhoto> {
  // PERFORMANCE: Stage timing keeps image preparation measurable on real devices.
  const startedAt = Date.now();
  debugRecipeImage("preparation_started", {
    width: photo.width,
    height: photo.height,
  });
  try {
    const ImageManipulator = await import("expo-image-manipulator");
    const context = ImageManipulator.ImageManipulator.manipulate(photo.uri);
    const resize = getRecipeImageResize(photo.width, photo.height);
    if (resize) context.resize(resize);

    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: 0.8,
      format: ImageManipulator.SaveFormat.WEBP,
    });
    const bytes = await fetch(result.uri).then((response) =>
      response.arrayBuffer(),
    );

    if (bytes.byteLength > RECIPE_IMAGE_MAX_BYTES) {
      throw new Error(
        "This photo is too large after processing. Choose another photo.",
      );
    }

    debugRecipeImage("preparation_completed", {
      width: result.width,
      height: result.height,
      byteLength: bytes.byteLength,
      durationMs: Date.now() - startedAt,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      bytes,
    };
  } catch (error) {
    debugRecipeImage("preparation_failed", {
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    if (
      error instanceof Error &&
      error.message ===
        "This photo is too large after processing. Choose another photo."
    ) {
      throw error;
    }
    throw new Error("This photo couldn’t be used. Choose another photo.");
  }
}
