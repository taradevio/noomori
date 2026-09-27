import { toRecipeImageError } from "@/shared/components/recipe/recipe-image";

it("does not misidentify a local photo read failure as an internet outage", () => {
  expect(
    toRecipeImageError(new TypeError("Network request failed")),
  ).toHaveProperty(
    "message",
    "This photo couldn’t be used. Choose another photo.",
  );
});

it("keeps the generic message for non-network photo failures", () => {
  expect(toRecipeImageError(new Error("File read failed"))).toHaveProperty(
    "message",
    "This photo couldn’t be used. Choose another photo.",
  );
});
