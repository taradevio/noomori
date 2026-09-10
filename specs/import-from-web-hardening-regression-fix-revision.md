# Import-from-Web Hardening — Regression Fix Revision

## Summary

Revise the current import-from-web hardening implementation around three observed regressions:

1. explicit recipe Notes are still missed on some sites because the DOM Notes extractor is too dependent on direct sibling markup;
2. Cookpad-style ingredient subgroup labels such as `Bumbu Bubuk:` are still not preserved as group titles when the same label is also present in the primary ingredient sequence;
3. Dapur Umami nutrition is still dropped because the current structured-nutrition gate requires `servingSize`, even when the recipe already exposes a trusted serving yield.

This revision keeps the existing layered importer and does not add hostname-specific behavior.

The existing architecture remains:

```text
validated fetch
→ recipe-scrapers primary extraction
→ normalization
→ guarded DOM metadata/group enrichment
→ precision DOM/text fallback when primary core extraction is insufficient
→ editable Noomori draft
```

---

# 1. Revised Website Notes Contract

## 1.1 Notes only — no publisher description fallback

For website imports, Noomori Notes must contain **only an explicit recipe Notes section**.

Remove the previous website-import fallback:

```text
explicit Notes
→ publisher description
→ null
```

Replace it with:

```text
explicit bounded recipe Notes
→ Noomori Notes

otherwise
→ null
```

Publisher description must not be copied into the Noomori Notes field.

Examples of content that must **not** populate Notes:

```text
recipe introduction
author story
SEO summary
article description
personal narrative before the recipe card
recipe teaser
```

This applies even when `recipe-scrapers.description()` returns a valid non-empty string.

`description` may continue to exist internally in `ExtractedRecipe` if required by the dependency-facing extraction model, but website normalization must not persist it into the editable Noomori Notes field.

## 1.2 Yield preservation

Non-serving yield text may still be appended to Notes only when explicit Notes exist.

Example:

```text
Keep chilled for up to 3 days.

Yield: 1 large loaf
```

If no explicit Notes exist, do not create a Notes value solely to carry publisher description.

For a non-serving yield with no Notes, choose one of the existing supported metadata destinations if available; otherwise leave Notes null.

Do not reintroduce publisher description as a carrier for Yield.

---

# 2. Notes DOM Extraction Hardening

## 2.1 Root cause

The current Notes extractor assumes that Notes content can be collected through direct siblings of the Notes heading.

This fails on real markup where the heading and its content live in nested wrappers.

Example:

```html
<section>
  <div class="heading">
    <h2>Notes</h2>
  </div>

  <div class="content">
    <p>First note.</p>
    <p>Second note.</p>
  </div>
</section>

<section>
  <h2>Additional Info</h2>
</section>
```

## 2.2 Replace direct-sibling traversal

Replace Notes extraction based solely on:

```python
heading.find_next_sibling()
```

with a bounded DOM-order section traversal.

Conceptual behavior:

```text
find one accepted Notes heading
→ walk forward in DOM order inside the selected metadata scope
→ collect meaningful note content
→ stop at the next same-or-higher-level section heading
```

The traversal must support nested wrappers while retaining strict section boundaries.

## 2.3 Accepted Notes headings

Keep the accepted heading set intentionally small:

```text
Notes
Recipe Notes
Tips & Notes
```

Normalization may remain:

```text
trim
remove trailing colon
casefold
collapse whitespace
```

Do not introduce fuzzy matching such as substring search for `"note"`.

## 2.4 Metadata scope

Prefer the existing selected recipe root when Notes are contained within it.

If a realistic regression fixture proves that Notes live just outside the current minimal recipe root, derive a bounded metadata scope by ascending to the nearest ancestor that still contains exactly one valid recipe candidate.

Do not default to the whole document or arbitrary `<body>` traversal.

## 2.5 Notes ambiguity

If more than one accepted Notes section is found in the same metadata scope:

```text
notes = null
```

Do not merge multiple blocks.

Prefer false negatives over importing unrelated content.

## 2.6 Noise exclusion

Notes extraction must exclude:

```text
buttons
forms
share controls
navigation
ads
related recipes
newsletter prompts
author boxes
comments
ratings
purchase/promotion blocks
```

Existing DOM cleaning rules should remain the primary defense.

---

# 3. Cookpad-Style Ingredient Group Labels

## 3.1 Root cause

The DOM grouping extractor can already identify a row such as:

```text
Bumbu Bubuk:
```

as a structural label.

However, real primary extraction may also include that same row in the flattened ingredient sequence.

Example primary sequence:

```text
8 batang kacang panjang
0.5 papan tempe
300 ml air matang
Bumbu Bubuk:
Secukupnya kaldu ayam
Secukupnya garam
Secukupnya gula pasir
```

DOM structure:

```text
[untitled]
8 batang kacang panjang
0.5 papan tempe
300 ml air matang

Bumbu Bubuk
Secukupnya kaldu ayam
Secukupnya garam
Secukupnya gula pasir
```

A simple flattened equality check currently fails because the DOM representation correctly consumes `Bumbu Bubuk:` as presentation metadata.

## 3.2 Preserve strict verification

Do not weaken group verification into fuzzy matching.

Instead, allow a primary ingredient row to be consumed as a verified group-label token when all are true:

- the DOM extractor identified the corresponding subgroup title;
- the primary row exactly matches that title after the existing normalized-text comparison and optional trailing-colon normalization;
- the label row satisfies the existing safe label heuristics;
- it occurs at the expected structural boundary;
- the following primary ingredients exactly match the DOM group's ingredient items.

Conceptually:

```text
primary label row
"Bumbu Bubuk:"
+
DOM verified title
"Bumbu Bubuk"
→ consume as presentation metadata
```

The consumed row must not become a `RecipeIngredient`.

## 3.3 Group matcher

Add or refactor a helper responsible for matching the primary ingredient stream against DOM groups.

Conceptual result:

```text
verified ingredient groups
+
consumed presentation-label positions
```

The matcher must prove:

```text
every non-label primary ingredient is accounted for exactly once
every DOM ingredient is accounted for exactly once
every consumed label matches one verified DOM title
```

No loss.

No duplication.

No arbitrary skipped rows.

## 3.4 Initial untitled group

Continue allowing:

```text
[untitled]
...
```

before the first explicit subgroup title.

This matches the observed Cookpad layout.

## 3.5 No hostname branches

Do not add:

```python
if hostname == "cookpad.com":
```

The rule applies to any structurally equivalent ingredient list.

---

# 4. Cookpad Regression Fixture Revision

The existing synthetic Cookpad-style fixture is too idealized because the group label exists only in DOM and not in the primary structured ingredient sequence.

Revise the fixture so the primary source also contains the label row.

Example:

```json
"recipeIngredient": [
  "200 g noodles",
  "1 tbsp oil",
  "Spice Mix:",
  "1 tsp paprika",
  "1 tsp garlic powder"
]
```

DOM:

```html
<ul>
  <li>200 g noodles</li>
  <li>1 tbsp oil</li>
  <li>Spice Mix:</li>
  <li>1 tsp paprika</li>
  <li>1 tsp garlic powder</li>
</ul>
```

Expected normalized output:

```text
[untitled]
- 200 g noodles
- 1 tbsp oil

Spice Mix
- 1 tsp paprika
- 1 tsp garlic powder
```

The label row must not appear as an ingredient.

---

# 5. Structured Nutrition Confidence Revision

## 5.1 Current problem

The current website nutrition path requires:

```text
nutrition values
+
servingSize
```

before populating `nutrition_per_serving`.

This is too restrictive for structured recipes that expose:

```text
recipeYield = servings
nutrition = NutritionInformation
```

but omit `servingSize`.

## 5.2 Revised trusted structured nutrition rule

Structured nutrition may populate `nutrition_per_serving` when either condition is true.

### Condition A — explicit servingSize

```text
NutritionInformation
+
non-empty servingSize
→ trusted
```

### Condition B — trusted serving yield

```text
NutritionInformation
+
recipeYield confidently parses as servings
→ trusted
```

If neither condition is true:

```text
do not populate nutrition_per_serving
→ allow the existing strict DOM nutrition gate to try
```

Do not infer per-serving nutrition from arbitrary yield strings.

## 5.3 Serving-yield aliases

Extend the strict serving-yield parser to support exact normalized aliases:

```text
1 serving
2 servings
1 porsi
4 porsi
```

Keep the rule intentionally narrow.

Do not treat the following as servings in this round:

```text
3 orang
2 bowls
1 loaf
12 cookies
4 pieces
```

unless separately modeled in a future product contract.

## 5.4 Dapur Umami behavior

A Dapur-style recipe with:

```text
recipeYield = "4 Porsi"
nutrition values present
servingSize absent
```

should now populate `nutrition_per_serving`.

The DOM nutrition gate remains unchanged and strict.

This means:

```text
structured Recipe nutrition + trusted serving yield
→ accepted

ambiguous standalone DOM nutrition without serving semantics
→ rejected
```

## 5.5 Preserve conservative fallback

Do not loosen `_dom_nutrition()` merely to support Dapur.

The fix belongs in the structured primary nutrition confidence path.

---

# 6. Dapur Umami Regression Fixture Revision

Add or revise one deterministic fixture representing:

```json
{
  "@type": "Recipe",
  "recipeYield": "4 Porsi",
  "nutrition": {
    "@type": "NutritionInformation",
    "calories": "576 Kkal",
    "proteinContent": "5.8 g",
    "carbohydrateContent": "102.5 g",
    "fatContent": "14.8 g",
    "fiberContent": "1.5 g"
  }
}
```

with no `servingSize`.

Expected:

```text
servings = 4

nutrition_per_serving.calories_kcal = 576
nutrition_per_serving.protein_g = 5.8
nutrition_per_serving.carbs_g = 102.5
nutrition_per_serving.fat_g = 14.8
nutrition_per_serving.fiber_g = 1.5
```

Also retain a negative structured case:

```text
nutrition present
servingSize absent
recipeYield not confidently a serving count
→ nutrition_per_serving = null
```

---

# 7. Website Description Handling

## 7.1 Normalization

Update website normalization so:

```text
ExtractedRecipe.description
```

does not flow into:

```text
ImportedRecipeTextDraft.description
```

for URL imports.

The field remains named `description` in the existing API/schema for compatibility, but its website-import semantic becomes:

```text
explicit recipe Notes only
```

## 7.2 Fallback preservation

Primary-to-DOM fallback metadata preservation must continue carrying explicit Notes when found.

Preserve:

```text
description   # explicit Notes only
servings
prep_time_minutes
cook_time_minutes
total_time_minutes
additional_time_label
additional_time_minutes
nutrition_per_serving
image_url
```

Do not preserve publisher description through this path.

## 7.3 No Notes found

If no explicit Notes are extracted:

```text
description = null
```

even when:

```text
recipe-scrapers.description() != null
```

This is intentional product behavior.

---

# 8. Regression Tests

## 8.1 Notes tests

Add one realistic nested Notes fixture where:

```text
Notes heading
and
Notes content
```

are not direct siblings.

Verify:

```text
explicit Notes extracted
publisher description ignored
next section excluded
```

Add negative cases:

```text
description exists, no Notes
→ description null

multiple Notes sections
→ description null

Notes outside valid metadata scope
→ description null
```

## 8.2 Cookpad grouping tests

Update the existing Cookpad-style fixture so the primary structured ingredient list includes the label row.

Verify:

```text
primary label consumed as group title
label not retained as RecipeIngredient
initial untitled group preserved
flattened real ingredients unchanged
no duplication
no loss
```

Add rejection cases:

```text
colon-ended row with quantity
colon-ended row with recognized unit
label not followed by ingredients
primary label does not match DOM title
```

## 8.3 Nutrition tests

Positive:

```text
servingSize + nutrition
→ accepted
```

Positive:

```text
trusted recipeYield servings + nutrition + no servingSize
→ accepted
```

Positive:

```text
"4 Porsi" + nutrition + no servingSize
→ servings=4 and nutrition accepted
```

Negative:

```text
nutrition + "1 loaf" + no servingSize
→ rejected
```

Negative:

```text
nutrition + no servingSize + no trusted serving yield
→ rejected
```

DOM explicit per-serving regression remains unchanged.

Ambiguous DOM nutrition remains null.

## 8.4 Existing site regressions

Re-run existing deterministic fixtures for:

```text
WPRM
Sasa
Dapur Umami
Serious Eats
Simply Recipes
generic Schema.org
generic DOM fallback
Cookpad-style grouping
```

No live website becomes a CI dependency.

---

# 9. Manual Characterization Matrix

Use the following live pages only as manual evidence.

| Site | Expected behavior |
|---|---|
| Gimme Some Oven | explicit Notes section imported; publisher description ignored |
| Cookpad | `Bumbu Bubuk:` becomes ingredient group title; article description ignored |
| Dapur Umami | structured nutrition accepted when serving yield is trusted |
| Food Network | transport remains compatible through generic HTML User-Agent behavior |
| Royco | observable upstream rejection remains unsupported |

Do not add hostname-specific implementation branches.

---

# 10. Non-Goals

This revision does not add:

- publisher description persistence;
- separate Description field;
- fuzzy Notes heading matching;
- browser automation;
- browser-rendered DOM;
- arbitrary article prose extraction;
- domain-specific Notes selectors;
- domain-specific ingredient grouping;
- nutrition inference from arbitrary yield text;
- relaxed DOM nutrition semantics;
- multiple Notes blocks;
- multiple additional-time rows;
- Active-time persistence.

---

# 11. Acceptance Criteria

The revision is complete when all are true.

### Notes

- Explicit bounded recipe Notes populate Noomori Notes.
- Nested-wrapper Notes markup is supported.
- Publisher description never populates Noomori Notes.
- Cookpad author/story description remains ignored.
- Ambiguous Notes remain null.

### Cookpad-style grouping

- A verified colon-ended label present in both primary ingredients and DOM may be consumed as presentation metadata.
- `Bumbu Bubuk:` becomes a group title rather than an ingredient.
- Initial untitled ingredients remain valid.
- No real ingredient is lost or duplicated.
- No hostname-specific code is introduced.

### Nutrition

- Structured nutrition with `servingSize` remains supported.
- Structured nutrition with trusted `recipeYield` servings is supported even without `servingSize`.
- `4 Porsi` is recognized as servings.
- Ambiguous non-serving yields do not authorize `nutrition_per_serving`.
- DOM nutrition confidence remains strict.

### Compatibility

- Existing public API error behavior remains unchanged.
- Existing null fields remain valid.
- Existing fallback and transport protections remain unchanged.
- Existing deterministic site regressions continue passing.

---

# 12. Implementation Order

Implement in this order:

```text
1. Update failing regression fixtures first.
2. Make website Notes explicit-only; remove description fallback.
3. Replace direct-sibling Notes traversal with bounded DOM-order traversal.
4. Add verified primary ingredient label consumption.
5. Extend strict serving-yield parsing with "porsi".
6. Allow structured nutrition trust from servingSize OR trusted serving yield.
7. Run focused importer tests.
8. Run full backend/database/frontend validation.
9. Manually verify Gimme Some Oven, Cookpad, and Dapur Umami.
```

Do not expand scope further unless a new failure reveals a generic structural correctness issue.
