// NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import {
  createCookbook,
  deleteCookbook,
  getCookbooks,
  renameCookbook,
  replaceCookbookRecipes,
} from "@/shared/cookbook-api";
import { getPersonalRecipes } from "@/shared/components/recipe/recipe-query";
import {
  generateHouseholdCode,
  getHouseholdActivity,
  getHouseholdSettings,
  joinHousehold,
  leaveHousehold,
  markHouseholdActivityRead,
  previewHouseholdCode,
  revokeHouseholdCode,
} from "@/shared/household-api";

const fetchMock = jest.fn();

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeAll(() => {
  globalThis.fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe("frontend API workflows", () => {
  it("loads recipes with authentication and forwards cancellation", async () => {
    const recipes = [{ id: "recipe-1", title: "Soup" }];
    fetchMock.mockResolvedValue(response(recipes));
    const controller = new AbortController();

    await expect(getPersonalRecipes("token", controller.signal)).resolves.toEqual(recipes);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/recipes$/),
      expect.objectContaining({
        headers: { Authorization: "Bearer token" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("runs the complete cookbook request lifecycle", async () => {
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: "book-1", title: "Dinner", recipe_count: 1, recipes: [] }))
      .mockResolvedValueOnce(response({ id: "book-1", title: "Favorites", recipe_count: 1, recipes: [] }))
      .mockResolvedValueOnce(response({ id: "book-1", title: "Favorites", recipe_count: 2, recipes: [] }))
      .mockResolvedValueOnce(response(null, 204));

    await getCookbooks("token");
    await createCookbook("token", { title: "Dinner", recipe_ids: ["recipe-1"] });
    await renameCookbook("token", "book-1", { title: "Favorites" });
    await replaceCookbookRecipes("token", "book-1", { recipe_ids: ["recipe-1", "recipe-2"] });
    await deleteCookbook("token", "book-1");

    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual([
      "GET",
      "POST",
      "PUT",
      "PUT",
      "DELETE",
    ]);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ title: "Dinner", recipe_ids: ["recipe-1"] }),
    );
  });

  it("runs household settings, invite, join, activity, and leave requests", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ household_id: "home", household_name: "Home", member_count: 2, members: null, role: "owner", active_code_expires_at: null }))
      .mockResolvedValueOnce(response({ code: "123456", expires_at: "tomorrow" }))
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response({ household_name: "Home", member_count: 2, owner_display_name: "Tara" }))
      .mockResolvedValueOnce(response({ status: "JOINED", household: { id: "home", name: "Home" }, membership: { household_id: "home", role: "member", user_id: "me" } }))
      .mockResolvedValueOnce(response({ member_count: 2, unread_count: 1, latest_activity_id: 9, activities: null }))
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response(null, 204));

    await expect(getHouseholdSettings("token")).resolves.toMatchObject({ members: [] });
    await generateHouseholdCode("token");
    await revokeHouseholdCode("token");
    await previewHouseholdCode("token", "123456");
    await joinHousehold("token", "123456");
    await expect(getHouseholdActivity("token")).resolves.toMatchObject({ activities: [] });
    await markHouseholdActivityRead("token", 9);
    await leaveHousehold("token");

    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ code: "123456" }));
    expect(fetchMock.mock.calls[6]?.[1]?.body).toBe(
      JSON.stringify({ through_activity_id: 9 }),
    );
  });

  it("surfaces stable API errors and retry timing", async () => {
    fetchMock.mockResolvedValue(
      response({ detail: "Too many attempts" }, 429, { "Retry-After": "30" }),
    );

    await expect(previewHouseholdCode("token", "123456")).rejects.toMatchObject({
      message: "Too many attempts",
      status: 429,
      retryAfter: 30,
    });
  });
});
