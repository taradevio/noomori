# Noomori Parser Hardening — Minimal Battle-Test Revision

## Summary

Harden Noomori's current recipe parser using only regressions derived from observed failures.

Do not build a new parser framework, manifest system, custom runner, metrics stack, or large fixture quota. Reuse the existing test architecture and `import_fixture()` helper in `server/tests/test_recipe_url_import_sites.py`.

This revision covers four concrete structural failures:

1. Whole Foods-style false-positive recipe ingredients.
2. Royco-style invalid instruction extraction.
3. Serious Eats-style lost ingredient grouping.
4. Ingredient unit grammar around full-word units such as `tablespoon`.

The goal is not to support specific websites. The goal is to add the smallest generic fixes that make these structural classes reliable without regressing existing behavior.

## 1. Existing Architecture

Keep the current parsing sequence unchanged:

```text
HTML fetch
→ recipe-scrapers
→ normalize
→ complete core?
   ├─ yes → optional DOM group/nutrition enrichment
   └─ no  → bounded DOM extraction → deterministic text parser fallback
```

Do not change:

- curl-cffi transport behavior;
- SSRF protections;
- image fetching;
- public API schemas;
- error mappings;
- database schema;
- frontend behavior.

## 2. Testing Strategy

Reuse `server/tests/test_recipe_url_import_sites.py` and the existing `import_fixture(...)` helper.

For every new website-derived regression:

```text
live failure
→ minimize into deterministic fixture
→ add failing regression
→ implement smallest generic fix
→ run full backend suite
→ rerun live source manually
```

Live URLs are discovery inputs only. They must never become blocking CI dependencies.

## 3. Regression A — Whole Foods False-Positive Ingredients

### Observed failure

The visible recipe contains four real ingredients, but Noomori returned two promotional Amazon/Prime lines as recipe ingredients.

This is a correctness failure, not merely missing metadata.

### Structural problem

A non-empty primary extraction is currently capable of being treated as a complete recipe even when the extracted ingredients do not correspond to the visible recipe core.

The page also contains repeated recipe-section structure, so DOM fallback/candidate selection must remain conservative.

### Required fixture

Add one minimized synthetic fixture derived from the failing structure. It should contain:

```text
recipe title
real Ingredients section with four recipe ingredients
Method/Instructions section
nutrition or another trailing section
a duplicated Ingredients heading or mirrored recipe block
unrelated promotional text elsewhere
```

Do not preserve irrelevant full-site HTML.

### Expected result

Assert exact semantic ingredient content and order. The promotional lines must not appear in ingredient names, instruction text, or Notes.

### Implementation rule

Do not add hostname branches or blacklist strings such as `Amazon` or `Prime`.

Fix the generic structural trust problem.

If repeated recipe sections are handled, only treat a later section as a mirrored duplicate when structural and normalized-content verification proves equivalence. Otherwise preserve fail-closed behavior.

Do not weaken multi-recipe rejection.

## 4. Regression B — Royco Invalid Instruction Core

### Observed failure

The visible recipe contains four instructions, but Noomori produced one instruction:

```text
"ungrouped"
```

### Structural problem

A technically non-empty instruction array is currently capable of satisfying the complete-core path even when its content is not a real cooking instruction.

### Required fixture

Add one minimized Royco-style fixture containing the title, ingredient section, four visible instruction bodies, and the structural markup that causes `"ungrouped"` to surface.

### Expected result

Assert exact four instruction bodies and order. Also assert `"ungrouped"` does not appear as an instruction.

### Implementation rule

Do not add `"ungrouped"` to a one-off blacklist.

Fix the structural cause.

If primary structured extraction yields a non-empty but contradictory instruction result while a bounded, unambiguous DOM candidate exposes stronger explicit instruction structure, the parser may degrade confidence in the primary core and use the verified fallback path.

Keep this deterministic. Do not introduce fuzzy confidence scores.

## 5. Regression C — Serious Eats Ingredient Group Collapse

### Observed failure

All 17 ingredients were extracted correctly, but two visible ingredient groups were collapsed into one.

### Severity

This is a presentation/structure failure, not content loss. It is lower priority than Whole Foods and Royco but still important because Noomori supports grouped recipe editing.

### Required fixture

Add one minimized fixture derived from the current Serious Eats structure. Retain only markup necessary to reproduce:

```text
Group 1 title
its ingredient rows

Group 2 title
its ingredient rows
```

### Expected result

Assert:

```text
total ingredient count == 17
ingredient group count == 2
```

and exact group titles, ingredient ordering, and item assignment.

Do not test counts only.

### Implementation rule

Keep primary ingredient values authoritative. DOM may contribute only verified group boundaries.

Do not loosen grouping matching globally until the minimized fixture explains why the current exact matcher fails.

## 6. Regression D — Full-Word Unit Grammar

### Problem

The ingredient parser already recognizes aliases such as:

```text
tablespoon
tablespoons
```

but grammar around the recognized unit may still produce incorrect ingredient names.

### Required direct parser regressions

#### Case 1 — Connector after unit

Input:

```text
1 tablespoon of sugar
```

Expected:

```text
quantity = 1
unit = "tbsp"
name = "sugar"
```

The connector `of` must not remain at the beginning of the ingredient name.

#### Case 2 — Modifier before unit

Input:

```text
2 rounded tablespoons ground coriander
```

Expected minimum behavior:

```text
quantity = 2
unit = "tbsp"
name contains "ground coriander"
```

The parser must not degrade to:

```text
unit = null
name = "rounded tablespoons ground coriander"
```

### Modifier semantics

Do not invent a broad modifier system in this revision.

Only support a small, explicit set if required by the regression, for example:

```text
rounded
level
heaped
```

If modifier preservation semantics are not yet defined, prefer preserving the modifier safely in `note` or ingredient text rather than losing the recognized unit.

Do not add fuzzy adjective detection.

## 7. Metamorphic Regression Checks

Add only three table-driven metamorphic families.

### 7.1 Whitespace / NBSP

Transform a known-good fixture with extra spaces, NBSP, or CRLF/LF variation.

Expected: same normalized semantic draft.

### 7.2 Wrapper insertion

Wrap existing semantic blocks inside harmless `div`, `section`, or `span` elements without changing visible content.

Expected: same normalized semantic draft.

### 7.3 Unrelated sibling noise

Add unrelated sibling content such as newsletter, advertisement, footer, related article, or promotion.

Expected: same recipe core. Noise must not become ingredients, instructions, Notes, or nutrition.

## 8. Existing Regression Guards

The following behavior must remain green:

```text
BBC apple crumble-style grouped recipe
Sasa Indonesian layout
Bango multi-recipe rejection
existing Cookpad grouping
existing Dapur Umami nutrition behavior
existing WPRM
existing Microdata
existing DOM fallback
existing Serious Eats fixture
existing Simply Recipes fixture
existing SSRF/fetch/image tests
```

Do not add duplicate fixtures for cases already covered unless the new minimized regression represents a materially different structural failure.

Bango remains an important live guard after any Whole Foods candidate-selection change.

## 9. Implementation Order

Implement in this order:

```text
1. Whole Foods minimized failing fixture.
2. Generic fix for false-positive primary core / duplicated structure.
3. Royco minimized failing fixture.
4. Generic fix for invalid instruction core.
5. Serious Eats minimized failing fixture.
6. Generic grouping fix.
7. Add tablespoon/unit grammar regressions.
8. Add smallest generic unit-grammar fix.
9. Add the three table-driven metamorphic test families.
10. Run the full backend suite.
11. Manually rerun the six live discovery URLs.
```

Do not modify parser behavior before each corresponding regression is red.

## 10. Definition of Done

The revision is complete when all of the following are true.

### Existing suite

```text
all existing backend parser/import tests pass
```

### New deterministic regressions

#### Whole Foods-derived case

```text
exact four real ingredients
correct order
zero promotional contamination
no false Notes/instruction contamination
```

#### Royco-derived case

```text
exact four instructions
correct order
"ungrouped" is never emitted as a cooking step
```

#### Serious Eats-derived case

```text
all 17 ingredients preserved
exact two ingredient groups
correct group titles
correct item assignment and order
```

#### Unit grammar

```text
1 tablespoon of sugar
→ quantity 1
→ unit tbsp
→ name sugar

2 rounded tablespoons ground coriander
→ quantity 2
→ unit tbsp
→ ingredient identity preserved
```

### Metamorphic checks

All three families pass:

```text
whitespace/NBSP
wrapper insertion
unrelated sibling noise
```

with no semantic core changes.

### Live rerun

Manually verify:

```text
BBC apple crumble
→ pass

Sasa Jangan Lombok
→ pass

Bango roundup
→ still rejected

Serious Eats chicken salad
→ correct ingredients + two groups

Royco opor ayam
→ correct four instructions

Whole Foods syrup
→ correct real ingredients, no promotional contamination
```

Live URLs are verification evidence only and remain outside CI.

## 11. Parser Change Rules

Every parser change in this revision must satisfy:

```text
failing deterministic regression first
+
smallest generic structural fix
+
existing suite remains green
+
relevant live source improves
+
no new false positives
```

Do not add:

```text
hostname branches
publisher-specific selectors
content blacklists
large heuristic dictionaries
fuzzy confidence scoring
LLM extraction
new parser framework
custom corpus runner
manifest system
metrics stack
```

unless a future observed failure proves the need.

## 12. Dependency Gate

Future `recipe-scrapers` upgrades must run the existing backend suite, including these regressions.

No separate dependency-specific harness is required.

If an upgrade changes semantic output for any fixture, inspect the diff before merging.

## 13. Stopping Point

After these regressions are fixed and the Definition of Done passes:

```text
stop parser hardening
→ proceed to the next closed-testing readiness task
```

Do not keep expanding parser scope simply because more theoretical edge cases exist.

Further parser changes must start from a real observed failure.
