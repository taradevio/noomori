# Noomori — Website Import Regression & Hardening Specification

**Status:** Proposed implementation specification  
**Area:** Import from Website + recipe presentation regressions  
**Repository baseline:** `taradevio/noomori` current `main`, reviewed 2026-09-09  
**Primary goal:** Turn newly observed real-world failures into durable, structure-based regression coverage without accumulating hostname-specific scraping hacks.

---

## 1. Summary

Noomori's website importer already has a sound layered architecture:

```text
URL
 ↓
validated / bounded HTTP fetch
 ↓
recipe-scrapers (primary extractor)
 ↓
normalize to Noomori draft
 ↓
complete core recipe?
 ├── yes
 │    ├── optional verified DOM group enrichment
 │    └── optional strict DOM nutrition enrichment
 │
 └── no
      ↓
 guarded DOM recipe-container fallback
      ↓
 deterministic text parser
```

The newly observed failures should **not** be treated as ten unrelated website bugs.
They reveal a smaller set of reusable failure classes:

1. transport/fetch incompatibility and insufficient diagnostics;
2. recipe-note preservation;
3. incomplete time semantics (`total`, `active`, `chill`, etc.);
4. cooking-fraction presentation after canonical numeric parsing;
5. independent ingredient/instruction grouping;
6. nutrition-basis confidence;
7. UI context where a `Shared` badge is redundant.

The regression strategy must therefore organize coverage by **structural risk and semantic contract**, not by the number of supported domains.

Bad success criterion:

```text
"Noomori supports these 10 domains."
```

Preferred success criterion:

```text
"Noomori has deterministic regression coverage for the failure classes
exposed by these domains, so equivalent sites benefit from the same fixes."
```

---

# 2. Current Implementation Constraints

The implementation should extend the current architecture rather than replace it.

Current relevant files include:

```text
server/src/server/recipe_url_import.py
server/src/server/modules/recipes/imports/website.py
server/src/server/modules/recipes/imports/text.py
server/src/server/modules/recipes/schemas.py
server/tests/test_recipe_url_import.py
src/shared/components/recipe/recipe-text-import.ts
src/shared/components/recipe/recipe-response.ts
src/shared/components/recipe/recipe-payload.ts
src/shared/components/recipe/recipe-card.tsx
src/shared/components/recipe/recipes-library-view.tsx
```

Existing behavior that must remain:

- `recipe-scrapers` remains the primary structured extractor;
- `supported_only=False` remains allowed for generic Schema.org extraction;
- DOM extraction remains guarded and bounded;
- existing SSRF protections remain intact;
- redirects continue to be revalidated;
- verified public-IP fetching remains intact;
- fetch deadlines and response-size limits remain intact;
- image fetching remains bounded separately from HTML fetching;
- DOM nutrition remains conservative when nutrition basis is ambiguous;
- recipe ingredients remain canonically numeric after parsing;
- no browser automation is introduced for ordinary URL import;
- live external sites are **not** required for blocking CI.

Do not solve the new regressions by introducing:

```text
if hostname == "foodnetwork.com": ...
if hostname == "cookpad.com": ...
if hostname == "damndelicious.net": ...
```

unless a provider-specific behavior is proven unavoidable and cannot be represented safely as a generic structural rule.

---

# 3. Newly Observed Regression Corpus

The following real-world pages motivated this specification.

| ID | Source | Observed regression | Primary failure class |
|---|---|---|---|
| W01 | Food Network — Stuffed Green Peppers | Noomori returns `502 page_unavailable`; page is not scraped | Transport/fetch compatibility first; time semantics second |
| W02 | Damn Delicious — Instant Pot Pot Roast | Recipe notes not imported | Notes semantics |
| W03 | Tastes Better From Scratch — Pumpkin Overnight Oats | Notes missing; chill time missing | Notes + non-prep/cook time |
| W04 | Household library | `Shared` badge is redundant inside Household view | UI context |
| W05 | Gimme Some Oven — Green Julius Smoothie | Adjustable serving state should not corrupt base import; `1/3`-style quantities display as long decimals; notes missing | URL-import contract + fraction display + notes |
| W06 | Tasty — French Onion Grilled Cheese | `1/4 cup` becomes `0.25` in editable/display surfaces | Fraction display |
| W07 | Southern Living — Quick Pickled Red Cabbage | Uses active + total time; notes missing | Time semantics + notes |
| W08 | Cookpad Indonesia recipe | Ingredient subsection label not preserved; recipe notes missing | Grouping + notes |
| W09 | Royco — Pindang Asam Iga Sapi | Noomori returns `502 page_unavailable` | Transport/fetch diagnostics |
| W10 | Dapur Umami — Cireng Kuah Keju ala Masako | Nutrition not extracted | Nutrition-basis confidence / site drift |

Source URLs:

```text
W01 https://www.foodnetwork.com/recipes/food-network-kitchen/stuffed-green-peppers-3364195
W02 https://damndelicious.net/2018/04/12/instant-pot-pot-roast/
W03 https://tastesbetterfromscratch.com/pumpkin-overnight-oats/
W05 https://www.gimmesomeoven.com/green-julius-smoothie/
W06 https://tasty.co/recipe/french-onion-grilled-cheese
W07 https://www.southernliving.com/quick-pickled-red-cabbage-12072757?kw=myrecipes
W08 https://cookpad.com/id/resep/26480542?ref=search&search_term=makanan
W09 https://www.royco.co.id/r/pindang-asam-iga-sapi.html/125025
W10 https://www.dapurumami.com/resep/cireng-kuah-keju-ala-masako
```

---

# 4. Priority Matrix

| Priority | Regression area | Why |
|---|---|---|
| **P0** | Transport observability + Food Network/Royco characterization | Import cannot proceed if HTML never reaches the parser; current `502` hides the actual upstream failure |
| **P0** | Cooking-fraction display correctness | Current canonical values are mathematically valid but user-facing `0.333333...` is unacceptable for cooking |
| **P0** | Recipe notes preservation | Multiple unrelated publishers expose the same missing semantic field |
| **P0** | Total/additional time semantics | Current prep+cook model can materially understate real recipe duration |
| **P1** | Independent ingredient/instruction group enrichment | Cookpad exposes a generic structural gap; current grouping can be too coupled |
| **P1** | Nutrition-basis confidence | We need better coverage without writing incorrect per-serving data |
| **P1** | Household Shared-badge context | Small isolated UI regression; low backend risk |
| **P2** | Live-site drift monitoring | Useful, but must not make CI depend on third-party uptime/WAF behavior |

---

# 5. Testing Philosophy

## 5.1 Deterministic CI first

Blocking CI must use:

- synthetic transport responses;
- stored HTML fixtures;
- unit tests;
- endpoint orchestration tests;
- frontend functional/component tests.

Blocking CI must **not** require:

```text
foodnetwork.com
royco.co.id
damndelicious.net
cookpad.com
...
```

to be online, stable, unthrottled, or scraper-friendly.

Reasons:

- WAF/CDN policies change independently of Noomori;
- rate limiting creates false negatives;
- markup changes can make otherwise valid application commits fail CI;
- remote sites may block CI-provider IP ranges;
- availability failures should not be confused with application regressions.

---

## 5.2 Real sites remain evidence, not fixtures of availability

Real websites are used to:

1. discover failures;
2. reproduce a regression manually;
3. capture the smallest structurally faithful fixture;
4. define expected semantics;
5. optionally run non-blocking drift checks later.

The permanent test should assert the semantic contract rather than the hostname.

---

## 5.3 One fixture must justify its existence

Add a new site-derived fixture only when it contributes at least one of:

- a newly observed bug;
- a structural extraction form not already covered;
- a new metadata semantic;
- a new primary-vs-DOM interaction;
- a dependency-upgrade regression;
- a new confidence-boundary case.

Do not add another fixture merely because the site is popular.

---

# 6. P0 — Transport Diagnostics and Compatibility

## 6.1 Current problem

The fetch layer currently maps every successful HTTP response whose status is not `200` to:

```text
page_unavailable
```

The API then maps:

```text
page_unavailable → HTTP 502
```

This collapses materially different upstream failures such as:

```text
403 Forbidden
406 Not Acceptable
429 Too Many Requests
500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
```

into the same user-facing Noomori response.

Therefore, a Noomori `502` does **not** prove that the source website returned `502`.

Food Network and Royco must first be treated as **transport characterization cases**, not parser regressions.

---

## 6.2 Required internal diagnostics

Without exposing sensitive response bodies, record enough metadata to distinguish failures.

Minimum structured diagnostic fields:

```text
hostname
upstream_status
redirect_count
fetch_phase
content_type (when available)
response_size (when known)
duration_ms
error_class
```

Do not log by default:

- complete recipe HTML;
- query-string secrets;
- response bodies;
- cookies;
- authorization headers;
- private resolved addresses beyond what is required for safe internal debugging.

User-facing API compatibility may remain:

```text
page_unavailable → 502
```

for MVP.

The important regression requirement is that internal logs make the underlying upstream class observable.

---

## 6.3 Transport unit tests

Add deterministic transport tests covering at minimum:

```text
upstream 403 → page_unavailable + diagnostic upstream_status=403
upstream 429 → page_unavailable + diagnostic upstream_status=429
upstream 500 → page_unavailable + diagnostic upstream_status=500
upstream 503 → page_unavailable + diagnostic upstream_status=503
socket/connect failure → page_unavailable with no fabricated upstream status
read/connect timeout → fetch_timeout
```

The test should assert behavior through the fetch boundary, not through a real remote URL.

Recommended location:

```text
server/tests/test_recipe_url_import_transport.py
```

If splitting the existing large test module is considered too much scope for this task, new tests may temporarily remain in:

```text
server/tests/test_recipe_url_import.py
```

Do not perform a large unrelated test-file migration merely to satisfy this spec.

---

## 6.4 Multiple resolved-address characterization

The current fetch loop stops after the first IP address that returns an HTTP response, even when that response is non-200.

Add a characterization test for:

```text
DNS result:
IP A → HTTP 503
IP B → HTTP 200
```

The test must document the chosen contract explicitly.

Preferred safe contract:

- do not blindly retry alternate addresses for arbitrary application-layer statuses;
- if alternate-address retry is introduced, restrict it to a narrowly defined transient class and preserve the shared fetch deadline;
- never weaken hostname verification or SSRF protections.

This test exists to prevent accidental retry semantics from changing silently.

---

## 6.5 Food Network regression protocol

Food Network is currently classified as:

```text
P0: transport/fetch failure
P1 after fetch succeeds: extraction/time fidelity
```

Required sequence:

```text
1. reproduce with current Noomori fetcher
2. record actual upstream status/error class
3. identify generic compatibility cause
4. implement the smallest generic safe fix
5. verify HTML reaches extraction
6. only then capture an extraction fixture
7. assert Total/Active-time semantics separately
```

Do **not** create a parser patch before step 5.

Do **not** assume the fix is a browser User-Agent until the observed upstream behavior proves that request-header compatibility is the cause.

If request-header compatibility is required, use a stable, honest application fetch profile rather than an ever-growing per-domain header table.

---

## 6.6 Royco regression protocol

Apply the same transport-first protocol to Royco.

Food Network and Royco may ultimately expose different root causes:

```text
Food Network → e.g. WAF/request-profile rejection
Royco        → e.g. upstream 5xx, routing, CDN, or another policy
```

Do not force both through one behavioral workaround merely because both currently surface as Noomori HTTP `502`.

---

# 7. P0 — Recipe Notes Preservation

## 7.1 Problem

Multiple observed pages contain a meaningful recipe-card Notes section, but Noomori fails to preserve it reliably.

Representative sources:

```text
W02 Damn Delicious
W03 Tastes Better From Scratch
W05 Gimme Some Oven
W07 Southern Living
W08 Cookpad
```

This is a semantic gap, not five separate hostname bugs.

---

## 7.2 Notes must not be confused with website description

Current Noomori import flow effectively uses backend `description` as the frontend Notes field.

A website can legitimately contain both:

```text
description / intro
+
recipe-card notes
```

Regression tests must not silently treat these as identical when both exist.

Required semantic rule:

```text
website description != recipe notes
```

The implementation should preserve recipe-card Notes intentionally.

Preferred model direction:

```text
Imported recipe metadata
├── description
└── notes
```

If persistence continues using the existing database `description` field as Noomori's user-facing Notes field for MVP, the mapping decision must be explicit and tested. Do not accidentally overwrite one source semantic with another merely because the current field name is `description`.

---

## 7.3 Notes extraction confidence

A note candidate is acceptable when it comes from a bounded recipe context and has a clearly identified note/tip heading such as:

```text
Note
Notes
Recipe Notes
Chef's Notes
Cook's Notes
Tips & Notes
Notes & Tips
```

Indonesian equivalents may be added only when verified from real recipe structures.

Do not capture arbitrary trailing article prose as Notes.

Do not capture:

- comments;
- related recipes;
- author biography;
- SEO article paragraphs;
- advertisements;
- storage widgets outside the recipe card unless deliberately included by product semantics.

---

## 7.4 Required regression fixtures

Use a small representative set rather than every site.

Minimum fixture classes:

### Notes A — explicit WordPress-style recipe-card notes

Representative source:

```text
Damn Delicious or Tastes Better From Scratch
```

Assert:

- notes are present;
- notes are not appended to ingredients;
- notes are not converted to instruction steps;
- controls are excluded;
- source description remains distinguishable where present.

### Notes B — notes on a structurally different publisher

Representative source:

```text
Southern Living or Cookpad
```

Assert the same semantic outcome through a materially different DOM/structured-data shape.

Do not add five near-identical Notes fixtures.

---

# 8. P0 — Time Semantics

## 8.1 Problem

The current recipe model primarily represents:

```text
prep_time_minutes
cook_time_minutes
```

Real recipe publishers expose additional semantics:

```text
Total
Active
Chill
Rest
Cooling
Marinate
Proof
Additional
```

Representative regressions:

```text
W01 Food Network      → Total + Active
W03 Tastes Better...  → Prep + Chill + source Total
W07 Southern Living   → Active + Total
```

A recipe card that computes only:

```text
prep + cook
```

can materially understate the user's real elapsed time.

---

## 8.2 Required product semantics

Add/define a first-class total-time value:

```text
total_time_minutes
```

Total time must prefer the publisher's explicit total when trustworthy.

Do not recompute publisher total blindly as:

```text
prep + cook + chill + ...
```

because publishers may define `Total` differently.

Example contract:

```text
source says:
Prep 5 min
Chill 8 hr
Total 5 min

Noomori must not silently replace source Total with 485 min.
```

The source semantic is authoritative unless product requirements explicitly define a derived elapsed-time metric separately.

---

## 8.3 Additional/passive time

Do not create one schema field per possible label.

Avoid:

```text
chill_time_minutes
rest_time_minutes
cooling_time_minutes
marinate_time_minutes
proof_time_minutes
...
```

Preferred minimal representation:

```text
additional_time_minutes
additional_time_label
```

Example:

```text
additional_time_minutes = 480
additional_time_label = "Chill"
```

If multiple additional-time categories are later required simultaneously, specify that separately rather than prematurely introducing an unbounded time taxonomy.

---

## 8.4 Active time

`Active` is not automatically equivalent to:

```text
Prep
```

or:

```text
Cook
```

Do not map it into either field merely to avoid a schema change.

For MVP, one of the following explicit contracts must be selected and tested:

1. preserve `Active` as supported additional metadata; or
2. preserve `Total` and intentionally ignore unsupported `Active` while ensuring no incorrect prep/cook value is fabricated.

Incorrect:

```text
Active 40 min → cook_time_minutes = 40
```

unless the source explicitly identifies that duration as cooking time.

---

## 8.5 Recipe-card display fallback

Once total time exists, card-level time should use:

```text
explicit total_time_minutes
    ?? safe derived prep+cook when both/one are available
    ?? null
```

Do not let missing total time break existing recipes.

Regression examples:

```text
total=120, prep=20, cook=40 → card shows 120 min

total=null, prep=20, cook=40 → card may show 60 min

total=null, prep=null, cook=null → no fabricated time
```

---

# 9. P0 — Cooking Fraction Presentation

## 9.1 Problem

The deterministic parser intentionally normalizes fractions to numeric values:

```text
1/4   → 0.25
1/3   → approximately 0.3333333333
1 1/2 → 1.5
```

This is correct for canonical computation.

The regression occurs when frontend surfaces later render the numeric value with ordinary string conversion:

```text
0.25
0.3333333333333333
```

Representative sources:

```text
W05 Gimme Some Oven
W06 Tasty
```

This is a display/presentation regression, not evidence that canonical numeric storage is wrong.

---

## 9.2 Do not change canonical persistence

Keep numeric canonical amounts.

Do not introduce, solely for this regression:

```text
quantity_raw
amount_raw
original_fraction_string
fraction_numerator
fraction_denominator
```

Exact lexical reconstruction is outside MVP.

Noomori needs **cooking-readable equivalence**, not byte-for-byte source syntax preservation.

---

## 9.3 Required formatter behavior

Reuse or extend one shared cooking-quantity formatter.

Minimum expected outputs:

```text
0.125       → 1/8
0.25        → 1/4
~0.33333333 → 1/3
0.5         → 1/2
~0.66666667 → 2/3
0.75        → 3/4
1.5         → 1 1/2
```

Fraction snapping must be conservative.

Examples that must not be aggressively changed:

```text
0.29 → not automatically 1/4
0.29 → not automatically 1/3
```

Use a strict numerical tolerance.

---

## 9.4 Required surfaces

Regression tests must verify the formatter is applied consistently to:

```text
website-import editable preview
recipe detail Original mode
recipe edit draft loaded from API
serving-scaled ingredient display
```

Do not fix only one UI screen.

A shared utility is preferred so behavior cannot drift between import and detail views.

---

## 9.5 Required tests

Backend parser characterization:

```text
"1/4 cup dry sherry"
→ quantity = 0.25
→ unit = cup
```

Frontend presentation:

```text
quantity 0.25 + cup
→ "1/4 cup"
```

Gimme-style thirds:

```text
quantity approximately 1/3
→ "1/3 cup"
```

Serving scaling:

```text
base 1/3 cup
selected servings = 1/2 of base
→ scaled numeric ≈ 1/6
→ display "1/6 cup" when formatter supports denominator 6
```

At minimum the result must never display a long floating-point artifact.

---

# 10. URL Import vs Website Adjustable Serving State

## 10.1 Contract

Ordinary URL import operates on the server-fetched canonical page.

It does not inherit ephemeral state from the user's browser such as:

```text
0.5× / 1× / 2× serving control
client-side JavaScript state
session-local ingredient scaling
browser DOM mutations
```

Therefore, for W05 Gimme Some Oven:

```text
website base recipe → import base recipe
Noomori servings UI → perform scaling locally
```

This is the required predictable contract.

---

## 10.2 Required regression

Capture a fixture representing the canonical/base recipe.

Assert:

- imported servings match the canonical source recipe;
- imported ingredients are the canonical source values;
- no scaled browser state is invented;
- subsequent Noomori serving scaling derives from the canonical numeric amount;
- fraction formatting keeps scaled output cooking-readable.

Do not introduce browser automation merely to reproduce a publisher's interactive serving widget.

If Noomori later wants "import exactly what is currently rendered in my browser," that is a different acquisition feature and requires a separate specification.

---

# 11. P1 — Independent Ingredient and Instruction Group Enrichment

## 11.1 Problem

A recipe may legitimately have:

```text
grouped ingredients + flat instructions
```

or:

```text
flat ingredients + grouped instructions
```

These two enrichment decisions should not unnecessarily depend on each other.

Cookpad exposes an observed ingredient-label case such as:

```text
Bumbu Bubuk:
```

inside the ingredients region.

---

## 11.2 Required refactor boundary

Prefer independent conceptual enrichment paths:

```text
enrich ingredient groups

enrich instruction groups
```

Each enrichment remains atomic within its own dimension.

Example:

```text
ingredient grouping verification succeeds
instruction grouping verification fails

→ preserve verified ingredient grouping
→ leave instructions in their valid primary form
```

Do not require both dimensions to succeed before either may be preserved.

---

## 11.3 Safe label-only ingredient rows

A generic candidate group label may be recognized when all required confidence rules hold, for example:

```text
short textual row
no parseable quantity
no recognized measurement unit
label-like punctuation/markup
followed by one or more real ingredient rows
inside the verified Ingredients region
```

The exact heuristic must remain conservative.

Do not classify ordinary ingredient prose as a group title merely because it contains a colon.

---

## 11.4 Required tests

Add independent cases:

```text
A. grouped ingredients + flat instructions
B. flat ingredients + grouped instructions
C. both grouped
D. ambiguous label → no enrichment
E. label-only ingredient subsection similar to Cookpad
```

Assert exact content equality before and after grouping so enrichment never drops or duplicates ingredients/steps.

---

# 12. P1 — Nutrition Confidence and Dapur Umami

## 12.1 Problem

Noomori persists:

```text
nutrition_per_serving
```

Therefore extracting nutrition numbers without proving their basis can silently create incorrect data.

W10 Dapur Umami exposes visible nutrition that is currently not imported.

The correct response is **not** to remove the current confidence gate blindly.

---

## 12.2 Confidence hierarchy

Preferred precedence:

```text
1. structured nutrition explicitly known to be per serving
2. bounded DOM nutrition block explicitly labeled per serving/per portion/per porsi
3. other structured representation whose basis is deterministically proven
4. ambiguous nutrition numbers → do not populate nutrition_per_serving
```

Incorrect:

```text
visible calories + recipe servings
→ automatically assume calories are per serving
```

unless the publisher's semantics prove that relationship.

---

## 12.3 Dapur Umami regression

The existing Dapur fixture should not be replaced merely to use the new URL.

W10 qualifies for a new fixture only because it represents a newly observed nutrition regression/site drift.

Recommended fixture:

```text
server/fixtures/recipe_url_import_dapur_umami_cireng.html
```

Required assertions:

- core recipe still imports;
- visible nutrition is detected only if basis semantics are proven;
- supported fields map correctly;
- unsupported nutrients remain ignored;
- ambiguous nutrition must result in `nutrition_per_serving = None`, not fabricated values.

If the page contains a machine-readable payload with a deterministic per-serving basis, prefer that over looser DOM inference.

---

# 13. P1 — Household Shared Badge

## 13.1 Problem

The current Recipe Card derives a badge whenever:

```text
isShared == true
```

Inside the Household library, every displayed recipe is already in the shared context, so the badge adds no information.

---

## 13.2 Required UI contract

```text
Personal library
shared recipe → show Shared badge
private recipe → no Shared badge

Household library
shared recipe → hide Shared badge
```

Sharing state must remain unchanged; only presentation changes.

Do not remove `isShared` from the recipe model.

---

## 13.3 Preferred implementation boundary

Pass display context to RecipeCard, for example through an existing/new presentation prop derived from library mode.

Do not mutate recipe data to fake:

```text
isShared = false
```

inside Household mode.

Regression tests should verify both Personal and Household usage so a fix cannot accidentally remove the useful badge from the personal library.

---

# 14. Fixture Strategy

## 14.1 Keep fixtures minimal but structurally faithful

Fixtures should retain only what matters to the regression:

- relevant Recipe JSON-LD / Microdata;
- recipe-card root;
- relevant metadata;
- ingredients/instructions;
- group labels;
- notes;
- nutrition context;
- relevant controls/noise when they are part of the bug.

Remove unrelated:

- analytics;
- megabytes of CSS;
- unrelated article body;
- ad scripts;
- recommendation feeds;
- comments;
- tracking payloads.

Do not sanitize away the exact structure that caused the bug.

---

## 14.2 Proposed fixture set for this regression wave

Do **not** necessarily create all fixtures below if two sources prove structurally equivalent.

Candidate fixtures:

```text
recipe_url_import_notes_wprm.html
    representative: Damn Delicious or Tastes Better From Scratch

recipe_url_import_total_active.html
    representative: Food Network or Southern Living, after transport succeeds

recipe_url_import_chill_time.html
    representative: Tastes Better From Scratch

recipe_url_import_fraction_thirds.html
    representative: Gimme Some Oven

recipe_url_import_fraction_quarter.html
    representative: Tasty

recipe_url_import_cookpad_groups.html
    representative: Cookpad W08

recipe_url_import_dapur_umami_cireng.html
    representative: Dapur Umami W10
```

Consolidation rule:

If one fixture can faithfully cover two regressions without becoming overly broad, prefer one fixture.

Example:

```text
Tastes Better From Scratch fixture
→ notes + chill-time semantics
```

Do not duplicate the same HTML into multiple files simply to create one fixture per requirement.

---

# 15. Test-Layer Matrix

| Concern | Unit | Fixture integration | Endpoint | Frontend |
|---|---:|---:|---:|---:|
| Upstream HTTP status diagnostics | ✅ | — | ✅ | — |
| Timeout/network classification | ✅ | — | ✅ | — |
| Food Network/Royco live behavior | manual/non-blocking | — | manual | — |
| Notes extraction | ✅ | ✅ | ✅ | ✅ preview |
| Total time | ✅ | ✅ | ✅ | ✅ card/detail |
| Additional/chill time | ✅ | ✅ | ✅ | ✅ when surfaced |
| Canonical fractions | ✅ backend characterization | ✅ | ✅ | — |
| Fraction presentation | — | — | — | ✅ |
| Serving scaling from canonical base | — | fixture contract | — | ✅ |
| Ingredient group enrichment | ✅ | ✅ | ✅ | ✅ mapping sanity |
| Nutrition confidence | ✅ | ✅ | ✅ | ✅ preview |
| Household Shared badge | — | — | — | ✅ |

---

# 16. Suggested Test Organization

The existing:

```text
server/tests/test_recipe_url_import.py
```

already covers many concerns.

New tests may gradually be separated by responsibility:

```text
server/tests/
├── test_recipe_url_import.py                 # existing/core orchestration
├── test_recipe_url_import_transport.py       # fetch/SSRF/status diagnostics
├── test_recipe_url_import_metadata.py        # notes/time/yield/nutrition semantics
└── test_recipe_url_import_sites.py           # structurally faithful site fixtures
```

Frontend additions may use existing functional-test conventions, for example:

```text
tests/frontend/
├── recipe-workflow.functional.test.ts
├── recipe-import.functional.test.tsx         # if an equivalent file already exists, reuse it
└── recipe-card.functional.test.tsx           # only if existing coverage cannot host the cases cleanly
```

**No mass test refactor is required.**

Existing tests should not be moved solely to produce this directory shape.

---

# 17. Detailed Regression Cases

## R-TRANSPORT-001 — Upstream status remains diagnosable

Given:

```text
validated public target
upstream response = 403
```

Expect:

```text
WebsiteImportError("page_unavailable")
user-facing mapping remains 502 if current API contract is retained
diagnostics record upstream_status=403
```

Repeat for:

```text
429
500
503
```

---

## R-TRANSPORT-002 — Network errors are not fabricated as HTTP status

Given:

```text
connection fails before HTTP response
```

Expect:

```text
page_unavailable
upstream_status absent/null
error_class records network failure class
```

---

## R-TRANSPORT-003 — Food Network is transport-first

Manual/non-blocking reproduction:

```text
W01 URL
```

Expect first diagnostic output to identify the underlying fetch class.

Do not mark extraction regression resolved until a valid page reaches `extract_recipe()` or DOM fallback.

---

## R-TRANSPORT-004 — Royco is independently characterized

Same contract as Food Network, but do not assume identical root cause.

---

## R-NOTES-001 — Recipe-card notes survive import

Given a source with:

```text
description = present
notes = present
```

Expect:

- notes appear in the Noomori editable Notes semantic;
- description is not silently mistaken for notes;
- notes do not become ingredients/instructions.

---

## R-TIME-001 — Explicit total time wins card display

Given:

```text
prep=20
cook=40
total=120
```

Expect:

```text
card total = 120
```

not:

```text
60
```

---

## R-TIME-002 — Existing recipes remain compatible

Given:

```text
total=null
prep=20
cook=40
```

Expect existing safe derived display:

```text
60 min
```

---

## R-TIME-003 — Chill time is preserved without redefining Total

Given source:

```text
Prep 5m
Chill 8h
Total 5m
```

Expect:

```text
prep = 5
additional label = Chill
additional = 480
total = 5
```

Do not silently recompute total as `485`.

---

## R-TIME-004 — Active is not fabricated as cook/prep

Given:

```text
Active = 40m
Total = 120m
```

Expect:

```text
total = 120
```

and no incorrect:

```text
prep = 40
cook = 40
```

unless source semantics explicitly provide those fields separately.

---

## R-QTY-001 — Quarter remains canonical numeric but cooking-readable

Given source:

```text
1/4 cup dry sherry
```

Backend:

```text
quantity = 0.25
unit = cup
```

Frontend display/edit:

```text
1/4 cup
```

---

## R-QTY-002 — Third avoids floating-point artifact

Given canonical:

```text
quantity ≈ 0.3333333333333333
unit = cup
```

Expect:

```text
1/3 cup
```

Never:

```text
0.3333333333333333 cup
```

---

## R-QTY-003 — Serving scaling derives from canonical base

Given:

```text
base amount = 1/3 cup
base servings = 2
selected servings = 1
```

Expect numeric scaling from canonical value, then display formatting.

Do not persist the scaled quantity back into the recipe.

---

## R-GROUP-001 — Ingredient groups can enrich independently

Given:

```text
verified ingredient groups
flat valid instructions
```

Expect ingredient groups preserved without requiring instruction groups.

---

## R-GROUP-002 — Instruction groups can enrich independently

Mirror R-GROUP-001.

---

## R-GROUP-003 — Cookpad-like label row

Given bounded Ingredients content containing a verified label such as:

```text
Bumbu Bubuk:
```

followed by ingredient rows, expect a group boundary without losing or duplicating items.

---

## R-NUTRITION-001 — Explicit per-serving nutrition accepted

Given a bounded block clearly labeled:

```text
per serving
per portion
per porsi
```

Expect supported values to populate `nutrition_per_serving`.

---

## R-NUTRITION-002 — Ambiguous nutrition rejected

Given visible numbers without a proven serving basis, expect:

```text
nutrition_per_serving = None
```

Accuracy is preferred over completeness.

---

## R-UI-001 — Personal library keeps Shared badge

Given:

```text
mode=personal
recipe.isShared=true
```

Expect Shared badge visible.

---

## R-UI-002 — Household library hides Shared badge

Given:

```text
mode=household
recipe.isShared=true
```

Expect Shared badge absent.

---

# 18. Live Drift Checks

Live-site drift checks are optional P2 tooling.

If added, they must be:

- non-blocking;
- manually runnable or scheduled separately;
- rate-limited;
- respectful of remote failures;
- diagnostic rather than definitive.

Suggested output:

```text
hostname
fetch_result
upstream_status
extraction_strategy
ingredient_count
instruction_count
metadata_presence
```

Do not alert merely because a third-party page is temporarily unavailable once.

A useful drift signal requires repeated or material failure.

---

# 19. Observability Contract

Website import logging should be sufficient to answer:

```text
Did fetch fail?
Did upstream reject us?
Did extraction fail?
Did DOM fallback run?
Did enrichment run?
Which semantic fields were preserved?
```

Suggested event dimensions:

```text
hostname
result
fetch_upstream_status
fetch_error_class
response_size
redirect_count
extraction_strategy
fallback_reason
group_enrichment
notes_enrichment
time_enrichment
nutrition_enrichment
ingredient_count
instruction_count
nutrition_field_count
duration_ms
```

Do not log full source HTML by default.

---

# 20. Implementation Order

Implement in this order to minimize false debugging:

```text
Phase 1 — Transport visibility
├── add upstream status/error diagnostics
├── add synthetic transport regressions
├── reproduce Food Network
└── reproduce Royco

Phase 2 — Quantity presentation
├── shared cooking-fraction formatter
├── import preview
├── edit/detail
└── serving scaling regressions

Phase 3 — Metadata semantics
├── notes
├── total time
├── additional/passive time
└── explicit Active-time policy

Phase 4 — Structural enrichment
├── independent ingredient grouping
├── independent instruction grouping
└── Cookpad-style label regression

Phase 5 — Nutrition confidence
├── Dapur Umami Cireng fixture
├── structured/per-serving precedence
└── ambiguous-basis rejection

Phase 6 — Small UI cleanup
└── hide Shared badge only in Household context
```

Reasoning:

- transport comes first because failed fetches never reach extraction;
- quantity formatting is isolated and high-impact;
- metadata changes should land before fixture assertions depend on them;
- grouping and nutrition remain conservative;
- Shared badge is independent and can be shipped separately if desired.

---

# 21. Acceptance Criteria

This regression wave is complete when all of the following are true.

## Transport

- [ ] Food Network's Noomori `502` can be traced to its actual upstream/network class.
- [ ] Royco's Noomori `502` can be traced independently.
- [ ] Non-200 upstream statuses are covered deterministically.
- [ ] Existing SSRF/redirect/TLS/size/deadline protections remain passing.
- [ ] No live website is required for blocking CI.

## Notes

- [ ] At least two structurally different notes cases are fixture-tested.
- [ ] Notes do not leak into ingredients or instructions.
- [ ] Source description and recipe-note semantics are not accidentally conflated.

## Time

- [ ] Explicit total time is representable and tested.
- [ ] Existing prep/cook recipes remain backwards-compatible.
- [ ] At least one Chill/additional-time case is tested.
- [ ] Active time is not fabricated as prep/cook.
- [ ] Recipe-card time does not under-report a known explicit Total merely because prep+cook is smaller.

## Quantities

- [ ] `1/4` no longer renders as `0.25` in cooking-facing Original display.
- [ ] `1/3` no longer renders as a long floating-point decimal.
- [ ] Canonical backend quantity remains numeric.
- [ ] Serving scaling derives from canonical values and does not mutate persistence.

## Grouping

- [ ] Ingredient and instruction grouping can succeed independently.
- [ ] Cookpad-like subsection labels are preserved only under conservative confidence rules.
- [ ] No item duplication or loss occurs during enrichment.

## Nutrition

- [ ] Dapur Umami Cireng is represented by a regression case.
- [ ] Explicit per-serving semantics populate nutrition.
- [ ] Ambiguous-basis nutrition remains unset.

## UI

- [ ] Personal shared recipes still show the Shared badge.
- [ ] Household recipe cards do not show a redundant Shared badge.

---

# 22. Non-Goals

This task does **not** require:

- guaranteeing support for every recipe website;
- headless Chrome / Playwright / browser rendering for ordinary import;
- bypassing CAPTCHAs or intentional anti-bot challenges;
- weakening SSRF protections;
- storing raw recipe HTML;
- preserving exact fraction typography (`¼` vs `1/4` vs `0.25`);
- importing the user's ephemeral browser serving multiplier;
- adding one time field for every publisher-specific duration label;
- assuming nutrition is per-serving merely because servings are present;
- creating hostname-specific scraper code unless a generic safe solution is impossible;
- making remote websites part of blocking CI.

---

# 23. Design Principle

The target reliability model is:

```text
fetch safely
→ observe transport failures precisely
→ extract the strongest structured recipe source
→ use DOM only through bounded verified enrichment/fallback
→ preserve source semantics rather than inventing them
→ store canonical values
→ present them in cooking-friendly form
→ lock every real-world failure into deterministic regression coverage
```

The important shift is from:

```text
"Can Noomori scrape this website?"
```

to:

```text
"Which reusable failure class did this website expose,
and how do we prevent the entire class from regressing?"
```

That should remain the rule for future Import from Website hardening.
