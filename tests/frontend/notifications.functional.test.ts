import * as Notifications from "expo-notifications";

import { notificationRoute } from "@/shared/providers/notification-provider";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

// The handler is installed at module import, before Jest clears call history.
const handler = (Notifications.setNotificationHandler as jest.Mock).mock
  .calls[0]?.[0];

describe("household recipe notifications", () => {
  it("uses a silent foreground handler", async () => {
    expect(handler).toEqual({ handleNotification: expect.any(Function) });
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it("accepts only household activity routes", () => {
    const recipeId = "22222222-2222-4222-8222-222222222222";
    expect(
      notificationRoute({
        kind: "household_recipe_activity",
        action: "edited",
        recipe_id: recipeId,
      }),
    ).toBe(`/recipe/${recipeId}`);
    expect(
      notificationRoute({
        kind: "household_recipe_activity",
        action: "unshared",
        recipe_id: recipeId,
      }),
    ).toBe("/activity");
    expect(
      notificationRoute({ action: "edited", recipe_id: recipeId }),
    ).toBeNull();
    expect(
      notificationRoute({
        kind: "household_recipe_activity",
        action: "added",
        recipe_id: "not-a-uuid",
      }),
    ).toBeNull();
    expect(
      notificationRoute({
        kind: "household_recipe_activity",
        action: "unshared",
      }),
    ).toBeNull();
  });
});
