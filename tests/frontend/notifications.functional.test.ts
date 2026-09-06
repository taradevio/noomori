import * as Notifications from "expo-notifications";

import { notificationRoute } from "@/shared/providers/notification-provider";

describe("household recipe notifications", () => {
  it("uses a silent foreground handler", () => {
    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function),
    });
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock
      .calls[0][0];
    expect(handler.handleNotification()).resolves.toEqual({
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
    expect(notificationRoute({ action: "edited", recipe_id: recipeId })).toBeNull();
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
