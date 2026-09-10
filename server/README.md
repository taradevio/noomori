# Noomori API

Copy `.env.example` to `.env` and set the Supabase values. Generate the
server-only household join-code key with:

```sh
openssl rand -hex 32
```

Store that value as `HOUSEHOLD_JOIN_CODE_HMAC_KEY`. Never expose it through an
`EXPO_PUBLIC_*` variable. Rotating it requires invalidating every outstanding
`household_join_codes` row as documented in `PLAN.md`.

Push notifications also require server-only `SUPABASE_SERVICE_ROLE_KEY` and
`EXPO_ACCESS_TOKEN` values. Configure APNs, FCM v1, and Expo enhanced push
security before shipping rebuilt iOS or Android binaries; remote push is not
supported in Android Expo Go.

## Recipe HTML transport

Create a private UTF-8 manifest containing exactly 20 recipe URLs, one per
line. Blank lines and lines beginning with `#` are ignored. Do not commit the
manifest because its URLs may contain sensitive query values.

From the API directory, run the manual characterization once:

```sh
cd server
uv run characterize-recipe-transport /path/to/urls.txt > /tmp/noomori-transport-results.jsonl
```

The command first checks locally that the pinned `curl-cffi` profile supports
`chrome150`. It then runs the entire manifest through urllib3, followed by
curl-cffi. Output contains only sanitized transport diagnostics; row order
within each 20-row block matches the manifest. This command is intentionally
manual and must not be added to CI or invoked for ordinary imports.

The characterization baseline was 16/20 successful HTML fetches (80%) for
urllib3 and 19/20 (95%) for curl-cffi, with no curl-only regression. Curl-cffi
is therefore the default HTML transport. It is validated during application
startup using only the locally installed wheel; startup validation performs no
DNS resolution or HTTP request.

Monitor at least 50 successful or failed HTML import attempts across at least
10 distinct hostnames. Do not qualify the sample while one hostname represents
more than 30% of attempts; repeated imports from one publisher are operational
data, not independent compatibility evidence.

Rollback is configuration-only:

```sh
RECIPE_HTML_TRANSPORT=urllib3
```

Restart the deployment after changing the setting. Roll back when two or more
previously stable characterization URLs have reproducible curl-only transport
regressions, or when qualified-sample HTML-fetch success falls below the 80%
urllib3 baseline. A regression is reproducible when its initial curl-only
failure is followed by a paired check where curl-cffi fails again and urllib3
succeeds for the same URL. Ordinary imports are never shadow-fetched.

Image fetching remains on urllib3. The existing `recipe-scrapers`, DOM
enrichment, and DOM/text fallback sequence is unchanged.
