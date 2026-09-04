# Noomori — Import from Text MVP Specification

**Status:** Implementation aligned  
**Platform:** Expo SDK 56 / React Native / FastAPI  
**Scope:** Paste one structured recipe, review it, and save through the existing recipe flow

## 1. Product behavior

Import from Text adds one ingestion boundary to Noomori:

```text
Recipes Home
→ Add a recipe
→ Import from text
→ Paste and edit text
→ Import recipe
→ Review in the existing RecipeForm
→ Save through the existing create flow
→ Recipe Detail
```

Parsing never persists a recipe. The user must review the extracted draft and
explicitly save it.

The MVP supports pasted plain text only. It excludes files, OCR, URLs, share
intents, clipboard monitoring, batch import, automatic parsing, and automatic
saving.

## 2. Current-codebase alignment

The implementation must reuse:

- Expo Router and the authenticated `Stack.Protected` route group;
- `RecipeDraft` and `RecipeForm`;
- `createBlankRecipeDraft()` defaults;
- the existing inline authenticated `fetch` convention and `apiConfig`;
- the existing `POST /add-recipes` create behavior;
- current photo preparation/upload and retry handling;
- `cacheCreatedRecipe` list/detail cache updates;
- existing validation and discard confirmation;
- navigation to the created Recipe Detail.

The feature must not introduce a second editor, persisted import model, API
client, auth path, cache, navigation system, snackbar system, analytics stack,
cookbook behavior, origin field, dark-mode system, or database migration.

The existing create route orchestration is shared by scratch and imported
creation:

```text
Write from scratch → blank RecipeDraft ─┐
                                       ├→ shared create screen → RecipeForm
Import from text → adapted RecipeDraft ─┘
```

An imported initial draft counts as unsaved work even before the user edits it.

## 3. Import API

Add one endpoint to `apiConfig`:

```ts
importRecipeText: "/recipes/import/text"
```

Request:

```http
POST /recipes/import/text
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{ "text": "..." }
```

The route uses the existing FastAPI `get_current_user` dependency. It does not
query or write recipe data.

Input rules:

- trim surrounding whitespace;
- reject whitespace-only input;
- reject text longer than 20,000 characters;
- use normal FastAPI/Pydantic validation responses for invalid input.

Successful response:

```json
{
  "title": "Miso noodles",
  "description": "Serve immediately.",
  "ingredients": [
    {
      "title": "Sauce",
      "items": [
        {
          "name": "soy sauce",
          "quantity": 2,
          "unit": "tbsp",
          "note": null
        }
      ]
    }
  ],
  "instructions": [
    {
      "title": null,
      "steps": [{ "text": "Stir and serve." }]
    }
  ],
  "servings": 2,
  "prep_time_minutes": 10,
  "cook_time_minutes": 15
}
```

Every top-level field may be `null` or empty when it was not found. This DTO is
an import-only transport contract, not a persisted recipe model. It contains no
recipe ID, owner, photo, source, nutrition, confidence, origin, or UI row IDs.

Return HTTP 422 with `Could not identify enough recipe information` when the
parser cannot produce a useful draft.

## 4. Deterministic parsing

The backend parser uses the Python standard library only. It does not call an
AI model or external parsing service.

Recognized section headings, case-insensitively and with an optional trailing
colon:

- `Ingredient` or `Ingredients`;
- `Instruction`, `Instructions`, `Direction`, `Directions`, or `Method`;
- `Note` or `Notes`.

Recognized metadata:

- `Servings` followed by a positive integer;
- `Yield`, preserved verbatim in notes rather than treated as servings;
- `Prep time` and `Cook time` expressed as bare minutes or hour/minute units;
- metadata values inline or on the next meaningful line.

The first meaningful non-metadata line before a recognized section becomes the
title. Leading Markdown heading markers are removed.

Within ingredient and instruction sections:

- `-`, `*`, `•`, `1.`, and `1)` list prefixes are removed;
- a line ending in `:` creates a one-level group heading;
- all remaining non-empty lines become ingredients or instruction steps;
- nested groups are not supported.

Ingredient quantities support the same formats as the current form:

- integer: `2`;
- decimal: `2.5` or `.5`;
- fraction: `1/2`;
- mixed fraction: `2 1/2`;
- Unicode fraction: `½`, `¼`, or a mixed form such as `1½`.

Units are returned case-insensitively as values from the existing `recipeUnits`
list. Common pasted variants such as `gr`, `gram(s)`, `liter(s)`, and plural
unit names are normalized to those values. When the token after a quantity is
not recognized, it remains part of the ingredient name rather than being
treated as a unit. A quantity and unit may be adjacent, such as `250gr`.

Notes are returned as `description`. The parser does not infer source,
nutrition, photo, missing instructions, or other absent content.

A result is useful when at least two of these signals exist:

1. title;
2. at least one ingredient;
3. at least one instruction.

Partial results such as title plus ingredients are allowed to continue to
review.

## 5. Client adaptation and review

The adapter merges the response with `createBlankRecipeDraft()`:

- missing servings use the current default of `1`;
- missing times remain `null`;
- missing description becomes empty notes;
- photo remains `null`;
- nutrition remains empty;
- source remains unset and must be selected before saving;
- ingredient, group, instruction, and step IDs are generated from array indexes.

After adaptation, the existing editable `RecipeForm` is the complete review UI.
There is no preview mode, import-specific field, or second validation layer.

Save failure preserves the form state and does not rerun parsing. Successful
save follows current create behavior, including photo handling, cache updates,
and navigation to Recipe Detail.

## 6. Import screen UI/UX

The import screen uses existing NativeWind/Tailwind primitives and semantic
Noomori tokens. It must not add colors, fonts, gradients, shadows, animation
libraries, or Tailwind configuration.

Content order:

1. 48×48 back button using the existing `SymbolView` language;
2. accessible `Import from text` heading;
3. concise explanation that review happens before saving;
4. visible `Recipe text` label;
5. multiline input with helper text and a 20,000-character limit;
6. inline error message;
7. one primary `Import recipe` action.

Interaction requirements:

- use `SafeAreaView`, `KeyboardAvoidingView`, and vertical scrolling;
- keep content centered with the existing responsive maximum-width convention;
- use semantic NativeWind classes such as `bg-background`, `bg-surface`,
  `border-border`, `text-text-primary`, and `bg-primary-strong`;
- use at least 48×48 touch targets and 8-point gaps;
- disable empty, whitespace-only, and pending submissions;
- pending state keeps layout stable and shows an `ActivityIndicator` plus
  `Importing…`;
- validation and server errors appear below the input with
  `accessibilityRole="alert"` and a clear recovery instruction;
- after an error, the action label becomes `Try again`;
- editing clears stale errors;
- preserve raw text across validation, parsing, timeout, and network failures;
- preserve text wrapping and logical focus order with large Dynamic Type;
- use normal Expo Router transitions without decorative motion.

## 7. Verification

Backend tests must cover:

- whitespace-only and oversized input;
- headings, groups, metadata, notes, and list prefixes;
- integers, decimals, ASCII fractions, mixed fractions, and Unicode fractions;
- recognized and unknown units;
- partial results;
- unparseable text.

The client adapter check must cover:

- default merging;
- generated local IDs;
- numeric quantity conversion to form text;
- absent photo and nutrition;
- source remaining unset.

Before release, verify type checking and manually exercise empty, valid, partial,
invalid, timeout, retry, review, save-failure, and successful-save flows. Check
keyboard behavior, small phone, tablet, landscape, large Dynamic Type, screen
reader labels, error announcements, and disabled/pending states.

Expo implementation must follow the exact SDK 56 documentation required by
`AGENTS.md`.
