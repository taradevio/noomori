# Import-from-Web Transport Hardening — Production Revision

## Summary

Harden Noomori's website-import transport for production without changing the existing parsing and fallback architecture.

The current importer already separates:

```text
fetch
→ recipe-scrapers
→ DOM enrichment
→ DOM/text fallback
```

The observed `502 page_unavailable` failures are transport failures that occur before parsing. This revision therefore focuses on the HTML fetch layer only.

Primary goals:

- evaluate and adopt `curl-cffi` for browser-compatible HTML fetching when it materially improves real-world success rate;
- preserve Noomori's existing SSRF and verified-IP guarantees;
- keep redirect validation under Noomori control;
- add bounded retry only for transient failures;
- add production rate protection and short-lived result caching;
- preserve existing parser, DOM fallback, error contracts, and image-fetch behavior unless separately justified.

This revision does **not** add browser automation, proxy rotation, CAPTCHA bypass, cookie-sharing across users, hostname-specific transport branches, or anti-bot escalation.

---

# 1. Current Problem Boundary

## 1.1 `502` is a transport failure

Current behavior:

```text
target returns any non-200 HTTP status
→ WebsiteImportError("page_unavailable")
→ API 502
```

Therefore a user-visible `502` may represent:

```text
upstream 403
upstream 429
upstream 500
upstream 502
upstream 503
upstream 504
connection failure
TLS failure
```

It does **not** imply that:

```text
recipe-scrapers failed
DOM fallback failed
Notes extraction failed
nutrition extraction failed
```

because those layers execute only after successful HTML fetch.

## 1.2 Most likely current weakness

The current HTML transport uses:

```text
urllib3
+
browser-compatible User-Agent
+
manual verified-IP connection
```

but still exposes a non-browser network fingerprint.

Likely mismatch:

```text
browser-like User-Agent
+
Python/liburllib3 TLS/HTTP behavior
```

Modern WAF/CDN systems may treat this as automation even when the User-Agent looks browser-compatible.

The production revision therefore evaluates a browser-fingerprint-capable transport rather than weakening parser logic.

---

# 2. Transport Strategy

## 2.1 `curl-cffi` as HTML transport candidate

Introduce `curl-cffi` only for recipe HTML fetches.

Target architecture:

```text
validated source URL
        ↓
Noomori DNS resolution
        ↓
public-IP validation
        ↓
validated destination IP
        ↓
curl-cffi browser-compatible HTML request
        ↓
manual redirect handling
        ↓
recipe-scrapers
        ↓
existing DOM enrichment/fallback
```

Keep image fetching on the existing transport for this round.

Do not replace both HTML and image fetching at the same time.

## 2.2 Adoption gate

Do not replace the current HTML transport purely because `curl-cffi` exists.

Run a transport characterization matrix first.

Minimum representative set:

```text
10–30 real recipe URLs
```

Include:

```text
known 200 cases
known 403 cases
known transient 5xx cases when available
Food Network
Cookpad
Dapur Umami
Gimme Some Oven
Southern Living
Tasty
Royco
existing generic fixture hosts where useful
```

Record:

```text
hostname
current_transport_status
curl_cffi_status
duration_ms
response_size
```

Adopt `curl-cffi` as default HTML transport only when it produces a material improvement in successful fetches without weakening security guarantees.

Example evidence:

```text
current urllib3: 70% fetch success
curl-cffi:       90% fetch success
```

is sufficient to justify migration.

A negligible improvement is not.

---

# 3. SSRF and Verified-IP Contract

## 3.1 Existing security model remains mandatory

Preserve:

```text
URL scheme validation
safe-port validation
DNS resolution under Noomori control
public/global IP validation
redirect target revalidation
maximum redirects
shared deadline
maximum body size
content-type validation
```

The transport library must not become the authority for DNS safety.

## 3.2 Pin actual connection to validated IP

When using `curl-cffi`, the original hostname must remain the request/TLS hostname while the network connection is pinned to a Noomori-validated IP.

Use libcurl resolve pinning through the exposed curl options.

Conceptual behavior:

```text
URL:
https://example.com/recipe

Noomori validates:
example.com → 203.0.113.10

curl transport:
TLS/SNI hostname = example.com
HTTP Host        = example.com
actual socket IP = 203.0.113.10
```

The exact `curl-cffi` API must be validated against the installed version before implementation.

Do not fall back to library-controlled DNS when a validated target IP is already available.

## 3.3 Redirects stay manual

Use:

```text
allow_redirects = false
```

for the HTML transport.

Redirect flow remains:

```text
response 301/302/303/307/308
        ↓
read Location
        ↓
urljoin
        ↓
Noomori validates new URL
        ↓
DNS resolve again
        ↓
IP validate again
        ↓
next request
```

Do not allow transport-level automatic redirect following.

---

# 4. Browser Fingerprint Policy

## 4.1 Use a stable explicit profile

Do not use a floating production profile such as:

```text
impersonate="chrome"
```

if it silently changes behavior across dependency upgrades.

Prefer an explicit browser target proven during characterization, for example:

```text
impersonate="<specific supported Chrome profile>"
```

The exact supported profile must be selected from the installed `curl-cffi` version.

## 4.2 Dependency pinning

Pin or lock the transport dependency intentionally.

Avoid:

```text
curl-cffi>=0.x
```

without lockfile control.

Production rule:

```text
dependency upgrade
→ transport regression tests
→ characterization subset
→ deploy
```

Browser fingerprint changes must be treated as observable network-behavior changes.

## 4.3 No anti-bot escalation

`curl-cffi` is used to provide reasonable browser-compatible transport behavior.

Noomori does not add:

```text
proxy rotation
residential proxies
CAPTCHA solving
browser challenge execution
session farming
anti-bot token services
```

A website requiring those remains unsupported.

---

# 5. Transport Abstraction

Do not couple recipe-import business logic directly to `curl-cffi`.

Add one internal HTML transport boundary.

Conceptual interface:

```python
class HtmlTransport:
    def fetch(
        self,
        *,
        url: str,
        hostname: str,
        port: int,
        validated_ip: str,
        timeout_seconds: float,
    ) -> HtmlTransportResponse:
        ...
```

or an equivalent internal function boundary.

The website importer continues calling:

```text
fetch_public_html()
```

without knowing which low-level library performs the request.

This keeps:

```text
transport
```

separate from:

```text
parser
normalization
DOM fallback
```

and makes rollback/test substitution straightforward.

---

# 6. Retry Policy

## 6.1 Bounded retry only

Production HTML fetch may retry at most once.

Maximum:

```text
2 total attempts
```

for one target/redirect hop.

## 6.2 Retryable failures

Retry once for transient failures such as:

```text
connection error
read timeout when deadline permits
429
500
502
503
504
```

For `429`, respect `Retry-After` only when:

```text
present
valid
within the remaining shared deadline
within a small configured upper bound
```

Otherwise use a short bounded jitter/backoff.

## 6.3 Non-retryable failures

Do not retry:

```text
400
401
403
404
410
unsupported content type
unsafe URL
page too large
```

A WAF refusal should not generate repeated outbound requests.

## 6.4 Shared deadline

Retries do not reset the existing import deadline.

Example:

```text
8-second total fetch deadline
```

means both attempts and all redirects must fit inside the same budget.

Do not turn retry into unbounded latency.

---

# 7. Alternate Address Behavior

Keep the current principle that only connection-level failure may advance to another already-validated address.

Do not treat:

```text
HTTP 403
HTTP 429
HTTP 5xx
```

as permission to probe every DNS address.

HTTP response recovery is handled by the bounded retry policy, not by scanning all destination IPs.

This avoids converting multi-address resolution into opportunistic host probing.

---

# 8. Rate Protection

## 8.1 Per-user API rate limit

Add a production rate limit for website-import endpoints.

Initial conservative target:

```text
10–20 website imports per user per minute
```

Exact values should be configurable.

Purpose:

```text
abuse prevention
accidental loops
backend protection
prevent Noomori from becoming an open scraping proxy
```

## 8.2 Per-host concurrency limit

Add destination-host concurrency protection.

Initial target:

```text
max 1–2 concurrent HTML fetches per hostname per backend instance
```

The exact value should be configurable.

This is more important than per-user limiting for upstream politeness because many users still appear to publishers as the same Noomori server IP.

Conceptually:

```text
foodnetwork.com → max 2
cookpad.com     → max 2
example.com     → max 2
```

Do not add hostname-specific numeric overrides in this round.

## 8.3 Optional spacing

If characterization shows 429 behavior, allow a small configurable minimum spacing per destination hostname.

Do not add delays blindly if no rate-pressure evidence exists.

---

# 9. Result Cache

## 9.1 Cache successful normalized imports

Cache:

```text
ImportedRecipeTextDraft
```

rather than raw publisher HTML.

Suggested key:

```text
normalized_source_url
+
importer_schema_version
```

Suggested initial TTL:

```text
15–60 minutes
```

## 9.2 Why result cache

Benefits:

```text
duplicate-tap protection
client retry deduplication
same URL imported by multiple users
lower upstream request count
lower parsing cost
lower chance of upstream throttling
faster repeat imports
```

## 9.3 Do not cache failures initially

Do not cache:

```text
403
429
500
502
503
504
timeouts
```

in the first production version.

Transient failures must be allowed to recover naturally.

Negative caching may be considered later only with evidence and very short TTLs.

## 9.4 Cache scope

Cached recipe data must contain only normalized recipe fields already returned by the import endpoint.

Do not cache:

```text
auth state
cookies
arbitrary response headers
raw HTML
```

unless a future design explicitly requires them.

---

# 10. Session and Cookie Isolation

Do not use one global cookie-bearing browser session across all Noomori users.

Avoid:

```text
User A fetch
→ publisher cookie stored
→ User B inherits same cookie
```

Default production behavior should be stateless with respect to publisher cookies.

If connection pooling is used, pooling must not imply cross-user cookie sharing.

Only introduce publisher cookie persistence when a concrete supported use case requires it.

---

# 11. Observability

Extend current website-import transport logs with:

```text
transport
browser_profile
attempt_count
cache_result
retry_reason
```

Continue logging:

```text
hostname
result
duration_ms
response_size
upstream_status
redirect_count
fetch_phase
content_type
transport_error_kind
```

Do not log:

```text
full URL
query string
cookies
request headers
response bodies
arbitrary exception messages for expected transport failures
```

Recommended metrics:

```text
website_import_fetch_total{
  transport,
  result,
  upstream_status
}

website_import_fetch_duration_ms

website_import_retry_total{
  reason
}

website_import_cache_hit_total

website_import_cache_miss_total

website_import_host_concurrency_reject_total
```

Primary production indicators:

```text
fetch success rate
403 rate
429 rate
5xx rate
timeout rate
p50 fetch latency
p95 fetch latency
cache hit rate
retry success rate
```

---

# 12. Error Contract

Keep public API error behavior compatible.

The transport implementation may become richer internally, but existing user-facing mapping remains unchanged unless separately revised.

Current transport-level behavior remains conceptually:

```text
unsafe_url               → 400
page_too_large           → 413
unsupported_content_type → 415
page_unavailable         → 502
fetch_timeout            → 504
```

Internal observability must continue distinguishing the upstream cause.

Example:

```text
Noomori API response: 502 page_unavailable
internal diagnostics:
upstream_status=403
transport=curl_cffi
fetch_phase=response
```

---

# 13. Image Fetching

Do not migrate image fetching to `curl-cffi` in this revision.

Keep:

```text
fetch_public_image()
→ existing transport
```

Reasons:

```text
smaller blast radius
different upstream behavior
current problem is HTML compatibility
easier rollback
```

Image transport can be evaluated separately if real production failures justify it.

---

# 14. Test Plan

## 14.1 Transport unit tests

Test:

```text
validated IP pinning
original hostname preserved
automatic redirects disabled
manual redirect revalidation
non-public redirect rejected
body size limit
content-type validation
shared deadline
```

## 14.2 Retry tests

Verify:

```text
503 → retry once → 200
429 + acceptable Retry-After → retry once
403 → no retry
404 → no retry
page too large → no retry
timeout beyond remaining deadline → no retry
```

Assert:

```text
max 2 total attempts
```

## 14.3 Multi-address tests

Preserve:

```text
IP A connection failure
→ IP B may be attempted
```

and:

```text
IP A HTTP response
→ do not scan every remaining IP
```

## 14.4 Cache tests

Verify:

```text
first successful import → cache miss
second same URL → cache hit
cached result skips outbound HTML fetch
TTL expiry → fetch again
failed fetch → not cached
importer schema version changes → old cache not reused
```

## 14.5 Rate-limit tests

Verify:

```text
per-user limit
per-host concurrency limit
different hosts do not block each other
same host is bounded
limits release after completion/failure
```

## 14.6 Security tests

Regression coverage must include:

```text
private IPv4
private IPv6
loopback
link-local
redirect to private target
DNS rebinding-style re-resolution
invalid port
credential-bearing URL
```

Switching transport must not weaken any existing SSRF test.

## 14.7 Characterization tests

Maintain a non-blocking manual matrix comparing:

```text
current urllib3
vs
curl-cffi
```

for representative live pages.

Do not make live-site access part of blocking CI.

---

# 15. Rollout Plan

## Phase 1 — Characterization

Run current transport and `curl-cffi` side-by-side manually against representative real URLs.

Record success/failure evidence.

Do not change production default yet.

## Phase 2 — Internal transport implementation

Add the `curl-cffi` HTML transport behind an internal configuration flag.

Example conceptual setting:

```text
RECIPE_HTML_TRANSPORT=urllib3|curl_cffi
```

Default may remain current transport initially.

## Phase 3 — Closed testing

Use `curl-cffi` during closed testing.

Monitor:

```text
403 rate
429 rate
5xx rate
timeout rate
fetch success rate
latency
```

## Phase 4 — Production default

Switch HTML default to `curl-cffi` only if closed testing shows meaningful reliability improvement.

At the same time enable:

```text
per-user rate limiting
per-host concurrency limiting
short successful-result cache
bounded retry
```

## Phase 5 — Simplification

Once `curl-cffi` is proven stable:

```text
remove unused legacy HTML transport
```

only if rollback value no longer justifies maintaining both implementations.

Do not maintain two permanent transport stacks without evidence they are both needed.

---

# 16. Production Boundary

Noomori supports recipe websites that are reachable through:

```text
safe
verified-IP
browser-compatible
non-interactive HTTP fetching
```

The following remain unsupported:

```text
CAPTCHA-required pages
authenticated-only recipes
interactive anti-bot challenges
browser-JavaScript-only extraction
sites requiring aggressive anti-bot bypass
```

The product should fail gracefully rather than escalating into a general-purpose crawling or anti-bot platform.

---

# 17. Acceptance Criteria

This revision is complete when:

### Transport

- HTML fetching can use `curl-cffi` through an internal transport boundary.
- The actual network destination is pinned to a Noomori-validated public IP.
- Original hostname remains valid for TLS/SNI and Host semantics.
- Redirects remain manually revalidated.
- Existing SSRF tests still pass.
- Image fetching remains unchanged.

### Reliability

- Characterization demonstrates a material fetch-success improvement before `curl-cffi` becomes default.
- Transient retry is capped at one retry.
- 403/404-style failures are not retried.
- Shared fetch deadlines remain enforced.

### Production protection

- Website imports have per-user rate limiting.
- Destination hosts have bounded concurrency.
- Successful normalized import results can be cached for a short TTL.
- Failed fetches are not cached initially.

### Observability

- Transport type, retry count, and cache result are observable.
- Upstream 403/429/5xx remain distinguishishable internally even when the public API returns `502 page_unavailable`.
- No sensitive request URL/query/body/cookie data is introduced into logs.

### Scope

- No parser or DOM fallback redesign is required for this transport revision.
- No hostname-specific bypasses are added.
- No browser automation, proxy rotation, or CAPTCHA solving is introduced.

---

# 18. Implementation Order

Implement in this order:

```text
1. Build a local curl-cffi characterization probe.
2. Compare representative real URLs against current urllib3 transport.
3. Confirm material compatibility improvement.
4. Add internal HTML transport abstraction.
5. Implement curl-cffi with validated-IP pinning and redirects disabled.
6. Re-run existing SSRF and transport regression tests.
7. Add bounded transient retry.
8. Add per-user rate limit.
9. Add per-host concurrency limit.
10. Add short successful-result cache.
11. Add transport/cache/retry observability.
12. Enable through config during closed testing.
13. Promote to production default only after reliability evidence.
```

Do not change parser/fallback behavior as part of this transport revision unless a separate extraction regression proves it necessary.
