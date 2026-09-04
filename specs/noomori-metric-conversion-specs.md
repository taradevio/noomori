# Noomori — Recipe Metric / Unit Conversion Specification

**Status:** Implementation-aligned MVP specification  
**Feature:** Recipe measurement conversion  
**Product:** Noomori  
**Platform:** Expo / React Native  
**Scope:** MVP  
**Compatibility requirement:** Extend the current codebase only; do not introduce replacement domain types, parser models, persistence fields, or duplicate conversion abstractions.

---

# 1. Purpose

This specification defines the behavior for displaying structured recipe ingredient measurements in:

```text
Original | Metric | US
```

The implementation must align with Noomori's current recipe model, parser, unit representation, serving-scaling behavior, Recipe Detail renderer, and existing utilities.

The feature is a **display derivation**, not a new persisted measurement model.

Primary product requirements:

```text
1. Saved recipe data remains authoritative.
2. Original mode does not change the ingredient's measurement system.
3. Fractions must not display as unwanted decimals when a clean cooking fraction exists.
4. Metric conversion follows NIST Metric Kitchen cooking equivalencies.
5. Conversion never crosses physical dimensions.
6. Existing types/functions are reused instead of replaced.
```

---

# 2. Current Codebase Is Authoritative

Before implementing this specification, inspect the current codebase and reuse the exact existing names and structures for:

- recipe form/draft type;
- persisted recipe type;
- ingredient type;
- ingredient `amount`;
- ingredient `unit`;
- unit IDs / aliases / registry;
- custom-unit handling;
- serving-scaling implementation;
- Recipe Detail ingredient renderer;
- fraction-formatting utility, if present;
- recipe-domain utilities;
- existing UI state conventions;
- existing test conventions.

The exact existing names are authoritative.

This specification intentionally does **not** require types such as:

```text
ParsedQuantity
QuantityValue
IngredientMeasurement
MeasurementSystem
UnitDefinition
```

and does **not** require functions such as:

```text
parseQuantity()
convertMeasurement()
formatGeneratedMetricMeasurement()
```

If equivalent concepts already exist, extend or reuse them.

Do not rename existing types/functions merely to match wording in this document.

---

# 3. Explicit No-Refactor Rule

This feature must not require replacing or restructuring:

- the canonical Recipe model;
- the existing ingredient storage shape;
- the existing numeric amount representation;
- the current unit representation;
- RecipeForm / RecipeDraft state;
- the existing deterministic import parser;
- `POST /recipes`;
- the existing Recipe Detail data-fetching flow;
- serving scaling;
- current navigation;
- backend persistence;
- Supabase schema.

Preferred implementation strategy:

```text
reuse existing behavior
→ minimally extend existing unit/fraction utilities
→ add conversion derivation where missing
→ integrate into existing Recipe Detail renderer
```

Not:

```text
design new measurement domain model
→ migrate ingredient schema
→ refactor parser
→ refactor RecipeForm
→ implement conversion
```

---

# 4. Existing Canonical Ingredient Convention

The implementation must continue using the current canonical ingredient concepts:

```text
amount?
unit?
name
note?
```

No second ingredient measurement representation should be persisted.

Example canonical ingredient:

```text
amount = 0.75
unit = existing canonical cup identity
name = milk
note = null
```

This remains valid.

The conversion feature must consume the existing `amount` and `unit` representation rather than requiring a replacement structure.

---

# 5. Important Fraction Decision

The deterministic parser currently normalizes fractions into the existing canonical numeric amount representation.

Examples:

```text
1/2 → amount = 0.5
1/4 → amount = 0.25
3/4 → amount = 0.75
1 1/2 → amount = 1.5
```

Keep this behavior.

Do **not** change the canonical `amount` type merely to preserve fraction syntax.

Do **not** add:

```text
amount_raw
quantity_raw
fraction_numerator
fraction_denominator
original_quantity_text
```

solely for this feature.

The problem:

```text
3/4 cup
→ parser
→ 0.75 cup
→ UI displays 0.75 cup
```

must be fixed at the **display formatting layer**, not by replacing the parser's canonical numeric representation.

---

# 6. Meaning of Original Mode

`Original` means:

> Keep the saved ingredient's existing amount/unit semantics and measurement system. Do not convert it to Metric or US.

Example saved ingredient:

```text
amount = 0.75
unit = cup
```

Original mode must remain:

```text
cup
```

and must not become:

```text
180 ml
```

because that would be a measurement-system conversion.

For amounts that correspond cleanly to standard cooking fractions, Original display should use the existing fraction formatter or extend the existing display formatter minimally.

Required:

```text
0.5 cup  → 1/2 cup
0.75 cup → 3/4 cup
1.5 cup  → 1 1/2 cups
0.25 cup → 1/4 cup
```

Therefore, pasted:

```text
3/4 cup milk
```

may be stored canonically as:

```text
amount = 0.75
unit = cup
```

but Recipe Detail Original mode must display:

```text
3/4 cup milk
```

rather than:

```text
0.75 cup milk
```

---

# 7. Lexical Preservation Boundary

Because the current canonical amount representation is numeric, this MVP does **not** require preserving the exact original characters after persistence.

For example, unless the current code already stores raw source representation, the persisted model does not need to distinguish:

```text
3/4
¾
0.75
```

when all three represent:

```text
amount = 0.75
```

Do not introduce a new persisted raw-quantity field solely to distinguish them.

The MVP requirement is:

```text
clean cooking quantity
→ clean cooking display
```

not:

```text
byte-for-byte reconstruction of pasted source syntax
```

If existing code already preserves raw source text, it may continue doing so.

---

# 8. User-Facing Modes

Recipe Detail supports:

```text
Original | Metric | US
```

Default:

```text
Original
```

Use:

```text
US
```

not:

```text
Imperial
```

for the MVP UI.

British Imperial and US Customary measurements are not numerically identical.

The exact local state name/type must follow existing project conventions.

Do not add a persisted measurement preference solely for MVP unless one already exists.

---

# 9. MVP Convertible Dimensions

MVP supports structured ingredient:

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
8 oz chicken → g      ✅
500 g chicken → oz    ✅

2 cups milk → ml      ✅
500 ml milk → cup     ✅

1 cup flour → g       ❌
200 g flour → cup     ❌
```

---

# 10. Temperature Is Out of Scope

Do not add temperature conversion as part of this feature.

Out of scope:

```text
°F ↔ °C
```

especially when temperatures occur inside instruction free text.

Example:

```text
Bake at 350°F.
```

must remain unchanged.

Temperature conversion may be specified separately later.

---

# 11. Free Text Is Out of Scope

Only the existing structured ingredient:

```text
amount
unit
```

participates in conversion.

Do not rewrite measurements appearing inside:

- ingredient `name`;
- ingredient `note`;
- recipe Notes;
- instruction text;
- source text;
- packaging descriptors.

Example:

```text
amount = 1
unit = package
name = pie crust
note = "14.1 ounce/2 count"
```

The package note remains unchanged.

---

# 12. Parser and Converter Must Stay Separate

The deterministic Import from Text parser remains responsible for:

```text
source text
→ existing canonical amount
→ existing canonical unit
→ ingredient name/note
```

Example:

```text
"3/4 cup milk"
        ↓
amount = 0.75
unit = existing cup identity
name = milk
```

The conversion/display feature is responsible for:

```text
canonical amount + unit
        ↓
selected display mode
        ↓
display amount + display unit
```

Do not put Recipe Detail unit-conversion policy inside the deterministic text parser.

---

# 13. Required Calculation Order

Reuse the existing serving-scaling behavior.

Required order:

```text
canonical saved amount
        ↓
existing serving scaling
        ↓
measurement conversion, when selected
        ↓
display formatting
```

Never:

```text
display-round
→ save
→ scale rounded value
```

Never:

```text
Metric display
→ convert displayed result back to US
```

Every mode must derive from the canonical saved amount.

---

# 14. No Rounding Drift

Correct:

```text
canonical amount
→ Original display

canonical amount
→ serving scale
→ Metric display

canonical amount
→ serving scale
→ US display
```

Incorrect:

```text
canonical
→ Metric rounded display
→ US conversion
→ Metric conversion
```

Repeated switching:

```text
Original → Metric → US → Metric → Original
```

must not mutate persisted data and must not accumulate rounding drift.

---

# 15. Metric Kitchen Policy

For Recipe Detail Metric mode, use **NIST Metric Kitchen cooking equivalencies** as the user-facing conversion policy.

This is deliberately different from exposing full-precision mathematical US-customary relationships.

Preferred cooking equivalents:

```text
1/4 tsp → 1.25 ml
1/2 tsp → 2.5 ml
1 tsp   → 5 ml
1 tbsp  → 15 ml
1 fl oz → 30 ml

1/4 cup → 60 ml
1/3 cup → 80 ml
1/2 cup → 120 ml
3/4 cup → 180 ml
1 cup   → 240 ml

2 cups / 1 pint  → 480 ml
3 cups           → 720 ml
4 cups / 1 quart → 950 ml
```

Mass cooking equivalents:

```text
1 oz   → 28 g
4 oz   → 114 g
1 lb   → 454 g
2.2 lb → 1 kg
```

These are practical kitchen equivalents.

---

# 16. Do Not Mix Conversion Policies

Do not use:

```text
1 cup → 236.5882365 ml
```

while also using:

```text
1 tbsp → 15 ml
```

within the same Metric kitchen mode.

That mixes exact unit math with NIST cooking approximations.

Noomori Metric mode should consistently follow its chosen kitchen-equivalency policy.

Therefore:

```text
1 cup → 240 ml
3/4 cup → 180 ml
```

not:

```text
1 cup → 236.6 ml
3/4 cup → 177.4 ml
```

for this MVP display mode.

---

# 17. Linear Scaling of Kitchen Equivalencies

When an exact NIST table quantity exists, use it directly.

Examples:

```text
1 cup → 240 ml
1/2 cup → 120 ml
1 tbsp → 15 ml
```

For quantities between table entries, linearly scale the same kitchen factor.

Examples:

```text
1.5 cups
→ 1.5 × 240
→ 360 ml
```

```text
2.5 tsp
→ 2.5 × 5
→ 12.5 ml
```

```text
0.1 cup
→ 0.1 × 240
→ 24 ml
```

Do not switch to a different conversion standard for non-table quantities.

---

# 18. Metric Display Precision

Do not cosmetically round valid kitchen values just to remove decimals.

Correct:

```text
1/4 tsp → 1.25 ml
1/2 tsp → 2.5 ml
2.5 tsp → 12.5 ml
```

Incorrect:

```text
1.25 ml → 1 ml
2.5 ml → 3 ml
12.5 ml → 13 ml
```

A non-zero converted amount must never display as zero.

Bad:

```text
0.25 tsp
→ 1.25 ml
→ 0 ml
```

This must never happen.

---

# 19. Metric Target Unit Selection

Reuse current unit IDs and aliases.

Do not create new IDs if equivalent units already exist.

Conceptual behavior only:

### Mass

```text
< 1000 g  → g
>= 1000 g → kg
```

Examples:

```text
500 g → 500 g
1500 g → 1.5 kg
```

### Volume

```text
< 1000 ml  → ml
>= 1000 ml → L
```

Examples:

```text
240 ml → 240 ml
1500 ml → 1.5 L
```

The exact canonical identifiers/casing must follow the current unit registry.

---

# 20. US Target Unit Selection

Use existing supported US unit identities.

For mass, conceptually:

```text
< 16 oz  → oz
>= 16 oz → lb
```

For volume, prefer existing cooking units such as:

```text
tsp
tbsp
cup
```

Use the current converter/unit registry if target-selection behavior already exists.

Do not add parallel target-selection abstractions unnecessarily.

---

# 21. Cooking Fraction Formatting

Fractions are a **display concern**.

They do not require changing the persisted numeric amount.

For kitchen-style US units such as:

```text
tsp
tbsp
cup
```

prefer common fractions when the numeric amount maps cleanly or is within the existing strict formatting tolerance.

Minimum supported display fractions:

```text
1/8
1/4
1/3
1/2
2/3
3/4
```

Mixed numbers:

```text
1 1/2
2 1/4
2 3/4
```

Required examples:

```text
0.125 → 1/8
0.25  → 1/4
0.333... → 1/3 when sufficiently close
0.5   → 1/2
0.666... → 2/3 when sufficiently close
0.75  → 3/4
1.5   → 1 1/2
```

---

# 22. Original Mode Fraction Rule

This rule directly addresses the current `3/4 → 0.x` behavior.

If the canonical saved ingredient is:

```text
amount = 0.75
unit = cup
```

Original mode should format it as:

```text
3/4 cup
```

not:

```text
0.75 cup
```

Likewise:

```text
amount = 0.5
unit = tsp
→ 1/2 tsp
```

```text
amount = 1.5
unit = cup
→ 1 1/2 cups
```

This must reuse the existing formatter if one exists.

If fraction formatting currently exists only for serving scaling, extend/reuse that behavior rather than introducing an unrelated second formatter.

---

# 23. Fraction Snapping Must Be Conservative

Do not aggressively convert arbitrary decimals into a nearby fraction.

Acceptable:

```text
0.2498 cup
→ 1/4 cup
```

if within the existing strict error policy.

Not acceptable:

```text
0.29 cup
→ 1/4 cup
```

or:

```text
0.29 cup
→ 1/3 cup
```

unless the existing formatter's tested tolerance explicitly permits it without materially changing the recipe.

If no suitable fraction exists, display a decimal.

---

# 24. Decimal Safety

Do not expose floating-point artifacts.

Bad:

```text
0.30000000000000004 cup
179.9999999997 ml
```

Display formatting may remove floating-point noise.

However, display formatting must not materially alter the recipe quantity.

Underlying persisted amount remains unchanged.

---

# 25. Unknown and Custom Units

If the existing unit registry does not define a safe same-dimension conversion:

```text
preserve amount + unit
```

Examples:

```text
2 scoops protein powder
1 bunch parsley
1 package pasta
1 can tomatoes
```

remain unchanged.

Do not guess a volume/mass for custom units.

---

# 26. Missing Amount

If the existing canonical ingredient has no amount:

```text
amount = null
```

do not convert it.

Examples:

```text
salt to taste
oil as needed
parsley for garnish
```

remain unchanged.

---

# 27. Count Units

Count/context units remain unchanged.

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
```

Example:

```text
2 cloves garlic
```

remains:

```text
2 cloves garlic
```

in Original, Metric, and US.

---

# 28. Volume-to-Mass Conversion Is Forbidden

Do not implement ingredient-density conversion in MVP.

Example:

```text
1 cup flour
```

Metric:

```text
240 ml flour
```

not:

```text
120 g flour
```

Similarly:

```text
2 tbsp butter
```

Metric:

```text
30 ml butter
```

not:

```text
28 g butter
```

Ingredient-specific density is a separate future feature.

---

# 29. Mixed-System Recipes

Original mode may remain mixed.

Saved:

```text
500 g chicken
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

Original:

```text
500 g chicken
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

Metric:

```text
500 g chicken
30 ml oil
240 ml rice
2 cloves garlic
salt to taste
```

US:

```text
converted US mass according to current target/formatter policy
2 tbsp oil
1 cup rice
2 cloves garlic
salt to taste
```

Do not normalize Original simply because the recipe mixes systems.

---

# 30. RecipeForm Boundary

Create/Edit continues editing canonical recipe measurements.

The Recipe Detail measurement-mode control must not rewrite RecipeForm values.

Out of MVP scope:

```text
switch Recipe Detail to Metric
→ edit/save Metric-derived amounts back into recipe
```

Converted editing requires a separate product decision.

---

# 31. Persistence

Do not add derived measurement fields such as:

```text
metric_amount
metric_unit
us_amount
us_unit
converted_amount
converted_unit
original_fraction
amount_raw
```

solely for this feature.

Persist only using the current canonical recipe schema.

Conversion values are derived locally for display.

---

# 32. Backend Boundary

Do not add:

- a conversion API endpoint;
- an external conversion service;
- an LLM conversion call;
- database conversion jobs;
- background jobs;
- measurement caches.

Conversion should be deterministic and local to the current app/domain layer unless existing architecture already places equivalent shared logic elsewhere.

---

# 33. Required Behavior Examples

| Canonical saved amount/unit | Mode | Expected display |
|---|---|---|
| `0.75 cup` | Original | `3/4 cup` |
| `0.5 cup` | Original | `1/2 cup` |
| `1.5 cup` | Original | `1 1/2 cups` |
| `0.75 cup` | Metric | `180 ml` |
| `1 cup` | Metric | `240 ml` |
| `0.5 cup` | Metric | `120 ml` |
| `1 tbsp` | Metric | `15 ml` |
| `0.5 tsp` | Metric | `2.5 ml` |
| `0.25 tsp` | Metric | `1.25 ml` |
| `2 cup` after 2× scaling | Metric | derive scaling first, then convert |
| `1 oz` mass | Metric | `28 g` |
| `1 lb` mass | Metric | `454 g` |
| `1 cup flour` | Metric | `240 ml flour` |
| `2 cloves garlic` | Metric | unchanged |
| no amount, custom/free text | Metric | unchanged |

---

# 34. Import-from-Text Regression Requirement

Input:

```text
3/4 cup milk
```

Parser may correctly normalize this to:

```text
amount = 0.75
unit = existing cup identity
name = milk
```

This normalization is not itself a bug.

The bug exists if Recipe Detail Original renders:

```text
0.75 cup milk
```

when the project's cooking fraction formatter should render:

```text
3/4 cup milk
```

Fix the display path.

Do not replace the parser's numeric amount contract.

---

# 35. Serving-Scaling Interaction

Reuse existing serving scaling.

Example saved:

```text
3/4 cup milk
4 servings
```

User selects:

```text
8 servings
```

Scale:

```text
0.75 × (8 / 4)
= 1.5 cups
```

Original/US cooking display:

```text
1 1/2 cups
```

Metric display:

```text
1.5 × 240
= 360 ml
```

Order:

```text
saved canonical amount
→ serving scale
→ selected unit conversion
→ display format
```

---

# 36. Tests Must Follow Existing Test Conventions

Do not introduce a new testing pattern if the codebase already has unit tests for parser, serving scaling, units, or Recipe Detail utilities.

Add regression coverage to the nearest existing test layer.

Minimum cases:

### Fraction parser compatibility

```text
"1/2 cup" → canonical amount 0.5
"3/4 cup" → canonical amount 0.75
"1 1/2 cup" → canonical amount 1.5
```

Parser contract remains unchanged.

### Original formatter regression

```text
0.5 cup → 1/2 cup
0.75 cup → 3/4 cup
1.5 cup → 1 1/2 cups
```

### Metric kitchen conversion

```text
0.25 tsp → 1.25 ml
0.5 tsp  → 2.5 ml
1 tsp    → 5 ml
1 tbsp   → 15 ml
0.25 cup → 60 ml
1/3 cup  → 80 ml when canonical value represents one third
0.5 cup  → 120 ml
0.75 cup → 180 ml
1 cup    → 240 ml
```

### Dimension safety

```text
cup → ml ✅
oz mass → g ✅
cup → g ❌
g → cup ❌
```

### No-zero regression

Any positive converted amount:

```text
> 0
```

must never format as:

```text
0
```

### No mutation

Switching display modes does not mutate canonical ingredient state.

### Serving regression

Scaling occurs before conversion.

---

# 37. Edge Cases

## EC-01 — Unicode fraction input

```text
¾ cup
```

may normalize to:

```text
amount = 0.75
```

Original Recipe Detail should still use a clean fraction display.

Do not require persisted Unicode source syntax.

## EC-02 — ASCII fraction input

```text
3/4 cup
```

may normalize to numeric `0.75`.

Do not render as unwanted decimal in Original mode.

## EC-03 — Decimal input

If the canonical model contains:

```text
0.73 cup
```

and no safe cooking fraction is sufficiently close:

```text
0.73 cup
```

may remain decimal.

Do not force it to `3/4`.

## EC-04 — Package fraction-like text

```text
1 (14 ounce/2 count) package
```

must not interpret `/2` as the primary amount.

Existing deterministic parser behavior remains authoritative.

## EC-05 — Amount range

If current canonical amount representation cannot represent:

```text
2–3 cups
```

do not change the amount type as part of conversion work.

Reuse the deterministic parser's existing fallback behavior.

## EC-06 — Unknown custom unit

Leave unchanged.

## EC-07 — Missing amount

Leave unchanged.

## EC-08 — Free-text instruction measurement

Leave unchanged.

## EC-09 — Repeated mode switching

No drift.

## EC-10 — Repeated serving changes

Always derive from canonical amount and existing serving baseline.

## EC-11 — Floating-point fraction boundary

Use existing/explicit conservative tolerance.

## EC-12 — Very small converted value

Must not become zero.

## EC-13 — Near 1000 g/ml threshold

Target-unit selection must be deterministic.

---

# 38. Codex / Agent Implementation Instructions

Before touching code, inspect the actual implementation for:

```text
1. ingredient type and canonical amount type
2. unit type / canonical IDs / alias registry
3. deterministic parser amount handling
4. current fraction formatter
5. serving-scaling function
6. Recipe Detail ingredient renderer
7. current Recipe Detail local state conventions
8. existing conversion utilities, if any
9. nearby unit/parser/scaling tests
```

Then implement using this priority:

```text
reuse exact existing function/type
→ extend existing utility
→ add smallest missing helper
→ integrate into current renderer
```

Never start by creating the conceptual types/functions shown in another design document.

If the current code already has a differently named function that serves the required behavior, **keep that function name**.

If the current code already has a type carrying the required data, **keep that type**.

If implementation appears to require modifying the persisted ingredient shape, stop and verify the design first.

---

# 39. Explicit Forbidden Refactors

Do not introduce any of the following solely to implement this feature:

```text
new persisted Quantity type
new rational-fraction domain type
new IngredientMeasurement model
new Recipe DTO
new parser DTO
new RecipeForm contract
new backend conversion schema
new amount_raw DB field
new source-fraction DB field
new unit system enum replacing existing unit conventions
```

A small local UI mode type is acceptable only if no equivalent project convention already exists.

---

# 40. Acceptance Criteria

## Codebase compatibility

- [ ] Existing ingredient model remains unchanged.
- [ ] Existing canonical numeric amount representation remains unchanged.
- [ ] Existing unit IDs/types are reused.
- [ ] Existing parser contract remains unchanged.
- [ ] Existing serving-scaling behavior is reused.
- [ ] Existing fraction formatter is reused/extended when available.
- [ ] No duplicate measurement domain model is introduced.
- [ ] No DB migration is required.

## Original mode

- [ ] Original is the default.
- [ ] Original does not convert measurement systems.
- [ ] Canonical `0.75 cup` displays as `3/4 cup`.
- [ ] Canonical `0.5 cup` displays as `1/2 cup`.
- [ ] Canonical `1.5 cup` displays as `1 1/2 cups`.
- [ ] Arbitrary decimals are not aggressively snapped to fractions.
- [ ] Mixed-system recipes remain mixed.

## Metric mode

- [ ] NIST Metric Kitchen policy is used consistently.
- [ ] `1 cup → 240 ml`.
- [ ] `3/4 cup → 180 ml`.
- [ ] `1 tbsp → 15 ml`.
- [ ] `1 tsp → 5 ml`.
- [ ] Small non-zero values do not format to zero.
- [ ] Metric display does not expose exact-US decimal tails.

## Conversion safety

- [ ] Mass converts only to mass.
- [ ] Volume converts only to volume.
- [ ] Volume ↔ mass is unsupported.
- [ ] Count/custom units remain unchanged.
- [ ] Free text remains unchanged.
- [ ] Instructions remain unchanged.
- [ ] Temperature is not converted in this MVP.

## State safety

- [ ] Conversion does not mutate persisted data.
- [ ] Serving scaling runs before conversion.
- [ ] Formatting runs after conversion.
- [ ] Repeated mode switching produces no drift.
- [ ] No network call is required for conversion.

---

# 41. Source Hierarchy

## Primary cooking conversion source

NIST — Metric Kitchen: Cooking Measurement Equivalencies

https://www.nist.gov/pml/owm/metric-si/metric-kitchen/metric-kitchen-cooking-measurement-equivalencies

Use this for user-facing US → Metric kitchen equivalents.

## Supporting household measurement source

NIST — Metric Household

https://www.nist.gov/pml/owm/metric-household

Use as supporting measurement reference, not as a reason to replace Kitchen Metric display values with `236.6 ml` per cup.

## Culinary guidance

NIST — Metric Kitchen: Culinary Measurement Tips

https://www.nist.gov/pml/owm/metric-si/metric-kitchen/metric-kitchen-culinary-measurement-tips

Use to support the rule that volume ↔ mass requires ingredient-specific density.

Recipe apps and cooking websites may be used for UX benchmarking, not as canonical metrology authorities.

---

# 42. Final MVP Rule

The implementation should be summarized as:

```text
Keep Noomori's existing data model.
Keep numeric canonical ingredient amounts.
Keep parser fraction normalization.
Do not convert Original to another measurement system.
Format clean kitchen fractions cleanly in Original/US display.
Convert only structured mass ↔ mass and volume ↔ volume.
Use NIST Metric Kitchen for Metric display.
Scale first, convert second, format last.
Never persist derived conversion values.
```

Most importantly:

> `3/4` becoming numeric `0.75` internally is acceptable under Noomori's current canonical amount convention. Displaying `0.75 cup` in Original mode when it should be shown as the cooking fraction `3/4 cup` is the behavior to fix.
