# Noomori — Recipe Unit Conversion Specification

**Status:** Implementation-aligned MVP specification  
**Feature:** Recipe measurement conversion  
**Product:** Noomori  
**Platform:** Expo / React Native  
**Scope:** MVP  

---

# 1. Purpose

This document specifies the MVP behavior for converting recipe ingredient measurements between:

```text
Original | Metric | US
```

The conversion system must be deterministic, display-only, dimension-safe, reversible, and compatible with Noomori's current canonical recipe model.

The feature must not mutate saved recipe measurements.

---

# 2. Core Invariant

> The saved recipe remains the source of truth. Unit conversion only derives a display representation.

Example saved ingredient:

```text
amount = 2
unit = cup
name = milk
```

Metric display may show:

```text
473 ml milk
```

but persistence remains:

```text
2 cups milk
```

Switching repeatedly between modes must never modify the saved recipe or introduce rounding drift.

---

# 3. Existing Code Alignment

Before implementation, inspect and reuse the current:

- ingredient amount type;
- unit type / canonical unit IDs;
- custom-unit behavior;
- serving scaling implementation;
- Recipe Detail ingredient renderer;
- fraction formatting utilities;
- recipe domain utilities.

Do not create a second persisted measurement model.

The exact existing code names are authoritative.

---

# 4. User-Facing Modes

Recipe Detail exposes:

```text
Original | Metric | US
```

Use `US`, not `Imperial`.

Noomori's MVP US mode uses US customary cooking measurements such as:

```text
cup
tbsp
tsp
fl oz
oz
lb
```

US customary and British Imperial units are not identical.

Default mode:

```text
Original
```

---

# 5. Original Mode

`Original` displays the measurement exactly according to the canonical saved ingredient.

Example:

```text
500 g chicken
2 tbsp oil
1 cup rice
```

must remain mixed in Original mode.

Do not normalize Original into Metric or US.

---

# 6. Supported Convertible Dimensions

MVP supports:

```text
mass
volume
```

Allowed:

```text
mass → mass
volume → volume
```

Forbidden:

```text
mass → volume
volume → mass
```

Examples:

```text
8 oz chicken → grams      ✅
2 cups milk → ml          ✅

1 cup flour → grams       ❌
200 g flour → cups        ❌
```

---

# 7. Why Mass ↔ Volume Is Out of Scope

Converting volume to mass requires ingredient-specific density.

For example:

```text
1 cup water
1 cup flour
1 cup butter
```

have different masses.

Supporting ingredient-aware conversion would require:

- ingredient identity matching;
- density data;
- preparation-state handling;
- packing assumptions;
- regional conventions.

Do not introduce this complexity for MVP.

---

# 8. Non-Convertible Units

Units representing counts or contextual quantities remain unchanged.

Examples:

```text
egg
piece
clove
slice
package
can
bunch
pinch
custom units
```

Examples:

```text
2 cloves garlic
1 egg
1 package pasta
salt to taste
```

must remain unchanged in Metric and US modes.

---

# 9. Canonical Base Units

Use:

```text
mass   → gram
volume → milliliter
```

Generic conversion:

```text
base_value =
  amount × source_unit.to_base

target_value =
  base_value ÷ target_unit.to_base
```

Always calculate from canonical numeric data, never from formatted display strings.

---

# 10. Authoritative Conversion Constants

## Mass

```text
1 g  = 1 g
1 kg = 1000 g

1 oz = 28.349523125 g
1 lb = 453.59237 g
```

## Volume

```text
1 ml = 1 ml
1 L  = 1000 ml

1 US tsp   = 4.92892159375 ml
1 US tbsp  = 14.78676478125 ml
1 US fl oz = 29.5735295625 ml
1 US cup   = 236.5882365 ml
```

Use one centralized conversion table.

Do not mix US customary cups with metric cups, Australian tablespoons, or British Imperial fluid ounces.

---

# 11. Unit Registry

Reuse Noomori's current unit model if equivalent metadata already exists.

Conceptually:

```ts
type UnitDimension =
  | "mass"
  | "volume"
  | "count"
  | "custom";

type UnitSystem =
  | "metric"
  | "us"
  | "neutral";

type UnitDefinition = {
  id: string;
  dimension: UnitDimension;
  system: UnitSystem;
  toBase: number | null;
};
```

This is illustrative only.

Do not add these types if the existing code already represents the same information.

---

# 12. Persistence

Persist only canonical recipe data.

Do not add:

```text
metric_amount
metric_unit
us_amount
us_unit
converted_amount
converted_unit
```

These are derived display values.

---

# 13. Required Calculation Order

The required order is:

```text
canonical saved amount
        ↓
serving scaling
        ↓
unit conversion
        ↓
display formatting
```

This order must not change.

---

# 14. Serving Scaling

Example:

Saved:

```text
4 servings
2 cups milk
```

User selects:

```text
8 servings
```

Scale first:

```text
2 × (8 / 4)
= 4 cups
```

Then Metric conversion:

```text
4 cups
→ 946.352946 ml
```

Then display formatting:

```text
946 ml
```

Never:

```text
convert
→ round
→ scale
```

---

# 15. No Rounding Drift

Every measurement display must derive from the stable canonical amount.

Correct:

```text
canonical
→ Metric

canonical
→ US

canonical
→ Original
```

Incorrect:

```text
Metric rounded value
→ convert to US
→ convert back to Metric
```

Likewise repeated serving changes must derive from the canonical serving snapshot already used by Noomori.

---

# 16. Metric Target Selection — Mass

After converting to grams:

```text
< 1000 g
→ g

>= 1000 g
→ kg
```

Examples:

```text
500 g
→ 500 g

1500 g
→ 1.5 kg
```

Automatic mg selection is not required for MVP.

---

# 17. Metric Target Selection — Volume

After converting to milliliters:

```text
< 1000 ml
→ ml

>= 1000 ml
→ L
```

Examples:

```text
236.588 ml
→ 237 ml

1500 ml
→ 1.5 L
```

---

# 18. US Target Selection — Mass

Convert to ounces first.

Recommended deterministic rule:

```text
< 16 oz
→ oz

>= 16 oz
→ lb
```

Examples:

```text
200 g
→ ~7.1 oz

500 g
→ ~1.1 lb
```

---

# 19. US Target Selection — Volume

Recommended automatic targets:

```text
very small volume
→ tsp

small volume
→ tbsp

larger recipe volume
→ cup
```

Initial deterministic thresholds:

```text
< 3 tsp equivalent
→ tsp

>= 3 tsp and < 4 tbsp equivalent
→ tbsp

>= 4 tbsp equivalent
→ cup
```

`fl oz` is supported by the conversion table but does not need to be automatically selected in MVP.

---

# 20. Formatting Is Separate From Conversion

Keep:

```text
raw converted numeric amount
```

separate from:

```text
display amount
```

Example:

```text
raw:
2.028841...

display:
2 tbsp
```

Do not overwrite raw calculation data with the formatted amount.

---

# 21. Metric Display Precision

Do not use aggressive magnitude-based rounding.

Canonical values and raw converted values must retain full calculation precision.

Display formatting exists only to remove excessive derived precision.

Example:

```text
1 US cup
= 236.5882365 ml internally
→ 236.6 ml for display
```

Do NOT display:

```text
237 ml
```

when a single decimal can preserve more useful precision without harming readability.

Recommended MVP display precision:

## Metric volume

```text
>= 10 ml
→ 1 decimal place when conversion produced a fractional value

1 ml to < 10 ml
→ up to 2 decimal places

< 1 ml
→ preserve enough decimal places to avoid materially changing the value
```

Examples:

```text
1 cup
236.5882365 ml
→ 236.6 ml

1/2 cup
118.29411825 ml
→ 118.3 ml

1/4 cup
59.147059125 ml
→ 59.1 ml

1 tbsp
14.78676478125 ml
→ 14.8 ml

1 tsp
4.92892159375 ml
→ 4.93 ml

1/4 tsp
1.2322303984375 ml
→ 1.23 ml
```

## Metric mass

Mass can be especially precision-sensitive for baking, salt, yeast, spices, coffee, gelatin, and other small quantities.

Use a conservative display policy:

```text
>= 10 g
→ up to 2 decimal places when needed

1 g to < 10 g
→ up to 3 decimal places when needed

< 1 g
→ prefer a more readable supported unit such as mg when appropriate,
   otherwise preserve enough decimals to avoid material information loss
```

Examples:

```text
28.349523125 g
→ 28.35 g

3.543690390625 g
→ 3.544 g

0.25 g
→ 250 mg
```

If no conversion is required because the stored unit already matches the target system, preserve the original amount representation wherever possible.

Example:

```text
stored: 100.125 g
Metric: 100.125 g
```

Do not reformat it to:

```text
100.13 g
```

merely because a generic formatter exists.

Remove unnecessary trailing zeroes only from derived display values.

---

# 22. US Mass Display Precision

Do not aggressively round converted mass.

Canonical and raw converted values remain full precision.

For derived US display values, preserve enough precision to avoid materially changing small recipe quantities.

Recommended MVP policy:

```text
oz
→ up to 3 decimal places when needed

lb
→ up to 3 decimal places when needed
```

Examples:

```text
500 g
→ raw 1.10231131 lb
→ display 1.102 lb

200 g
→ raw 7.05479239 oz
→ display 7.055 oz
```

For larger everyday quantities, the formatter may omit unnecessary trailing digits when doing so does not materially change the measurement.

If the original stored unit is already US, preserve the original amount representation wherever possible.

---

# 23. US Cooking Fractions

For:

```text
tsp
tbsp
cup
```

prefer common cooking fractions when sufficiently close.

Supported display fractions:

```text
1/8
1/4
1/3
1/2
2/3
3/4
```

Support mixed values:

```text
1 1/2
2 1/4
```

The UI may render Unicode forms:

```text
½
¼
⅓
⅔
¾
```

while canonical numeric data remains numeric.

---

# 24. Fraction Snapping

Cooking fractions are a display convenience, not permission to materially alter the recipe.

Use deterministic and conservative tolerance.

Conceptually:

```text
nearest supported fraction
        ↓
display error within strict tolerance?
        ↓
yes → display fraction
no  → display decimal
```

Do not use a loose universal tolerance such as `0.03` without validating relative error.

The formatter should prefer the fraction only when the difference is negligible for the converted amount.

Example:

```text
0.2498 cup
→ 1/4 cup
```

may be acceptable.

But:

```text
0.29 cup
```

must NOT become:

```text
1/4 cup
```

or:

```text
1/3 cup
```

unless the selected fraction satisfies the explicit display-error policy.

For MVP, tests should verify both absolute and relative error behavior for small measurements.

---

# 25. Unknown / Custom Units

If a unit is not convertible:

```text
preserve original amount + unit
```

Example:

```text
2 scoops protein powder
```

remains unchanged.

Never guess the volume or mass of a custom unit.

---

# 26. Missing Amount

If:

```text
amount = null
```

do not attempt conversion.

Examples:

```text
salt to taste
oil as needed
```

remain unchanged.

---

# 27. Unit Aliases

Parser aliases should normalize before conversion.

Example:

```text
tablespoon
tablespoons
tbsp
```

should map to one canonical unit ID before entering the converter.

The converter should operate on canonical units, not repeatedly parse raw strings.

---

# 28. Parser Boundary

Import parsing and unit conversion are separate responsibilities.

Parser:

```text
"2 tablespoons butter"
        ↓
amount = 2
unit = tablespoon
name = butter
```

Converter:

```text
2 tablespoons
        ↓
Metric
        ↓
~30 ml
```

Do not place Recipe Detail conversion logic inside the deterministic import parser.

---

# 29. Recipe Form Boundary

Create/Edit continues to edit canonical recipe measurements.

MVP conversion is a read/display feature in Recipe Detail.

Do not make RecipeForm values mutate according to the selected Recipe Detail unit mode.

Converted editing is out of scope.

---

# 30. Recipe Detail State

Conceptually:

```ts
type MeasurementDisplayMode =
  | "original"
  | "metric"
  | "us";
```

Use existing project conventions.

For MVP, this may remain local Recipe Detail UI state.

Do not add a persisted user preference solely for this feature.

---

# 31. UI

Suggested control:

```text
Original | Metric | US
```

Requirements:

- selected mode is visually clear;
- switching is immediate;
- no network request;
- no persistence mutation;
- ingredient names remain unchanged;
- ingredient notes remain unchanged;
- only structured amount/unit display changes.

---

# 32. Conversion Failure Semantics

One unsupported ingredient must not fail the entire recipe.

Example:

```text
500 g chicken
2 mystery-scoops spice
250 ml milk
```

Metric/US should:

```text
convert supported ingredients
preserve unsupported ingredient
```

No recipe-level error is required.

---

# 33. Mixed-System Example

Stored recipe:

```text
500 g chicken
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

## Original

```text
500 g chicken
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

## Metric

```text
500 g chicken
30 ml oil
237 ml rice
2 cloves garlic
salt to taste
```

## US

```text
1.1 lb chicken
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

---

# 34. Flour Boundary

Stored:

```text
1 cup flour
```

Metric:

```text
237 ml flour
```

Not:

```text
120 g flour
```

The converter preserves physical dimension.

---

# 35. Butter Boundary

Stored:

```text
2 tbsp butter
```

Metric:

```text
~30 ml butter
```

Not:

```text
~28 g butter
```

because the latter is volume → mass.

---

# 36. Count Unit Example

Stored:

```text
3 eggs
```

All modes:

```text
3 eggs
```

---

# 37. Package Unit Example

Stored:

```text
1 package pie crust
```

All modes:

```text
1 package pie crust
```

Package sizes embedded in free-text notes are not converted.

---

# 38. Free-Text Notes Are Not Converted

Only structured:

```text
ingredient.amount
ingredient.unit
```

participate.

Do not rewrite units appearing inside:

```text
ingredient.name
ingredient.note
instruction text
recipe notes
source text
```

Example:

```text
note = "one 14 oz can"
```

remains unchanged.

---

# 39. Instructions Are Not Converted

Do not rewrite:

```text
Bake at 350°F
Add 1 cup water
Use a 9-inch pan
```

inside instruction text.

Temperature, free-text measurement, and pan-size conversion are separate features.

---

# 40. Temperature Conversion

Out of scope.

Do not automatically convert:

```text
°F ↔ °C
```

in MVP.

---

# 41. Length Conversion

Out of scope.

Do not convert:

```text
inch ↔ cm
```

inside free text.

---

# 42. Nutrition

Measurement conversion must not alter nutrition values.

Nutrition behavior remains independent.

---

# 43. Performance

Conversion is local deterministic derivation.

Do not add:

- backend calls;
- database updates;
- external services;
- background jobs;
- custom caching infrastructure.

Normal recipe conversion should feel immediate.

---

# 44. Architecture Boundary

Recommended conceptual pipeline:

```text
canonical recipe
      ↓
serving scaler
      ↓
measurement converter
      ↓
measurement formatter
      ↓
Recipe Detail renderer
```

Responsibilities should remain separate.

---

# 45. Suggested Domain Functions

Conceptually:

```ts
scaleIngredientAmount(...)
convertMeasurement(...)
selectMetricTargetUnit(...)
selectUsTargetUnit(...)
formatRecipeMeasurement(...)
```

Adapt names and module boundaries to the current codebase.

Do not create unnecessary abstractions.

---

# 46. Golden Conversion Tests

## Mass

```text
1000 g
Metric → 1 kg
US → ~2.2 lb
```

```text
500 g
Metric → 500 g
US → ~1.1 lb
```

```text
8 oz
Metric → ~227 g
US → 8 oz
```

```text
1 lb
Metric → ~454 g
US → 1 lb
```

## Volume

```text
1 cup
Metric → ~237 ml
US → 1 cup
```

```text
2 tbsp
Metric → ~30 ml
US → 2 tbsp
```

```text
1 tsp
Metric → ~4.93 ml
US → 1 tsp
```

```text
1000 ml
Metric → 1 L
US → readable cup representation
```

## Neutral

```text
2 cloves
Metric → 2 cloves
US → 2 cloves
```

```text
1 package
Metric → 1 package
US → 1 package
```

---

# 47. Mathematical Unit Tests

Use tolerance-based assertions for raw conversions.

At minimum:

```text
1 oz → 28.349523125 g
1 lb → 453.59237 g
1 cup → 236.5882365 ml
1 tbsp → 14.78676478125 ml
1 tsp → 4.92892159375 ml
```

Test raw conversion independently from formatting.

---

# 48. Serving + Conversion Regression Test

Canonical:

```text
servings = 4
amount = 2 cups
```

Display:

```text
8 servings + Metric
→ scale to 4 cups
→ convert from 4 cups
```

Then:

```text
8 servings + US
```

must derive again from canonical.

Then:

```text
4 servings + Metric
```

must derive again from canonical.

Assert no accumulated rounding drift.

---

# 49. Formatting Tests

At minimum:

```text
236.5882365 ml → 236.6 ml
118.29411825 ml → 118.3 ml
59.147059125 ml → 59.1 ml
14.78676478125 ml → 14.8 ml
4.92892159375 ml → 4.93 ml
1.2322303984375 ml → 1.23 ml

1500 ml → 1.5 L
1500 g → 1.5 kg
28.349523125 g → 28.35 g
3.543690390625 g → 3.544 g
0.25 g → 250 mg when mg target selection is supported

0.5 cup → 1/2 cup
1.5 cup → 1 1/2 cups
0.25 cup → 1/4 cup
```

Also assert that a non-zero converted amount never formats to zero.

If Unicode fractions are used, test rendering separately from numeric representation.

---

# 50. Edge Cases

## EC-01 — Mixed systems

Original may contain Metric and US together.

## EC-02 — Unknown unit

Leave unchanged.

## EC-03 — Custom unit

Leave unchanged unless the canonical registry explicitly supports conversion.

## EC-04 — Missing amount

Leave unchanged.

## EC-05 — Fraction

Canonical numeric fraction converts normally.

## EC-06 — Very large mass

Use kg/lb thresholds.

## EC-07 — Very large volume

Use L/cup thresholds.

## EC-08 — Flour measured by volume

Remain volume when converting.

## EC-09 — Ingredient measured by mass

Remain mass when converting.

## EC-10 — Count ingredient

Never convert.

## EC-11 — Package note contains unit

Do not rewrite note.

## EC-12 — Measurement inside instruction

Do not rewrite.

## EC-13 — Temperature inside instruction

Do not rewrite.

## EC-14 — Repeated mode switching

No rounding drift.

## EC-15 — Repeated serving changes

Always derive from canonical amount.

## EC-16 — Serving and unit-mode changes interleaved

Order remains:

```text
scale → convert → format
```

## EC-17 — Unsupported ingredient

Other ingredients still convert.

## EC-18 — Recipe has no convertible ingredients

Recipe remains fully usable.

## EC-19 — Floating-point boundary near 1000 g/ml

Target selection must be deterministic.

## EC-20 — Floating-point value near a cooking fraction

Fraction snapping follows explicit tolerance.

---

# 51. Core Invariants

The following must always hold:

```text
1. Conversion never mutates persisted recipe data.
2. Original always represents the saved measurement.
3. Mass converts only to mass.
4. Volume converts only to volume.
5. Count/custom units remain unchanged.
6. Free text is never rewritten.
7. Serving scaling happens before conversion.
8. Formatting happens after conversion.
9. Canonical values are never rounded by the conversion feature.
10. Raw converted values retain full calculation precision.
11. Display formatting may remove only excessive derived precision.
12. A non-zero converted amount must never format to zero.
13. Display rounding must not materially change small recipe quantities.
14. Repeated switching cannot create rounding drift.
15. Unsupported ingredients cannot break recipe rendering.
16. Conversion requires no network request.
```

---

# 52. Explicit Non-Goals

MVP does not include:

- ingredient density database;
- cup flour → grams;
- grams flour → cups;
- semantic ingredient recognition;
- temperature conversion;
- pan-size conversion;
- length conversion;
- instruction rewriting;
- Notes rewriting;
- conversion of measurements embedded in free text;
- British Imperial mode;
- regional cup preferences;
- Australian tablespoon support;
- global user measurement preference;
- persisted display mode;
- backend conversion endpoint;
- external conversion API;
- LLM-assisted conversion.

---

# 53. Codex Implementation Instructions

Before implementation, inspect:

1. current ingredient amount type;
2. current unit IDs/aliases;
3. existing unit conversion utilities, if any;
4. serving scaling logic;
5. Recipe Detail ingredient renderer;
6. Recipe Detail state ownership;
7. existing fraction formatter;
8. current segmented-control/tab primitive;
9. serving-scaling tests.

Then prefer:

```text
reuse
→ extend minimally
→ add domain conversion utility
→ add Recipe Detail display mode
```

Do not:

```text
replace the ingredient model
persist converted values
move conversion to backend
refactor parser unnecessarily
```

---

# 54. Implementation Order

Recommended:

```text
1. Inspect/reuse unit registry.
2. Add dimension/base-factor metadata only if missing.
3. Implement raw same-dimension conversion.
4. Add Metric target selection.
5. Add US target selection.
6. Add display formatter.
7. Add cooking-fraction formatter.
8. Integrate after serving scaling.
9. Add Original / Metric / US UI.
10. Add mathematical unit tests.
11. Add serving + conversion regression tests.
12. Add edge-case tests.
```

Do not begin with UI before conversion-domain tests pass.

---

# 55. Acceptance Criteria

## Architecture

- [ ] Existing canonical ingredient model remains authoritative.
- [ ] Converted values are not persisted.
- [ ] No second measurement model is introduced.
- [ ] Existing unit registry is reused where possible.
- [ ] Existing serving scaling is reused.

## Modes

- [ ] Recipe Detail supports Original.
- [ ] Recipe Detail supports Metric.
- [ ] Recipe Detail supports US.
- [ ] Default is Original.
- [ ] Switching requires no network request.

## Conversion

- [ ] Mass converts only to mass.
- [ ] Volume converts only to volume.
- [ ] Count/custom units remain unchanged.
- [ ] Unknown units remain unchanged.
- [ ] Free text is not rewritten.
- [ ] Instructions are not rewritten.
- [ ] Temperature is not converted.
- [ ] Length is not converted.

## Precision

- [ ] Raw conversion uses authoritative constants.
- [ ] Canonical values are never rounded.
- [ ] Raw converted values retain full calculation precision.
- [ ] Display precision is separate from conversion.
- [ ] `1 cup` converts internally to `236.5882365 ml` and displays as `236.6 ml`, not `237 ml`.
- [ ] Small non-zero values never collapse to zero.
- [ ] Existing target-system source precision is preserved where possible.
- [ ] Repeated switching creates no drift.
- [ ] Fraction snapping uses conservative deterministic error limits.

## Serving Interaction

- [ ] Serving scaling happens before conversion.
- [ ] Conversion always derives from canonical amounts.
- [ ] Repeated serving changes create no accumulated error.

## UI

- [ ] Selected mode is visually clear.
- [ ] Ingredient names remain unchanged.
- [ ] Ingredient notes remain unchanged.
- [ ] Unsupported ingredients render normally.
- [ ] A single unsupported ingredient cannot break the recipe.

## Testing

- [ ] Conversion constants have unit tests.
- [ ] Target-unit selection has unit tests.
- [ ] Formatting has unit tests.
- [ ] Serving + conversion interaction has regression tests.
- [ ] Edge cases in this specification are covered.

---

# 56. MVP Decision Summary

Noomori MVP conversion is:

```text
Original | Metric | US
```

with:

```text
canonical saved measurement
        ↓
serving scaling
        ↓
same-dimension conversion
        ↓
precision-preserving display formatting
```

Precision policy:

```text
canonical value
→ never rounded

raw converted value
→ full calculation precision

display value
→ remove excessive derived precision only
→ preserve meaningful small quantities
→ never collapse non-zero values to zero
```

Example:

```text
1 US cup
→ 236.5882365 ml internally
→ 236.6 ml displayed
```

not:

```text
237 ml
```

Boundaries:

```text
mass ↔ mass        supported
volume ↔ volume    supported

mass ↔ volume      unsupported
count/custom       unchanged
free text          unchanged
temperature        unchanged
length             unchanged
```

This provides deterministic conversion while preserving recipe precision and avoiding false precision from long conversion constants.
