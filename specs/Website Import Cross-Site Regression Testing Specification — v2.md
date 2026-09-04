# Website Import Cross-Site Regression Testing Specification — v2

> This specification extends Noomori's existing Website Import regression coverage.
>
> It is based on the current test architecture and existing real-world fixtures. Tests that already exist are treated as established coverage and must not be reimplemented merely to satisfy this specification.
>
> The goal is to close remaining extraction-architecture gaps, not to accumulate arbitrary website domains.

---

# 1. Goal

Strengthen confidence that **Import from Website** remains reliable across structurally different recipe sources and extraction paths.

Noomori already has meaningful coverage for:

- generic Recipe JSON-LD;
- primary `recipe-scrapers` extraction;
- unlisted-site DOM fallback;
- Indonesian recipe layouts;
- nested instruction labels;
- grouped ingredients and instructions;
- DOM noise filtering;
- presentation-only step marker removal;
- DOM nutrition enrichment;
- primary-result group enrichment;
- URL/SSRF/fetch boundaries;
- image-fetch boundaries.

This specification therefore focuses only on the remaining high-value gaps:

1. metadata preservation when primary extraction falls back;
2. Microdata-based recipes;
3. major WordPress recipe-card families;
4. pages containing multiple Recipe entities;
5. structured `HowToSection` instructions;
6. non-serving yield diversity;
7. clearer separation of site-regression tests from transport/parser tests.

---

# 2. Current Architecture

Keep the current architecture.

```text
URL
 ↓
fetch_public_html()
 ↓
recipe-scrapers
supported_only=False
 ↓
normalize_imported_website_recipe()
 ↓
complete core recipe?
 ├── yes
 │    ↓
 │ optional DOM group enrichment
 │ optional DOM nutrition enrichment
 │    ↓
 │ return primary draft
 │
 └── no
      ↓
 BeautifulSoup DOM fallback
      ↓
 extract_recipe_container_text()
      ↓
 parse_recipe_text()
      ↓
 strict DOM nutrition enrichment
      ↓
 return fallback draft
```

Existing rules remain:

- `recipe-scrapers` is the primary extractor.
- BeautifulSoup DOM extraction remains the fallback.
- DOM enrichment may enhance a complete primary result when exact structural verification succeeds.
- Primary parsed values remain authoritative during group enrichment.
- DOM nutrition must satisfy the existing confidence gate.
- External website fetching must retain current SSRF, redirect, timeout, size, content-type, and verified-IP protections.
- No browser rendering is introduced.

---

# 3. Existing Coverage — Do Not Duplicate

The following coverage already exists and is outside the implementation scope of this specification.

## 3.1 Generic structured recipe

Existing fixture:

```text
server/fixtures/recipe_url_import.html
```

Already verifies:

- Recipe JSON-LD;
- title;
- description;
- ingredients;
- instructions;
- servings;
- prep time;
- cook time;
- nutrition;
- image URL.

Do not create another generic JSON-LD fixture unless it covers a materially different Schema.org structure.

---

## 3.2 Generic unlisted DOM fallback

Existing fixture:

```text
server/fixtures/recipe_url_import_dom.html
```

Already verifies:

- unlisted website fallback;
- recipe-container discovery;
- basic ingredient parsing;
- instruction extraction;
- page-noise exclusion.

---

## 3.3 Sasa

Existing fixture:

```text
server/fixtures/recipe_url_import_sasa.html
```

Already verifies:

- Indonesian headings;
- normalized `Bahan-Bahan`;
- multiple ingredient groups;
- multiple instruction groups;
- recipe controls excluded;
- products/articles/related recipes excluded;
- later page content excluded.

Do not recreate this case.

Future Sasa tests should only be added for a newly observed regression.

---

## 3.4 Dapur Umami

Existing fixture:

```text
server/fixtures/recipe_url_import_dapur_umami.html
```

Already verifies:

- Indonesian grouped ingredients;
- visual instruction-number cleanup;
- five real cooking instructions;
- primary extraction behavior;
- strict DOM per-serving nutrition detection;
- DOM nutrition enrichment;
- rejection of ambiguous nutrition blocks.

Do not add another Dapur Umami fixture merely to increase site count.

---

## 3.5 Serious Eats

Existing fixture:

```text
server/fixtures/recipe_url_import_serious_eats.html
```

Already verifies:

- ingredient groups;
- instruction groups;
- primary-flat → DOM-group enrichment;
- exact/atomic structure verification;
- no partial enrichment;
- native primary groups are never overwritten;
- trailing sections/noise are excluded;
- primary metadata such as time, servings, nutrition, and image survives group enrichment.

---

## 3.6 Simply Recipes

Existing fixture:

```text
server/fixtures/recipe_url_import_simply_recipes.html
```

Already verifies:

- nested instruction headings;
- heading/body pairing;
- grouped instructions;
- primary enrichment;
- DOM fallback for the same structure;
- trailing non-recipe content exclusion.

---

## 3.7 URL and image transport

Existing tests already cover:

- unsafe schemes;
- credentials in URLs;
- restricted ports;
- private/loopback/link-local addresses;
- mixed public/private DNS results;
- verified-IP connections;
- TLS hostname preservation;
- safe redirects;
- unsafe redirects;
- redirect limits;
- timeouts;
- upstream errors;
- unsupported content types;
- declared and streamed oversized responses;
- charset decoding;
- image content types and limits.

Do not expand cross-site tests into transport testing.

---

# 4. Testing Philosophy

The corpus is organized by **structural risk**, not hostname.

Bad target:

```text
"We support 25 websites."
```

Preferred target:

```text
"We have representative regression coverage for the major extraction
structures Noomori can encounter."
```

A new website fixture should be added only when it contributes at least one of:

- an extraction format not represented yet;
- a recipe-card engine not represented yet;
- a previously observed bug;
- a new primary/fallback interaction;
- a new ambiguity or noise pattern;
- a dependency upgrade regression.

---

# 5. Priority Gap Matrix

| Priority | Gap | Current coverage | Required action |
|---|---|---|---|
| P0 | Primary → fallback metadata preservation | Missing | Add focused endpoint regression |
| P0 | Microdata Recipe | Missing | Add one structural fixture |
| P0 | WordPress Recipe Maker family | Missing | Add one representative fixture |
| P0 | Multiple Recipe objects / roundup ambiguity | Missing | Add positive + negative cases |
| P1 | `HowToSection` structured instructions | Missing | Add JSON-LD fixture |
| P1 | Additional WordPress recipe-card family | Missing | Add Tasty Recipes or Mediavine Create representative |
| P1 | Non-serving yield diversity | Partial | Add focused normalization cases |
| P2 | Live-site drift monitoring | Intentionally absent | Optional manual/non-blocking later |

---

# 6. P0 — Preserve Primary Metadata Across Fallback

## Problem

The current endpoint can receive a partially useful primary result such as:

```text
title ✅
description ✅
ingredients ✅
instructions ❌
servings ✅
prep time ✅
cook time ✅
nutrition ✅
image ✅
```

and then use DOM fallback to recover ingredients/instructions.

A fallback must not silently discard unrelated high-confidence primary metadata.

This is a separate concern from DOM nutrition enrichment.

## Required regression

Add a focused endpoint test in:

```text
server/tests/test_recipe_url_import.py
```

No real website fixture is required.

Mock only:

```text
fetch_public_html()
extract_recipe()
```

Use the real:

- primary normalization;
- fallback extraction path;
- final composition logic.

Construct a primary extraction containing:

```text
title = "Fallback Soup"
description = "Primary description"
ingredients = valid
instructions = missing
servings = 4
prep_time_minutes = 10
cook_time_minutes = 30
nutrition = valid
image_url = https://example.com/soup.webp
```

Provide DOM fallback containing:

```text
Fallback Soup
Ingredients
...
Instructions
...
```

## Expected final contract

Fallback may supply the missing core recipe content, but supported primary metadata must remain where there is no conflicting higher-confidence fallback value.

At minimum verify preservation of:

- description;
- servings;
- prep time;
- cook time;
- nutrition;
- image URL.

Do not blindly merge:

- ingredient arrays;
- instruction arrays;
- title values from conflicting sources.

## Precedence rule

Use this conceptual rule:

```text
primary high-confidence metadata
        ↓
preserved

core field that caused fallback
        ↓
fallback becomes authoritative
```

Do not introduce generic recursive model merging.

Implement explicit field semantics.

---

# 7. P0 — Microdata Recipe Coverage

## Goal

Prove that Noomori's primary extractor remains compatible with Recipe Schema expressed as **Microdata**, not only JSON-LD.

## Fixture

Add:

```text
server/fixtures/recipe_url_import_microdata.html
```

Keep it minimal and synthetic.

Example structure:

```html
<article itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Tomato Soup</h1>

  <meta itemprop="prepTime" content="PT10M">
  <meta itemprop="cookTime" content="PT20M">
  <meta itemprop="recipeYield" content="4 servings">

  <ul>
    <li itemprop="recipeIngredient">2 cups tomatoes</li>
    <li itemprop="recipeIngredient">1 cup stock</li>
  </ul>

  <div itemprop="recipeInstructions">
    <p>Simmer the tomatoes.</p>
    <p>Blend until smooth.</p>
  </div>
</article>
```

## Required assertions

Run through:

```text
import_recipe_url()
```

with only `fetch_public_html()` mocked.

Assert:

- exact title;
- expected ingredient count;
- expected instructions;
- servings;
- prep time;
- cook time.

The test should not assert the extractor implementation class or adapter name.

The contract is successful recipe fidelity.

---

# 8. P0 — WP Recipe Maker Representative

## Why

A large number of independent recipe websites use common WordPress recipe-card engines.

Testing every domain independently has low leverage.

A representative **WP Recipe Maker** fixture covers an important structural family.

## Representative source

Prefer one existing public recipe page whose rendered structure clearly represents WP Recipe Maker.

Examples may include sites such as:

```text
RecipeTin Eats
Budget Bytes
Pinch of Yum
Minimalist Baker
```

The selected fixture must represent the plugin structure, not merely the hostname.

## Fixture

Add something like:

```text
server/fixtures/recipe_url_import_wprm.html
```

Use a minimal structurally faithful capture.

Preserve relevant:

- Recipe structured metadata;
- WPRM recipe container;
- ingredient groups if present;
- instruction markup;
- notes;
- serving metadata;
- recipe-card controls that could become noise.

Remove unrelated page content.

## Required assertions

At endpoint level verify:

- title;
- ingredient count;
- instruction count;
- servings when present;
- time metadata when present;
- supported nutrition when present;
- no recipe-card controls leak into ingredients/instructions;
- no duplicate ingredients;
- no duplicate instructions.

Examples of controls that must not leak:

```text
Print
Pin
Save Recipe
Cook Mode
Prevent your screen from going dark
```

Do not introduce WPRM-specific production code unless a generic structural fix is impossible.

---

# 9. P0 — Multiple Recipe Objects and Roundup Pages

## Risk

A page may contain multiple Schema.org `Recipe` objects.

Examples:

```text
main recipe
+
recommended recipe metadata
```

or:

```text
recipe roundup article
├── Recipe A
├── Recipe B
├── Recipe C
└── ItemList
```

The dangerous failure is not always an exception.

It may be:

```text
HTTP 200
+
valid-looking recipe
+
wrong recipe selected
```

## Positive case

Add:

```text
server/fixtures/recipe_url_import_multiple_recipe_primary.html
```

Structure should include:

```text
one clearly primary Recipe
+
one secondary Recipe
```

The expected result must match the primary recipe exactly.

Assert:

- title;
- distinctive first ingredient;
- distinctive instruction.

Do not only assert that some valid recipe was returned.

## Ambiguous case

Add:

```text
server/fixtures/recipe_url_import_multiple_recipe_ambiguous.html
```

Represent:

```text
multiple equivalent Recipe candidates
+
no deterministic primary target
```

Expected behavior:

```text
recipe_not_found
```

unless the current extraction library provides a deterministic and semantically justified primary selection.

Do not add arbitrary:

```text
take first Recipe
```

logic solely to make the test pass.

---

# 10. P1 — Structured `HowToSection` Instructions

## Goal

Cover Recipe JSON-LD whose instructions are grouped structurally.

Example:

```json
{
  "@type": "Recipe",
  "recipeInstructions": [
    {
      "@type": "HowToSection",
      "name": "Make the sauce",
      "itemListElement": [
        {
          "@type": "HowToStep",
          "text": "Heat the oil."
        },
        {
          "@type": "HowToStep",
          "text": "Add the tomatoes."
        }
      ]
    },
    {
      "@type": "HowToSection",
      "name": "Assemble",
      "itemListElement": [
        {
          "@type": "HowToStep",
          "text": "Combine everything."
        }
      ]
    }
  ]
}
```

## Fixture

Add:

```text
server/fixtures/recipe_url_import_howto_sections.html
```

## Contract

If `recipe-scrapers` exposes section structure directly, preserve it where Noomori's model can represent it.

If the library legitimately flattens structured instructions, the test must at minimum ensure:

```text
all real steps preserved
correct order preserved
section labels do not become fake instruction steps
```

Do not invent grouping semantics from text alone.

---

# 11. P1 — Additional Recipe-Card Family

After WP Recipe Maker is covered, add **one**, not several, additional structural family.

Choose based on actual observed value:

```text
Tasty Recipes
or
Mediavine Create
```

Do not add both in the same task unless both expose materially distinct failures.

## Selection rule

Pick the next family when:

- a user reports a failure;
- manual testing finds a structural incompatibility;
- the HTML architecture differs materially from current fixtures.

The same endpoint-level semantic assertions apply.

---

# 12. P1 — Yield Diversity

## Existing behavior

Current tests already cover:

```text
4 servings
1 large loaf
```

This is useful but not enough to protect against common false serving conversions.

## Add focused normalization tests

These should remain unit-level.

Cases:

```text
"4 servings"
→ servings = 4

"1 large loaf"
→ servings = None
→ Yield note preserved

"12 cookies"
→ servings = None

"2 loaves"
→ servings = None

"1 9-inch pie"
→ servings = None

"24 pieces"
→ servings = None
```

Optional characterization cases:

```text
"Serves 4 to 6"
"8-10 servings"
"Makes 6 portions"
```

Do not automatically implement support for these forms unless the product explicitly defines their semantics.

Unknown or ambiguous yield is preferable to incorrect serving metadata.

---

# 13. Cross-Site Test Location

The current:

```text
server/tests/test_recipe_url_import.py
```

has grown to contain:

- normalization;
- DOM fallback;
- transport safety;
- image fetching;
- endpoint orchestration;
- real-site fixtures;
- group enrichment;
- nutrition enrichment.

Future site cases should no longer be added to this file.

Create:

```text
server/tests/test_recipe_url_import_sites.py
```

Move nothing initially unless it is a trivial test-only refactor.

New cross-site compatibility tests go here.

Recommended eventual structure:

```text
server/tests/
├── test_recipe_url_import.py
│   ├── normalization
│   ├── endpoint orchestration
│   ├── primary/fallback composition
│   └── enrichment behavior
│
├── test_recipe_url_import_sites.py
│   ├── Microdata
│   ├── WP Recipe Maker
│   ├── multiple Recipe
│   ├── HowToSection
│   └── future site-family regressions
│
└── existing transport tests
```

A future cleanup may split transport tests separately, but that is not required for this task.

Do not refactor production code just to reorganize test files.

---

# 14. Cross-Site Endpoint Helper

A test-only helper may be introduced inside:

```text
test_recipe_url_import_sites.py
```

Conceptually:

```python
def import_fixture(path: Path, url: str):
    ...
```

It should:

1. read fixture HTML;
2. construct `FetchedRecipePage`;
3. patch only `server.main.fetch_public_html`;
4. call `import_recipe_url`;
5. return the draft.

Do not mock:

- `extract_recipe`;
- `normalize_imported_website_recipe`;
- `extract_recipe_container_text`;
- `parse_recipe_text`;
- group enrichment;
- nutrition enrichment.

The purpose is to test the real pipeline after the network boundary.

---

# 15. Semantic Assertions

Cross-site tests must assert behavior, not snapshots.

Required categories:

## Core

```text
correct title
ingredient structure
instruction structure
```

## Metadata where relevant

```text
servings
prep time
cook time
nutrition
image URL
```

## Negative assertions

Site-specific controls/noise must not leak.

Examples:

```text
Print Recipe
Save Recipe
Cook Mode
Advertisement
Related Recipes
Nutrition Facts heading
Step 1
Langkah 1
```

Do not assert HTML implementation details unless those details are themselves the regression.

---

# 16. Do Not Lock Tests to Extraction Strategy

Cross-site fixtures should not generally assert:

```text
extraction_strategy == "recipe_scrapers"
```

or:

```text
extraction_strategy == "dom_fallback"
```

A future library upgrade may improve a site from fallback to primary extraction while preserving correct output.

That should remain green.

Focused orchestration tests may continue asserting fallback reasons and strategy.

Site tests assert **recipe fidelity**.

---

# 17. Dependency Upgrade Gate

`recipe-scrapers` is an important dependency boundary.

Whenever its version changes:

```text
upgrade dependency
        ↓
run all URL import tests
        ↓
run site corpus
        ↓
inspect semantic changes
```

An upgrade is not accepted simply because imports return success.

Watch for:

- ingredient count changes;
- lost group information;
- instruction duplication;
- changed yield parsing;
- lost nutrition;
- changed images;
- new presentation markers;
- fallback frequency changes.

Noomori's regression corpus defines expected behavior above the dependency.

---

# 18. TDD Rule for New Website Bugs

When a real site fails:

```text
capture minimal fixture
        ↓
reproduce user-visible failure
        ↓
RED
        ↓
classify failure
        ↓
minimal generic fix
        ↓
GREEN
        ↓
run full corpus
```

Classify before fixing:

```text
A. primary extraction
B. normalization
C. fallback selection
D. DOM scope
E. DOM serialization
F. text parser
G. primary/fallback composition
H. product-model limitation
```

Do not immediately introduce:

```python
if hostname == "...":
```

unless the behavior is provably site-specific.

---

# 19. Production-Fix Rules

## Prefer structural fixes

Bad:

```text
if Dapur Umami:
    remove "Langkah 1"
```

Preferred:

```text
remove presentation-only standalone instruction markers
while preserving numbers inside real instruction text
```

Bad:

```text
if Serious Eats:
    create these groups
```

Preferred:

```text
apply DOM grouping only when flattened primary content
matches DOM content exactly and atomically
```

The current group-enrichment implementation already follows this philosophy.

Continue it.

---

# 20. Live Website Testing

Do not add live third-party HTTP calls to required CI.

Required tests remain:

```text
fixture-based
deterministic
offline-compatible
```

Optional future live smoke testing may be useful to detect upstream HTML drift.

If introduced later, it must be:

```text
manual
or
scheduled
non-blocking
```

A third-party outage or anti-bot response must not block a Noomori merge.

---

# 21. Implementation Order

Implement in this order.

## Phase A — Composition correctness

1. Add primary → fallback metadata-preservation regression.
2. If RED, implement minimal explicit composition fix.
3. Run full current import suite.

This is highest priority because it affects the current orchestration architecture.

---

## Phase B — Missing extraction formats

4. Add Microdata fixture.
5. Add WP Recipe Maker fixture.
6. Add multiple-Recipe positive fixture.
7. Add ambiguous roundup fixture.

---

## Phase C — Structured fidelity

8. Add `HowToSection` fixture.
9. Add yield normalization cases.
10. Add one additional recipe-card family only if structurally useful.

---

## Phase D — Test organization

11. Create `test_recipe_url_import_sites.py`.
12. Put all newly added cross-site cases there.
13. Do not perform large-scale movement of existing tests in the same change unless required.

---

# 22. Acceptance Criteria

This specification is complete when:

- all pre-existing Website Import tests remain green;
- no existing Sasa/Dapur/Serious Eats/Simply Recipes coverage is duplicated;
- primary → fallback preserves supported primary metadata;
- Microdata Recipe import is covered through the endpoint;
- one WP Recipe Maker representative is covered;
- a page with multiple Recipe objects has deterministic expected behavior;
- an ambiguous multi-recipe page fails safely instead of returning an arbitrary recipe;
- structured `HowToSection` instructions preserve all real steps and ordering;
- common non-serving yields are not converted into false servings;
- new cross-site tests mock only the fetch boundary;
- no real external network is required;
- no browser automation is introduced;
- no new scraping framework is introduced;
- no domain-specific production branch is added without demonstrated necessity;
- full backend tests remain green.

Minimum final verification:

```text
targeted Website Import tests
        ↓
cross-site corpus
        ↓
bun run test:be
```

---

# 23. Future Corpus Growth Rule

After this specification, do **not** keep adding random websites proactively.

The corpus grows when:

```text
real user failure
or
new structural family
or
dependency regression
or
new product requirement
```

Examples:

```text
new WPRM site with same structure
→ no fixture needed

new site using unseen RDFa Recipe markup
→ useful fixture

new user reports instructions duplicated after recipe-scrapers upgrade
→ add regression

new site requires JavaScript rendering
→ record unsupported limitation;
  do not add browser automation automatically
```

---

# 24. Definition of Done

The Website Import suite should answer:

> If Noomori changes its parser, DOM fallback, enrichment logic, or `recipe-scrapers` dependency, will the tests detect when real recipe fidelity gets worse?

The target is not universal scraping.

The target is a **small, deterministic, structurally diverse regression corpus around Noomori's actual extraction architecture**.