import { apiConfig } from "@/config/api";

export type HouseholdRole = "member" | "owner";

export type HouseholdSettings = {
  active_code_expires_at: string | null;
  household_id: string;
  household_name: string;
  member_count: number;
  role: HouseholdRole;
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

export function getHouseholdSettings(accessToken: string) {
  return householdRequest<HouseholdSettings>(
    accessToken,
    apiConfig.endpoints.households,
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
