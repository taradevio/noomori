import { getRecipeImageResize, RECIPE_IMAGE_MAX_BYTES } from "./recipe-image";

const landscape = getRecipeImageResize(3200, 1800);
const portrait = getRecipeImageResize(1200, 2400);

if (
  landscape?.width !== 1600 ||
  landscape.height !== null ||
  portrait?.width !== null ||
  portrait.height !== 1600 ||
  getRecipeImageResize(1200, 800) !== null ||
  RECIPE_IMAGE_MAX_BYTES !== 5 * 1024 * 1024
) {
  throw new Error("Recipe image policy check failed.");
}

let invalidDimensionsRejected = false;
try {
  getRecipeImageResize(0, 800);
} catch {
  invalidDimensionsRejected = true;
}
if (!invalidDimensionsRejected) {
  throw new Error("Invalid image dimensions were accepted.");
}
