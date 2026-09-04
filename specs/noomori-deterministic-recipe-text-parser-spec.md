# Noomori — Deterministic Recipe Text Parser Specification

**Status:** Implementation-aligned MVP specification  
**Feature:** Import from Text  
**Parser strategy:** Deterministic / heuristic only  
**Product:** Noomori  
**Platform:** Expo / React Native + FastAPI  
**Scope:** MVP

---

## 1. Purpose

This document specifies the deterministic parser used by Noomori's `Import from Text` flow.

The parser converts pasted plain-text recipes into data compatible with Noomori's **existing canonical recipe form/model**. It must not create a parallel persisted recipe model.

The parser should be:

- deterministic;
- conservative;
- predictable;
- source-faithful;
- recoverable;
- easy to test;
- inexpensive to run;
- independent of an LLM or third-party parser.

Target pipeline:

```text
raw pasted text
      ↓
normalize text
      ↓
detect metadata
      ↓
detect recipe sections
      ↓
classify lines by section/context
      ↓
parse structured ingredients
      ↓
parse instructions
      ↓
normalize into existing RecipeForm-compatible draft
      ↓
Import Review
```

The parser is an **extraction layer**, not a recipe-writing system.

---

## 2. Core Invariant

The parser MUST:

> Extract what is explicitly present and preserve meaning when structure is uncertain.

The parser MUST NOT:

- invent a recipe title;
- invent ingredients;
- invent quantities;
- invent units;
- invent preparation steps;
- infer missing timings;
- infer missing servings;
- infer a source that is not explicitly available;
- rewrite instructions for style;
- summarize recipe text;
- merge separate ingredients merely because they are adjacent;
- split one numbered step merely because it contains semicolons or multiple sentences.

When structured parsing is uncertain, prefer the less-structured but source-faithful representation.

---

## 3. Compatibility With Current Noomori Code

Before implementing the parser, inspect and reuse the actual current Noomori code for:

- recipe draft/form type;
- Create Recipe payload type;
- ingredient type;
- ingredient-group type;
- instruction-group type;
- step type;
- unit representation and aliases;
- duration representation;
- source representation;
- Pydantic schemas;
- validation rules.

Conceptual names in this specification do **not** require renaming existing code.

Required boundary:

```text
parser result
    ↓
small adapter / normalization boundary
    ↓
existing RecipeForm-compatible state
```

If the existing implementation can directly produce form-compatible state, do not introduce another parser DTO merely for abstraction.

Import from Text must not require refactoring existing recipe persistence.

---

## 4. Canonical Fields Relevant to Import

The current Noomori model contains concepts equivalent to:

```text
Recipe
├── metadata
│   ├── title
│   ├── prep_minutes?
│   ├── cook_minutes?
│   └── canonical_servings
│
├── ingredient_groups[]
│   ├── title?
│   ├── note?
│   └── ingredients[]
│       ├── amount?
│       ├── unit?
│       ├── name
│       └── note?
│
├── instruction_groups[]
│   ├── title?
│   └── steps[]
│
├── notes?
├── source
└── cookbook_memberships[]
```

The parser may populate only values it can determine from the source text. Missing fields use the same defaults/empty structures already used by Write from Scratch / Import Review.

---

## 5. MVP Parsing Priorities

Implement in this order:

1. text normalization;
2. metadata label/value parsing;
3. Ingredients / Directions section detection;
4. numbered instruction parsing;
5. ingredient line boundaries;
6. numeric amount parsing;
7. Unicode fraction parsing;
8. existing unit-alias recognition;
9. conservative ingredient note parsing;
10. ingredient/instruction subsection preservation;
11. unsupported metadata preservation;
12. parser diagnostics and regression tests.

Do not add NLP, embeddings, an LLM, or a third-party recipe parser to solve edge cases in this MVP.

---

## 6. Input Contract

Input is one UTF-8 plain-text string.

The parser must tolerate:

- `\n`;
- `\r\n`;
- extra spaces;
- tabs;
- multiple blank lines;
- Unicode fractions;
- Unicode bullets;
- mixed capitalization;
- trailing whitespace.

The parser does not need to know whether the user copied the text from Notes, WhatsApp, a browser, Google Docs, or another app.

---

## 7. Text Normalization

Recommended deterministic normalization:

```text
\r\n → \n
\r   → \n
trailing spaces → remove
leading/trailing document whitespace → remove
3+ consecutive blank lines → max 2 blank lines
```

Do not globally lowercase content. Use case-insensitive matching only for known headings and metadata labels.

Do not remove semantic punctuation.

Example that must remain intact:

```text
450 degrees F (220 degrees C)
```

---

## 8. Context-Aware Parsing

The parser should reason from document regions, not from globally matching numbers or keywords.

Conceptual line categories:

```text
BLANK
METADATA_LABEL
METADATA_VALUE
SECTION_HEADING
INGREDIENT_LINE
INSTRUCTION_LINE
UNKNOWN_TEXT
```

A literal enum is optional; the behavior is required.

For example:

```text
Servings:
8
```

in the header region may map to metadata.

But:

```text
Serve 8 people immediately.
```

inside Directions must remain instruction content.

---

## 9. Metadata Header Region

Metadata parsing should normally occur before the first recognized top-level Ingredients or Instructions heading.

Supported labels should include case-insensitive aliases for:

```text
Prep Time
Preparation Time
Prep

Cook Time
Cooking Time

Additional Time

Total Time

Servings
Serving

Yield
```

Support both formats:

```text
Prep Time:
30 mins
```

and:

```text
Prep Time: 30 mins
```

Whitespace around `:` should be tolerated:

```text
Prep Time : 30 mins
```

---

## 10. Duration Parsing

Supported duration units:

```text
minute
minutes
min
mins
hour
hours
hr
hrs
```

Examples:

```text
30 mins      → 30
40 minutes   → 40
1 hr         → 60
1 hr 25 mins → 85
1 hour 5 min → 65
90 mins      → 90
```

Conceptually:

```text
parse_duration_to_minutes(value) -> int | None
```

Do not guess vague values such as:

```text
about an hour
until done
a while
```

unless future product requirements explicitly support them.

---

## 11. Time Mapping

Map only canonical fields directly:

```text
Prep Time → existing prep_minutes
Cook Time → existing cook_minutes
```

### Additional Time

The current canonical recipe model does not require a dedicated persisted `additional_time` field.

Therefore:

```text
Additional Time: 15 mins
```

should be parsed for recognition but preserved source-faithfully using the existing `notes` field when no canonical field exists.

Example Notes contribution:

```text
Additional Time: 15 mins
```

Do not rewrite it into a fabricated instruction such as:

```text
Rest for exactly 15 minutes.
```

### Total Time

Parse Total Time for validation/diagnostics, but do not map it into Prep or Cook Time.

Example:

```text
Prep Time: 30 mins
Cook Time: 40 mins
Additional Time: 15 mins
Total Time: 1 hr 25 mins
```

Consistency:

```text
30 + 40 + 15 = 85
```

Because the Total is redundant, it may be omitted from Notes.

If Total Time conflicts with the components, do not modify the source values to make them match. Preserve the conflicting source value in diagnostics or Notes.

---

## 12. Servings and Yield

Valid positive integer Servings should map to the existing canonical servings field.

Example:

```text
Servings:
8
```

becomes:

```text
canonical_servings = 8
```

Yield is different from Servings.

Example:

```text
Yield:
1 (9-inch) pie
```

MUST NOT become:

```text
servings = 1
```

If there is no canonical Yield field, preserve it in existing Notes:

```text
Yield: 1 (9-inch) pie
```

Do not introduce a new DB column solely for text import.

---

## 13. Unsupported Recognized Metadata

For recognized metadata that has no canonical persisted field:

```text
canonical field exists
→ populate it

canonical field does not exist but value is meaningful
→ preserve source-faithfully in existing Notes

value is redundant/derived
→ may omit from persisted fields

value is malformed/ambiguous
→ preserve source instead of guessing
```

The parser must not silently drop meaningful recognized source information.

---

## 14. Section Headings

Recognize common whole-line headings case-insensitively.

### Ingredients

```text
Ingredients
Ingredient
Ingredients:
Ingredient:
```

Optional Indonesian aliases:

```text
Bahan
Bahan-bahan
```

### Instructions

```text
Directions
Directions:
Instructions
Instructions:
Method
Method:
Steps
Steps:
```

Optional Indonesian aliases:

```text
Cara Membuat
Langkah
Langkah-langkah
```

Do not use substring matching.

Bad:

```python
if "direction" in line.lower():
```

because this could misclassify:

```text
Follow package directions.
```

Prefer normalized whole-line matches.

---

## 15. Title Detection

The parser MUST NOT invent a title.

An unambiguous standalone line before metadata/sections may be used as title:

```text
Classic Peach Pie

Prep Time:
30 mins
```

may produce:

```text
title = Classic Peach Pie
```

But if the pasted text starts directly with:

```text
Prep Time:
```

then:

```text
title = empty
```

The parser must not infer `Peach Pie` from later words such as `peaches`, `pie crust`, or `Cool pie`.

Import Review handles the missing required title.

---

## 16. Ingredients Region

After a recognized Ingredients heading, parsing continues until:

- a recognized Directions/Instructions heading;
- another recognized top-level section;
- end of document.

Blank lines inside Ingredients do not terminate the section.

MVP default:

> One non-empty line in the Ingredients region equals one ingredient candidate.

Example:

```text
Ingredients
1 egg, beaten

5 cups sliced peeled peaches

2 tablespoons lemon juice
```

must produce three ingredient candidates.

Do not merge neighboring lines because blank lines are present or absent.

Do not split one ingredient line on commas.

---

## 17. Ingredient Amount Grammar

Support leading amounts in these forms:

### Integer

```text
1
2
10
```

### Decimal

```text
0.5
1.5
```

### ASCII fraction

```text
1/2
1/4
3/4
```

### Mixed fraction

```text
1 1/2
2 1/4
```

### Unicode fraction

```text
½
¼
¾
⅓
⅔
⅛
⅜
⅝
⅞
```

### Whole number + Unicode fraction

```text
1½
1 ½
2¼
2 ¼
```

Use the existing canonical numeric amount representation.

---

## 18. Unicode Fraction Mapping

At minimum:

```text
½ → 0.5
¼ → 0.25
¾ → 0.75
⅓ → 1/3
⅔ → 2/3
⅛ → 0.125
⅜ → 0.375
⅝ → 0.625
⅞ → 0.875
```

If Noomori already contains fraction parsing/formatting utilities, reuse them.

---

## 19. Unit Recognition

Reuse the current Noomori unit model and alias normalization.

Typical aliases include:

```text
teaspoon / teaspoons / tsp
tablespoon / tablespoons / tbsp
cup / cups
gram / grams / g
kilogram / kilograms / kg
milliliter / milliliters / ml
liter / liters / l
ounce / ounces / oz
pound / pounds / lb / lbs
package / packages
clove / cloves
piece / pieces
```

Do not create a second independent unit vocabulary if one already exists.

Required direction:

```text
raw alias
   ↓
existing unit normalization
   ↓
existing canonical unit identity
```

If custom units already exist, unknown but structurally clear units may use that existing behavior.

Do not silently drop an unknown unit.

---

## 20. Parenthetical Packaging — Critical Rule

The parser must correctly handle:

```text
1 (14.1 ounce/2 count) package ready-to-bake pie crust pastry for a double-crust 9-inch pie
```

Primary structure:

```text
amount = 1
unit = package
name = ready-to-bake pie crust pastry for a double-crust 9-inch pie
note = 14.1 ounce/2 count
```

The parser MUST NOT:

- replace primary amount `1` with `14.1`;
- treat `ounce` as the primary unit;
- interpret `/2` as the ingredient's fraction amount;
- parse `9-inch` as another quantity;
- infer `2` crusts as the canonical amount.

General rule:

> A parenthetical expression immediately after the leading amount is packaging/descriptor context unless an explicit future grammar says otherwise.

Example:

```text
1 (400 g) can tomatoes
```

safe result:

```text
amount = 1
unit = can
name = tomatoes
note = 400 g
```

not:

```text
amount = 400
unit = g
```

---

## 21. Ingredient Notes

Punctuation can provide deterministic note boundaries.

Example:

```text
1 egg, beaten
```

may become:

```text
amount = 1
unit = null
name = egg
note = beaten
```

Common comma-suffix preparation notes include:

```text
minced
chopped
diced
sliced
peeled
beaten
melted
softened
divided
drained
rinsed
```

Do not aggressively split every comma-containing ingredient. If uncertain, preserve more text in `name` rather than losing information.

---

## 22. "or to taste" Preservation

Example:

```text
½ teaspoon ground cinnamon or to taste
```

may become:

```text
amount = 0.5
unit = teaspoon
name = ground cinnamon
note = or to taste
```

Likewise:

```text
¼ teaspoon ground nutmeg or to taste
```

may become:

```text
amount = 0.25
unit = teaspoon
name = ground nutmeg
note = or to taste
```

The phrase must never disappear.

If the parser cannot confidently create a note boundary, preserving the phrase inside `name` is preferable to dropping it.

---

## 23. Preparation Words Without Punctuation

Do not perform NLP-style adjective extraction.

Example:

```text
5 cups sliced peeled peaches
```

safe MVP result:

```text
amount = 5
unit = cup
name = sliced peeled peaches
note = null
```

Do not force:

```text
name = peaches
note = sliced, peeled
```

unless the source punctuation explicitly supports that structure.

---

## 24. Optional / Ambiguous Ingredient Amounts

Examples:

```text
salt to taste
pepper as needed
oil for frying
```

Expected conservative behavior:

```text
amount = null
unit = null
name = full meaningful source phrase
```

Do not fabricate quantity/unit.

### Ranges

Examples:

```text
2-3 tablespoons sugar
2 to 3 tablespoons sugar
```

If the current canonical amount type cannot represent ranges, do not collapse to a made-up scalar.

Preferred fallback:

```text
amount = null
name = full original expression
```

or reuse an existing raw/custom amount representation if one already exists.

Never silently choose `2`, `2.5`, or `3`.

---

## 25. Bullet Ingredients

Supported leading bullets may include:

```text
-
*
•
–
—
```

Strip a bullet only when it is a leading structural marker inside the Ingredients region.

Example:

```text
• 2 tablespoons butter
```

becomes the same candidate as:

```text
2 tablespoons butter
```

Internal hyphens must remain intact:

```text
ready-to-bake
9-inch
double-crust
```

Never globally strip hyphens.

---

## 26. Slash Safety

Slash characters may indicate different concepts.

Examples:

```text
1/2 cup sugar
14.1 ounce/2 count
```

Only treat `/` as a fraction when it appears in a valid leading amount grammar.

Do not globally convert every `x/y` substring into a numeric fraction.

---

## 27. Ingredient Subsections

Explicit source headings may map to the existing one-level ingredient group structure.

Example:

```text
Ingredients

For the filling
2 cups peaches
1 cup sugar

For the crust
2 cups flour
1 cup butter
```

may produce groups:

```text
For the filling
For the crust
```

Subsection detection must be conservative. A candidate subsection should generally:

- occur inside Ingredients;
- have no leading amount;
- be relatively short;
- be followed by one or more ingredient-like lines.

If uncertain, preserve the line rather than inventing a group.

Do not create nested ingredient groups.

---

## 28. Directions Region

After a recognized Directions/Instructions heading, content remains instruction content until another recognized top-level section or end of document.

Blank lines do not automatically terminate the section.

---

## 29. Numbered Instruction Parsing

Support:

```text
1. Step text
2. Step text
```

and:

```text
1) Step text
2) Step text
```

Strip only the leading marker.

Example:

```text
1. Gather all ingredients. Preheat the oven to 450 degrees F (220 degrees C)
```

must become one step:

```text
Gather all ingredients. Preheat the oven to 450 degrees F (220 degrees C)
```

Do not sentence-split numbered steps.

---

## 30. Instruction Continuation Lines

Copied text may wrap a logical numbered step across physical lines.

Example:

```text
8. Bake in the preheated oven for 10 minutes. Reduce the oven
temperature to 350 degrees F (175 degrees C); continue baking
until crust is brown.
9. Cool pie for 15 minutes.
```

must produce two steps.

Rule:

```text
numbered step begins
→ collect following non-numbered continuation lines
→ stop when next valid numbered marker begins
```

Do not apply this continuation rule inside Ingredients.

---

## 31. Semicolons and Multiple Sentences

A semicolon does not create a new step.

Sentence periods do not create additional steps when explicit numbering already defines the step boundary.

Example:

```text
8. Bake for 10 minutes. Reduce temperature to 350 degrees F (175 degrees C); continue baking until brown. Cover edges if needed.
```

remains exactly one instruction step.

---

## 32. Numeric Values Inside Directions

Numbers inside Directions are instruction content.

Examples:

```text
450 degrees F
220 degrees C
9-inch pie plate
1 pie crust
10 minutes
350 degrees F
175 degrees C
30 to 35 minutes
15 minutes
```

These values MUST NOT mutate:

- servings;
- prep time;
- cook time;
- Additional Time;
- ingredient amounts.

This is why section-aware parsing is mandatory.

---

## 33. Unnumbered Instructions

If an Instructions section contains paragraphs rather than numbering:

```text
Directions

Heat the pan.

Add the onion and cook until soft.

Serve warm.
```

each blank-line-separated paragraph may become one step.

If there are no reliable paragraph boundaries, preserve content conservatively instead of sentence-tokenizing prose.

---

## 34. Instruction Subsections

Explicit source structure such as:

```text
Make the filling
Bake
To serve
```

may map to existing one-level instruction groups only when context is clear.

Do not infer groups from semantic meaning.

Do not create nested instruction groups.

---

## 35. Unknown Text Preservation

### Before structured sections

Example:

```text
This is my grandmother's favorite pie.

Prep Time:
30 mins
```

If this is not an unambiguous title, preserve it as Notes or parser-unmapped source text rather than silently deleting it.

### After directions

Example:

```text
Directions:
1. ...
2. ...

Best served warm with ice cream.
```

If the final line is clearly supplementary rather than a continuation of step 2, preserve it in Notes.

Do not silently append arbitrary trailing prose to the last numbered step.

---

## 36. Duplicate / Malformed Metadata

### Conflicting duplicate

```text
Prep Time: 30 mins
Prep Time: 40 mins
```

Preferred behavior:

```text
ambiguous canonical value
→ do not silently choose one
→ preserve source values / diagnostics
```

Identical duplicate values may be deduplicated.

### Malformed values

```text
Prep Time: soon
Cook Time: until done
```

Do not coerce these into numeric durations.

One malformed field must not fail the whole recipe.

---

## 37. Partial Parsing

Parsing should distinguish:

```text
complete failure
partial parse
successful parse
```

### Complete failure

Examples:

- empty input;
- whitespace-only input;
- no useful recipe structure;
- multiple strong recipe structures detected.

Result:

```text
do not enter Import Review
preserve raw text
show recoverable error
```

### Partial parse

Example:

```text
title missing
ingredients found
instructions found
```

Result:

```text
enter Import Review
title remains empty
user completes it
```

Existing Create validation remains authoritative before Save Recipe.

---

## 38. Multiple Recipes in One Paste

MVP does not support batch import.

If the parser identifies multiple strong top-level recipe structures, it must not merge them.

Recommended product response:

```text
We found more than one recipe.
Paste one recipe at a time.
```

Do not arbitrarily select one recipe.

---

## 39. Missing Headings

Example:

```text
1 cup flour
2 eggs
Mix everything.
Bake for 30 minutes.
```

For MVP, avoid aggressive semantic inference.

The parser may conservatively fail or use only a narrowly defined fallback supported by regression tests.

Do not grow a giant regex/NLP-like rules engine solely to parse arbitrary prose.

---

## 40. Mixed-Language Input

Known English and Indonesian heading aliases may coexist.

Example:

```text
Bahan:
2 telur

Directions:
1. Kocok telur.
```

Do not perform language detection.

Do not translate recipe content.

Preserve the source language.

---

# Golden Regression Fixture

## 41. Source Fixture

The following exact input must be added as a deterministic parser regression fixture:

```text
Prep Time:
30 mins
Cook Time:
40 mins
Additional Time:
15 mins
Total Time:
1 hr 25 mins
Servings:
8
Yield:
1 (9-inch) pie

Ingredients
1 (14.1 ounce/2 count) package ready-to-bake pie crust pastry for a double-crust 9-inch pie

1 egg, beaten

5 cups sliced peeled peaches

2 tablespoons lemon juice

1 cup white sugar

½ cup all-purpose flour

½ teaspoon ground cinnamon or to taste

¼ teaspoon ground nutmeg or to taste

¼ teaspoon salt

2 tablespoons butter


Directions:
1. Gather all ingredients. Preheat the oven to 450 degrees F (220 degrees C)
2. Line the bottom and sides of a 9-inch pie plate with 1 pie crust; lightly brush crust with egg to prevent dough from becoming soggy. Set aside remaining 1 crust.
3. Place peaches in a large bowl; gently toss with lemon juice
4. Combine sugar, flour, cinnamon, nutmeg, and salt in a separate bowl; pour over peaches and mix until combined.
5. Pour peach filling into the prepared pie crust; dot with butter
6. Cover filling with remaining 1 pie crust; flute edges to seal or use a fork dipped in egg to press them down.
7. Brush remaining egg on top crust; cut several slits in top crust to allow steam to escape
8. Bake in the preheated oven for 10 minutes. Reduce the oven temperature to 350 degrees F (175 degrees C); continue baking until crust is brown and juice begins to bubble through ventilation slits, 30 to 35 minutes more. If the edges brown too fast, cover them with strips of aluminum foil about halfway through baking
9. Cool pie for 15 minutes before slicing. Enjoy
```

---

## 42. Expected Metadata Result

### Title

No explicit title exists.

Expected:

```text
title = empty
```

The parser MUST NOT infer `Peach Pie`.

### Prep Time

```text
prep_minutes = 30
```

### Cook Time

```text
cook_minutes = 40
```

### Additional Time

Recognized:

```text
15 minutes
```

No canonical dedicated field:

```text
Notes += "Additional Time: 15 mins"
```

### Total Time

Parsed diagnostically:

```text
85 minutes
```

Consistency:

```text
30 + 40 + 15 = 85
```

Do not map Total Time into Prep or Cook Time.

Because it is exactly redundant, it does not need to be added to Notes.

### Servings

```text
canonical_servings = 8
```

### Yield

Do not map Yield into Servings.

Preserve:

```text
Notes += "Yield: 1 (9-inch) pie"
```

---

## 43. Expected Ingredient Count

The fixture must produce exactly:

```text
ingredient_count = 10
```

Blank lines between ingredients must not cause any ingredient to disappear.

---

## 44. Expected Ingredient Structures

### Ingredient 1

Source:

```text
1 (14.1 ounce/2 count) package ready-to-bake pie crust pastry for a double-crust 9-inch pie
```

Expected conservative structure:

```text
amount = 1
unit = package
name = ready-to-bake pie crust pastry for a double-crust 9-inch pie
note = 14.1 ounce/2 count
```

### Ingredient 2

```text
1 egg, beaten
```

Expected:

```text
amount = 1
unit = null
name = egg
note = beaten
```

### Ingredient 3

```text
5 cups sliced peeled peaches
```

Expected:

```text
amount = 5
unit = existing canonical cup identity
name = sliced peeled peaches
note = null
```

### Ingredient 4

```text
2 tablespoons lemon juice
```

Expected:

```text
amount = 2
unit = existing canonical tablespoon identity
name = lemon juice
```

### Ingredient 5

```text
1 cup white sugar
```

Expected:

```text
amount = 1
unit = cup
name = white sugar
```

### Ingredient 6

```text
½ cup all-purpose flour
```

Expected:

```text
amount = 0.5
unit = cup
name = all-purpose flour
```

### Ingredient 7

```text
½ teaspoon ground cinnamon or to taste
```

Expected:

```text
amount = 0.5
unit = teaspoon
name = ground cinnamon
note = or to taste
```

### Ingredient 8

```text
¼ teaspoon ground nutmeg or to taste
```

Expected:

```text
amount = 0.25
unit = teaspoon
name = ground nutmeg
note = or to taste
```

### Ingredient 9

```text
¼ teaspoon salt
```

Expected:

```text
amount = 0.25
unit = teaspoon
name = salt
```

### Ingredient 10

```text
2 tablespoons butter
```

Expected:

```text
amount = 2
unit = tablespoon
name = butter
```

---

## 45. Expected Instructions

The fixture must produce exactly:

```text
instruction_step_count = 9
```

Explicit numbering is authoritative.

Critical assertions:

- Step 1 remains one step despite containing two sentences.
- Step 2 remains one step despite a semicolon.
- Step 8 remains one step despite multiple sentences, temperatures, a semicolon, and several duration expressions.
- Step 9's `15 minutes` remains instruction content and does not become Additional Time.
- `450`, `220`, `350`, `175`, `10`, `30`, `35`, and `15` inside Directions do not overwrite metadata.

---

## 46. Expected Notes

If current persisted schema still has no dedicated Additional Time or Yield fields, expected imported Notes contribution is:

```text
Additional Time: 15 mins
Yield: 1 (9-inch) pie
```

If source Notes already exist, preserve them and append recognized unsupported metadata using the existing Notes formatting convention. Never overwrite source Notes.

---

## 47. Golden Fixture Assertions

At minimum:

```text
title is empty
prep_minutes == 30
cook_minutes == 40
servings == 8
ingredient_count == 10
instruction_step_count == 9
unicode ½ == 0.5
unicode ¼ == 0.25
first ingredient amount == 1
first ingredient primary unit == package
first ingredient preserves "14.1 ounce/2 count"
"or to taste" is not dropped
step 8 remains one step
instruction durations do not overwrite metadata
Yield does not become Servings
meaningful unsupported metadata is not silently lost
```

---

# Edge Cases

## 48. Required Edge-Case Catalogue

### EC-01 — Blank lines between every ingredient

Every non-empty line remains an ingredient candidate.

### EC-02 — No blank lines between ingredients

Each non-empty line remains independent.

### EC-03 — Unicode fractions

`½`, `¼`, `¾`, etc. parse correctly.

### EC-04 — ASCII fraction

`1/2 cup sugar` parses as amount `0.5`.

### EC-05 — Mixed fraction

`1 1/2 cups flour` parses according to existing numeric amount representation.

### EC-06 — Fraction-like packaging

```text
1 (14 ounce/2 count) package
```

`/2` must not become primary amount.

### EC-07 — Hyphenated words

```text
ready-to-bake
9-inch
double-crust
```

remain intact.

### EC-08 — Comma preparation note

```text
1 egg, beaten
```

preserves `beaten`.

### EC-09 — "or to taste"

Must never disappear.

### EC-10 — No explicit title

Leave title empty.

### EC-11 — Time values inside Directions

Must not mutate metadata.

### EC-12 — Servings versus Yield

Never map Yield directly into Servings.

### EC-13 — Additional Time has no canonical field

Preserve exact source metadata using existing Notes.

### EC-14 — Total Time is redundant

Do not duplicate into Prep/Cook.

### EC-15 — Total Time conflicts with components

Do not fix source values; preserve conflict.

### EC-16 — Duplicate conflicting metadata

Do not silently select a value.

### EC-17 — Wrapped numbered instruction

Continuation lines join the current step until next explicit marker.

### EC-18 — Multi-sentence numbered step

Remain one step.

### EC-19 — Semicolon within step

Remain one step.

### EC-20 — Bullet ingredient

Strip only leading bullet.

### EC-21 — Unknown custom unit

Reuse existing custom-unit behavior or preserve source text.

### EC-22 — Amount range

Do not collapse `2-3` into a fabricated scalar.

### EC-23 — Optional ingredient

Do not invent amount/unit for `salt to taste`.

### EC-24 — Explicit ingredient subsection

Preserve only when structure is clear.

### EC-25 — Explicit instruction subsection

Preserve only when structure is clear.

### EC-26 — Supplementary notes before/after recipe

Preserve meaningful text instead of silently dropping it.

### EC-27 — Multiple pasted recipes

Reject/ask for one recipe; never merge.

### EC-28 — Missing Ingredients heading

Do not aggressively infer arbitrary lines without a narrow tested fallback.

### EC-29 — Missing Directions heading

Do not aggressively infer arbitrary prose without a narrow tested fallback.

### EC-30 — HTML fragments in copied text

Treat as text or sanitize deterministically; never execute.

### EC-31 — Very long input

Reject above configured maximum input size.

### EC-32 — Mixed English/Indonesian headings

Known aliases may coexist; content remains untranslated.

### EC-33 — Decimal package size

`1 (14.1 ounce) package` keeps leading amount `1` as canonical amount.

### EC-34 — Quantity inside ingredient name

`double-crust 9-inch pie` must not produce new amount fields.

### EC-35 — Zero servings

Reject as invalid canonical servings; preserve source for user correction.

### EC-36 — Negative quantity

Do not accept negative ingredient amount as valid recipe quantity unless existing canonical validation explicitly supports it.

### EC-37 — Empty Ingredients section

Partial parse may continue to Import Review if other useful content exists.

### EC-38 — Empty Directions section

Partial parse may continue to Import Review if other useful content exists.

### EC-39 — Punctuation-only lines

Do not create ingredients/steps from meaningless separators.

### EC-40 — Repeated numbered marker

Conflicting/repeated numbering should preserve step order based on document order rather than renumbering recipe semantics.

---

# Testing

## 49. Unit Test Matrix

At minimum, add tests for:

### Durations

```text
30 mins
30 min
30 minutes
1 hr
1 hour
1 hr 25 mins
90 mins
```

### Fractions

```text
1/2
1 1/2
½
¼
¾
1 ½
```

### Units

```text
cup/cups
teaspoon/teaspoons/tsp
tablespoon/tablespoons/tbsp
g/kg/ml/l
package/packages
clove/cloves
```

### Ingredients

```text
1 egg
1 egg, beaten
½ cup flour
salt to taste
2 tablespoons butter
1 (400 g) can tomatoes
1 (14.1 ounce/2 count) package pie crust
```

### Instructions

```text
1. text
1) text
multi-sentence numbered step
semicolon inside step
temperature values
duration values inside step
wrapped continuation lines
```

### Metadata

```text
Prep Time:
30 mins

Prep Time: 30 mins

Servings:
8

Yield:
1 loaf
```

### Structural

```text
blank lines between ingredients
no blank lines between ingredients
missing title
missing instructions
missing ingredients
duplicate metadata
multiple recipes
mixed line endings
Unicode bullets
```

---

## 50. Parser Invariants

Where practical, test invariants such as:

```text
parser never returns negative servings
parser never returns negative duration
parser never creates ingredients from instruction-region numbers
parser never creates metadata from instruction-region times
parser never silently drops a non-empty ingredient line in a recognized Ingredients region
parser never merges two explicitly numbered instruction steps
parser never invents a title when title source is absent
Yield never overwrites Servings
parenthetical packaging never overwrites leading primary amount
```

These invariants are more valuable than attempting to support every formatting style on day one.

---

# Implementation Constraints

## 51. Security

The parser processes user-controlled text.

Requirements:

- enforce a reasonable maximum input length at the API boundary;
- never execute pasted content;
- avoid catastrophic-backtracking regexes;
- bound regex work;
- treat HTML-like content as untrusted text;
- use existing authenticated API dependencies;
- never use `eval`, shell commands, or dynamic code execution.

---

## 52. Performance

The deterministic parser should run synchronously during normal request processing.

Do not add:

- background jobs;
- queues;
- external model calls;
- embeddings;
- vector search;
- OCR.

Normal recipe text should feel effectively immediate to the user.

---

## 53. Logging

Useful non-content diagnostics:

```text
input_character_count
line_count
metadata_fields_detected
ingredient_count
instruction_count
unmapped_metadata_count
parse_status
parse_duration_ms
```

Do not log complete raw recipe text by default in production.

Use sanitized/local fixtures for regression tests.

---

## 54. Recommended Module Boundary

Adapt names to the existing FastAPI project.

Conceptually:

```text
import endpoint
    ↓
text normalizer
    ↓
metadata parser
    ↓
section parser
    ↓
ingredient parser
    ↓
instruction parser
    ↓
normalizer / adapter
    ↓
existing RecipeForm/Create-compatible response
```

Possible conceptual functions:

```python
normalize_recipe_text(text)
parse_metadata(lines)
find_recipe_sections(lines)
parse_ingredient_line(line)
parse_ingredients(lines)
parse_instructions(lines)
normalize_import_result(...)
```

These names are illustrative.

Do not create a class/file for every function if the current backend style favors a simpler module. Separation of concerns matters; abstraction for its own sake does not.

---

## 55. Recommended Implementation Order

```text
1. Add peach-pie golden fixture as a failing test.
2. Implement newline/whitespace normalization.
3. Implement metadata label/value parsing.
4. Implement top-level section detection.
5. Implement numbered instruction boundaries.
6. Implement one-line-per-ingredient extraction.
7. Implement leading amount/fraction parser.
8. Reuse existing unit aliases.
9. Implement parenthetical packaging protection.
10. Implement comma / "or to taste" preservation.
11. Implement unsupported metadata preservation through existing Notes.
12. Normalize into current RecipeForm-compatible response.
13. Make the golden fixture pass.
14. Add edge-case regression tests.
15. Integrate into the existing Import from Text mutation.
```

Do not start with a giant all-in-one regex.

---

## 56. Explicit Non-Goals

MVP deterministic parsing does not include:

- LLM extraction;
- OpenAI/Gemini/Anthropic calls;
- third-party recipe parsing APIs;
- embeddings;
- semantic classification;
- OCR;
- image understanding;
- website scraping;
- PDF parsing;
- DOCX parsing;
- automatic translation;
- automatic recipe rewriting;
- automatic unit conversion on import;
- automatic nutrition calculation;
- multi-recipe batch import;
- probabilistic title generation.

---

## 57. Acceptance Criteria

- [ ] Parser is deterministic and requires no external model/API.
- [ ] Parser reuses current Noomori recipe/unit/form contracts.
- [ ] No parallel persisted recipe model is introduced.
- [ ] Raw input normalization is deterministic.
- [ ] Metadata supports both two-line and inline label/value formats.
- [ ] Prep Time maps to existing prep minutes.
- [ ] Cook Time maps to existing cook minutes.
- [ ] Servings maps to existing canonical servings.
- [ ] Yield never overwrites Servings.
- [ ] Meaningful unsupported metadata is not silently lost.
- [ ] Total Time does not overwrite Prep/Cook.
- [ ] Ingredients are not dropped because of blank lines.
- [ ] Unicode fractions are parsed.
- [ ] Parenthetical package sizes do not overwrite primary amount/unit.
- [ ] Hyphenated ingredient text remains intact.
- [ ] `or to taste` is preserved.
- [ ] Numbered instruction boundaries are preserved.
- [ ] Multi-sentence numbered steps remain one step.
- [ ] Semicolons do not split steps.
- [ ] Numbers/times/temperatures inside instructions do not mutate metadata.
- [ ] Missing title remains empty.
- [ ] Partial parse proceeds to Import Review.
- [ ] Multiple recipes are not silently merged.
- [ ] No invented recipe data is produced.
- [ ] Golden peach-pie fixture yields exactly 10 ingredients.
- [ ] Golden peach-pie fixture yields exactly 9 instruction steps.
- [ ] Parser test suite covers the required edge cases.

---

## 58. Final Rule

> **Structure may be incomplete, but source meaning must not be silently destroyed or invented.**

For Noomori MVP, a conservative editable draft is better than an aggressive parser that appears smart but corrupts recipe data.
