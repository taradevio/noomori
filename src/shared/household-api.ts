import { apiConfig } from "@/config/api";

export type HouseholdRole = "member" | "owner";

export type HouseholdMember = {
  display_name: string;
  role: HouseholdRole;
  user_id: string;
};

export type HouseholdSettings = {
  active_code_expires_at: string | null;
  household_id: string;
  household_name: string;
  member_count: number;
  members: HouseholdMember[];
  role: HouseholdRole;
  shared_recipe_count: number;
  pending_handoff_recipe_count: number;
};

export type RecipeHandoffSnapshot = {
  title: string;
  description: string | null;
  ingredients: unknown[];
  instructions: unknown[];
  servings: number | null;
  nutrition_per_serving: Record<string, unknown> | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  additional_time_label: string | null;
  additional_time_minutes: number | null;
  source_type: "my_recipe" | "family" | "website";
  source_person_name: string | null;
  source_url: string | null;
};

export type RecipeHandoffItem = {
  id: string;
  snapshot_schema_version: 1;
  snapshot: RecipeHandoffSnapshot;
  image_path: string | null;
  image_url: string | null;
};

export type RecipeHandoff = {
  id: string;
  departed_user_display_name: string;
  created_at: string;
  items: RecipeHandoffItem[];
};

export type ResolveRecipeHandoffResult = {
  handoff_id: string;
  handoff_status: "pending" | "resolved";
  resolved_item_ids: string[];
  kept_recipe_ids: string[];
};

export type GeneratedHouseholdCode = {
  code: string;
  expires_at: string;
};

export type HouseholdJoinPreview = {
  household_name: string;
  member_count: number;
  owner_display_name: string;
};

export type HouseholdJoinResult = {
  household: { id: string; name: string };
  membership: {
    household_id: string;
    role: HouseholdRole;
    user_id: string;
  };
  status: "ALREADY_MEMBER" | "JOINED";
};

export type LeaveHouseholdResult =
  | {
      status: "RESTORED";
      household: { id: string; name: string };
    }
  | {
      status: "LEFT";
      household: null;
    };

export type HouseholdActivityAction = "added" | "edited" | "unshared";

export type HouseholdActivity = {
  id: number;
  actor_user_id: string | null;
  actor_display_name: string;
  action: HouseholdActivityAction;
  recipe_id: string | null;
  recipe_title: string;
  created_at: string;
};

export type HouseholdActivityResponse = {
  member_count: number;
  unread_count: number;
  latest_activity_id: number | null;
  activities: HouseholdActivity[];
};

export const householdActivityKey = ["household", "activity"] as const;

export class HouseholdApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

async function householdRequest<T>(
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
    throw new HouseholdApiError(
      typeof body?.detail === "string"
        ? body.detail
        : "Household request failed",
      response.status,
      Number(response.headers.get("Retry-After")) || null,
    );
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export async function getHouseholdSettings(accessToken: string) {
  const settings = await householdRequest<HouseholdSettings>(
    accessToken,
    apiConfig.endpoints.households,
  );
  return {
    ...settings,
    members: settings.members ?? [],
    shared_recipe_count: settings.shared_recipe_count ?? 0,
    pending_handoff_recipe_count:
      settings.pending_handoff_recipe_count ?? 0,
  };
}

export async function getRecipeHandoffs(accessToken: string) {
  const handoffs = await householdRequest<RecipeHandoff[]>(
    accessToken,
    apiConfig.endpoints.recipeHandoffs,
  );
  return handoffs.map((handoff) => ({
    ...handoff,
    items: handoff.items ?? [],
  }));
}

export function resolveRecipeHandoff(
  accessToken: string,
  handoffId: string,
  decision: "keep" | "remove",
  itemIds: string[] | null,
) {
  return householdRequest<ResolveRecipeHandoffResult>(
    accessToken,
    apiConfig.endpoints.resolveRecipeHandoff(handoffId),
    {
      method: "POST",
      body: JSON.stringify({ decision, item_ids: itemIds }),
    },
  );
}

export async function getHouseholdActivity(accessToken: string) {
  const activity = await householdRequest<HouseholdActivityResponse>(
    accessToken,
    apiConfig.endpoints.householdActivity,
  );
  return { ...activity, activities: activity.activities ?? [] };
}

export function markHouseholdActivityRead(
  accessToken: string,
  throughActivityId: number,
) {
  return householdRequest<void>(
    accessToken,
    apiConfig.endpoints.householdActivityRead,
    {
      method: "PUT",
      body: JSON.stringify({ through_activity_id: throughActivityId }),
    },
  );
}

export function registerNotificationDevice(
  accessToken: string,
  expoPushToken: string,
  platform: "android" | "ios",
  previousExpoPushToken?: string | null,
) {
  // NOTE: Rotation is one authenticated request so the previous token is not leaked.
  return householdRequest<void>(
    accessToken,
    apiConfig.endpoints.notificationDevice,
    {
      method: "PUT",
      body: JSON.stringify({
        expo_push_token: expoPushToken,
        platform,
        ...(previousExpoPushToken && previousExpoPushToken !== expoPushToken
          ? { previous_expo_push_token: previousExpoPushToken }
          : {}),
      }),
    },
  );
}

export function unregisterNotificationDevice(
  accessToken: string,
  expoPushToken: string,
) {
  return householdRequest<void>(
    accessToken,
    apiConfig.endpoints.notificationDevice,
    {
      method: "DELETE",
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    },
  );
}

export function leaveHousehold(accessToken: string) {
  return householdRequest<LeaveHouseholdResult>(
    accessToken,
    apiConfig.endpoints.households,
    { method: "DELETE" },
  );
}

export function generateHouseholdCode(accessToken: string) {
  return householdRequest<GeneratedHouseholdCode>(
    accessToken,
    apiConfig.endpoints.householdInvite,
    { method: "POST" },
  );
}

export function revokeHouseholdCode(accessToken: string) {
  return householdRequest<void>(
    accessToken,
    apiConfig.endpoints.householdInvite,
    { method: "DELETE" },
  );
}

export function previewHouseholdCode(accessToken: string, code: string) {
  return householdRequest<HouseholdJoinPreview>(
    accessToken,
    apiConfig.endpoints.householdJoinPreview,
    { method: "POST", body: JSON.stringify({ code }) },
  );
}

export function joinHousehold(accessToken: string, code: string) {
  return householdRequest<HouseholdJoinResult>(
    accessToken,
    apiConfig.endpoints.householdJoin,
    { method: "POST", body: JSON.stringify({ code }) },
  );
}
