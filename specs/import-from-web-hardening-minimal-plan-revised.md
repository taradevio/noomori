# Import-from-Web Hardening — Minimal Implementation Plan (Revised)

## Summary

Harden the existing importer without replacing its layered architecture or adding hostname-specific behavior. Reuse `recipe-scrapers`, the current duration parser, fraction formatter, DOM nutrition gate, and recipe components.

The implementation must preserve the existing high-level pipeline:

```text
validated fetch
→ recipe-scrapers primary extraction
→ normalization
→ guarded DOM enrichment
→ precision DOM/text fallback when primary core extraction is insufficient
→ editable Noomori draft
```

The goal is to improve reliability across structurally different publishers without turning the importer into a collection of domain-specific exceptions.

### Ponytail reductions

- No browser automation.
- No hostname-specific extraction or fetch bypasses.
- No live-site CI dependency.
- No drift-monitor tooling in this round.
- No raw quantity persistence.
- No generic time arrays.
- No separate persisted Description field.
- No Active-time persistence.
- No changes that weaken SSRF protection.
- Reuse existing fixtures where they cover the same structural risk.
- Add only one Cookpad-style grouping fixture.
- Keep Royco unsupported while making its upstream failure diagnosable.
- Preserve the current public error codes and nullable-field compatibility.

---

# 1. Transport and Observability

## 1.1 Safe transport diagnostics

Extend `WebsiteImportError` so expected fetch failures may carry safe structured diagnostics.

Supported diagnostic fields:

```text
hostname
upstream_status
redirect_count
fetch_phase
content_type
bytes_read
transport_error_kind
```

Possible `fetch_phase` values should remain small and stable, for example:

```text
dns
connect
request
redirect
response
content_type
body
```

`transport_error_kind` must be an allowlisted classification rather than an arbitrary exception message.

Examples:

```text
timeout
connection_error
tls_error
dns_error
http_error
unknown_transport_error
```

Do not expose internal diagnostics through the existing public API error body in this round.

Public error behavior remains:

```text
unsafe_url               → 400
page_too_large           → 413
unsupported_content_type → 415
recipe_not_found         → 422
page_unavailable         → 502
fetch_timeout            → 504
```

## 1.2 Safe logging contract

Website-import logs must not contain:

- full source URLs;
- URL query strings;
- request or response bodies;
- cookies;
- arbitrary request headers;
- arbitrary response headers;
- arbitrary exception messages from expected transport failures.

Replace full-URL logging with:

```text
hostname
result
duration_ms
response_size
upstream_status
redirect_count
fetch_phase
content_type
bytes_read
transport_error_kind
```

For expected `WebsiteImportError` failures:

```text
structured sanitized log
→ no raw exception message
→ no chained traceback / exc_info
```

Unexpected programming/application errors may continue using normal exception logging.

## 1.3 Preserve fetch security behavior

Keep unchanged:

- verified-IP fetching;
- DNS validation;
- globally routable address checks;
- safe-port checks;
- redirect revalidation;
- maximum redirect count;
- shared fetch deadline;
- maximum HTML size;
- maximum image size;
- content-type validation;
- SSRF protections.

Do not bypass these protections to support a website.

## 1.4 HTML User-Agent compatibility

The current Noomori HTML User-Agent is too obviously application-specific for some publishers.

Use a browser-compatible HTML fetch User-Agent that matches the successfully characterized `recipe-scrapers` fetch profile closely enough to preserve Food Network compatibility.

Do **not** import private dependency internals such as:

```python
from recipe_scrapers._abstract import HEADERS
```

or otherwise make Noomori runtime behavior depend on a private `recipe-scrapers` constant.

Noomori should own its HTML User-Agent constant.

Example conceptual rule:

```text
Noomori-controlled browser-compatible HTML User-Agent
→ used for recipe HTML requests only
```

Image-fetch behavior does not need to change unless independently required.

Characterized behavior:

```text
Food Network
current Noomori UA → upstream 403
browser-compatible dependency-style UA → upstream 200

Royco
current Noomori UA → upstream 403
browser-compatible dependency-style UA → still upstream 403
```

Therefore:

- Food Network becomes a supported transport regression.
- Royco remains unsupported.
- No Royco-specific bypass should be added.

## 1.5 Alternate-address behavior

Preserve the current alternate-address contract:

```text
connection-level failure
→ next validated address may be attempted
```

but:

```text
any HTTP response
→ address selection stops
```

Therefore this behavior remains valid:

```text
IP A → HTTP 503
IP B → HTTP 200

result:
stop after IP A
→ page_unavailable
```

Do not silently turn HTTP response handling into multi-address retry behavior in this round.

---

# 2. Notes Metadata

## 2.1 Product contract

No separate persisted Description field is added in this round.

The existing persisted `description` field continues serving the editable Noomori **Notes** field.

For website imports, precedence becomes:

```text
explicit recipe-card Notes
→ persisted description / Noomori Notes

otherwise
publisher description
→ persisted description / Noomori Notes

otherwise
null
```

If non-serving yield text exists, append it after the selected Notes/description value.

Example:

```text
Keep refrigerated for up to 3 days.

Yield: 1 large loaf
```

Do not overwrite explicit Notes with a publisher summary.

## 2.2 Notes extraction

Extract Notes only from one unambiguous bounded recipe-card block.

Accepted heading families may include exact normalized labels such as:

```text
Notes
Recipe Notes
Tips & Notes
```

Any accepted aliases must remain explicit and intentionally small.

Requirements:

- the Notes block must be inside the selected recipe candidate;
- the heading must be unambiguous;
- the content must be structurally bounded;
- controls must be excluded;
- advertisement/navigation/share content must be excluded;
- unrelated trailing article content must be excluded;
- ambiguous multiple Notes candidates must be ignored rather than merged.

Prefer a false negative over importing unrelated prose.

---

# 3. Time Metadata

## 3.1 New persisted fields

Add nullable recipe fields:

```text
total_time_minutes
additional_time_label
additional_time_minutes
```

Database constraints:

```text
total_time_minutes IS NULL OR total_time_minutes >= 0
```

and:

```text
(
  additional_time_label IS NULL
  AND additional_time_minutes IS NULL
)
OR
(
  additional_time_label IS NOT NULL
  AND length(trim(additional_time_label)) BETWEEN 1 AND 40
  AND additional_time_minutes > 0
)
```

The label and duration must therefore be either:

```text
both null
```

or:

```text
both present
```

Do not impose arithmetic consistency between:

```text
prep
cook
additional
total
```

because publisher semantics differ.

## 3.2 Meaning of Total

`total_time_minutes` stores the **extractor-reported total time**.

It does **not** guarantee that the publisher explicitly supplied a distinct `Total` value.

`recipe-scrapers.total_time()` may internally:

- return explicit publisher `totalTime`;
- derive total from prep + cook;
- use site-specific logic.

Noomori must not independently recompute, reconcile, or override the returned value during extraction.

Required behavior:

```text
recipe-scrapers total_time()
→ normalize valid non-negative integer
→ total_time_minutes
```

If the extractor returns no usable value:

```text
total_time_minutes = null
```

## 3.3 Card time behavior

Recipe cards display:

```text
total_time_minutes
```

when it is positive.

Otherwise retain the current fallback:

```text
prep_time_minutes + cook_time_minutes
```

when that fallback is positive.

Otherwise:

```text
no time metadata
```

Conceptually:

```text
cardTime =
  positive(total_time_minutes)
  ?? positive(prep + cook)
  ?? null
```

## 3.4 Additional/passive duration

Extract at most one additional/custom duration from a bounded recipe-card timing block.

Accepted canonical labels:

```text
Chill
Rest
Cooling
Marinate
Proof
Additional
```

Importer aliases may normalize obvious variants:

```text
Chill time  → Chill
Chilling    → Chill

Rest time   → Rest
Resting     → Rest

Cooling time → Cooling

Marinating  → Marinate
Marinate time → Marinate

Proofing    → Proof
Proof time  → Proof

Additional time → Additional
```

Keep the alias set intentionally small and explicit.

Use the existing duration parser.

Reject the additional duration when:

- more than one valid passive/custom duration candidate exists;
- the label is unsupported;
- the value cannot be parsed confidently;
- the candidate is outside the bounded recipe timing block.

Do not sum multiple passive times.

## 3.5 Active time

Do not add an Active field.

Do not map DOM `Active` time into:

```text
prep
cook
additional
```

Continue accepting explicit `prep_time()` and `cook_time()` values supplied by structured extraction.

If a publisher exposes only:

```text
Active
Total
```

then Noomori may persist Total while leaving prep/cook unchanged or null.

## 3.6 Form behavior

Extend the existing Timing UI with:

```text
Prep time
Cook time
Total time
Additional time
```

Reuse `RecipeDurationPicker` for numeric durations.

The additional label is a separate editable text field:

```text
max 40 characters
trimmed on save
```

Manual user input is allowed to use free text within the 40-character limit.

Website import remains stricter and uses only the importer allowlist/canonicalization rules.

---

# 4. Primary Metadata Preservation Across Fallback

The current primary → DOM fallback path already restores selected high-confidence metadata after the fallback owns title/core arrays.

Extend this preservation contract.

When primary extraction produced trusted values, preserve the following non-null metadata across DOM fallback:

```text
description
servings
prep_time_minutes
cook_time_minutes
total_time_minutes
additional_time_label
additional_time_minutes
nutrition_per_serving
image_url
```

The Notes/description value selected by the website metadata policy must therefore survive a core extraction fallback.

Example:

```text
primary:
title ✅
ingredients ✅
instructions ❌
Total ✅
Chill ✅
Notes ✅

DOM fallback:
title ✅
ingredients ✅
instructions ✅

final:
DOM core arrays
+ primary Total
+ primary Chill
+ primary Notes
```

Do not let a fallback that exists only to recover core recipe structure silently discard trusted metadata.

---

# 5. Ingredient and Instruction Grouping

## 5.1 Independent grouping success

Refactor the low-level DOM grouping contract so ingredient grouping and instruction grouping may succeed independently.

Current behavior must no longer require:

```text
ingredient group count >= 2
AND
instruction group count >= 2
```

before returning structural information.

A valid result may therefore be:

```text
ingredient_groups = [...]
instruction_groups = []
```

or:

```text
ingredient_groups = []
instruction_groups = [...]
```

The enrichment layer then decides independently whether each dimension has enough verified structure to apply.

## 5.2 Preserve exact-content verification

DOM grouping is presentation enrichment only.

Primary parsed ingredient/instruction content remains authoritative.

Before applying grouping:

```text
flattened DOM content
must equal
flattened primary content
```

after only the existing approved presentation-label normalization.

If exact normalized equality fails:

```text
do not enrich that dimension
```

Do not partially copy or merge unmatched content.

## 5.3 Cookpad-style ingredient subgroup labels

Recognize a direct ingredient `<li>` as a subgroup label only when all are true:

- it is inside the verified ingredient list;
- it is short;
- it ends with `:`;
- it has no leading quantity;
- it has no recognized unit;
- it is not an obvious ingredient;
- it is followed by one or more real ingredient rows.

Example:

```text
Tomat
Garam
Bumbu Bubuk:
Ketumbar
Kunyit
Lada
```

may normalize to:

```text
[untitled]
- Tomat
- Garam

Bumbu Bubuk
- Ketumbar
- Kunyit
- Lada
```

An initial untitled group is allowed.

Prefer false negatives over inventing groups.

## 5.4 No hostname-specific grouping

Do not add:

```python
if hostname == "cookpad.com":
```

or equivalent domain-specific grouping logic.

The new behavior must be based on structure only.

---

# 6. Nutrition Confidence

## 6.1 Structured nutrition

Structured nutrition may populate Noomori `nutrition_per_serving` only when the source proves the nutrition basis is per serving/portion.

For `recipe-scrapers` structured nutrition, require a usable `servingSize` semantic signal.

Examples of acceptable basis:

```text
1 serving
1 portion
per serving
per portion
```

A concrete unit serving such as:

```text
1 cup
1 cookie
```

may also be accepted when it is clearly returned as the recipe nutrition `servingSize`.

If structured nutrient values exist without a usable serving basis:

```text
nutrition_per_serving = null
```

Do not infer per-serving semantics from recipe yield alone in this round.

## 6.2 DOM nutrition fallback

If structured nutrition is rejected or absent, the existing DOM nutrition confidence gate may still populate nutrition.

Accepted DOM basis remains explicit semantics such as:

```text
per serving
per portion
per porsi
```

Ambiguous nutrition remains unset.

## 6.3 Existing Dapur regression

Keep the current Dapur Umami fixture as the ambiguous-basis regression.

The Cireng page exposes the same unsupported risk class and does not require another fixture.

Expected behavior:

```text
nutrition values visible
+ no proven per-serving basis
→ null
```

## 6.4 WPRM fixture update

The existing WPRM fixture currently contains nutrition without `servingSize`.

Under the new rule, update that fixture with an explicit structured basis such as:

```json
"servingSize": "1 serving"
```

so its existing expected nutrition import remains valid.

Add a separate structured regression where nutrition values are present but `servingSize` is absent; expected result is `null`.

---

# 7. Quantity and Fraction Presentation

## 7.1 Persistence remains numeric

Do not add:

```text
amount_raw
quantity_raw
original_quantity_text
fraction numerator/denominator fields
```

Canonical ingredient quantity remains numeric.

Examples:

```text
1/4 → 0.25
1/3 → approximately 0.333333...
1 1/2 → 1.5
```

## 7.2 Reuse the conservative cooking formatter

Export/reuse the existing cooking-amount formatter rather than adding another fraction formatter.

Add support for:

```text
1/6
```

Minimum cooking-fraction set after this change:

```text
1/8
1/6
1/4
1/3
1/2
2/3
3/4
```

Retain the existing conservative snapping tolerances.

Required:

```text
0.25 → 1/4
~0.333333 → 1/3
~0.166667 → 1/6
0.29 → 0.29
```

## 7.3 Unit-aware fraction formatting

Do not apply kitchen fraction formatting blindly to every numeric unit.

Retain the current policy for cooking-style units where fractions are natural, such as:

```text
tsp
tbsp
cup
```

Do not accidentally render arbitrary metric quantities as cooking fractions.

Examples that should remain decimal/numeric:

```text
0.5 mg
0.333 kg
0.25 ml
```

unless an existing explicit unit policy already says otherwise.

## 7.4 Imported and edit-loaded drafts

When API/import numeric quantities become editable draft strings, use the same unit-aware display formatting policy.

Examples:

```text
stored 0.25 cup
→ editable "1/4"

stored 0.333333... cup
→ editable "1/3"
```

## 7.5 Serving scaling

When the Recipe Form changes servings, derive new quantities from the stable canonical snapshot and format the result with the same cooking formatter.

Required:

```text
base 1/3 cup
2 servings → 1 serving
→ 1/6 cup
```

Never scale from the last rounded display value.

Canonical amounts must not accumulate rounding drift.

---

# 8. Shared Badge Context

Add:

```ts
showSharedBadge?: boolean
```

to `RecipeCard`.

Default:

```text
true
```

Behavior:

```text
Personal library
shared recipe
→ show Shared badge

Household library
recipe already appears in Shared Recipes context
→ hide Shared badge
```

The household library passes:

```text
showSharedBadge={false}
```

All other contexts retain the default behavior unless they have an explicit product reason to suppress it.

Do not pass the full `LibraryMode` into `RecipeCard` solely for this behavior.

---

# 9. Interfaces and Database Migration

## 9.1 Database fields

Add:

```text
total_time_minutes integer null
additional_time_label text null
additional_time_minutes integer null
```

with constraints defined in Section 3.

No data backfill is required.

Existing rows remain:

```text
null
```

and continue rendering through current prep+cook fallback behavior.

## 9.2 Server schemas

Extend:

```text
CreateRecipe
ImportedRecipeTextDraft
ExtractedRecipe
```

and any internal website-import metadata model required by the implementation.

Keep all new request fields optional/nullable for compatibility.

## 9.3 Client types

Extend:

```text
ApiRecipe
RecipeCreatePayload
RecipeDraft
RecipeDetailModel
```

with client draft names:

```text
totalMinutes
additionalTimeLabel
additionalTimeMinutes
```

Use existing naming conventions elsewhere when mapping API snake_case to client camelCase.

## 9.4 Legacy PUT compatibility

This is required.

Current recipe update behavior uses a full model dump.

After adding new nullable fields, an older mobile client will omit them. Pydantic would otherwise fill the new fields with `None`, and a full update could erase previously stored timing metadata.

Required update semantics for the new fields:

```text
legacy client omits field
→ preserve current DB value

modern client sends null explicitly
→ clear DB value

modern client sends value
→ update DB value
```

Do not globally change all recipe PUT semantics with `exclude_unset=True` unless separately proven safe.

Prefer a targeted compatibility rule for the newly introduced timing fields.

Conceptual implementation:

```python
values = payload.model_dump(mode="json")

for field in NEW_TIMING_FIELDS:
    if field not in payload.model_fields_set:
        values.pop(field, None)
```

The exact implementation should follow current Pydantic conventions in the repository.

## 9.5 Deployment order

Deploy in this order:

```text
1. nullable database migration
2. compatible backend
3. new client
```

The backend must remain compatible with older client payloads during rollout.

Existing public error responses remain unchanged.

---

# 10. Regression Strategy

Tests must be organized by failure class, not by website count.

Live websites are manual characterization evidence only.

Blocking CI tests must use deterministic synthetic or captured/minimized fixtures.

## 10.1 Transport regressions

Add deterministic tests for:

```text
upstream 403
upstream 429
upstream 500
upstream 503
network failure with no fabricated HTTP status
timeout
redirect handling
unsupported content type
body-size limit
safe logging
HTML User-Agent
```

Verify sanitized diagnostics include only expected fields.

Verify full URL/query strings do not appear in expected failure logs.

Verify expected transport failures do not emit raw chained tracebacks.

Preserve:

```text
IP A → 503
IP B → 200
→ stop after A
```

### Manual characterization cases

Food Network:

```text
https://www.foodnetwork.com/recipes/food-network-kitchen/stuffed-green-peppers-3364195
```

Expected manual evidence:

```text
browser-compatible Noomori HTML fetch → 200
```

Once fetched, extraction may proceed through the normal importer.

Royco:

```text
https://www.royco.co.id/r/pindang-asam-iga-sapi.html/125025
```

Expected manual evidence:

```text
browser-compatible Noomori HTML fetch → upstream 403
```

No bypass is planned.

Royco remains unsupported.

## 10.2 Notes regressions

Extend the existing WPRM fixture with:

```text
publisher description
explicit Notes block
```

Assert:

```text
explicit Notes wins
```

Add or extend one existing non-WPRM fixture with a differently structured bounded Notes block.

Cover:

```text
one valid Notes block
ambiguous multiple Notes blocks
notes followed by unrelated article content
notes containing controls/noise
description fallback when Notes absent
non-serving Yield appended after selected Notes/description
```

## 10.3 Time regressions

Cover:

```text
extractor-reported total is persisted
total card value wins when positive
legacy recipe without total uses prep + cook
total null + no prep/cook → no card time
```

Additional time:

```text
Chill
Rest
Cooling
Marinate
Proof
Additional
```

Cover alias canonicalization.

Reject:

```text
multiple passive duration candidates
unsupported labels
unparseable durations
DOM Active mapping
```

Verify:

```text
Total and Chill remain independent
```

including a case where publisher Total does not arithmetically include Chill.

Do not assert arithmetic consistency.

## 10.4 Fallback metadata preservation

Add a focused unit/integration regression:

```text
primary core incomplete
primary Total present
primary Additional present
primary Notes present
DOM fallback recovers core recipe

final result preserves primary metadata
```

This test should not require a new full site fixture.

## 10.5 Fraction regressions

Verify import/API-to-draft formatting:

```text
0.25 cup → 1/4
~1/3 cup → 1/3
```

Verify serving scaling:

```text
1/3 cup
× 0.5 serving factor
→ 1/6 cup
```

Verify conservative behavior:

```text
0.29 cup → 0.29
```

Verify unit-aware behavior:

```text
0.5 mg remains numeric
0.333 kg remains numeric
```

Verify save round-trip:

```text
fraction display
→ numeric payload
→ persisted numeric value
```

Verify repeated serving changes do not mutate the canonical base snapshot.

## 10.6 Grouping regressions

Add one minimal Cookpad-style fixture.

Cover:

```text
ingredient grouping only succeeds
instruction grouping only succeeds
both succeed
neither succeeds
initial untitled ingredient group
colon-ended list-row subgroup label
ambiguous label remains ingredient text
```

Verify:

```text
flattened primary content
==
flattened enriched content
```

No loss.

No duplication.

Native structured groups remain authoritative when already available and valid.

## 10.7 Nutrition regressions

Structured:

```text
servingSize present + valid nutrients
→ accepted
```

Structured:

```text
valid nutrients + no servingSize
→ rejected
```

DOM:

```text
explicit per serving / per portion / per porsi
→ accepted
```

Ambiguous Dapur fixture:

```text
nutrition values + unsupported/ambiguous basis
→ null
```

Update the WPRM fixture to include a valid `servingSize` so its existing positive nutrition regression remains intentional.

## 10.8 Shared badge regressions

Verify:

```text
Personal library + isShared=true
→ Shared badge visible

Household library + isShared=true
→ Shared badge hidden

Personal library + isShared=false
→ no Shared badge
```

The default `RecipeCard` behavior remains backward compatible.

## 10.9 API and migration regressions

Database:

```text
new columns nullable
negative total rejected
additional label without duration rejected
additional duration without label rejected
additional duration = 0 rejected
valid paired additional metadata accepted
```

Create:

```text
new client sends timing metadata
→ persisted
```

Legacy update:

```text
existing timing metadata
+ old PUT omits new fields
→ metadata preserved
```

Modern update:

```text
explicit null
→ metadata cleared
```

Existing legacy rows:

```text
all new fields null
→ valid API response
→ existing prep+cook rendering fallback
```

---

# 11. Test Execution

Run:

```text
backend URL-import tests
backend full test suite
database/migration tests
TypeScript checks
frontend functional tests
```

The current frontend Jest command fails before test discovery under Bun 1.3.14 with a readonly-property error.

Do not treat that runner issue as an importer regression.

Use a supported Node/Jest environment for frontend test execution or track the Bun/Jest runner problem separately.

---

# 12. Manual Evidence Matrix

The following live pages remain characterization references, not blocking CI dependencies.

| Site | Risk represented |
|---|---|
| Food Network | HTML fetch compatibility + Total/Active metadata |
| Damn Delicious | explicit recipe Notes |
| Tastes Better From Scratch | Notes + Chill + differing Total semantics |
| Gimme Some Oven | source serving controls + fraction display |
| Tasty | original fraction display |
| Southern Living | Total + Active + Notes |
| Cookpad | ingredient subgroup labels + Notes |
| Royco | upstream transport rejection |
| Dapur Umami | ambiguous nutrition basis |

Do not create one implementation exception per row.

Each row must map to a generic capability or remain unsupported.

---

# 13. Explicit Non-Goals

This implementation does not add:

- browser rendering;
- Playwright/Selenium;
- JavaScript execution for recipe pages;
- browser session state import;
- preservation of a website's currently selected serving multiplier;
- exact lexical quantity preservation;
- Active time persistence;
- multiple additional-time rows;
- domain-specific scrapers in Noomori;
- domain-specific WAF bypasses;
- automated live drift checks;
- nutrition inference from recipe yield;
- automatic reconciliation of prep/cook/additional/total arithmetic;
- a separate persisted Description field.

---

# 14. Acceptance Criteria

The hardening round is complete when all of the following are true.

### Transport

- Food Network-compatible browser-like HTML requests no longer fail solely because of the old Noomori User-Agent.
- Royco remains unsupported without a bypass.
- Upstream HTTP status is diagnosable internally.
- Public error codes remain unchanged.
- Expected transport failures do not log source query strings or arbitrary exception traces.
- SSRF/security behavior remains unchanged.

### Notes

- Explicit bounded recipe Notes are imported into Noomori Notes.
- Publisher description remains the fallback.
- Ambiguous Notes are ignored.
- Yield preservation still works.

### Time

- Extractor-reported Total is persisted.
- One supported additional duration may be persisted with a label.
- Active is not misclassified.
- Recipe cards prefer Total and otherwise retain prep+cook behavior.
- New timing metadata survives primary → DOM fallback.

### Fractions

- `1/4`, `1/3`, and scaled `1/6` display naturally in supported cooking units.
- Arbitrary decimals such as `0.29` are not aggressively snapped.
- Canonical persisted quantities remain numeric.
- Serving scaling does not accumulate rounding drift.

### Grouping

- Ingredient and instruction grouping can enrich independently.
- Cookpad-style list-row labels can form ingredient groups when structurally safe.
- Enrichment never loses, duplicates, or changes authoritative primary recipe content.

### Nutrition

- Structured nutrition requires a proven serving basis.
- Explicit DOM per-serving nutrition remains supported.
- Ambiguous Dapur-style nutrition remains null.

### UI/API

- Shared badges appear in Personal context and are hidden in Household context.
- Existing null rows remain valid.
- Legacy PUT requests cannot silently erase newly stored timing metadata.
- Modern clients can explicitly clear the new timing metadata.

---

# 15. Assumptions

Selected product contracts for this round:

```text
Notes-first mapping
Total + one optional labeled additional duration
no separate Description field
no Active field
no raw quantity storage
no browser automation
no live-site CI
no drift tooling
Royco unsupported
Food Network supported through generic fetch compatibility
```

`recipe-scrapers` remains an implementation dependency, not a Noomori domain contract.

Noomori owns:

- fetch security policy;
- User-Agent behavior;
- normalization policy;
- persisted schema;
- confidence gates;
- fallback composition;
- product-facing semantics.

Before modifying the existing Expo 56 UI components, consult the repository-required Expo 56 documentation and preserve the existing component/navigation conventions.
