"""Live local-Supabase authorization boundary test.

Run with ``bun run test:auth:api`` after ``bunx supabase start``.

Note: the service role is used only to create and remove deterministic fixtures.
All application requests use real local Auth access tokens, so this test crosses
FastAPI, PostgREST, and PostgreSQL RLS boundaries. The filename intentionally
does not start with ``test_`` to keep it out of the fast mocked backend suite.
"""

import logging
import os
import unittest
import warnings
from uuid import uuid4

import httpx


LOCAL_API_URL = os.getenv("SUPABASE_TEST_URL", "http://127.0.0.1:54321")
LOCAL_ANON_KEY = os.getenv(
    "SUPABASE_TEST_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9."
    "CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
)
LOCAL_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_TEST_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0."
    "EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)

# These are fixed local CLI credentials, never hosted-project secrets.
os.environ["APP_ENV"] = "test"
os.environ["SUPABASE_URL"] = LOCAL_API_URL
os.environ["SUPABASE_KEY"] = LOCAL_ANON_KEY
os.environ["HOUSEHOLD_JOIN_CODE_HMAC_KEY"] = (
    "0123456789abcdef0123456789abcdef"
)
warnings.filterwarnings("ignore", category=ResourceWarning)

from server.main import app  # noqa: E402


PASSWORD = "Authorization-test-123!"
RECIPE_PAYLOAD = {
    "title": "Authorization soup",
    "description": None,
    "ingredients": [],
    "instructions": [],
    "servings": 2,
    "prep_time_minutes": None,
    "cook_time_minutes": None,
    "nutrition_per_serving": None,
    "source_type": "my_recipe",
    "source_person_name": None,
    "source_url": None,
}


class LiveAuthorizationTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        warnings.filterwarnings("ignore", category=DeprecationWarning)
        warnings.filterwarnings("ignore", category=ResourceWarning)

    async def asyncSetUp(self):
        self.supabase = httpx.AsyncClient(base_url=LOCAL_API_URL, timeout=20)
        self.api = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            timeout=20,
        )
        suffix = uuid4().hex
        self.user_ids: list[str] = []
        self.household_id: str | None = None
        self.tokens: dict[str, str] = {}

        for name in ("owner", "member", "outsider"):
            email = f"noomori-authz-{name}-{suffix}@example.test"
            user_id = await self.create_user(email, name.title())
            self.user_ids.append(user_id)
            self.tokens[name] = await self.sign_in(email)

        household = await self.admin_rest(
            "POST",
            "/rest/v1/households",
            json={"name": "Authorization home", "created_by": self.user_ids[0]},
        )
        self.household_id = household[0]["id"]
        await self.admin_rest(
            "POST",
            "/rest/v1/household_members",
            json=[
                {
                    "household_id": self.household_id,
                    "user_id": self.user_ids[0],
                    "role": "owner",
                },
                {
                    "household_id": self.household_id,
                    "user_id": self.user_ids[1],
                    "role": "member",
                },
            ],
        )

    async def asyncTearDown(self):
        if self.household_id:
            await self.admin_rest(
                "DELETE",
                f"/rest/v1/households?id=eq.{self.household_id}",
            )
        for user_id in self.user_ids:
            response = await self.supabase.delete(
                f"/auth/v1/admin/users/{user_id}",
                headers=self.service_headers,
            )
            if response.status_code not in (200, 204, 404):
                response.raise_for_status()
        await self.api.aclose()
        await self.supabase.aclose()

    @property
    def service_headers(self) -> dict[str, str]:
        return {
            "apikey": LOCAL_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {LOCAL_SERVICE_ROLE_KEY}",
        }

    def user_headers(self, name: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.tokens[name]}"}

    async def create_user(self, email: str, display_name: str) -> str:
        response = await self.supabase.post(
            "/auth/v1/admin/users",
            headers=self.service_headers,
            json={
                "email": email,
                "password": PASSWORD,
                "email_confirm": True,
                "user_metadata": {"full_name": display_name},
            },
        )
        response.raise_for_status()
        return response.json()["id"]

    async def sign_in(self, email: str) -> str:
        response = await self.supabase.post(
            "/auth/v1/token?grant_type=password",
            headers={"apikey": LOCAL_ANON_KEY},
            json={"email": email, "password": PASSWORD},
        )
        response.raise_for_status()
        return response.json()["access_token"]

    async def admin_rest(self, method: str, path: str, **kwargs):
        headers = {
            **self.service_headers,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        response = await self.supabase.request(
            method,
            path,
            headers=headers,
            **kwargs,
        )
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    async def test_real_tokens_cannot_cross_recipe_authorization_boundaries(self):
        missing = await self.api.get("/recipes/00000000-0000-4000-8000-000000000000")
        self.assertEqual(401, missing.status_code)

        auth_logger = logging.getLogger("server.main")
        auth_logger.disabled = True
        try:
            invalid = await self.api.get(
                "/recipes/00000000-0000-4000-8000-000000000000",
                headers={"Authorization": "Bearer invalid-token"},
            )
        finally:
            auth_logger.disabled = False
        self.assertEqual(401, invalid.status_code)

        created = await self.api.post(
            "/recipes",
            headers=self.user_headers("owner"),
            json=RECIPE_PAYLOAD,
        )
        self.assertEqual(200, created.status_code, created.text)
        recipe_id = created.json()["id"]

        member_private = await self.api.get(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("member"),
        )
        outsider_private = await self.api.get(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("outsider"),
        )
        self.assertEqual(404, member_private.status_code)
        self.assertEqual(404, outsider_private.status_code)

        shared = await self.api.put(
            f"/recipes/{recipe_id}/share",
            headers=self.user_headers("owner"),
        )
        self.assertEqual(200, shared.status_code, shared.text)

        member_read = await self.api.get(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("member"),
        )
        outsider_read = await self.api.get(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("outsider"),
        )
        self.assertEqual(200, member_read.status_code, member_read.text)
        self.assertEqual(404, outsider_read.status_code)

        member_edit = await self.api.put(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("member"),
            json={**RECIPE_PAYLOAD, "title": "Unauthorized edit"},
        )
        member_delete = await self.api.delete(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("member"),
        )
        member_share = await self.api.put(
            f"/recipes/{recipe_id}/share",
            headers=self.user_headers("member"),
        )
        self.assertEqual(404, member_edit.status_code)
        self.assertEqual(404, member_delete.status_code)
        self.assertEqual(404, member_share.status_code)

        unshared = await self.api.delete(
            f"/recipes/{recipe_id}/share",
            headers=self.user_headers("owner"),
        )
        self.assertEqual(200, unshared.status_code, unshared.text)

        member_after_unshare = await self.api.get(
            f"/recipes/{recipe_id}",
            headers=self.user_headers("member"),
        )
        self.assertEqual(404, member_after_unshare.status_code)


if __name__ == "__main__":
    unittest.main()
