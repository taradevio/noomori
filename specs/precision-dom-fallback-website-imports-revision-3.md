# Precision DOM Fallback for Website Imports — Revision 3

## Summary

Keep the current website-import architecture intact:

```text
safe fetch
  ↓
recipe-scrapers
  ↓
website normalization
  ↓
core recipe complete?
  ├── yes → primary result
  └── no  → precision DOM fallback
```

The current implementation is already working for unsupported/static pages such as the Scottish Goat Meat and Sasa regression cases.

This revision does **not** replace the fallback architecture.

Instead, add two narrowly scoped improvements exposed by the Dapur Umami case:

1. remove presentation-only instruction artifacts such as standalone step numbers;
2. enrich missing nutrition from a validated DOM recipe candidate when exact, high-confidence nutrition labels and units are available.

Core recipe fields must still come from one extraction strategy only. Optional metadata enrichment may fill missing fields conservatively from the same validated recipe container.

## Current Architecture to Preserve

Do not change the existing network acquisition layer.

Preserve:

- safe URL validation;
- DNS/IP SSRF protection;
- redirect limits;
- timeout handling;
- response-size limits;
- content-type validation;
- `recipe-scrapers` as primary extraction;
- `BeautifulSoup` precision DOM fallback;
- exact English/Indonesian recipe-section aliases;
- ambiguity rejection;
- full-page-body rejection;
- deterministic text parsing;
- Import Review before save;
- existing API contracts.

Current flow:

```text
URL
 ↓
existing safe HTML fetch
 ↓
recipe-scrapers
 ↓
normalize_imported_website_recipe()
 ↓
ingredient_count >= 1 AND instruction_count >= 1?
 ├── yes
 │    ↓
 │  primary recipe
 │
 └── no
      ↓
   extract_recipe_container_text()
      ↓
   parse_recipe_text()
      ↓
   ingredient_count >= 1 AND instruction_count >= 1?
      ├── yes → DOM fallback recipe
      └── no  → recipe_not_found
```

## Goals of This Revision

### Goal 1 — Instruction fidelity

Prevent presentation-only step markers from becoming recipe instructions.

Example source structure:

```text
Cara Membuat

1
Rendam soun dalam air panas.

2
Panaskan minyak.

3
Ambil selembar rice paper.
```

Expected canonical instructions:

```text
Rendam soun dalam air panas.
Panaskan minyak.
Ambil selembar rice paper.
```

Not:

```text
1
Rendam soun dalam air panas.
2
Panaskan minyak.
```

### Goal 2 — Nutrition enrichment

Allow exact, deterministic nutrition blocks such as:

```text
Kalori
181.0 Kkal

Protein
3.0 gram

Karbo
25.8 gram

Lemak
7.5 gram

Serat
2.0 gram
```

to populate the existing `nutrition_per_serving` model when the primary recipe otherwise imports correctly.

Do not introduce site-specific Dapur Umami selectors.

## Implementation Changes

### 1. Keep Core Extraction Strategy Isolation

Continue prohibiting field-level merging for core recipe content.

Prohibited:

```text
primary ingredients
+
fallback instructions
```

Prohibited:

```text
fallback ingredients
+
primary instructions
```

Core recipe fields must continue to come from exactly one accepted strategy:

```text
recipe_scrapers
```

or:

```text
dom_fallback
```

This preserves recipe consistency and avoids Frankenstein recipes.

### 2. Allow Conservative Optional Metadata Enrichment

Introduce a narrow exception for optional metadata.

After one core extraction strategy succeeds, Noomori may fill a currently-missing optional field from the same validated recipe DOM candidate when the extraction rule is exact and deterministic.

Initial allowed enrichment:

```text
nutrition_per_serving
```

Rules:

- never overwrite a non-null primary value;
- use only the same validated recipe candidate;
- require exact recognized nutrient labels;
- require a numeric value;
- require a recognized unit;
- reject ambiguous or malformed nutrition values;
- do not infer nutrition from prose;
- do not merge unrelated page content;
- do not use LLM inference.

Conceptually:

```text
accepted primary/core recipe
        ↓
nutrition missing?
   ┌────┴────┐
  no        yes
  │          │
return       ▼
         validated DOM candidate
              ↓
       exact nutrition extraction
              ↓
         valid values?
          ┌───┴───┐
         no      yes
         │         │
      return    fill only
               missing nutrition
```

### 3. Instruction Presentation Cleanup

Add a small deterministic sanitizer for instruction lines.

Ignore standalone ordinal-only lines inside the instruction section.

Examples to discard:

```text
1
2
3
1.
2.
3.
1)
2)
3)
```

Also discard presentation labels that contain only a step marker.

Examples:

```text
Langkah 1
Langkah 2
Langkah 1/5
Step 1
Step 2
Step 1/5
```

Suggested exact pattern family:

```text
^\d+[.)]?$
^(?:langkah|step)\s+\d+(?:\s*(?:/|dari)\s*\d+)?[.)]?$
```

Matching should be:

- case-insensitive;
- whitespace-normalized;
- exact to the whole line.

Do **not** remove numeric text from real instructions.

Keep:

```text
Masak selama 1 jam.
Tambahkan 2 sdm minyak.
Bagi menjadi 3 bagian.
Ulangi langkah 2 bila perlu.
```

The sanitizer should remove only presentation-only lines, not arbitrary strings containing numbers.

### 4. Apply Presentation Cleanup to Both Paths

The same canonical sanitizer should apply before accepted instructions reach the draft regardless of extraction strategy.

Apply to:

```text
recipe-scrapers instructions
```

and:

```text
DOM fallback text-parser instructions
```

This prevents the fix from depending on whether a site happened to succeed through primary extraction or fallback extraction.

Do not add hostname checks.

### 5. Do Not Add Special `img alt` Cleanup

The current DOM serializer does not use image `alt` text as recipe content.

Do not add unnecessary site-specific logic for:

```html
<img alt="Langkah 1">
```

The regression should focus on visible standalone labels/ordinals that can actually enter the text stream.

### 6. Extend Nutrition Aliases

Extend deterministic nutrition parsing with a small Indonesian alias set.

Map:

```text
kalori
energi
→ calories_kcal

protein
→ protein_g

karbo
karbohidrat
→ carbs_g

lemak
→ fat_g

lemak jenuh
→ saturated_fat_g

serat
→ fiber_g

gula
→ sugar_g

natrium
→ sodium_mg

kolesterol
→ cholesterol_mg
```

Keep existing English aliases.

Do not add fuzzy semantic classification.

### 7. Extend Nutrition Unit Aliases

Support exact normalized units needed by Indonesian recipe pages.

Calories:

```text
cal
kcal
kkal
calorie
calories
```

Grams:

```text
g
gr
gram
grams
```

Milligrams:

```text
mg
milligram
milligrams
```

Normalize aliases into existing canonical unit kinds:

```text
cal
g
mg
```

### 8. Recognize Label/Value Nutrition Pairs

Support deterministic nutrition layouts where the label and value are split across separate DOM/text lines.

Example:

```text
Kalori
181.0 Kkal

Protein
3.0 gram
```

Treat the recognized label as pending:

```text
pending = calories_kcal
```

and accept the immediately following valid value:

```text
181.0 Kkal
```

Then clear the pending state.

Rules:

- only consume the next valid nutrition value;
- clear pending state on unrelated structural section changes;
- do not carry pending nutrition across ingredient/instruction boundaries;
- do not infer values from paragraphs.

### 9. Nutrition Block Confidence Gate

Do not treat arbitrary single nutrient-like text as nutrition facts.

For DOM nutrition enrichment, require at least:

```text
2 recognized nutrient label/value pairs
```

inside the same validated recipe candidate.

Example accepted:

```text
Kalori 181 Kkal
Protein 3 gram
```

Example rejected:

```text
Tinggi protein dan serat.
```

Example rejected:

```text
Protein
```

Example rejected:

```text
Kalori sekitar 200-an.
```

### 10. Per-Serving Semantics

The API model remains:

```text
nutrition_per_serving
```

Do not blindly assume every detected nutrition block is per serving.

Populate `nutrition_per_serving` only when at least one of the following is true:

- the page explicitly labels the nutrition as per serving/per portion/per porsi;
- the existing primary extractor already defines the nutrition semantics as per serving;
- a deterministic page-level recipe metadata field explicitly ties the nutrition block to one serving.

If the DOM block exposes nutrient values but per-serving semantics cannot be established confidently:

```text
do not populate nutrition_per_serving
```

and keep the recipe import otherwise successful.

Do not silently convert total-recipe nutrition into per-serving values.

### 11. Nutrition Enrichment Ordering

After accepted core recipe extraction:

```text
core_draft = primary or fallback
```

run optional enrichment only when:

```text
core_draft.nutrition_per_serving is None
```

Do not reparse or replace existing valid primary nutrition.

Conceptually:

```python
if draft.nutrition_per_serving is None:
    enriched = extract_dom_nutrition(candidate)
    if enriched_is_confident:
        draft = draft.model_copy(
            update={"nutrition_per_serving": enriched}
        )
```

Keep the enrichment function independent of client/API types where practical.

### 12. Logging

Keep current extraction telemetry.

Continue logging:

```text
extraction_strategy
fallback_reason
ingredient_count
instruction_count
```

Add coarse optional enrichment telemetry:

```text
nutrition_enrichment=none
nutrition_enrichment=dom
nutrition_field_count=<n>
```

Optional diagnostic reason:

```text
nutrition_reason=already_present
nutrition_reason=not_found
nutrition_reason=ambiguous_semantics
nutrition_reason=dom_success
```

Do not log raw nutrition blocks or raw HTML.

## Regression Test Plan

### Regression Fixture 1 — Scottish Goat Meat

Preserve existing fixture and behavior.

Coverage:

```text
unlisted domain
English headings
flat ingredients
flat instructions
noise exclusion
```

### Regression Fixture 2 — Sasa

Preserve existing fixture and behavior.

Coverage:

```text
Indonesian headings
ingredient groups
instruction groups
surrounding noise
localized aliases
```

### Regression Fixture 3 — Dapur Umami

Add a minimized static fixture representing the relevant structure of:

```text
https://www.dapurumami.com/resep/spring-roll-sayur-ala-saori
```

Do not depend on live HTTP.

Fixture should include:

```text
recipe title
servings metadata
duration metadata
nutrition block
ingredient section
ingredient groups
instruction section
standalone step numbers
actual instruction text
unrelated surrounding content
```

Representative structure:

```text
Spring Roll Sayur ala SAORI

6 Porsi
40 Menit

Kalori
181.0 Kkal

Protein
3.0 gram

Karbo
25.8 gram

Lemak
7.5 gram

Serat
2.0 gram

Bahan - bahan

Bahan Utama
- ingredient
- ingredient

Bahan Isi
- ingredient
- ingredient

Cara Membuat

1
Rendam soun dalam air panas.

2
Panaskan minyak.

3
Ambil selembar rice paper.

4
Isi dan gulung.

5
Goreng hingga matang.
```

Expected behavior:

```text
title ✅
servings ✅ where deterministic metadata supports it
duration ✅ where existing parser supports it
ingredients ✅
ingredient groups ✅
instructions exactly 5 ✅
standalone step-number instructions = 0 ✅
nutrition extracted only if per-serving semantics are confidently established ✅
```

### Instruction Sanitizer Tests

Verify removal of:

```text
1
2.
3)
Langkah 1
langkah 2
LANGKAH 3
Langkah 1/5
Step 1
Step 2/5
```

Verify preservation of:

```text
Masak selama 1 jam.
Tambahkan 2 sdm minyak.
Bagi menjadi 3 bagian.
Ulangi langkah 2 bila perlu.
```

Verify the sanitizer applies consistently to:

- primary `recipe-scrapers` instructions;
- fallback/parser instructions.

### Nutrition Alias Tests

Verify:

```text
Kalori 181 Kkal
→ calories_kcal = 181
```

```text
Protein 3 gram
→ protein_g = 3
```

```text
Karbo 25.8 gram
→ carbs_g = 25.8
```

```text
Lemak 7.5 gram
→ fat_g = 7.5
```

```text
Serat 2 gram
→ fiber_g = 2
```

Also verify English nutrition behavior remains unchanged.

### Nutrition Split-Line Tests

Verify:

```text
Kalori
181 Kkal
Protein
3 gram
```

is parsed deterministically.

Verify pending labels do not leak across:

```text
Ingredients
Instructions
Notes
```

section changes.

### Nutrition Confidence Tests

Verify DOM enrichment rejects:

```text
Protein
```

alone.

Reject:

```text
Tinggi protein.
```

Reject:

```text
Kalori sekitar 200.
```

Accept only a block with at least two recognized valid nutrient pairs.

### Nutrition Precedence Tests

Verify:

```text
primary nutrition present
→ DOM enrichment does not overwrite it
```

Verify:

```text
primary nutrition missing
+
confident DOM nutrition
→ fill missing nutrition
```

Verify:

```text
primary nutrition missing
+
ambiguous serving semantics
→ keep nutrition null
```

### Core Isolation Tests

Preserve the existing invariant:

```text
primary ingredients + fallback instructions
→ prohibited
```

and:

```text
fallback ingredients + primary instructions
→ prohibited
```

Optional nutrition enrichment must not weaken core extraction isolation.

### Full Regression

Run:

- website-import tests;
- recipe-text-import tests;
- full server test suite.

Do not fix unrelated baseline failures.

## Assumptions

- The current DOM fallback architecture remains the correct base.
- Precision remains more important than maximizing import success.
- Core recipe fields come from one accepted extraction strategy.
- Optional DOM enrichment may only fill missing deterministic metadata.
- Static public HTML remains the only supported website source.
- No JavaScript rendering is added.
- No LLM extraction is added.
- No site-specific Dapur Umami adapter is added.
- No Scrapy or Playwright dependency is added.

## Out of Scope

This revision does not add:

- site-specific selectors for Dapur Umami;
- browser rendering;
- authenticated scraping;
- anti-bot bypass;
- LLM extraction;
- whole-page scraping;
- recipe-field blending between unrelated strategies;
- serving-size calculations from total nutrition;
- automatic nutrition derivation;
- frontend/API contract changes;
- database/schema changes.

## Acceptance Criteria

This revision is complete when:

1. Existing Scottish Goat Meat and Sasa regression tests still pass.
2. The Dapur Umami-style fixture imports with the correct core recipe.
3. Presentation-only standalone step numbers do not appear as instructions.
4. Exactly the actual cooking instructions remain.
5. Existing primary instructions also receive the same presentation cleanup.
6. Indonesian nutrition aliases and `kkal` are recognized deterministically.
7. Missing nutrition may be enriched from the same validated DOM candidate.
8. Existing valid primary nutrition is never overwritten.
9. Nutrition is populated only when per-serving semantics are sufficiently clear.
10. Core ingredients/instructions are still never merged across extraction strategies.
11. No hostname-specific logic is introduced.
12. Existing fetch/security behavior and API contracts remain unchanged.
