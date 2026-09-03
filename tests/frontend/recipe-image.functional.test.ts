import { toRecipeImageError } from "@/shared/components/recipe/recipe-image";

it("reports an offline error when processed photo bytes cannot be read", () => {
  expect(toRecipeImageError(new TypeError("Network request failed"))).toHaveProperty(
    "message",
    "You’re offline. Connect to the internet and try adding the photo again.",
  );
});

it("keeps the generic message for non-network photo failures", () => {
  expect(toRecipeImageError(new Error("File read failed"))).toHaveProperty(
    "message",
    "This photo couldn’t be used. Choose another photo.",
  );
});
