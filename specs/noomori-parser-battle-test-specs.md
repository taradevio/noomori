# Parser Battle-Test Specification

## Summary

Build a deterministic parser battle-test system for Noomori before making further parser changes.

The goal is not to increase the number of supported hostnames. The goal is to make every parser improvement reproducible, structurally generic, measurable, regression-safe, precision-first, and independent from live-site availability.

Current architecture stays unchanged:

```text
HTML fetch
→ recipe-scrapers
→ normalize
→ complete core?
   ├─ yes → optional DOM group/nutrition enrichment
   └─ no  → bounded DOM extraction → deterministic text parser fallback
```

This specification adds a corpus and evaluation harness around that architecture.

## 1. Goals

The battle-test system must answer:

```text
Did this change fix the intended structural failure?
Did it improve a structural class rather than one hostname?
Did it regress any existing case?
Did it increase false positives?
Did optional metadata improve without corrupting core recipe data?
```

Primary quality goals:

```text
1. Correct core recipe extraction.
2. No invented or incorrectly mapped fields.
3. Stable behavior under harmless markup variation.
4. Graceful failure on ambiguous pages.
5. Repeatable regression coverage for real-world failures.
```

Prefer:

```text
missing optional field
```

over:

```text
wrong field with high confidence
```

Precision remains more important than recall.

## 2. Scope

### In scope

Battle-test:

- title;
- ingredient content, quantities, units, and groups;
- instruction content and groups;
- servings;
- prep, cook, total, and additional/passive time;
- explicit Notes;
- nutrition-per-serving;
- image URL presence;
- parser fallback behavior;
- structured-primary versus DOM-enrichment interaction;
- parser ambiguity handling;
- `recipe-scrapers` dependency regressions.

### Out of scope

Do not add as part of this work:

- fetch transport changes;
- curl-cffi changes;
- browser automation;
- proxy rotation;
- hostname-specific parser branches;
- AI/LLM extraction;
- fuzzy semantic classification;
- database changes;
- frontend changes;
- rate limiting;
- caching;
- production metrics infrastructure.

## 3. Current Baseline

The existing HTML regression corpus already covers representative cases for:

```text
generic Recipe JSON-LD
generic DOM fallback
Microdata
Cookpad-style ingredient labels
Dapur Umami-style layout
Sasa-style Indonesian layout
Serious Eats-style grouping
Simply Recipes-style instruction grouping
WPRM-style recipe cards
```

These become the seed corpus.

Do not recreate existing cases merely to increase fixture count.

The first milestone is:

```text
20–30 deterministic structural fixtures
```

not:

```text
20–30 hostnames
```

A new fixture must cover a distinct structural risk or a real regression.

## 4. Corpus Organization

Create one canonical website parser corpus.

Suggested structure:

```text
server/tests/fixtures/website_import/
├── manifest.json
├── jsonld-basic.html
├── microdata-basic.html
├── cookpad-inline-group-label.html
├── nested-notes.html
├── wrapped-instructions.html
├── grouped-instructions.html
├── ambiguous-two-recipes.html
├── roundup-page.html
├── missing-instructions.html
├── nutrition-per-serving.html
└── ...
```

Existing fixtures may remain in their current locations initially. Avoid unnecessary file churn.

## 5. Fixture Admission Rule

Add a fixture only when it represents at least one of:

- newly observed parser bug;
- new Schema.org structure;
- new recipe-card structure;
- new DOM nesting pattern;
- new grouping pattern;
- new ambiguity pattern;
- new noise pattern;
- dependency upgrade regression;
- new primary/fallback interaction.

Bad:

```text
add Site A
add Site B
add Site C
```

Preferred:

```text
add nested instruction heading
add label-only ingredient row
add duplicated recipe section
add multi-Recipe ambiguity
```

## 6. Test Tiers

### Tier A — Golden Structural Corpus

Tier A is blocking CI.

Representative cases:

#### Structured-primary

```text
JSON-LD simple Recipe
JSON-LD @graph Recipe
Microdata Recipe
HowToSection instructions
native ingredient groups
native instruction groups
structured nutrition + servingSize
structured nutrition + serving-count yield
partial primary extraction
multiple Recipe objects
```

#### DOM fallback/enrichment

```text
h2 Ingredients / Instructions
standalone bold section labels
nested wrappers
initial untitled ingredient group
colon-ended ingredient label row
nested instruction labels
multi-paragraph instruction item
nested Notes
passive/additional time
page chrome and advertisements
```

#### Negative

```text
two complete recipes on one page
recipe roundup
duplicate ingredient sections
duplicate instruction sections
article prose containing "ingredients"
missing instructions
missing ingredients
ambiguous structural root
unrelated nutrition block
publisher description/story without explicit Notes
```

Negative cases must deterministically reject or omit unsafe optional fields.

### Tier B — Metamorphic Tests

Tier B applies harmless markup transformations to known-good fixtures. The semantic output must stay the same.

Required mutations:

```text
LF ↔ CRLF
regular spaces ↔ repeated spaces
regular spaces ↔ NBSP
heading with/without trailing colon
extra div/span/section wrappers
irrelevant class-name changes
additional nav/footer/sidebar noise
advertisement insertion
newsletter insertion
related-recipe insertion
nested paragraph wrappers
multi-paragraph instruction body
figure/figcaption inside instruction step
```

Required invariants:

```text
Adding unrelated page noise must not change core output.
Adding wrapper elements must not change core output.
Whitespace-only changes must not change parsed values.
Changing irrelevant CSS classes must not change parsed values.
Removing Notes must affect Notes only.
Adding publisher description must not populate Notes.
Adding unrelated nutrition text must not affect ingredients/instructions.
```

Do not add property-based testing tooling yet. Small deterministic mutation helpers are enough.

### Tier C — Live Characterization

Tier C is non-blocking and manual or separately invoked.

Start with the URLs already used for curl-cffi transport characterization.

Expand gradually toward:

```text
50+ live recipe URLs
10+ distinct hostnames
```

Workflow:

```text
live URL
→ fetch
→ run parser
→ inspect semantic output
→ classify failure
→ reduce to minimal structural fixture
→ add Tier A regression
→ implement generic fix
```

Live-site failures must not make normal CI fail.

## 7. Expected Result Manifest

Add a manifest with semantic expectations.

Example:

```json
{
  "id": "ingredient_inline_group_label",
  "fixture": "cookpad-inline-group-label.html",
  "expected_status": "success",
  "expected": {
    "title": "Weeknight Noodles",
    "ingredient_groups": [
      {"title": null, "count": 2},
      {"title": "Spice Mix", "count": 2}
    ],
    "instruction_group_count": 1,
    "instruction_count": 2,
    "servings": null,
    "notes": null
  }
}
```

Do not encode private helper names, BeautifulSoup paths, or implementation details unless the case explicitly tests that boundary.

## 8. Assertion Strategy

Do not use giant blind snapshots for every fixture.

Core fields are strict:

```text
title
ingredients
ingredient grouping
instructions
instruction grouping
```

Optional fields must explicitly declare one of:

```text
exact value
must be null
must exist
don't care
```

Failure output should be field-level, for example:

```text
ingredients[2].name:
expected "garlic"
actual   "garlic Notes"

instruction_count:
expected 5
actual   4
```

## 9. Core Exactness Rules

A core-exact pass requires:

```text
correct title when present;
same ingredient count;
same ingredient order;
same ingredient-group boundaries;
same ingredient names after normal canonical normalization;
same parsed quantities where confidently parseable;
same parsed units where confidently parseable;
same instruction count;
same instruction order;
same instruction-group boundaries.
```

Fail when content is:

```text
dropped;
duplicated;
moved to the wrong group;
merged incorrectly;
split incorrectly;
invented.
```

HTTP 200 alone is not parser success.

## 10. Optional Metadata Quality

Evaluate metadata only when the source contains a trustworthy value.

Track:

```text
servings
prep time
cook time
total time
additional time
Notes
nutrition-per-serving
image URL
```

Expected categories:

```text
correct
missing
wrong
not_applicable
```

A wrong optional value is a stronger regression than a missing optional value.

## 11. Parser Characterization Report

Add a small non-production characterization command or test helper that emits:

```text
case
status
core_exact
title
ingredients
instructions
grouping
servings
times
notes
nutrition
image
warnings
```

Example:

```text
Parser characterization

Cases                     24
Successful parses         21
Expected rejections        3

Core exact
title                    21/21
ingredients              20/21
instructions             19/21
grouping                 18/20 applicable

Optional metadata
servings                 15/17 applicable
times                    13/15 applicable
notes                      5/6 applicable
nutrition                  8/10 applicable

Incorrect optional fields
notes                      0
nutrition                  0
```

Do not collapse quality into one synthetic score.

## 12. Failure Classification

Every discovered failure must receive a structural category first.

Suggested categories:

```text
primary_extraction_missing
primary_extraction_wrong
ingredient_quantity
ingredient_unit
ingredient_grouping
instruction_grouping
instruction_boundary
notes_boundary
nutrition_confidence
servings_metadata
time_metadata
dom_candidate_selection
page_noise
multiple_recipe_ambiguity
primary_fallback_composition
dependency_regression
```

Do not use hostname names as root classifications.

## 13. Change Gate

Every parser fix must follow:

```text
1. Discover a failing real or synthetic case.
2. Identify the structural root cause.
3. Minimize it into a deterministic fixture.
4. Add a failing Tier A regression.
5. Implement the smallest generic fix.
6. Run the full golden corpus.
7. Run relevant metamorphic mutations.
8. Compare characterization before/after.
9. Verify no new false positives or wrong optional fields.
```

Do not merge a fix that only proves:

```text
the original website now works
```

without a structural regression test.

## 14. Generic-Fix Rule

Parser code must remain hostname-agnostic.

Do not add:

```python
if hostname == "example.com":
    ...
```

Do not add site-specific selectors unless separately approved.

Preferred:

```text
Recognize a structurally verified colon-ended label-only list item.
```

Not:

```text
Recognize Cookpad's "Bumbu Bubuk:".
```

Preferred:

```text
Traverse Notes across nested wrappers until same/higher-level heading.
```

Not:

```text
Use one publisher-specific Notes selector.
```

## 15. Fail-Closed Behavior

Preserve conservative behavior.

When structure is ambiguous:

```text
reject or omit
```

rather than guess.

Examples:

```text
multiple valid recipe roots
→ reject

two complete recipe structures
→ reject

ambiguous nutrition basis
→ nutrition null

publisher story without explicit Notes heading
→ Notes null

uncertain quantity range
→ preserve ingredient text rather than invent scalar quantity
```

Battle tests must protect these negative behaviors.

## 16. recipe-scrapers Dependency Gate

Treat `recipe-scrapers` upgrades as parser changes.

Required flow:

```text
update recipe-scrapers
→ run full golden corpus
→ run parser characterization
→ inspect semantic diff
→ merge only explained changes
```

Do not auto-merge dependency bumps without the parser corpus passing.

If an optional getter starts failing and Noomori silently degrades to `None`, the corpus must expose the missing field.

## 17. Hidden Degradation Detection

Production may intentionally swallow optional extractor/enrichment failures.

Battle tests must still detect them.

For test/characterization purposes, expose enough diagnostic state to distinguish:

```text
not_applicable
not_found
rejected_by_confidence_rule
unexpected_error
applied
```

At minimum cover:

```text
group enrichment
nutrition enrichment
primary extraction
DOM fallback
```

This diagnostic state does not need to enter the public API.

## 18. Battle-Test Seed Set

Build the first 20–30 fixture corpus around these classes.

### P0

```text
existing JSON-LD fixture
existing Microdata fixture
existing WPRM fixture
existing Cookpad label fixture
existing Dapur Umami fixture
existing Sasa fixture
existing Serious Eats fixture
existing Simply Recipes fixture
generic DOM fallback
nested Notes
publisher description without Notes
structured nutrition without servingSize + serving-count yield
ambiguous nutrition without per-serving basis
partial primary + fallback composition
multiple Recipe entities
two visible recipe cards
missing instruction section
duplicated instruction section
```

### P1

```text
JSON-LD @graph
HowToSection instructions
nested instruction wrapper
multi-paragraph instruction item
figure inside instruction item
uncolonized ingredient subgroup
multiple ingredient lists
inline passive time
serving yield in Indonesian
non-serving yield
recipe article with heavy page noise
```

Do not add more until characterization finds new structural failures.

## 19. Live Battle-Test Procedure

For each live URL:

```text
1. Fetch HTML using the current primary transport.
2. Run the full website import pipeline.
3. Compare output against the visible recipe.
4. Record field-level result.
5. Do not patch immediately.
6. Classify the structural failure.
7. Check whether an existing fixture represents it.
8. If not, create one minimized fixture.
9. Add regression before changing parser code.
```

A URL that cannot be fetched is excluded from parser-quality scoring.

## 20. Acceptance Criteria

### Corpus

- At least 20 deterministic structural fixtures.
- Existing fixtures are represented.
- At least 5 negative/ambiguity cases.
- Fixtures are categorized by structural risk, not hostname.

### Harness

- One corpus runner executes all cases.
- Failures report field-level semantic differences.
- Live-site tests are non-blocking.
- Metamorphic tests cover at least whitespace, wrapper, and page-noise invariance.

### Quality

- All existing golden cases pass.
- No false-positive regression.
- No wrong Notes or nutrition mapping.
- Core exactness does not regress when optional metadata improves.

### Process

- Every future parser fix requires a failing regression fixture first.
- Hostname-specific branches are prohibited unless explicitly approved.
- `recipe-scrapers` upgrades require full corpus validation.

## 21. Initial Implementation Order

Implement only in this order:

```text
1. Freeze current parser behavior as baseline.
2. Create the corpus manifest.
3. Register current website fixtures in the corpus.
4. Add reusable semantic assertion helpers.
5. Add 5–10 missing high-risk structural fixtures.
6. Add a parser characterization report.
7. Add deterministic metamorphic mutations.
8. Run the existing fetchable live URL set.
9. Convert discovered failures into minimized fixtures.
10. Only then change parser implementation.
```

Do not modify parser logic during steps 1–7 unless needed for harness observability.

## 22. Definition of Improvement

A parser change is an improvement only when all are true:

```text
the target failing structural fixture now passes;
all existing golden fixtures still pass;
relevant metamorphic variants still pass;
no new incorrect optional fields appear;
no new ambiguity case becomes a false positive;
the fix is generic rather than hostname-specific.
```

Increasing the number of successful imports without preserving semantic correctness is not an improvement.

## 23. Stopping Point

Once the first corpus is established, stop expanding infrastructure.

Do not add:

```text
fuzzing platform
distributed test service
LLM judge
external crawler fleet
snapshot service
browser farm
```

until the deterministic corpus proves a need.

For Noomori MVP, the hardening loop is:

```text
real failure
→ structural fixture
→ generic fix
→ full corpus regression check
```

That loop is the parser hardening system.
