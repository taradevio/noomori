# Noomori — Import from Text Hardening Specification

**Status:** Proposed  
**Scope:** Backend parser + import API + regression coverage  
**Feature:** Import from Text  
**Priority:** Pre-closed-testing hardening  
**Strategy:** Deterministic, conservative, source-faithful  

---

## 1. Summary

Harden Noomori's current deterministic `Import from Text` pipeline against real-world copy/paste formats, especially Google Docs exports that flatten tables, preserve unusual whitespace, and use heading variants not currently recognized by the parser.

This work must improve structural correctness without rewriting the parser, adding an LLM fallback, introducing fuzzy NLP classification, or changing recipe persistence.

The primary objective is:

> Prevent imports that appear successful but silently place source content into the wrong canonical fields.

The highest-risk current failure mode is section bleed: an unrecognized instruction heading can leave the parser inside the Ingredients section, causing numbered instructions to be imported as ingredients.

The second major failure mode is flattened metadata tables, where Google Docs exports consecutive labels followed by consecutive values instead of label/value pairs.

---

## 2. Current Implementation

Relevant code:

```text
server/src/server/modules/recipes/imports/text.py
server/src/server/modules/recipes/service.py
server/src/server/modules/recipes/schemas.py
server/src/server/recipe_url_import.py
server/tests/test_recipe_text_import.py

src/app/recipe/import-text.tsx
src/shared/components/recipe/recipe-text-import.ts
```

Current flow:

```text
Paste recipe text
      ↓
POST /recipes/import/text
      ↓
ImportRecipeTextRequest
      ↓
parse_recipe_text()
      ↓
ImportedRecipeTextDraft
      ↓
toImportedRecipeDraft()
      ↓
RecipeCreateScreen / Import Review
```

`parse_recipe_text()` is also reused by parts of the website-import fallback path. Parser changes therefore require both text-import and website-import regression coverage.

---

## 3. Design Principles

The parser MUST remain:

- deterministic;
- source-faithful;
- conservative;
- predictable;
- recoverable;
- inexpensive;
- testable;
- independent of an LLM.

When uncertain:

```text
preserve source text
> partially structure it
> invent structure
```

The parser MUST NOT:

- invent title, servings, times, quantities, or units;
- silently resolve conflicting metadata;
- merge multiple recipes;
- translate source content;
- sentence-split numbered instructions;
- fabricate scalar values from ranges;
- silently discard meaningful unsupported metadata;
- infer recipe structure using broad fuzzy matching.

---

# 4. Real-World Regression Fixtures

Add permanent fixtures derived from the real Google Docs copy/export layouts used during testing.

```text
server/tests/fixtures/text_import/
├── google-docs-bolognese.txt
├── google-docs-salmon.txt
├── google-docs-garlic-chicken.txt
└── google-docs-carbonara.txt
```

Fixtures must preserve the important exported structure, including:

- flattened table label/value ordering;
- tabs where relevant;
- CRLF-equivalent content after normalization;
- Unicode punctuation;
- heading variants;
- footer/noise content;
- servings and ingredient ranges.

Do not simplify fixtures until they stop representing the problematic source format.

---

## 5. Fixture A — Classic Spaghetti Bolognese

Representative metadata layout:

```text
Recipe Summary
Prep Time
Cook Time
Servings
Difficulty
15 minutes
45 minutes
4-6 servings
Easy / Intermediate
```

Representative sections:

```text
Ingredients
For the Bolognese Sauce
...
For the Pasta & Serving
...

Step-by-Step Instructions
1. Sauté the Aromatics: ...
2. Brown the Meat: ...
...

Chef's Tips for Success
...
```

Required outcome:

```text
title = Classic Spaghetti Bolognese Recipe
prep_time_minutes = 15
cook_time_minutes = 45
servings = null

ingredient_groups = 2
instruction_steps = 7
```

Critical invariants:

- `Step-by-Step Instructions` MUST transition to the Instructions region.
- No instruction step may become an ingredient.
- `For the Bolognese Sauce` and `For the Pasta & Serving` should become ingredient groups when structurally unambiguous.
- `4-6 servings` MUST NOT become 4, 5, or 6.
- `Difficulty: Easy / Intermediate` must not shift metadata table alignment.
- Unsupported meaningful metadata may be preserved in Notes or diagnostics.
- Tips must not become ingredients.

---

## 6. Fixture B — Pan-Seared Salmon

Representative metadata layout:

```text
Prep Time
Cook Time
Total Time
Servings

10 mins
15 mins
25 mins
4
```

Required outcome:

```text
prep_time_minutes = 10
cook_time_minutes = 15
servings = 4
nutrition_per_serving = preserved
instruction_steps = 5
```

The recipe overview description must remain recoverable instead of being silently discarded.

Nutrition parsing must continue to support alternating label/value layouts such as:

```text
Calories
480 kcal
Protein
36 g
...
```

---

## 7. Fixture C — Garlic Butter Herb Chicken Thighs

Representative header:

```text
Garlic Butter Herb Chicken Thighs
Line spacing: 1.25
Recipe Overview
A quick, flavorful, and reliable one-pan dinner...
```

Representative metadata layout:

```text
Prep Time
Cook Time
Total Time
Servings

10 mins
20 mins
30 mins
4
```

Required outcome:

```text
title = Garlic Butter Herb Chicken Thighs
prep_time_minutes = 10
cook_time_minutes = 20
servings = 4
instruction_steps = 7
```

`Line spacing: 1.25` must never become a recipe title or ingredient.

---

## 8. Fixture D — Spaghetti alla Carbonara

Representative metadata:

```text
SERVINGS
4
PREP
10 min
COOK
20 min
TOTAL
30 min
```

Representative ingredient range:

```text
1–2 tsp freshly cracked black pepper, to taste
```

Representative footer:

```text
Italian Recipe • Spaghetti alla Carbonara
```

Required outcome:

```text
servings = 4
prep_time_minutes = 10
cook_time_minutes = 20
instruction_steps = 6
```

Range behavior:

```text
quantity = null
unit = null
name preserves the full original range expression
```

The parser MUST NOT fabricate:

```text
quantity = 1
quantity = 1.5
quantity = 2
```

The trailing document footer must not be added to recipe notes when it is confidently recognized as non-recipe document chrome.

---

# 9. Required Parser Changes

## 9.1 Explicit Parser Regions

Introduce or make explicit a small parser-state model:

```text
HEADER
INGREDIENTS
INSTRUCTIONS
NUTRITION
NOTES
```

The implementation does not need a formal enum if the same invariant is enforced clearly.

Metadata parsing MUST be restricted to the header region.

Bad current behavior:

```text
Instructions
Cook Time: 10 minutes
```

must not mutate canonical `cook_time_minutes`.

Likewise:

```text
Recipe Notes
Servings: 4
```

must remain note content unless explicitly defined otherwise.

---

## 9.2 Expand Exact Instruction Heading Aliases

Extend the exact, conservative instruction-heading aliases to include at minimum:

```text
Steps
Step-by-Step Instructions
Step by Step Instructions
```

Matching remains:

- case-insensitive;
- whole-line only;
- normalized for repeated whitespace and surrounding punctuation;
- non-fuzzy.

Do NOT use substring matching such as:

```python
if "step" in line.lower():
```

because prose may contain the same token.

---

## 9.3 Prevent Section Bleed

Once the parser is in Ingredients, an unrecognized structural boundary must not silently allow an entire numbered instruction block to become ingredients.

Add a narrow structural guard:

```text
inside INGREDIENTS
+
encounter multiple consecutive numbered instruction-like lines
→ structural ambiguity / instruction-boundary candidate
```

Preferred resolution order:

1. exact known heading alias;
2. narrowly tested structural boundary;
3. fail conservatively if ambiguity is strong;
4. never silently import obvious instructions as ingredients.

This guard is a safety net, not a replacement for explicit heading aliases.

---

## 9.4 Google Docs Flattened Metadata Blocks

Support the common table-export shape:

```text
<label 1>
<label 2>
<label 3>
...
<value 1>
<value 2>
<value 3>
...
```

Example:

```text
Prep Time
Cook Time
Total Time
Servings
10 mins
15 mins
25 mins
4
```

Detect only in the `HEADER` region.

### Required algorithm

Conceptually:

```text
collect consecutive metadata-like labels
    ↓
collect the same number of following plausible values
    ↓
pair by source position
    ↓
interpret supported canonical fields
```

Important:

Do not remove unsupported labels before positional pairing.

For:

```text
Prep Time
Cook Time
Servings
Difficulty
15 minutes
45 minutes
4-6 servings
Easy / Intermediate
```

first pair:

```text
Prep Time  → 15 minutes
Cook Time  → 45 minutes
Servings   → 4-6 servings
Difficulty → Easy / Intermediate
```

Then interpret fields.

If `Difficulty` were removed before pairing, later values could shift into the wrong field.

---

## 9.5 Metadata Alias Coverage

Support header labels including:

```text
Prep
Prep Time
Preparation Time

Cook
Cook Time
Cooking Time

Total
Total Time

Additional Time

Serving
Servings

Yield
```

Unknown labels inside a confidently detected metadata block may participate in positional alignment without becoming canonical fields.

---

## 9.6 Servings Range Handling

Canonical Noomori servings is a positive integer.

Ranges must not be collapsed.

Examples:

```text
4-6 servings
4–6 servings
4 to 6 servings
```

Expected:

```text
servings = null
```

Preserve the original value in Notes or parser diagnostics when useful.

Do not produce:

```text
4
5
6
```

---

## 9.7 Ingredient Amount Range Guard

Detect common scalar-ambiguous leading ranges before ordinary quantity parsing.

Examples:

```text
1-2 tbsp oil
1–2 tsp pepper
2 to 3 tablespoons sugar
1 or 2 tbsp oil
```

Expected fallback:

```text
quantity = null
unit = null
name = full original ingredient expression
```

Do not collapse a range into a scalar.

Fraction forms remain valid:

```text
1/2 cup
2/3 tbsp
1 1/2 cups
```

---

## 9.8 Ingredient Group Detection Without Mandatory Colon

Current explicit group detection should be extended beyond headings ending in `:`.

Support conservative subgroup detection for lines such as:

```text
For the Bolognese Sauce
For the Pasta & Serving
```

Candidate group heading requirements should include:

- currently inside Ingredients;
- short non-empty line;
- no leading quantity;
- followed by one or more clearly ingredient-like lines;
- structurally separated from the previous group when possible;
- not an obvious ingredient itself.

Prefer false negatives over inventing groups.

Do not introduce nested groups.

---

## 9.9 Preserve Meaningful Preamble / Overview Text

Meaningful text before Ingredients/Instructions must not disappear silently.

Example:

```text
Pan-Seared Salmon with Lemon Dill Cream Sauce
Recipe Overview
A high-protein, heart-healthy meal...
```

Expected:

```text
title = Pan-Seared Salmon with Lemon Dill Cream Sauce
description includes the overview prose
```

Known structural labels such as:

```text
Recipe Overview
Recipe Summary
```

should not become the recipe title or description by themselves.

Unknown preamble text should be preserved conservatively when it appears meaningful.

---

## 9.10 Preserve Blank-Line Structure Internally

Do not discard all blank lines before structural parsing.

The parser may still normalize excessive whitespace, but it must retain enough information to distinguish:

- paragraph boundaries;
- wrapped instruction lines;
- subsection boundaries;
- trailing supplementary prose.

Recommended internal representation:

```text
LineToken
├── original_index
├── text
├── normalized_text
└── is_blank
```

A literal class is optional; preserving structural information is required.

---

## 9.11 Wrapped Numbered Instructions

Support wrapped physical lines belonging to the same explicitly numbered step.

Example:

```text
1. Bake the chicken until the skin is crisp and
   the internal temperature reaches 165°F.
2. Rest for five minutes.
```

Expected:

```text
Step 1 = one instruction
Step 2 = one instruction
```

Rule:

```text
numbered marker begins step
→ consume continuation lines
→ stop at next numbered marker or structural section boundary
```

Do not sentence-split numbered instructions.

---

## 9.12 Duplicate Metadata

Do not use silent last-write-wins for duplicate canonical metadata.

Rules:

```text
same field + same value
→ deduplicate

same field + conflicting values
→ canonical value becomes ambiguous
→ preserve source/conflict
→ do not silently choose one
```

Example:

```text
Prep Time: 20 min
Prep Time: 45 min
```

Expected:

```text
prep_time_minutes = null
```

or equivalent explicit ambiguous-state handling before DTO finalization.

---

## 9.13 Additional Time and Unsupported Metadata

Meaningful recognized metadata without a canonical persisted field must not be silently discarded.

Example:

```text
Additional Time: 15 mins
```

Preferred:

```text
Notes += "Additional Time: 15 mins"
```

`Total Time` may remain non-persisted when it is purely redundant.

If Total Time conflicts with component values, preserve the conflict rather than rewriting canonical data.

---

## 9.14 Conservative Clipboard Noise Handling

Support only narrow, high-confidence clipboard/editor artifacts.

Example known fixture noise:

```text
Line spacing: 1.25
```

Such text must not become title, ingredient, or instruction content.

Do not build a large generic noise-removal engine.

Unknown text should default to preservation rather than deletion.

---

## 9.15 Footer Handling

Document footer/chrome may appear after recipe notes.

Example:

```text
Italian Recipe • Spaghetti alla Carbonara
```

Only remove footer content when matching a narrow tested rule with high confidence.

If uncertain, preserve it rather than applying fuzzy footer detection.

---

# 10. Multiple Recipe Protection

MVP supports one recipe per paste.

The parser MUST reject multiple strong recipe structures rather than merge them.

Example:

```text
Recipe A
Ingredients
...
Instructions
...

Recipe B
Ingredients
...
Instructions
...
```

Expected API error:

```text
multiple_recipes
```

Do not arbitrarily select Recipe A or Recipe B.

Do not merge their ingredient/instruction lists.

---

# 11. Parser Error Taxonomy

Replace the single generic parser failure path with a small stable error taxonomy.

Recommended codes:

```text
insufficient_structure
multiple_recipes
ambiguous_structure
```

Request validation remains responsible for:

```text
blank input
oversized input
```

Suggested API response shape:

```json
{
  "detail": {
    "code": "multiple_recipes",
    "message": "Paste one recipe at a time."
  }
}
```

Keep the taxonomy intentionally small.

---

# 12. Frontend Error Mapping

`src/app/recipe/import-text.tsx` should map stable parser error codes to useful copy.

Examples:

```text
insufficient_structure
→ We couldn’t identify enough recipe information. Edit the text and try again.

multiple_recipes
→ We found more than one recipe. Paste one recipe at a time.

ambiguous_structure
→ We couldn’t safely separate this recipe. Adjust the pasted text and try again.
```

Raw pasted text must remain in the input after recoverable failure.

Do not clear user input automatically.

---

# 13. Test Structure

Reorganize parser regression coverage by responsibility rather than continuously expanding one flat test file.

Suggested structure:

```text
server/tests/
├── test_recipe_text_import.py
├── test_recipe_text_metadata.py
├── test_recipe_text_ingredients.py
├── test_recipe_text_instructions.py
├── test_recipe_text_documents.py
└── fixtures/
    └── text_import/
        ├── google-docs-bolognese.txt
        ├── google-docs-salmon.txt
        ├── google-docs-garlic-chicken.txt
        └── google-docs-carbonara.txt
```

Splitting files is optional if the project prefers a single test module, but test responsibilities must remain clearly grouped.

---

# 14. Required Unit Tests

## Metadata

Add cases for:

```text
Prep Time: 30 mins
Prep Time\n30 mins

Prep Time
Cook Time
Servings
10 mins
20 mins
4

Prep Time
Cook Time
Servings
Difficulty
15 mins
45 mins
4-6 servings
Easy

SERVINGS\n4
PREP\n10 min
COOK\n20 min

4-6 servings
4–6 servings
4 to 6 servings

duplicate identical metadata
duplicate conflicting metadata
metadata text inside Instructions
metadata text inside Notes
```

---

## Instruction Headings

Add exact alias tests for:

```text
Instructions
Directions
Method
Steps
Step-by-Step Instructions
Step by Step Instructions
Cara Membuat
Langkah-Langkah
```

Negative tests:

```text
Follow package instructions.
Repeat the previous step.
This is a step-by-step process.
```

must not become structural headings.

---

## Ingredients

Add cases for:

```text
1–2 tsp pepper
1-2 tbsp oil
2 to 3 tablespoons sugar
1 or 2 tbsp oil

1/2 cup flour
2/3 tbsp oil
1 1/2 cup flour

For the Sauce
1 tbsp oil
2 cloves garlic

For the Pasta & Serving
1 lb spaghetti
```

---

## Instructions

Add cases for:

```text
wrapped numbered steps
multi-sentence numbered step
semicolon inside step
numbers inside instruction prose
Cook Time text inside instruction prose
Servings text inside instruction prose
repeated numbering
number jumps
```

---

## Clipboard Normalization

Add cases for:

```text
UTF-8 BOM
CRLF
CR
horizontal tabs
vertical tabs
NBSP
Unicode bullets
Unicode en dash
Unicode em dash
excess blank lines
Line spacing: 1.25
punctuation-only separators
```

---

# 15. Golden Fixture Assertions

## Bolognese

At minimum assert:

```text
title correct
prep == 15
cook == 45
servings is null
ingredient group count == 2
instruction count == 7
instruction text does not occur in ingredient names
Step-by-Step Instructions is not an ingredient
Difficulty does not shift metadata pairing
```

## Salmon

```text
prep == 10
cook == 15
servings == 4
nutrition preserved
instruction count == 5
overview prose preserved
```

## Garlic Chicken

```text
prep == 10
cook == 20
servings == 4
instruction count == 7
Line spacing artifact not used as title/content
```

## Carbonara

```text
servings == 4
prep == 10
cook == 20
instruction count == 6
range ingredient does not fabricate scalar quantity
footer does not pollute notes when confidently recognized
```

---

# 16. Parser Invariants

These tests are higher priority than adding support for arbitrary new formatting.

### INV-01 — Metadata locality

Numbers and metadata-looking lines inside Instructions must never mutate canonical header metadata.

### INV-02 — Section integrity

Clearly numbered instruction blocks must never be silently imported as ingredients.

### INV-03 — Source preservation

Meaningful non-empty content should not disappear without either:

- structured mapping;
- explicit supported noise classification;
- diagnostics;
- preserved Notes content.

### INV-04 — No fabricated range scalar

Ranges must never be converted to an invented scalar value.

### INV-05 — No silent conflict resolution

Conflicting duplicate canonical metadata must never use silent last-write-wins.

### INV-06 — Multiple recipes never merge

Two strong recipe structures must never produce one merged recipe draft.

### INV-07 — Explicit numbering is authoritative

Different numbered markers remain different steps even when numbering repeats or skips.

### INV-08 — Website import remains stable

Text-parser hardening must not regress existing website-import fallback fixtures.

---

# 17. API Tests

Add functional coverage for `POST /recipes/import/text`.

Required cases:

```text
401 unauthenticated
422 blank input through request validation
422 oversized input
422 insufficient structure
422 multiple recipes
200 partial recipe
200 complete recipe
```

Verify response schema remains compatible with `ImportedRecipeTextDraft`.

---

# 18. Frontend Functional Tests

Add focused coverage for `src/app/recipe/import-text.tsx`.

Required behavior:

```text
blank text → submit disabled
valid text → request sent
pending → duplicate submission disabled
422 insufficient_structure → correct error
422 multiple_recipes → specific error
network failure → retry message
failure → raw pasted text preserved
success → opens RecipeCreateScreen with adapted draft
missing imported servings → existing form default remains intact
```

Do not make parser correctness depend on frontend tests; frontend tests cover flow and contract only.

---

# 19. Observability

Add structured import telemetry without logging raw recipe text.

Recommended fields:

```text
event=recipe_text_import
input_chars
input_lines
parse_result
failure_code
warning_codes
has_title
ingredient_group_count
ingredient_count
instruction_group_count
instruction_count
has_servings
has_prep_time
has_cook_time
has_nutrition
duration_ms
```

Example success:

```text
parse_result=partial
warning_codes=[ambiguous_servings_range]
```

Example failure:

```text
parse_result=failed
failure_code=multiple_recipes
```

Never log:

- full pasted text;
- ingredient names;
- instruction text;
- notes;
- arbitrary user content.

---

# 20. Implementation Order

Implement in this order to reduce regression risk.

## Phase 1 — Structural correctness

1. Restrict metadata parsing to header region.
2. Add exact instruction heading variants.
3. Add section-bleed safety tests.
4. Add Bolognese fixture and make it pass.

## Phase 2 — Google Docs metadata

5. Add flattened metadata block detection.
6. Preserve unsupported labels during positional pairing.
7. Add servings-range ambiguity handling.
8. Make Salmon and Garlic Chicken fixtures pass.

## Phase 3 — Source preservation

9. Preserve overview/preamble text.
10. Add conservative group detection without mandatory colon.
11. Preserve Additional Time / unsupported meaningful metadata.
12. Handle duplicate metadata conflicts.

## Phase 4 — Instruction and clipboard hardening

13. Preserve blank-line structure internally.
14. Add wrapped instruction continuation.
15. Add range guards for ingredient quantities.
16. Add narrow clipboard noise handling.
17. Make Carbonara fixture pass.

## Phase 5 — Boundary hardening

18. Detect/reject multiple recipes.
19. Add stable parser error taxonomy.
20. Add API functional tests.
21. Add frontend import-flow tests.
22. Run website-import regression suite together with text-import tests.

---

# 21. Non-Goals

Do NOT include in this hardening work:

- LLM fallback;
- NLP title classification;
- semantic ingredient extraction;
- embeddings;
- fuzzy section-heading similarity;
- automatic language detection;
- translation;
- arbitrary OCR cleanup;
- batch import;
- arbitrary document-layout reconstruction;
- new recipe database columns solely for import;
- a generic Google Docs parser.

The goal is to improve robust deterministic parsing for common copy/paste structures, not to understand every possible document.

---

# 22. Acceptance Criteria

This work is complete when all of the following are true:

- Bolognese instructions are never imported as ingredients.
- `Step-by-Step Instructions` is recognized as an instruction section.
- Google Docs labels-first metadata blocks map to the correct fields.
- Unsupported metadata labels cannot shift positional pairing.
- Salmon imports `prep=10`, `cook=15`, `servings=4`.
- Garlic Chicken imports `prep=10`, `cook=20`, `servings=4`.
- Carbonara imports `servings=4`, `prep=10`, `cook=20`.
- `4-6 servings` remains ambiguous rather than becoming a fabricated integer.
- `1–2 tsp` remains source-faithful rather than becoming an invented scalar.
- Metadata inside instructions/notes cannot overwrite header metadata.
- Conflicting duplicate metadata is not silently resolved.
- Wrapped numbered steps remain single logical steps.
- Multiple recipes are rejected rather than merged.
- Raw pasted text is preserved on recoverable frontend failures.
- Existing text parser tests continue to pass.
- Existing website import regression tests continue to pass.
- No raw recipe content is added to production logs.

---

# 23. Definition of Done

Before merging:

```text
bun run test:be
bun run test:functional:be
bun run test:functional:fe
bun run lint
```

Additionally verify manually on a development build:

```text
Google Docs → Select All → Copy
→ Noomori → Import from text → Paste
→ Import Recipe
→ Review generated form
```

Run this manual smoke test for all four real Google Docs fixtures.

The review screen must be checked for:

- title;
- prep/cook time;
- servings;
- ingredient grouping;
- ingredient quantities;
- instruction count/order;
- notes/description;
- nutrition where applicable;
- obvious source leakage or missing content.

