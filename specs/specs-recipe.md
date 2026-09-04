# Recipe Form Specification

## Scope

This document is the canonical screen specification for:

- **Add Recipe / Write from Scratch**
- **Edit Recipe**

Both flows must reuse the same form model and interaction primitives.

```text
Create
→ blank/default state

Edit
→ prefilled canonical recipe
```

Do not build two unrelated form systems.

Import Review should also reuse the same field/section primitives where practical because manual and imported recipes converge on the same canonical recipe model.

---

## 1. Form hierarchy

Recommended order:

```text
Recipe photo

Recipe title

Prep time
Cook time
Servings

Ingredients
  optional sections
  structured ingredient rows

Instructions
  optional sections
  numbered steps

Notes

Nutrition

Source

Cookbooks

Save
```

The form is mobile-first and vertically scrollable.

Avoid one giant free-form recipe textarea, excessive card nesting, and desktop-style dense grids.

---

## 2. Recipe photo

Optional for the MVP unless product requirements change.

Support:

- add photo;
- replace photo;
- remove photo.

The photo area should remain secondary to the form, not dominate the editor.

---

## 3. Recipe title

```text
Recipe title
[ ______________________________ ]
```

Requirements:

- required;
- trim leading/trailing whitespace;
- reject empty title after trimming.

Example error:

```text
Enter a recipe name.
```

---

## 4. Prep time and cook time

Both fields are optional structured durations.

Do not use unrestricted numeric text entry as the primary interaction.

Tap should open a duration picker with common values such as:

```text
Not set
5 min
10 min
15 min
20 min
30 min
45 min
60 min
90 min
Custom duration
```

`Custom duration` should use hour/minute selection.

Store canonical values as integer minutes.

Example:

```text
1 hour 20 minutes
→ 80
```

---

## 5. Servings

Every recipe has a canonical serving count.

Constraint:

```text
servings >= 1
```

Preferred control:

```text
Servings

[ − ]    4    [ + ]
```

Do not allow zero or negative servings.

---

## 6. Serving scaling in Create/Edit

Changing servings in Create or Edit changes the canonical recipe size.

Numeric ingredient amounts scale proportionally:

```text
scaled_amount =
canonical_amount
× new_servings
/ canonical_servings
```

Example:

```text
4 servings
400 g chicken

→ 8 servings
→ 800 g chicken
```

Use a stable canonical snapshot rather than repeatedly scaling rounded display values.

Example:

```text
4 → 8 → 6 → 4
```

must return to the original canonical values without cumulative rounding drift.

Non-numeric amounts must not be guessed.

Examples that should remain unchanged:

```text
to taste
as needed
a handful
```

---

## 7. Ingredients

Ingredients are structured data.

Each ingredient supports:

```text
amount
unit
ingredient name
optional note
```

Conceptually:

```text
[ amount ] [ unit ▼ ] [ ingredient name ]
[ note — optional                         ]
```

Do not store the canonical ingredient list as one multiline textarea.

---

## 8. Ingredient amount

Supported amount forms:

- integer;
- decimal;
- fraction;
- mixed number;
- empty where appropriate.

Examples:

```text
2
0.5
1/3
1 1/2
```

Optional quick fractions:

```text
1/4
1/3
1/2
2/3
3/4
```

Amount may be empty for cases such as:

```text
salt — to taste
```

---

## 9. Ingredient units

Use selection-first unit entry.

### Convertible volume

```text
tsp
tbsp
cup
ml
L
```

### Convertible mass

```text
mg
g
kg
oz
lb
```

### Common non-convertible culinary units

Examples:

```text
piece
clove
slice
can
pack
bunch
pinch
```

Also support:

```text
No unit
+ Custom unit
```

Custom units must be preserved exactly and must never be assigned guessed conversion semantics.

---

## 10. Ingredient notes

Ingredient note is optional and distinct from recipe-level Notes.

Examples:

```text
2 cloves garlic
minced

1 can tomatoes
drained
```

---

## 11. Ingredient sections

Recipes may contain optional one-level ingredient sections.

### Simple recipe

```text
Ingredients

2 eggs
100 g flour
200 ml milk
```

Do not force a synthetic section such as `Main`.

### Sectioned recipe

```text
Ingredients

Marinade
- coconut milk
- soy sauce
- garlic

Chicken & Salad
- chicken breast
- olive oil
- avocado
```

Another valid structure:

```text
For the tart shell
...

For the lemon curd
...

To serve
...
```

Conceptual model:

```text
ingredient_groups[]
├── id
├── title?
├── note?
├── position
└── ingredients[]
```

Only one section level is supported.

Do not support recursive groups.

---

## 12. Ingredient section actions

Sections should support:

- add;
- rename;
- reorder;
- delete.

Ingredients should support:

- add;
- edit;
- reorder;
- delete;
- move between sections when the implementation supports it safely.

Deleting a non-empty section must not silently delete all children.

Use either:

- explicit confirmation of the consequence; or
- safe move/flatten behavior.

---

## 13. Instructions

Instructions are structured as individual steps.

Simple example:

```text
Instructions

1. Mix the ingredients.
2. Heat the pan.
3. Cook for 10 minutes.
```

Each step must be independently editable.

Do not use one long-form instruction textarea as the canonical model.

---

## 14. Instruction sections

Instruction sections are optional and one-level only.

Example:

```text
Instructions

Prepare the marinade
1. Combine the ingredients.
2. Mix thoroughly.

Cook the chicken
1. Heat the pan.
2. Cook the chicken.

Assemble
1. Combine the components.
```

Conceptual model:

```text
instruction_groups[]
├── id
├── title?
├── position
└── steps[]
```

Ingredient and instruction sections are independent.

Do not require their names or counts to match.

---

## 15. Instruction section actions

Sections should support:

- add;
- rename;
- reorder;
- delete.

Steps should support:

- add;
- edit;
- reorder;
- delete;
- move between sections where supported.

Deleting a non-empty section must not silently destroy its steps.

---

## 16. Reordering

Drag-and-drop may be used if it is reliable on mobile.

If drag-and-drop is not stable enough for the MVP, use simpler deterministic reorder controls.

Data integrity is more important than a sophisticated gesture.

---

## 17. Notes

Recipe Notes are optional free-form content.

Example:

```text
Notes

This tastes better after resting overnight.
```

Keep Notes distinct from ingredient notes and instruction steps.

---

## 18. Nutrition

Nutrition is recipe metadata, not a health-tracking feature.

Supported fields:

```text
Calories
Fat (g)
Saturated fat (g)
Cholesterol (mg)
Sodium (mg)
Carbohydrate (g)
Dietary fiber (g)
Sugar (g)
Protein (g)
```

Keep the presentation restrained.

Do not add:

- macro rings;
- progress bars;
- daily goals;
- health scores;
- diet recommendations.

---

## 19. Nutrition × Servings — current product requirement

Latest requirement:

> Nutrition per Serving must update dynamically when servings increase or decrease.

This must be preserved.

However, final calculation semantics are not yet fully resolved because it interacts with the existing ingredient-scaling rule.

### Existing Create/Edit rule

```text
servings change
→ ingredient quantities scale proportionally
```

If the whole batch scales, total nutrition normally scales too, so nutrition per serving would remain equivalent.

Example:

```text
4 servings
2000 kcal total
500 kcal/serving

scale entire batch to 8 servings:

4000 kcal total
500 kcal/serving
```

### Dynamic per-serving behavior

Per-serving nutrition changes when the same total recipe is divided into a different number of portions:

```text
2000 kcal total

4 servings
→ 500 kcal/serving

8 servings
→ 250 kcal/serving
```

### Implementation guardrail

Codex must **not invent the final formula**.

Before final nutrition calculation logic is implemented, explicitly resolve which semantic is intended:

#### A. Batch scaling

```text
Create/Edit:
servings change
→ ingredients scale
→ total nutrition scales
→ per-serving nutrition stays equivalent
```

#### B. Portion re-division

```text
servings change
→ total recipe stays fixed
→ per-serving nutrition changes
```

#### C. Screen-specific behavior

Potential model:

```text
Create/Edit
→ batch scaling

Recipe Detail transient serving control
→ portion re-division
```

Until this is resolved, implement the nutrition fields/state structure but do not silently choose a calculation model.

---

## 20. Source / provenance

Every saved recipe requires a source.

Supported source types:

### My Recipe

```text
My recipe
```

No additional attribution required.

### Family / Friend

Require a readable source name.

```text
Family / Friend
[ Mom ]
```

### Website

Require a source URL.

```text
Website
[ https://example.com/recipe ]
```

Imported URL recipes should preserve the original URL.

Source is provenance, not recipe ownership.

---

## 21. Source validation

### My Recipe

Valid without an additional source field.

### Family / Friend

Require non-empty attribution.

Example:

```text
Add who this recipe came from.
```

### Website

Require a valid URL format.

Do not silently convert arbitrary invalid text into a URL.

---

## 22. Cookbooks

A recipe may belong to multiple Cookbooks.

Cookbook membership is optional.

Do not render a very long cookbook list inline in the recipe form.

Use:

```text
Cookbooks

Family Favorites
Weeknight

[ Manage cookbooks ]
```

---

## 23. Cookbook selection sheet

Example:

```text
Cookbooks

☑ Family Favorites
☐ Weeknight
☑ Mom's Recipes

2 selected

[ Save selection ]
```

Requirements:

- strong dim scrim;
- background non-interactive;
- opaque sheet surface;
- clear top radius;
- internal scrolling;
- search when the list becomes large enough;
- selected state uses multiple signals;
- sticky footer;
- selected count;
- Save action.

A tiny checkmark alone is not enough to communicate selection.

---

## 24. Cookbook persistence in Create/Edit

Inside Create/Edit:

```text
Manage cookbooks
→ Save selection
→ update RecipeForm draft only
→ continue editing
→ Save Recipe / Save Changes
→ persist recipe + cookbook memberships
```

Do not persist cookbook membership independently before the parent recipe is saved.

---

## 25. Create mode

Create begins from blank/default form state.

Conceptual defaults:

```text
photo = none
title = empty
prep time = not set
cook time = not set
servings = product-approved default >= 1
ingredients = empty/simple initial structure
instructions = empty/simple initial structure
notes = empty
nutrition = empty
source = My recipe if approved as the default
cookbooks = none
```

Do not guess imported/source-specific content in Write From Scratch.

---

## 26. Edit mode

Edit pre-fills all canonical saved fields:

- photo;
- title;
- prep time;
- cook time;
- servings;
- ingredient sections;
- ingredients;
- instruction sections;
- steps;
- notes;
- nutrition;
- source;
- cookbook memberships.

All supported fields remain editable.

---

## 27. Edit scaling snapshot

When Edit loads, preserve a stable snapshot of original canonical serving/ingredient data.

Conceptually:

```text
original canonical snapshot
        ↓
serving changes
        ↓
derive edited values from snapshot
```

Do not use the latest rounded UI amount as the next scaling source.

---

## 28. Save behavior — Create

Primary action:

```text
Save recipe
```

Success:

```text
Recipes Home
→ Recipe saved
```

Do not automatically force Recipe Detail after creation.

---

## 29. Save behavior — Edit

Primary action:

```text
Save changes
```

Success:

```text
Recipe Detail
→ Recipe updated
```

---

## 30. Saving state

While saving:

- prevent duplicate submission;
- show clear progress;
- keep form values intact;
- do not reset before server confirmation.

Example:

```text
[ Saving… ]
```

---

## 31. Save failure

If saving fails:

- remain on the form;
- preserve every entered value;
- preserve section structure;
- preserve draft cookbook selection;
- show understandable error feedback;
- allow retry.

Never clear the form after a failed request.

---

## 32. Dirty state

Track meaningful changes.

### Edit

Initial prefilled state:

```text
dirty = false
```

After meaningful modification:

```text
dirty = true
```

### Create

Meaningful entered content should also trigger dirty state.

---

## 33. Leaving with unsaved changes

If navigation would discard a dirty form, protect the draft.

Example:

```text
Discard changes?

Your unsaved recipe changes will be lost.

[ Keep editing ]
[ Discard ]
```

Do not show this when nothing meaningful changed.

---

## 34. Keyboard behavior

The form must remain usable with the software keyboard open.

Requirements:

- focused fields remain visible;
- keyboard does not cover the active field;
- repetitive ingredient/step entry remains efficient;
- multiline input remains usable;
- normal keyboard actions must not accidentally trigger Save.

Use Expo/React Native keyboard-safe primitives appropriate to the implementation.

---

## 35. Mobile ingredient layout

Do not force desktop-width fields into one cramped row.

A valid small-screen adaptation could be:

```text
[ amount ] [ unit ▼ ]
[ ingredient name       ]
[ note — optional       ]
```

The exact layout may vary, but preserve:

- clear field relationships;
- readable labels;
- adequate touch targets;
- efficient repeated entry.

Avoid a giant elevated card around every ingredient row unless necessary.

---

## 36. Mobile instruction layout

Each step should include:

- visible order/step number;
- editable text;
- reorder affordance when available;
- delete action;
- adequate touch targets.

Avoid clusters of tiny icon buttons.

---

## 37. Section visual hierarchy

Use:

- headings;
- spacing;
- restrained dividers;
- subtle surface differentiation where useful.

Do not make every ingredient/instruction section a large heavy card.

Long recipes must remain scannable.

---

## 38. Validation

At minimum:

### Required

- recipe title;
- servings >= 1;
- source;
- source-dependent fields.

### Conditionally required

Family/Friend:

```text
source name
```

Website:

```text
valid URL
```

### Empty rows

Do not persist meaningless placeholder ingredient or instruction rows.

Trim/filter truly empty draft rows before persistence.

Do not silently discard partially filled rows that contain meaningful user input; validate them instead.

---

## 39. Accessibility

Require:

- sufficient contrast;
- visible pressed/focus states;
- suitable mobile touch targets;
- labels for icon-only actions;
- no color-only state communication;
- accessible labels for add/delete/reorder;
- destructive actions clearly differentiated.

---

## 40. Conceptual canonical data shape

```text
RecipeDraft
├── photo?
├── title
├── prep_minutes?
├── cook_minutes?
├── canonical_servings
│
├── ingredient_groups[]
│   ├── id?
│   ├── title?
│   ├── note?
│   ├── position
│   └── ingredients[]
│       ├── id?
│       ├── amount?
│       ├── unit?
│       ├── name
│       ├── note?
│       └── position
│
├── instruction_groups[]
│   ├── id?
│   ├── title?
│   ├── position
│   └── steps[]
│       ├── id?
│       ├── text
│       └── position
│
├── notes?
├── nutrition?
│   ├── calories?
│   ├── fat_g?
│   ├── saturated_fat_g?
│   ├── cholesterol_mg?
│   ├── sodium_mg?
│   ├── carbohydrate_g?
│   ├── dietary_fiber_g?
│   ├── sugar_g?
│   └── protein_g?
│
├── source
│   ├── type
│   ├── name?
│   └── url?
│
└── cookbook_ids[]
```

This is a product-level conceptual model, not a mandatory database schema.

---

## 41. Reusable form primitives

Prefer shared primitives such as:

```text
RecipePhotoField
RecipeTitleField
DurationPickerField
ServingsControl

IngredientSectionEditor
IngredientRow
AmountInput
UnitPicker

InstructionSectionEditor
InstructionStepRow

NotesField
NutritionEditor
SourceSelector
CookbookSelector

RecipeFormActions
```

Create and Edit should reuse them.

---

## 42. Import Review compatibility

Import paths should normalize into a RecipeDraft-compatible state.

```text
URL
Pasted text
Instagram caption
        ↓
extract
        ↓
RecipeDraft-compatible review state
        ↓
user corrects
        ↓
Save
```

This prevents manual and imported recipes from diverging into separate models.

---

## 43. Explicitly out of scope

Do not add without a new product decision:

- meal planning;
- grocery generation;
- pantry management;
- public/social recipe publishing;
- likes/comments;
- ratings;
- AI recipe rewriting;
- AI ingredient substitution;
- health goals;
- diet tracking;
- nested ingredient groups;
- nested instruction groups;
- complex recipe permissions.

---

## 44. Create acceptance criteria

- [ ] Photo can be added/replaced/removed.
- [ ] Title is required.
- [ ] Prep and cook time use structured duration selection.
- [ ] Servings cannot go below 1.
- [ ] Numeric ingredients scale from canonical values when Create/Edit servings change.
- [ ] Ingredients use amount/unit/name/note.
- [ ] Standard and custom units are supported.
- [ ] Ingredient sections are optional.
- [ ] Multiple ingredient sections are supported.
- [ ] Ingredient grouping is one-level only.
- [ ] Instruction sections are optional.
- [ ] Multiple instruction sections are supported.
- [ ] Instruction grouping is one-level only.
- [ ] Notes are optional.
- [ ] Nutrition metadata fields exist without health-dashboard styling.
- [ ] Source is required.
- [ ] Family/Friend attribution is supported.
- [ ] Website URL source is supported.
- [ ] Multiple Cookbooks can be selected.
- [ ] Cookbook selection remains draft-only until recipe save.
- [ ] Save failure preserves form state.
- [ ] Successful Create returns to Recipes Home.
- [ ] Successful Create shows `Recipe saved`.
- [ ] Unsaved meaningful changes are protected.
- [ ] Mobile keyboard does not block form entry.
- [ ] Empty placeholder rows are not persisted.
- [ ] Final Nutrition × Servings formula is not invented before the open semantic decision is resolved.

---

## 45. Edit acceptance criteria

- [ ] All saved canonical data is prefilled.
- [ ] Edit reuses Create form primitives.
- [ ] Scaling uses original canonical snapshot data.
- [ ] Repeated serving changes do not create rounding drift.
- [ ] Existing ingredient groups remain editable.
- [ ] Existing instruction groups remain editable.
- [ ] Source is prefilled.
- [ ] Cookbook memberships are preselected.
- [ ] Cookbook changes remain draft-only until Save Changes.
- [ ] Dirty state is tracked.
- [ ] Unsaved changes are protected.
- [ ] Save failure preserves edits.
- [ ] Successful Edit returns to Recipe Detail.
- [ ] Successful Edit shows `Recipe updated`.
- [ ] Final Nutrition × Servings formula is not invented before the open semantic decision is resolved.

---

## 46. MVP implementation priority

Prioritize functional core first:

1. title;
2. servings;
3. structured ingredients;
4. ingredient sections;
5. structured instructions;
6. instruction sections;
7. prep/cook time;
8. notes;
9. source;
10. create/save/load/edit behavior;
11. loading/error/dirty state.

Then add/refine:

12. photo;
13. Cookbooks;
14. nutrition calculation behavior;
15. reorder polish;
16. final visual polish.

The form does not need final visual styling before the end-to-end recipe flow works reliably.

---

## 47. Codex planning requirement

Before implementation, Codex should:

1. read this specification;
2. inspect the current recipe/domain model;
3. inspect existing Create/Edit code;
4. identify reusable components;
5. identify form state ownership;
6. identify API payload shape;
7. identify client/server validation boundaries;
8. identify inconsistencies between current code and this specification;
9. propose an implementation plan;
10. explicitly surface the unresolved Nutrition × Servings semantic dependency;
11. avoid silently adding product behavior.

Only after the plan is established should implementation begin.
