# Noomori — Import from Website MVP Specification

**Status:** Implementation-aligned MVP specification  
**Feature:** Import from Website / Recipe URL  
**Product:** Noomori  
**Platform:** Expo / React Native + FastAPI  
**Scope:** MVP  
**Extraction strategy:** Deterministic structured web extraction  
**Primary UX:** Paste URL  
**Later shortcut:** Browser Share Sheet  
**Final persistence:** Existing Create Recipe flow  

---

# 1. Purpose

Import from Website allows a user to paste a public recipe webpage URL and convert the recipe data exposed by that page into Noomori's existing recipe draft/review flow.

The MVP is intentionally **not a general-purpose web scraper**.

The feature should:

```text
public recipe URL
      ↓
safe server-side fetch
      ↓
mature recipe HTML extractor
      ↓
Noomori normalization
      ↓
existing RecipeForm / Import Review
      ↓
existing Save Recipe flow
```

The feature must be incremental, testable, and aligned with the current Noomori codebase.

---

# 2. Core Architecture Rule

> **Import from Website adds a URL-acquisition/extraction boundary. It does not add a second recipe system.**

Everything after website extraction should converge on the same canonical Noomori recipe state already used by:

- Write from Scratch;
- Import from Text;
- future import methods.

The existing recipe model, form, save behavior, cache behavior, and navigation remain authoritative.

---

# 3. Current Noomori Conventions Are Authoritative

Before implementation, inspect the actual current codebase.

Reuse the existing equivalents of:

- Expo Router route organization;
- Add Recipe entry flow;
- RecipeForm;
- RecipeDraft/form state type;
- Create Recipe payload type;
- ingredient types;
- instruction-group types;
- source/origin types;
- current API request helper;
- `apiConfig`;
- authentication header/session behavior;
- TanStack Query mutation patterns;
- recipe query keys and invalidation;
- FastAPI router organization;
- existing auth dependency;
- Pydantic v2 request/response conventions;
- current deterministic ingredient parser;
- current duration parser;
- current fraction/unit parser;
- existing Import Review behavior;
- existing unsaved-change handling;
- current Create Recipe mutation;
- existing `POST /recipes`.

Names shown in this specification are conceptual.

**Do not rename current types/functions/files just to match this document.**

---

# 4. Required Codex Behavior

Codex must prefer:

```text
inspect
→ reuse
→ minimally extend
```

over:

```text
invent abstraction
→ refactor existing architecture
→ migrate unrelated code
```

If the existing code already contains a helper that is close enough, extend or reuse it.

Do not create a new helper only because a helper name appears in this spec.

---

# 5. No Big-Bang Implementation

Implement the feature **one stage at a time**.

Each implementation stage must:

1. have one clear responsibility;
2. compile before moving on;
3. preserve existing behavior;
4. have tests where appropriate;
5. avoid unrelated refactors.

Do not implement all of the following in one pass:

```text
Share Sheet
+
URL screen
+
safe fetcher
+
scraper
+
normalizer
+
Import Review rewrite
+
recipe persistence changes
```

The MVP must be built incrementally according to the implementation phases in this specification.

---

# 6. MVP User Journey

```text
Recipes Home
    ↓
Add Recipe
    ↓
Import from Website
    ↓
Paste recipe URL
    ↓
Import Recipe
    ↓
Preparing recipe...
    ↓
Import Review
    ↓
User corrects/completes recipe
    ↓
Save Recipe
    ↓
Recipes Home
    ↓
Snackbar: Recipe saved
```

Import Review is mandatory.

The import endpoint must not create a recipe.

---

# 7. MVP Input

The initial MVP accepts:

```text
one public HTTP/HTTPS recipe URL
```

Examples:

```text
https://example.com/recipes/peach-pie
https://food-blog.example/pasta
```

The URL must be explicitly submitted by the user.

Do not automatically read the clipboard.

Do not auto-import immediately after paste.

---

# 8. Import Screen

Suggested UI:

```text
← Import from Website

Paste a recipe link from a website.

┌────────────────────────────────┐
│ https://example.com/recipe     │
└────────────────────────────────┘

[ Import Recipe ]
```

Reuse existing Noomori text-field/button/layout primitives.

Do not build an in-app web browser.

---

# 9. Import CTA Behavior

Label:

```text
Import Recipe
```

Behavior:

```text
empty
→ disabled

invalid local URL syntax
→ validation feedback

valid URL syntax
→ enabled

import mutation pending
→ disabled
```

Reuse existing TanStack Query mutation pending state.

Do not create redundant booleans such as:

```text
isFetchingWebsite
isScraping
isParsing
isImporting
```

unless separate UI phases are genuinely required.

For MVP one pending state is sufficient.

---

# 10. Explicit Processing

Required:

```text
Paste URL
    ↓
user reviews URL
    ↓
Import Recipe
```

Not:

```text
Paste
    ↓
auto request
```

This stays consistent with Noomori's Import from Text interaction.

---

# 11. Browser Share Sheet

Browser Share Sheet is **not required for the first website-import implementation**.

Initial MVP:

```text
Noomori
→ Add Recipe
→ Import from Website
→ Paste URL
```

Later v1.1 shortcut:

```text
Browser
→ Share
→ Noomori
→ same Website Import pipeline
```

Share Sheet must not create a second scraper/import backend.

It only provides the same URL through a different ingress path.

---

# 12. No In-App Browser

Do not build:

```text
Noomori
→ internal browser
→ search web
→ browse recipe sites
```

for MVP.

Users should discover recipes in the browser they already use.

Noomori only needs:

- pasted URL initially;
- browser Share Sheet later.

---

# 13. Backend API Boundary

The existing recipe creation endpoint remains authoritative:

```http
POST /recipes
```

Website extraction must be non-persisting.

Recommended route only if it matches current FastAPI router conventions:

```http
POST /recipes/import/url
```

Responsibility:

```text
receive URL
→ validate
→ safely fetch
→ extract recipe
→ normalize into reviewable draft
→ return draft
```

It must NOT save a recipe.

---

# 14. Request Contract

A small import-boundary request model is acceptable.

Conceptually:

```python
class ImportRecipeUrlRequest(BaseModel):
    url: str
```

Use the current project's exact:

- naming convention;
- model organization;
- validators;
- response conventions.

Do not change Create Recipe request types just to accommodate URL input.

---

# 15. Response Contract

Do not introduce a persisted model such as:

```text
WebsiteRecipe
WebImportedRecipe
ScrapedRecipe
```

The response should converge to the existing RecipeForm/RecipeDraft-compatible state.

Conceptual boundary:

```text
website extraction result
        ↓
Noomori normalizer
        ↓
existing RecipeDraft-compatible response
```

If the project already has an import draft response schema, reuse it.

---

# 16. Authentication

The URL import endpoint must use the same authentication dependency used by other protected FastAPI routes.

Do not create:

- a second JWT validator;
- a second Supabase auth path;
- service-role authentication for normal user import;
- auth logic inside the scraper.

Authentication remains an API boundary concern.

---

# 17. Client API Alignment

Reuse existing:

```text
apiConfig
→ backendUrl
→ endpoints
→ authenticated request helper
```

Add only the minimum endpoint entry needed.

Do not:

- hardcode backend URLs;
- create a second API configuration;
- create a second `fetch` wrapper;
- create Axios only for this feature if current code does not use it;
- manually duplicate bearer-token logic.

---

# 18. TanStack Query Alignment

Use the existing mutation conventions.

Conceptually:

```text
URL
 ↓
import-url mutation
 ↓
RecipeDraft-compatible result
 ↓
Import Review
```

The exact hook/function names must follow the codebase.

Do not create an import-specific query cache.

This is a mutation, not a durable fetched resource.

---

# 19. Recommended External Extraction Library

For MVP, prefer the mature Python `recipe-scrapers` package as the **HTML recipe extraction layer**.

Reasons:

- Python-native;
- compatible with the FastAPI backend;
- handles recipe structured data across many real sites;
- supports common structured formats;
- includes site-specific extraction knowledge;
- avoids Noomori maintaining a universal recipe-markup parser.

Use a version compatible with the current Python version and lock it through the project's existing `uv` dependency workflow.

Do not make the specification depend on one forever-fixed package version.

---

# 20. Important Library Boundary

`recipe-scrapers` should be responsible for:

```text
HTML
+
source URL
    ↓
recipe-oriented extraction
```

Noomori remains responsible for:

```text
URL validation
network safety
HTTP fetching
timeouts
redirects
response-size limits
error classification
canonical recipe normalization
persistence
```

Do not let a convenience library call bypass Noomori's fetch/security boundary.

---

# 21. Do Not Build a Custom General Scraper

MVP must not start by implementing custom selectors such as:

```text
.ingredients
.recipe-ingredients
.wprm-recipe-ingredients
.instructions
.recipe-card
```

for arbitrary sites.

That duplicates mature extractor-library responsibilities and creates ongoing site-specific maintenance.

If the mature extractor cannot find a usable recipe:

```text
fail gracefully
```

instead of building a universal DOM heuristic engine.

---

# 22. Extraction Priority

Conceptually, the mature extractor may use signals such as:

```text
Schema.org Recipe
├── JSON-LD
├── Microdata
└── RDFa

OpenGraph

known site-specific extraction
```

Noomori itself does not need to manually orchestrate every markup format if the selected extraction library already does so.

Noomori should consume its normalized recipe extraction result.

---

# 23. Why Structured Data Is the MVP Happy Path

Recipe websites commonly expose structured Recipe information for search engines and other consumers.

Useful fields can include:

```text
name
description
image
prepTime
cookTime
totalTime
recipeYield
recipeIngredient[]
recipeInstructions[]
nutrition
```

Instructions can also preserve structured groups/steps.

This maps naturally to Noomori's canonical recipe model.

---

# 24. Safe HTTP Fetcher Must Be Noomori-Owned

Do not use:

```python
requests.get(user_supplied_url)
```

directly inside the route without safety controls.

Create or reuse the smallest current backend utility responsible for safe public-page retrieval.

Conceptually:

```text
validated URL
    ↓
safe HTTP fetch
    ↓
HTML
```

Do not create an elaborate generic crawling framework.

---

# 25. Existing HTTP Client First

Before adding a dependency, inspect whether the backend already has a standard async/sync HTTP client convention.

If an existing client/helper exists:

```text
reuse it
```

If no backend HTTP client exists, choose the smallest dependency appropriate for the current FastAPI conventions.

Do not introduce multiple HTTP libraries.

---

# 26. SSRF Is an MVP Requirement

Because the server fetches user-provided URLs, SSRF protection is required from the first release.

The server must reject destinations resolving to non-public network ranges.

At minimum protect against:

```text
localhost
loopback
private RFC1918 ranges
link-local
multicast
unspecified addresses
cloud metadata endpoints
IPv6 local/private equivalents
```

Examples that must not be fetched:

```text
http://127.0.0.1/
http://localhost/
http://10.0.0.1/
http://192.168.1.1/
http://169.254.169.254/
```

---

# 27. URL Scheme

MVP supports:

```text
http
https
```

Prefer HTTPS in normal use.

Reject:

```text
file:
ftp:
data:
javascript:
gopher:
ws:
custom application schemes
```

---

# 28. Host Validation

The backend must:

1. parse the URL;
2. resolve hostname/IP;
3. verify the resolved address is public;
4. only then fetch.

Do not rely purely on string comparison.

Examples of dangerous variants must not bypass validation:

```text
127.0.0.1
localhost
IPv6 loopback
numeric/encoded IP variants when parsable
```

Use standard IP-address validation utilities instead of home-grown string prefix checks.

---

# 29. Redirect Validation

Every redirect destination must be revalidated.

Example:

```text
https://public.example/
    ↓ redirect
http://169.254.169.254/
```

must be blocked.

Do not blindly enable unlimited automatic redirects.

Use a small bounded redirect count.

---

# 30. DNS / Rebinding Boundary

The implementation should minimize DNS-rebinding risk by validating the resolved destination used for the actual request.

Do not:

```text
validate hostname once
→ later resolve again without checking
```

if the chosen networking implementation allows the destination to change.

Implementation detail should follow the capabilities of the selected HTTP client without creating excessive custom networking code.

---

# 31. Fetch Timeout

HTTP fetching must use bounded timeouts.

A slow recipe site must not keep the FastAPI request open indefinitely.

Use project config conventions if timeout settings already exist.

Do not create unrelated global configuration architecture solely for this feature.

---

# 32. Maximum Response Size

Do not download unbounded pages.

Use a reasonable maximum HTML response size.

If the current backend has request/response size configuration, reuse it.

Otherwise add a local/configurable limit appropriate for normal recipe pages.

Failure should be classified as:

```text
PAGE_TOO_LARGE
```

or mapped to the existing error convention.

---

# 33. Content Type

The fetcher should primarily accept HTML-like content:

```text
text/html
application/xhtml+xml
```

Do not attempt to recipe-scrape:

- PDF;
- images;
- videos;
- ZIP files;
- arbitrary binaries.

If a URL resolves to unsupported content:

```text
UNSUPPORTED_CONTENT_TYPE
```

---

# 34. Public Pages Only

MVP supports:

```text
public recipe pages
```

MVP does not support:

- login-required pages;
- private pages;
- authenticated sessions;
- subscription-only pages;
- paywall bypass;
- user cookie forwarding.

Do not store browser cookies for website import.

---

# 35. Bot Protection

MVP does not attempt to bypass:

- Cloudflare challenges;
- CAPTCHA;
- anti-bot protections;
- browser-fingerprint checks.

If a public site cannot be fetched normally:

```text
PAGE_UNAVAILABLE
```

or equivalent.

Do not add browser automation as a hidden fallback.

---

# 36. No Headless Browser in MVP

Do not add:

- Playwright;
- Chromium;
- Puppeteer;
- browser pools;
- JavaScript rendering infrastructure.

A normal safe HTTP fetch is the MVP boundary.

Headless rendering may only be considered later if telemetry shows high-value recipe sites require it.

---

# 37. Extraction Adapter

Keep `recipe-scrapers` behind a small Noomori boundary.

Conceptually:

```text
HTML + source URL
      ↓
recipe extractor adapter
      ↓
raw extracted web recipe
```

The adapter exists so:

- package-specific exceptions do not leak into route code;
- Noomori can normalize errors;
- extraction library can be changed later without rewriting the app.

Do not create a large plugin architecture.

One small module/function is sufficient if consistent with current style.

---

# 38. Extraction Result Is Not Canonical Recipe Data

The extractor's output is third-party/source-specific data.

It must pass through the Noomori normalization boundary before reaching Import Review.

```text
recipe-scrapers
      ↓
raw extraction
      ↓
Noomori normalization
      ↓
existing recipe draft
```

Do not make RecipeForm depend directly on a third-party library's types.

---

# 39. Ingredient Normalization

Website structured data commonly returns ingredients as source strings.

Example:

```text
"1 egg, beaten"
"½ cup all-purpose flour"
"2 tablespoons butter"
```

Do not use a second website-specific ingredient parser.

Feed those strings through Noomori's existing deterministic ingredient parsing logic.

Required:

```text
recipeIngredient[]
        ↓
existing ingredient parser
        ↓
amount / unit / name / note
```

This keeps Import from Text and Import from Website consistent.

---

# 40. Ingredient Source Fidelity

If deterministic ingredient parsing cannot safely structure a source ingredient:

```text
preserve the ingredient text conservatively
```

Do not discard ingredients just because the structured amount/unit could not be parsed.

Reuse the current deterministic parser's fallback policy.

---

# 41. Instruction Normalization

When the source already exposes structured instruction steps:

```text
preserve that structure
```

Examples:

```text
HowToStep
→ instruction step

HowToSection
→ instruction group
```

Do not flatten structured sections into one string and then try to rediscover them.

---

# 42. Instruction Fallback

If the extractor returns unstructured instruction text:

```text
apply the existing conservative instruction normalization behavior
```

Do not introduce NLP or LLM sentence inference for Website Import MVP.

---

# 43. One-Level Groups

Current Noomori canonical rules remain:

```text
ingredient groups
→ optional, one level

instruction groups
→ optional, one level
```

If source markup is more deeply nested:

```text
normalize conservatively
```

Do not expand the persisted model solely for web imports.

---

# 44. Title

Map a reliable source recipe title to the existing title field.

If the extractor cannot provide a title:

```text
title = empty
```

Import Review/Create validation remains authoritative.

Do not infer the title from page `<title>` when it is clearly generic/noisy unless the extractor intentionally provides a reliable recipe name.

---

# 45. Prep / Cook Time

Structured durations should map to the existing canonical timing fields.

Example:

```text
prepTime = PT30M
→ prep_minutes = 30

cookTime = PT1H10M
→ cook_minutes = 70
```

Reuse current duration utilities where possible.

Do not create a second duration parser if one already exists.

---

# 46. Total Time

If the source provides Total Time but Noomori does not persist a dedicated field:

- do not change the database model solely for Website Import;
- follow the same unsupported/redundant metadata policy already approved for deterministic import.

Do not overwrite Prep/Cook to force Total Time equality.

---

# 47. Servings / Yield

Website structured data may expose:

```text
8
8 servings
1 loaf
1 (9-inch) pie
```

Reuse the same distinction already established in Noomori:

```text
servings
≠
yield
```

Do not map:

```text
1 (9-inch) pie
```

to:

```text
servings = 1
```

unless the source explicitly declares serving count separately.

---

# 48. Description / Notes

If the current canonical Recipe model supports description separately:

```text
map source description through existing field semantics
```

If not, do not add a new database field solely because the website extractor provides one.

Use current canonical model decisions.

---

# 49. Nutrition

Only map nutrition fields that already exist in Noomori and have unambiguous compatible semantics.

Do not:

- redesign nutrition;
- calculate missing nutrition;
- infer nutrition from ingredients;
- add website-only nutrition fields.

Unsupported nutrition data can be ignored for MVP.

---

# 50. Source

Website provenance must use the existing Source model.

Conceptually:

```text
origin = url / website
source_url = canonical recipe page URL
```

Use actual current enum/type names.

Do not create a second provenance system.

---

# 51. URL Canonicalization

Prefer a reliable same-page canonical URL when available.

Possible order:

```text
valid canonical page URL from extracted/page metadata
        ↓
otherwise sanitized submitted URL
```

Do not blindly trust a canonical URL pointing to an unrelated or unsafe host.

Any URL used/persisted must remain valid provenance for the imported page.

---

# 52. Tracking Parameters

Safe tracking parameters such as common campaign IDs may be removed when canonicalizing.

Do not indiscriminately remove all query parameters.

Some sites use query parameters as part of page identity.

Prefer:

```text
<link rel="canonical">
```

when trustworthy and appropriate.

---

# 53. Multiple Recipe Objects

Some pages contain multiple structured Recipe objects.

Do not:

```text
merge every Recipe object
```

into one recipe.

Preferred:

```text
one clearly identifiable main recipe
→ use it
```

If multiple equally plausible recipes remain:

```text
MULTIPLE_RECIPES
```

or equivalent.

Do not choose arbitrarily.

---

# 54. Partial Extraction

If the extractor returns useful but incomplete data:

```text
title       ✅
ingredients ✅
instructions ❌
```

proceed to Import Review.

Likewise:

```text
ingredients ❌
instructions ✅
```

may proceed if enough useful recipe data exists.

Do not require a perfect web extraction before review.

---

# 55. Extraction Failure

If no useful recipe can be extracted:

```text
Couldn't import this recipe

We couldn't find enough recipe
information on this page.
```

Potential user actions:

```text
[ Try Again ]
[ Paste Recipe Text Instead ]
```

Use exact buttons consistent with current navigation patterns.

---

# 56. Import-from-Text Fallback

Website failure should be able to lead naturally to Import from Text.

Conceptually:

```text
website extraction failed
        ↓
Paste Recipe Text Instead
        ↓
existing Import from Text
```

Do not duplicate the text-import UI/parser inside Website Import.

If current navigation/form supports pre-filling Source URL while transitioning, reuse that mechanism.

Do not add cross-flow global state solely to preserve the URL.

---

# 57. Recipe Photo

Website extractors may expose recipe image URLs.

Recipe photo import is a **separate product/storage concern**.

MVP website extraction must not require image import to ship.

Safe initial behavior:

```text
recipe image metadata
→ ignore for persistence
```

while the existing RecipePhotoField remains available in Import Review.

Do not hotlink or copy website images automatically unless the existing image specification explicitly supports it.

---

# 58. No LLM Fallback

MVP does not use an LLM when recipe extraction fails.

Do not:

```text
raw HTML
→ send whole page to LLM
→ generate recipe
```

This creates:

- unpredictable extraction;
- higher cost;
- latency;
- hallucination risk;
- privacy/content-processing concerns.

Failure should fall back to user review/text import rather than AI generation.

---

# 59. No Site-Specific Noomori Adapters Initially

Do not begin with:

```text
AllRecipesAdapter
SeriousEatsAdapter
FoodNetworkAdapter
RandomBlogAdapter
```

Use the extraction library's existing site support.

Only consider a Noomori-specific site workaround later if production telemetry demonstrates:

```text
high user demand
+
repeatable extractor failure
```

---

# 60. Error Categories

Adapt to current backend error conventions.

Useful conceptual failures:

```text
INVALID_URL
UNSUPPORTED_SCHEME
UNSAFE_URL
PAGE_UNAVAILABLE
FETCH_TIMEOUT
TOO_MANY_REDIRECTS
PAGE_TOO_LARGE
UNSUPPORTED_CONTENT_TYPE
RECIPE_NOT_FOUND
MULTIPLE_RECIPES
EXTRACTION_ERROR
```

Do not build a brand-new complex exception hierarchy if the project has existing error normalization.

The important requirement is that actionable failures remain distinguishable.

---

# 61. User-Facing Error Examples

## Invalid URL

```text
Enter a valid recipe URL.
```

## Unsafe / unsupported URL

```text
This link can't be imported.
```

Do not expose internal SSRF details.

## Page unavailable

```text
We couldn't access this page.
Please check the link and try again.
```

## Recipe not found

```text
We couldn't find a recipe on this page.

You can paste the recipe text instead.
```

## Timeout

```text
This page took too long to respond.
Please try again.
```

Keep tone aligned with Noomori's current UI.

---

# 62. Logging

Useful backend diagnostics:

```text
host
fetch_status
fetch_duration_ms
response_size
extract_status
extract_duration_ms
ingredient_count
instruction_count
failure_type
```

Do not log full:

- page HTML;
- recipe ingredients;
- instructions

by default in production.

---

# 63. Domain-Level Success Metrics

If analytics/metrics infrastructure already exists, useful metrics include:

```text
website_import_attempted
website_import_fetch_success
website_import_extract_success
website_import_partial
website_import_failed
website_import_saved
```

Most valuable aggregate:

```text
success/failure by hostname
```

This helps identify whether specific high-volume sites justify later support.

Do not create an analytics stack solely for this feature.

---

# 64. No New Background Jobs

MVP website import remains request/response.

Do not add:

- Celery;
- Redis queue;
- task worker;
- background import polling;
- import job database.

Normal public recipe HTML extraction should be fast enough for an initial synchronous flow.

If real-world latency later becomes a problem, reevaluate with measurements.

---

# 65. No New Cache Required

Do not add a dedicated website HTML/recipe extraction cache for MVP.

Caching introduces:

- staleness;
- storage;
- invalidation;
- source-content persistence questions.

Fetch/process once per explicit import request.

Existing recipe cache behavior begins only after the user saves through normal Create Recipe.

---

# 66. Import Review

Website import must hydrate the existing Import Review / RecipeForm.

Fields should be editable immediately.

Do not add a separate Preview mode.

Expected existing fields include the current equivalents of:

```text
Photo
Title
Prep time
Cook time
Servings
Ingredients
Ingredient groups
Instructions
Instruction groups
Notes
Nutrition
Source
Cookbooks
```

Do not add website-specific form components.

---

# 67. Existing Validation

Current Create validation remains authoritative.

Website extraction does not bypass:

- required title;
- serving rules;
- ingredient rules;
- section rules;
- Source requirement;
- placeholder cleanup;
- cookbook behavior.

Extraction success != persistence validation success.

---

# 68. Save

Required:

```text
Import Review
    ↓
Save Recipe
    ↓
existing Create Recipe mutation
    ↓
POST /recipes
```

Do not create:

```text
POST /recipes/import/url/save
saveWebsiteRecipe()
```

when current Create Recipe can persist the normalized form.

---

# 69. Save Success

Reuse current behavior:

```text
Save Recipe
    ↓
Recipes Home
    ↓
Snackbar: Recipe saved
```

Do not automatically navigate to Recipe Detail.

---

# 70. Query Invalidation

Reuse current TanStack Query invalidation/refetch after Create Recipe.

Do not create:

- website-import recipe query keys;
- a parallel recipe list cache;
- origin-specific cache handling.

Once saved, website recipes are normal recipes.

---

# 71. Save Failure

On save failure:

- remain on Import Review;
- preserve form state;
- preserve Source;
- preserve cookbooks;
- allow retry;
- do not re-fetch webpage;
- do not rerun extraction.

Extraction and persistence are separate operations.

---

# 72. Unsaved Changes

Reuse existing RecipeForm dirty-state/unsaved-change behavior.

Do not create Website Import-specific dirty state.

---

# 73. Dependency Management

Add dependencies only through the project's existing `uv`/`pyproject.toml` workflow.

Before adding:

- inspect existing dependencies;
- reuse existing HTTP client if available.

Expected likely net-new extraction dependency:

```text
recipe-scrapers
```

Do not install:

- Playwright;
- Selenium;
- BeautifulSoup separately

unless required by the chosen library/current implementation and not already transitively handled.

Do not add parsing libraries speculatively.

---

# 74. Phase 0 — Inspection Only

Before writing implementation code, inspect:

## Client

1. Add Recipe screen/route.
2. Import from Text screen.
3. Import Review route/component.
4. RecipeForm state/type.
5. existing API service/module organization.
6. existing mutation hook conventions.
7. `apiConfig`.
8. authenticated request helper.
9. query invalidation after create.

## Backend

1. recipe router.
2. current request/response schema files.
3. auth dependency.
4. import-text endpoint/parser if already implemented.
5. deterministic ingredient parser.
6. duration parser.
7. existing service/domain module conventions.
8. current HTTP client dependency, if any.
9. current settings/config convention.

Output a short implementation map before editing code.

Do not refactor during Phase 0.

---

# 75. Phase 1 — Extraction Dependency + Offline Fixture Test

Goal:

> Prove that HTML recipe extraction works before adding networking/UI.

Tasks:

1. add `recipe-scrapers` using existing dependency management;
2. create one local HTML recipe fixture containing Recipe JSON-LD;
3. write a narrow extraction adapter following current backend module conventions;
4. pass fixture HTML + source URL to extractor;
5. verify extraction of:
   - title;
   - ingredients;
   - instructions;
   - prep/cook times where available.

Do NOT implement URL fetching yet.

Do NOT implement endpoint/client UI yet.

Acceptance gate:

```text
local HTML fixture
→ extractor
→ predictable raw extraction
```

passes tests.

---

# 76. Phase 2 — Noomori Web Normalizer

Goal:

> Map extracted web recipe data into current canonical import draft behavior.

Tasks:

1. inspect current Import-from-Text normalizer;
2. reuse existing parsing/domain utilities;
3. ingredient strings use existing deterministic ingredient parser;
4. structured instructions preserve groups/steps;
5. map existing timing fields;
6. map servings/yield according to current rules;
7. map Source URL through current source type;
8. return existing RecipeDraft-compatible shape.

Do NOT modify RecipeForm types.

Do NOT implement network fetch yet.

Acceptance gate:

```text
fixture HTML
→ extractor
→ Noomori normalizer
→ existing RecipeDraft-compatible result
```

with correct ingredients/steps.

---

# 77. Phase 3 — URL Validation + SSRF Guard

Goal:

> Safely classify URLs before any network request.

Tasks:

1. use real URL parsing;
2. support HTTP/HTTPS;
3. reject unsupported schemes;
4. resolve host;
5. reject local/private/link-local/unsafe destination addresses;
6. write tests for:
   - valid public URL;
   - localhost;
   - loopback IP;
   - RFC1918 private IPs;
   - link-local metadata IP;
   - malformed URL.

No remote page extraction is needed to complete this phase.

Acceptance gate:

```text
unsafe URL
→ blocked before HTTP fetch
```

---

# 78. Phase 4 — Safe Fetcher

Goal:

> Fetch public recipe HTML under bounded network rules.

Tasks:

1. reuse existing HTTP client if present;
2. add bounded timeout;
3. manually/control redirects as required to revalidate each target;
4. enforce response-size limit;
5. verify HTML-compatible content type;
6. return HTML + final validated URL;
7. map fetch errors to current error style.

Test using mocked HTTP responses where practical.

Do NOT wire client UI yet.

Acceptance gate:

```text
safe validated public URL
→ bounded HTML fetch
```

while redirect-to-private-network tests remain blocked.

---

# 79. Phase 5 — Backend Import Endpoint

Goal:

> Connect existing pieces through the current FastAPI router convention.

Flow:

```text
request URL
↓
auth
↓
validate
↓
safe fetch
↓
extract
↓
normalize
↓
RecipeDraft-compatible response
```

Tasks:

1. add import request Pydantic model following current conventions;
2. add endpoint to current recipe router or established import route module;
3. use existing auth dependency;
4. reuse error normalization;
5. ensure endpoint never writes to recipe tables.

Acceptance gate:

```text
POST import URL
→ draft response

database recipe count unchanged
```

---

# 80. Phase 6 — Client API Function + Mutation

Goal:

> Add URL import using current client data conventions.

Tasks:

1. add minimum `apiConfig.endpoints` entry;
2. add API function beside existing recipe/import functions;
3. use existing authenticated request helper;
4. implement TanStack Query mutation following current mutation pattern;
5. no duplicate API/error abstraction.

Do NOT build Share Sheet.

Acceptance gate:

```text
client mutation
→ backend
→ typed draft result
```

---

# 81. Phase 7 — Import from Website Screen

Goal:

> Provide minimal paste-URL UX.

Tasks:

1. add route according to current Expo Router structure;
2. reuse Add Recipe navigation convention;
3. reuse existing input/button styles;
4. screen owns URL input only;
5. explicit `Import Recipe`;
6. mutation pending drives loading state;
7. success forwards normalized draft to existing Import Review;
8. error preserves URL.

Do NOT create custom global website-import state unless existing recipe import architecture requires it.

Acceptance gate:

```text
Add Recipe
→ Website
→ Paste URL
→ Import
→ Import Review
```

---

# 82. Phase 8 — Failure / Text Import Fallback

Goal:

> Give users a useful path when websites cannot be extracted.

Tasks:

1. distinguish recipe-not-found from generic network error where possible;
2. offer current Import from Text flow for extraction failure;
3. preserve user URL on the Website screen;
4. do not embed a duplicate multiline text importer in the same screen unless current UX conventions prefer it.

Acceptance gate:

```text
unsupported website
→ recoverable UI
→ user can use existing Text Import
```

---

# 83. Phase 9 — Production Fixtures / Regression Tests

Add fixtures covering:

1. JSON-LD Recipe;
2. HowToStep instructions;
3. HowToSection groups;
4. Unicode ingredient fractions;
5. yield vs servings;
6. partial recipe;
7. no Recipe data;
8. multiple Recipe objects;
9. malformed structured data;
10. unsupported content type;
11. redirect to unsafe address.

Prefer local sanitized HTML fixtures rather than live websites for unit tests.

Live smoke tests may be separate and non-blocking.

---

# 84. Phase 10 — Share Sheet (v1.1, Not Initial MVP Gate)

Only after paste-URL import is stable:

```text
Browser
→ Share
→ Noomori
→ receive URL
→ same Website Import path
```

Requirements:

- no second backend endpoint;
- no second extractor;
- no second RecipeDraft type;
- no separate save behavior.

Share Sheet is an input convenience layer only.

---

# 85. Golden Fixture — JSON-LD Recipe

Example fixture:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Peach Pie",
  "prepTime": "PT30M",
  "cookTime": "PT40M",
  "recipeYield": "8 servings",
  "recipeIngredient": [
    "1 egg, beaten",
    "5 cups sliced peeled peaches",
    "½ cup all-purpose flour"
  ],
  "recipeInstructions": [
    {
      "@type": "HowToStep",
      "text": "Gather all ingredients."
    },
    {
      "@type": "HowToStep",
      "text": "Bake until golden."
    }
  ]
}
</script>
```

Expected Noomori draft:

```text
title = Peach Pie
prep_minutes = 30
cook_minutes = 40
servings = 8

ingredient_count = 3
instruction_count = 2

ingredient #1:
amount = 1
name = egg
note = beaten

ingredient #3:
amount = 0.5
unit = cup
name = all-purpose flour
```

The existing deterministic parser defines exact ingredient normalization.

---

# 86. Golden Fixture — Instruction Sections

Input source:

```text
HowToSection: Make the filling
    HowToStep
    HowToStep

HowToSection: Bake
    HowToStep
```

Expected:

```text
instruction_groups = 2

group 1 title = Make the filling
group 2 title = Bake
```

Do not flatten reliable source structure.

---

# 87. Golden Fixture — Yield Is Not Servings

Source:

```text
recipeYield = "1 (9-inch) pie"
```

Expected:

```text
do not set servings = 1
```

Follow the existing Noomori yield preservation policy.

---

# 88. Golden Fixture — Partial Recipe

Source extraction:

```text
title = Example Cake
ingredients = [...]
instructions = missing
```

Expected:

```text
proceed to Import Review
```

with empty existing instruction state.

Do not fail solely because instructions are absent.

---

# 89. Golden Fixture — No Recipe

HTML page contains:

```text
Article
BreadcrumbList
WebPage
```

but no usable Recipe content.

Expected:

```text
RECIPE_NOT_FOUND
```

No fabricated recipe draft.

---

# 90. Golden Fixture — Multiple Recipes

Page contains two equally plausible Recipe objects.

Expected:

```text
MULTIPLE_RECIPES
```

unless the extraction library reliably identifies one canonical/main recipe.

Never merge them.

---

# 91. Golden Fixture — Unsafe Redirect

Input:

```text
https://public.example/recipe
```

mock response:

```text
302
Location: http://169.254.169.254/
```

Expected:

```text
blocked
```

No request to the unsafe redirect target.

---

# 92. What Must Not Be Refactored

Website Import must not require changing:

- canonical Recipe DB schema;
- household ownership;
- `POST /recipes`;
- recipe editor architecture;
- ingredient storage;
- instruction storage;
- cookbook relationships;
- source semantics;
- Expo Router strategy;
- Supabase session handling;
- current API-client strategy;
- existing query keys;
- Create Recipe success destination;
- existing unit-conversion architecture.

If implementation appears to require these changes:

```text
stop
→ inspect why the importer is coupled incorrectly
```

---

# 93. Explicit Non-Goals

MVP does not include:

- general web crawling;
- site search;
- in-app browser;
- authenticated website sessions;
- user cookie forwarding;
- paywall bypass;
- anti-bot bypass;
- CAPTCHA solving;
- headless browser;
- JavaScript rendering;
- LLM extraction fallback;
- OCR;
- PDF import;
- multiple-recipes-at-once;
- automatic website image copying;
- website synchronization;
- background scraper jobs;
- scraper-specific database;
- dozens of Noomori site adapters.

---

# 94. Performance Boundary

Website import is expected to complete within a normal API request lifecycle.

Primary cost:

```text
network fetch
+
HTML extraction
+
deterministic normalization
```

The parser/extractor itself should be lightweight.

If performance becomes poor:

```text
measure first
```

before introducing:

- caching;
- jobs;
- concurrency infrastructure.

---

# 95. Dependency Boundary

Third-party extraction package types/exceptions must not leak into:

- React Native;
- RecipeForm;
- persisted Recipe type.

All third-party behavior stops at:

```text
backend extraction adapter
```

This protects the rest of Noomori if the package changes.

---

# 96. Upgrade Boundary

`recipe-scrapers` should be treated as an implementation dependency, not a Noomori domain contract.

When upgrading:

1. run local extraction fixtures;
2. run normalization regression tests;
3. verify no mapped recipe behavior changed unexpectedly.

Do not automatically update extraction dependencies without fixture coverage.

---

# 97. Acceptance Criteria — Architecture

- [ ] Existing recipe domain/form types remain authoritative.
- [ ] Existing `POST /recipes` remains authoritative for persistence.
- [ ] URL extraction endpoint is non-persisting.
- [ ] Existing Import Review is reused.
- [ ] Existing ingredient parser is reused.
- [ ] Existing duration/unit/fraction utilities are reused where applicable.
- [ ] Existing Create Recipe mutation is reused.
- [ ] Existing query invalidation is reused.
- [ ] Existing API/auth conventions are reused.
- [ ] No general scraper subsystem is introduced.

---

# 98. Acceptance Criteria — Fetch Safety

- [ ] URLs use a real parser.
- [ ] Only HTTP/HTTPS supported.
- [ ] Local/private/link-local destinations blocked.
- [ ] Redirect destinations revalidated.
- [ ] Fetch timeout is bounded.
- [ ] Response size is bounded.
- [ ] Unsupported binary content rejected.
- [ ] Backend cannot be used as a generic internal-network fetch proxy.
- [ ] Login/paywall bypass is not attempted.

---

# 99. Acceptance Criteria — Extraction

- [ ] Mature recipe extraction library is used instead of custom universal DOM selectors.
- [ ] Structured source groups are preserved.
- [ ] Ingredients pass through existing deterministic parser.
- [ ] Yield is not blindly treated as servings.
- [ ] Partial useful extraction can proceed to review.
- [ ] No useful recipe produces a recoverable failure.
- [ ] Multiple recipes are not silently merged.
- [ ] No LLM invents missing content.

---

# 100. Acceptance Criteria — Client

- [ ] Import from Website is reachable from existing Add Recipe.
- [ ] URL input is editable.
- [ ] Paste does not auto-import.
- [ ] `Import Recipe` explicitly starts mutation.
- [ ] Mutation state drives loading.
- [ ] URL remains after failure.
- [ ] Success opens existing Import Review.
- [ ] Existing validation applies.
- [ ] Save returns to Recipes Home.
- [ ] `Recipe saved` success feedback is reused.

---

# 101. Acceptance Criteria — Incremental Delivery

- [ ] Phase 0 completed before code changes.
- [ ] HTML extraction proven with fixture before network fetching.
- [ ] Normalizer tested before API/client integration.
- [ ] SSRF tests pass before live URL fetching is enabled.
- [ ] Safe fetcher passes redirect/timeout/size tests.
- [ ] Backend endpoint works before UI polish.
- [ ] Paste-URL flow ships before Share Sheet is required.
- [ ] Share Sheet reuses the same import pipeline.

---

# 102. Final MVP Architecture

```text
                        EXISTING NOOMORI
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Add Recipe                                                │
│      ↓                                                     │
│  NEW Import from Website screen                            │
│      ↓ URL                                                 │
│  EXISTING apiConfig + authenticated request helper         │
│      ↓                                                     │
│  NEW URL import mutation                                   │
│                                                            │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
                       FASTAPI BACKEND
                             │
                  EXISTING auth dependency
                             │
                             ▼
                    NEW safe URL boundary
                    ├── parse
                    ├── SSRF guard
                    ├── redirects
                    ├── timeout
                    └── response limits
                             │
                             ▼
                    NEW HTML fetch step
                             │
                             ▼
                 NEW thin extraction adapter
                    └── recipe-scrapers
                             │
                             ▼
                    NEW/REUSED normalizer
                    ├── metadata mapping
                    ├── EXISTING duration logic
                    ├── EXISTING ingredient parser
                    ├── structured instructions
                    ├── yield/servings policy
                    └── EXISTING source semantics
                             │
                             ▼
                  EXISTING RecipeDraft-compatible
                             │
                             ▼
                  EXISTING Import Review
                             │
                             ▼
                  EXISTING Create mutation
                             │
                             ▼
                     EXISTING POST /recipes
                             │
                             ▼
                  EXISTING Recipes Home
                             │
                             ▼
                    Snackbar: Recipe saved
```

Only the Website-specific acquisition/extraction boundary should be net-new.

---

# 103. MVP Decision Summary

Ship first:

```text
Paste URL
→ safe public-page fetch
→ recipe-scrapers
→ Noomori deterministic normalization
→ Import Review
→ existing Save Recipe
```

Do not ship initially:

```text
Share Sheet requirement
headless browser
LLM fallback
custom universal scraper
authenticated websites
image copying
background jobs
```

After the paste-URL importer is stable:

```text
Browser Share Sheet
→ same URL import flow
```

The implementation should remain intentionally boring:

> **safe fetch + mature extraction + existing Noomori recipe pipeline.**

That is the desired MVP architecture.
