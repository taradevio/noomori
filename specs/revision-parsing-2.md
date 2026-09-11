# Noomori Parser Reliability — Revision After Implementation Review

**Status:** Revision required  
**Reviewed commit:** `f4dc68ad6cabe6163d5b55e3b133eb05d4a6319a`  
**Scope:** Follow-up hardening only. Do not reopen parser architecture work.

## Summary

The focused parser reliability implementation is largely correct and aligned with the intended scope.

The remaining work is small:

1. Stop swallowing unexpected fallback exceptions.
2. Add a real Love & Lemons full-pipeline regression.
3. Reduce optional extractor warning noise.
4. Optionally move shared metadata vocabulary into a neutral helper module when this area is touched again.

Do not add new parser frameworks, scoring, evidence models, Schema.org pipelines, persistence changes, or new public API fields.

---

## 1. Do not swallow unexpected fallback exceptions

### Current behavior

The website fallback path catches broad `Exception`.

When a useful `primary_draft` exists, unexpected failures such as:

```text
RuntimeError
TypeError
AttributeError
unexpected validation failures
programming errors
```

can currently be converted into a successful partial import.

The existing regression test also treats `RuntimeError("extractor failure")` as recoverable.

### Problem

This improves user availability but can hide actual implementation regressions.

The desired behavior is:

```text
expected recovery failure
→ keep useful primary draft

unexpected internal failure
→ preserve existing unexpected-error behavior
```

### Required change

Narrow the fallback exception handling.

Recoverable fallback failures should include only expected parser/extraction outcomes, for example:

```text
WebsiteImportError("recipe_not_found")
RecipeTextImportError("insufficient_structure")
```

Keep existing explicit ambiguity/security failures non-recoverable:

```text
WebsiteImportError("unsafe_url")
WebsiteImportError("page_unavailable")
WebsiteImportError("fetch_timeout")
RecipeTextImportError("multiple_recipes")
RecipeTextImportError("ambiguous_structure")
```

Unexpected exceptions should propagate to the existing outer unexpected-failure handling.

### Tests

Update the partial-primary regression:

```text
recipe_not_found
→ primary returned

insufficient_structure
→ primary returned

partial fallback
→ primary returned

RuntimeError
→ does not silently return primary
```

Add at least one assertion proving an unexpected fallback programming error is not converted to success.

---

## 2. Add a real Love & Lemons full-pipeline regression

### Current coverage

The ingredient parser directly tests:

```text
normal spaces
tabs
NBSP
narrow NBSP
repeated spaces
Unicode fractions
quantity ranges
1 cupcake
6 large apples
```

This validates `_ingredient()` itself.

However, the site-shaped Unicode fixture currently uses an `example.com` URL and therefore exercises generic structured extraction rather than the custom `LoveAndLemons` scraper path.

### Why this matters

The upstream Love & Lemons scraper reads:

```python
element.get_text()
```

from `.wprm-recipe-ingredient`.

The original regression may occur at the website-extraction boundary before Noomori's ingredient parser receives the text.

A direct `_ingredient()` test is not enough to prove the real website path stays fixed.

### Required fixture

Add one sanitized/minimized Love & Lemons-shaped fixture using:

```text
https://www.loveandlemons.com/...
```

and WPRM markup such as:

```html
<li class="wprm-recipe-ingredient">
  <span class="wprm-recipe-ingredient-amount">2</span>
  <span class="wprm-recipe-ingredient-unit">tablespoons</span>
  <span class="wprm-recipe-ingredient-name">all-purpose flour</span>
</li>
```

Include representative cases:

```text
2 tablespoons all-purpose flour
2 teaspoons fresh lemon juice
½ teaspoon nutmeg
¾ cup whole rolled oats
6 large apples
```

Where useful, reproduce the whitespace form that caused the real failure.

### Expected assertions

```text
2 tablespoons all-purpose flour
→ quantity = 2
→ unit = tbsp
→ name = all-purpose flour

2 teaspoons fresh lemon juice
→ quantity = 2
→ unit = tsp
→ name = fresh lemon juice

½ teaspoon nutmeg
→ quantity = 0.5
→ unit = tsp
→ name = nutmeg

¾ cup whole rolled oats
→ quantity = 0.75
→ unit = cup
→ name = whole rolled oats

6 large apples
→ quantity = 6
→ unit = null
→ name = large apples
```

Run it through the existing full-pipeline fixture helper with only the network boundary mocked.

Do not add a Love & Lemons hostname branch.

---

## 3. Reduce optional extractor warning noise

### Current behavior

`_optional_value()` logs every optional extractor exception at warning level.

It is used for fields such as:

```text
ingredient_groups
ingredients
instructions_list
title
description
prep_time
cook_time
total_time
yields
nutrients
image
```

Some `recipe-scrapers` implementations use exceptions to signal that an optional field is unavailable.

### Problem

A successful import can generate several warning logs even when nothing operationally wrong happened.

This lowers the signal quality of production logs.

### Required behavior

Do not change extraction control flow.

Optional extraction failures must still fail softly.

Prefer one of these approaches:

#### Preferred

Expected field-unavailable exceptions:

```text
DEBUG
```

Unexpected exception classes:

```text
WARNING
```

#### Acceptable alternative

Accumulate extractor method/class diagnostics and emit one compact warning only when the final import also required fallback or lost an expected field.

### Logging constraints

Keep:

```text
method name
exception class
```

Do not log:

```text
exception message
raw recipe text
HTML
URL query parameters
source content
```

This is observability cleanup only.

---

## 4. Shared metadata vocabulary cleanup

### Current behavior

`text.py` imports:

```text
_PASSIVE_TIME_LABELS
is_recipe_notes_heading
```

from `recipe_url_import.py`.

This currently works, but the dependency direction is conceptually awkward:

```text
text parser
→ URL/DOM acquisition module
```

### Recommendation

Not a blocker for the current hardening release.

If this area is touched again, move the shared exact vocabulary/helpers into a neutral module, for example:

```text
server/src/server/modules/recipes/imports/metadata.py
```

Possible contents:

```text
NOTE_HEADINGS
PASSIVE_TIME_LABELS

is_recipe_notes_heading()
canonical_passive_time_label()
```

Keep the module small and data-focused.

Do not turn this into:

```text
MetadataParser
MetadataEvidence
MetadataAssessment
```

No new framework is needed.

---

## Confirmed behavior to keep

The following implementation choices are good and should remain unchanged.

### Partial website drafts

Keep the current two-signal usefulness rule:

```text
title
ingredients
instructions
```

Any two signals may form a useful editable draft.

Keep:

```text
usable primary + failed/partial fallback
→ primary

no usable primary + usable partial fallback
→ fallback

neither usable
→ 422
```

Do not merge core arrays from separate candidates.

### Ingredient whitespace

Keep normalization at the ingredient-parser boundary.

Continue supporting:

```text
tabs
NBSP
narrow NBSP
repeated spaces
```

without compatibility normalization that decomposes Unicode fractions.

Keep conservative cases:

```text
½–¾ cup milk
→ quantity = null
→ unit = null
→ raw ingredient meaning preserved

1 cupcake
→ quantity = 1
→ unit = null
→ name = cupcake

6 large apples
→ quantity = 6
→ unit = null
→ name = large apples
```

### Text times

Keep:

```text
Prep
Cook
Total
```

independent.

Do not validate explicit total against:

```text
prep + cook + additional
```

Keep semantic passive-time deduplication:

```text
Chill: 1 hr
Chill time: 60 min
→ Chill, 60
```

Keep invalid/multiple passive metadata in Notes.

Keep:

```text
Active
```

unsupported as prep/cook/additional time.

### Bounded website metadata

Keep the relaxed metadata fallback conservative:

```text
strict recipe root first
```

If strict root fails:

```text
explicit recipe identifier
+
exact normalized primary-title match
+
innermost candidate
+
exactly one remaining candidate
```

Do not broaden to generic:

```text
article
main
body
```

Keep unrelated surrounding Notes excluded.

### Yield preservation

Keep noncanonical yield text reviewable:

```text
Yield: 1 jar
Yield: 1 large loaf
Yield: 2-3 servings
```

when it cannot safely map to integer `servings`.

Do not infer a serving count from ambiguous yield text.

### Frontend partial-draft handling

Keep support for imported drafts where:

```text
ingredients = []
```

or:

```text
instructions = []
```

Import Review must remain editable through the existing add controls.

---

## Verification

### Backend

Run focused suites covering:

```text
text parser
website parser/orchestration
site-shaped URL import fixtures
```

Then run the full backend suite.

### Frontend

Run relevant import/review tests proving:

```text
recovered Notes survive conversion
independent times survive conversion
empty ingredient arrays remain editable
empty instruction arrays remain editable
```

### New required regressions

Add:

1. Unexpected `RuntimeError` in fallback is not swallowed.
2. Love & Lemons custom scraper path preserves unit boundaries end-to-end.

### Existing regressions that must remain green

Preserve coverage for:

```text
Unicode spaces
Unicode fractions
ranges
cupcake
6 large apples
conflicting totals
duplicate passive times
invalid passive times
Active
bounded Notes
nested recipe containers
ambiguous metadata roots
partial primary recovery
partial fallback recovery
one-signal 422 behavior
yield preservation
```

---

## Stop condition

This revision is complete when:

```text
broad fallback exception swallowing is removed
+
Love & Lemons full-pipeline regression passes
+
optional extractor logging cleanup and level/content regression checks pass
+
focused parser suites pass
+
full backend suite passes
+
relevant frontend import tests pass
```

Then stop.

Do not use this revision as justification to add:

```text
Lark
new structured extractors
field evidence models
quality scoring
production accuracy metrics
new persistence fields
fuzzy metadata matching
hostname-specific parsing branches
```

Any further parser expansion must begin with a reproduced failure and a regression fixture.
