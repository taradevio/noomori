import { apiConfig } from "@/config/api";
import type { RecipePhotoDraft } from "@/shared/types";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { Platform } from "react-native";

import {
  debugRecipeImage,
  prepareRecipeImage,
  RECIPE_IMAGE_MAX_BYTES,
  type PreparedRecipePhoto,
} from "./recipe-image";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ImportedRecipePhoto = {
  draftPhoto: RecipePhotoDraft;
  preparedPhoto: PreparedRecipePhoto;
};

async function createTemporaryImage(
  bytes: ArrayBuffer,
  contentType: string,
): Promise<{ uri: string; cleanup: () => void }> {
  // NOTE: ImageManipulator needs a URI, so web uses a short-lived Blob URL and
  // native uses an SDK-managed cache file. Neither is recipe persistence.
  if (Platform.OS === "web") {
    const uri = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    return { uri, cleanup: () => URL.revokeObjectURL(uri) };
  }

  const { File, Paths } = await import("expo-file-system");
  const file = new File(
    Paths.cache,
    `noomori-recipe-import-${randomUUID()}.${imageExtensions[contentType]}`,
  );
  file.write(new Uint8Array(bytes));
  return {
    uri: file.uri,
    cleanup: () => {
      if (file.exists) file.delete();
    },
  };
}

export async function prepareImportedRecipeImage(
  imageUrl: string,
  accessToken: string,
): Promise<ImportedRecipePhoto> {
  const response = await fetch(
    `${apiConfig.backendUrl}${apiConfig.endpoints.importRecipeImage}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: imageUrl }),
      signal: AbortSignal.timeout(apiConfig.timeout),
    },
  );
  if (!response.ok) throw new Error("Recipe image download failed.");

  const contentType = response.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType || !imageExtensions[contentType]) {
    throw new Error("Recipe image type is unsupported.");
  }

  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > RECIPE_IMAGE_MAX_BYTES) {
    throw new Error("Recipe image is empty or too large.");
  }

  const temporary = await createTemporaryImage(bytes, contentType);
  try {
    const image = await Image.loadAsync(temporary.uri);
    const photo: RecipePhotoDraft = {
      uri: temporary.uri,
      width: Math.round(image.width * image.scale),
      height: Math.round(image.height * image.scale),
      fileName: `imported-recipe.${imageExtensions[contentType]}`,
      mimeType: contentType,
    };
    image.release();

    // NOTE: Reuse the picker pipeline once here so review and save receive the
    // same resized WebP preview and already-prepared upload bytes.
    const preparedPhoto = await prepareRecipeImage(photo);
    return {
      draftPhoto: {
        uri: preparedPhoto.uri,
        width: preparedPhoto.width,
        height: preparedPhoto.height,
        fileName: "imported-recipe.webp",
        mimeType: "image/webp",
      },
      preparedPhoto,
    };
  } finally {
    // NOTE: The source copy is no longer needed after preparation. The prepared
    // preview stays alive only until the import route unmounts.
    temporary.cleanup();
  }
}

export async function cleanupImportedRecipeImage(uri: string) {
  // NOTE: Clearing this temporary preview never affects a saved recipe because
  // successful saves upload the prepared bytes to Supabase Storage first.
  if (uri.startsWith("blob:")) {
    URL.revokeObjectURL(uri);
    return;
  }
  if (Platform.OS === "web" || !uri.startsWith("file:")) return;

  const { File } = await import("expo-file-system");
  const file = new File(uri);
  if (file.exists) file.delete();
  debugRecipeImage("imported_prepared_file_removed");
}
