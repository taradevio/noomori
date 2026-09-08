# Noomori — Import from Text Hardening Specification

**Status:** Proposed  
**Scope:** Backend parser + import API + recipe serving semantics + frontend scaling + regression coverage  
**Feature:** Import from Text  
**Priority:** Pre-closed-testing hardening  
**Strategy:** Deterministic, conservative, source-faithful  

---

## 1. Summary

Harden Noomori's current deterministic `Import from Text` pipeline against real-world copy/paste formats, especially Google Docs exports that flatten tables, preserve unusual whitespace, and use heading variants not currently recognized by the parser.

This work must improve structural correctness without rewriting the parser, adding an LLM fallback, or introducing fuzzy NLP classification. A small serving-nullability persistence correction is required because the current import fallback can fabricate a base serving count and then scale ingredient quantities from that fabricated baseline.

The primary objective is:

> Prevent imports that appear successful but silently place source content into the wrong canonical fields.

The highest-risk current failure mode is section bleed: an unrecognized instruction heading can leave the parser inside the Ingredients section, causing numbered instructions to be imported as ingredients.

The second major failure mode is flattened metadata tables, where Google Docs exports consecutive labels followed by consecutive values instead of label/value pairs.

The third major failure mode is serving-baseline corruption: the import DTO allows `servings = null`, but the current client adapter replaces it with the blank draft default `1`. The recipe form then treats that `1` as a real baseline and proportionally mutates ingredient amounts when the user changes servings.

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
src/shared/types.ts
src/shared/components/recipe/recipe-text-import.ts
src/shared/components/recipe/recipe-draft.ts
src/shared/components/recipe/recipe-form.tsx
src/shared/components/recipe/recipe-calculations.ts
src/shared/components/recipe/recipe-payload.ts
src/shared/components/recipe/recipe-card.tsx
src/shared/components/recipe/recipe-detail-view.tsx

supabase/migrations/20260830074714_authorization_baseline.sql
specs/Noomori Recipe Database Specification.md
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

### Current serving behavior that must be corrected

Current backend import DTO behavior is already capable of representing unknown servings:

```text
ImportedRecipeTextDraft.servings: int | null
```

However, the client adapter currently performs the equivalent of:

```ts
servings: imported.servings ?? 1
```

The blank draft also starts at:

```ts
servings: 1
```

The form's current `setServings()` behavior treats the current value as the base for every numeric ingredient and immediately rescales amounts:

```text
new amount = original amount × next servings / base servings
```

The detail view similarly forces:

```ts
baseServings = Math.max(1, recipe.servings)
```

This means an imported recipe with missing or ambiguous servings can become:

```text
source servings = unknown or 4–6
        ↓
client fallback = 1
        ↓
user changes displayed/base servings to 4
        ↓
ingredients scale ×4
```

That behavior is incorrect. `null` means **unknown**, not `1`.

The repository also contains a domain-spec mismatch that this work must resolve: the recipe database specification says `NULL → Not set` and “Missing servings MUST NOT automatically become 1,” while the current migration and API require a non-null positive integer. The implementation must align with the nullable domain semantics.

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
- treat unknown servings as an implicit base of `1`;
- scale ingredients until an exact base serving count is known;
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

## 9.6 Servings Semantics and Scaling Safety

Canonical Noomori servings must distinguish an exact positive integer from an unknown value.

Required domain model:

```text
servings = positive integer
→ exact base serving count is known
→ ingredient scaling is allowed

servings = null
→ exact base serving count is unknown / not set
→ ingredient scaling is not allowed yet
```

### Current bug

The current parser metadata implementation uses a prefix match for servings. Therefore a source such as:

```text
Servings: 4-6
```

can be interpreted as:

```text
servings = 4
```

because the leading `4` satisfies the positive-integer prefix. This is silent semantic corruption and MUST be fixed before flattened metadata support is added.

Ranges and non-exact values must not be collapsed.

Examples:

```text
4-6 servings
4–6 servings
4 to 6 servings
about 4 servings
serves a crowd
```

Expected canonical result:

```text
servings = null
```

The original meaningful source value must be preserved in Notes or parser diagnostics. For MVP, a new persisted `servings_text` column is NOT required.

Do not produce:

```text
4
5
6
```

### Persistence correction

The persisted recipe model must allow unknown servings instead of fabricating `1`.

Update the database/API contract to:

```text
recipes.servings: integer | null
CreateRecipe.servings: int | None
Recipe response servings: number | null
```

Database migration requirements:

```sql
alter table public.recipes
  alter column servings drop not null;

alter table public.recipes
  alter column servings drop default;
```

Retain or add a positivity constraint that permits null:

```sql
check (servings is null or servings > 0)
```

Do not rewrite existing legitimate positive serving values.

Update `specs/Noomori Recipe Database Specification.md` so its executable schema and prose agree on nullable servings.

### Client draft semantics

Change the draft-level contract to support:

```ts
servings: number | null
```

For text/website imports:

```ts
servings: imported.servings
```

MUST replace the current fallback:

```ts
servings: imported.servings ?? blank.servings
```

The manual blank-create default may remain `1` in this hardening work if that is the intended product default. It MUST NOT be reused as an import fallback.

### Establishing a baseline is not scaling

If an imported or persisted draft has unknown servings:

```text
servings = null
ingredients = source quantities
```

and the user sets:

```text
servings = 4
```

this action means:

> Establish that the current ingredient quantities correspond to a base of 4 servings.

Required result:

```text
servings: null → 4
ingredient amounts: unchanged
```

Only a subsequent exact-to-exact change may scale:

```text
4 → 8
scale factor = 8 / 4
ingredients = source/base amounts × 2
```

### Recipe form implementation

Preserve the current stable-snapshot strategy in `recipe-form.tsx`; it correctly avoids cumulative rounding drift. Extend it with nullable-baseline behavior.

Required `setServings()` semantics:

```text
current servings = null
next servings = positive integer
→ establish new snapshots using the CURRENT ingredient amounts
→ snapshot.baseServings = next servings
→ set servings = next servings
→ DO NOT modify any ingredient amount

current servings = positive integer
next servings = positive integer
→ use existing stable snapshots
→ scale from snapshot.baseAmount / snapshot.baseServings
```

When an ingredient amount is edited while `draft.servings == null`, do not create a numeric scaling snapshot with a fabricated base serving count. The snapshot may be created once an exact baseline is established.

If the UI supports clearing servings back to `null`, clearing must:

```text
leave current ingredient amounts unchanged
clear serving-based amount snapshots
disable serving scaling
```

### Recipe detail behavior

Current detail rendering must stop coercing null through `Math.max(1, ...)`.

When `recipe.servings == null`:

- show `Base servings not set` or omit the base-servings metadata;
- hide or disable the serving +/- scaler;
- do not change ingredient quantities;
- keep unit conversion available.

Unit conversion and serving scaling should be decoupled. A neutral scale factor of `1` may be used internally for measurement conversion, but it MUST NOT be presented or persisted as “1 serving.”

When `recipe.servings` is a positive integer, existing display-only scaling behavior remains unchanged.

### Recipe card behavior

`RecipeCardModel.servings` must become nullable. If null, the card must omit the servings label rather than rendering `null servings`, `0 servings`, or `1 serving`.

### Serving invariants

```text
unknown → exact
= establish baseline, no ingredient mutation

exact → exact
= scale from stable baseline

unknown → unknown
= no scaling

unknown servings
≠ 1 serving
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
missing imported servings → draft servings remains null
ambiguous imported servings → draft servings remains null and source value is preserved
null → 4 servings → ingredient amounts unchanged
4 → 8 servings → numeric ingredient amounts scale ×2
unknown servings → detail serving scaler unavailable
unknown servings → unit conversion still works
recipe card with null servings → no fabricated servings label
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
has_exact_servings
has_ambiguous_servings
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
7. Add servings-range ambiguity handling and prevent integer-prefix collapse.
8. Make Salmon and Garlic Chicken fixtures pass.

## Phase 2B — Serving baseline correctness

9. Make persisted/API servings nullable and align the database specification.
10. Change imported draft mapping so null never falls back to `1`.
11. Extend `RecipeDraft`, payload/response types, card, and detail handling for nullable servings.
12. Make `null → exact` establish a baseline without scaling ingredients.
13. Preserve the existing stable-snapshot scaling behavior for `exact → exact`.
14. Add serving-scaling frontend regression tests.

## Phase 3 — Source preservation

15. Preserve overview/preamble text.
16. Add conservative group detection without mandatory colon.
17. Preserve Additional Time / unsupported meaningful metadata.
18. Handle duplicate metadata conflicts.

## Phase 4 — Instruction and clipboard hardening

19. Preserve blank-line structure internally.
20. Add wrapped instruction continuation.
21. Add range guards for ingredient quantities.
22. Add narrow clipboard noise handling.
23. Make Carbonara fixture pass.

## Phase 5 — Boundary hardening

24. Detect/reject multiple recipes.
25. Add stable parser error taxonomy.
26. Add API functional tests.
27. Add frontend import-flow tests.
28. Run website-import regression suite together with text-import tests.

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
- persisted free-form serving/yield text in this hardening pass;
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
- Direct `Servings: 4-6` cannot silently parse as `4`.
- Missing/ambiguous imported servings remain `null`; they never fall back to `1`.
- Persisted/API servings supports `null` as “not set.”
- Setting `null → 4` establishes the base and does not mutate ingredient amounts.
- Changing `4 → 8` scales numeric ingredient amounts from the stable 4-serving baseline.
- Recipe detail does not expose serving scaling when the base serving count is unknown.
- Recipe cards do not fabricate a servings label for null servings.
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

Additionally verify the serving baseline flow manually:

```text
Import recipe with missing or 4–6 servings
→ review form shows no exact base
→ set base to 4
→ ingredient amounts do not change
→ save
→ detail shows base 4
→ increase displayed servings to 8
→ numeric ingredient amounts display at ×2
```

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

