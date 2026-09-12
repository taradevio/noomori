import logging
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from pydantic.types import SecretStr

from server.config import Settings
from server.core.auth import get_current_user
from server.main import _initialize_sentry


BASE_SETTINGS = {
    "supabase_url": "https://example.supabase.co",
    "supabase_key": "publishable-key",
    "household_join_code_hmac_key": "0123456789abcdef0123456789abcdef",
    "sentry_dsn": None,
}


def make_settings(**changes) -> Settings:
    values = {**BASE_SETTINGS, **changes}
    return Settings(_env_file=None, **values)


class SentryConfigurationTest(unittest.TestCase):
    def test_non_deployed_environments_do_not_initialize_sentry(self):
        for app_env in ("development", "test", "local"):
            with self.subTest(app_env=app_env), patch(
                "server.main.sentry_sdk.init"
            ) as sentry_init:
                _initialize_sentry(
                    make_settings(app_env=app_env, sentry_dsn="https://dsn.test/1")
                )

                sentry_init.assert_not_called()

    def test_deployed_environments_initialize_sentry_with_public_options(self):
        for app_env in ("staging", "production"):
            with self.subTest(app_env=app_env), patch(
                "server.main.LoggingIntegration"
            ) as logging_integration_class, patch(
                "server.main.sentry_sdk.init"
            ) as sentry_init:
                logging_integration = Mock()
                logging_integration_class.return_value = logging_integration
                config = make_settings(
                    app_env=app_env,
                    sentry_dsn=SecretStr("https://dsn.test/1"),
                    sentry_release="release-sha",
                    sentry_traces_sample_rate=0.2,
                    sentry_profiles_sample_rate=0.3,
                )

                _initialize_sentry(config)

                logging_integration_class.assert_called_once_with(
                    level=logging.WARNING,
                    event_level=logging.ERROR,
                    sentry_logs_level=logging.WARNING,
                    capture_sentry_logs=True,
                )
                sentry_init.assert_called_once_with(
                    dsn="https://dsn.test/1",
                    environment=app_env,
                    release="release-sha",
                    traces_sample_rate=0.2,
                    profiles_sample_rate=0.3,
                    send_default_pii=False,
                    include_local_variables=False,
                    max_request_body_size="never",
                    integrations=[logging_integration],
                )

    def test_missing_deployed_dsn_warns_without_initializing(self):
        for app_env in ("staging", "production"):
            with self.subTest(app_env=app_env), patch(
                "server.main.sentry_sdk.init"
            ) as sentry_init, self.assertLogs(
                "server.main", level="WARNING"
            ) as logs:
                _initialize_sentry(make_settings(app_env=app_env))

            sentry_init.assert_not_called()
            self.assertIn("SENTRY_DSN is not configured", logs.output[0])

    def test_sample_rates_accept_boundaries(self):
        for value in (0, 1):
            with self.subTest(value=value):
                config = make_settings(
                    sentry_traces_sample_rate=value,
                    sentry_profiles_sample_rate=value,
                )
                self.assertEqual(value, config.sentry_traces_sample_rate)
                self.assertEqual(value, config.sentry_profiles_sample_rate)

    def test_sample_rates_reject_values_outside_zero_and_one(self):
        for field in (
            "sentry_traces_sample_rate",
            "sentry_profiles_sample_rate",
        ):
            for value in (-0.1, 1.1):
                with self.subTest(field=field, value=value), self.assertRaises(
                    ValidationError
                ):
                    make_settings(**{field: value})


class SentryUserIdentityTest(unittest.TestCase):
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-access-token",
    )

    def test_successful_authentication_sets_only_verified_user_id(self):
        user_id = UUID("11111111-1111-4111-8111-111111111111")
        user = SimpleNamespace(id=user_id, email="not-sent@example.com")
        supabase = Mock()
        supabase.auth.get_user.return_value = SimpleNamespace(user=user)

        with patch(
            "server.core.auth.get_supabase", return_value=supabase
        ), patch("server.core.auth.sentry_sdk.set_user") as set_user:
            result = get_current_user(self.credentials)

        set_user.assert_called_once_with({"id": str(user_id)})
        supabase.postgrest.auth.assert_called_once_with("test-access-token")
        self.assertIs(user, result.user)
        self.assertIs(supabase, result.supabase)

    def test_failed_authentication_does_not_set_user(self):
        supabase = Mock()
        supabase.auth.get_user.side_effect = RuntimeError("authentication failed")

        with patch(
            "server.core.auth.get_supabase", return_value=supabase
        ), patch("server.core.auth.sentry_sdk.set_user") as set_user, self.assertRaises(
            HTTPException
        ) as raised:
            get_current_user(self.credentials)

        set_user.assert_not_called()
        self.assertEqual(401, raised.exception.status_code)

    def test_missing_authenticated_user_does_not_set_user(self):
        supabase = Mock()
        supabase.auth.get_user.return_value = SimpleNamespace(user=None)

        with patch(
            "server.core.auth.get_supabase", return_value=supabase
        ), patch("server.core.auth.sentry_sdk.set_user") as set_user, self.assertRaises(
            HTTPException
        ) as raised:
            get_current_user(self.credentials)

        set_user.assert_not_called()
        self.assertEqual(401, raised.exception.status_code)
