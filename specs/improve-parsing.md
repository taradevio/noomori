# Noomori Recipe Parser Reliability Specification

**Status:** Proposed  
**Scope:** Import from Website + Import from Text  
**Goal:** Reduce misses and hard failures without trying to make extraction perfect.

## 1. Reliability Definition

Noomori considers the parser reliable when it:

1. Returns a usable editable draft whenever meaningful recipe data can be recovered.
2. Minimizes hard import failures.
3. Minimizes missing fields when the source contains recoverable recipe information.
4. Avoids confidently producing incorrect structured data.
5. Preserves uncertain source information instead of discarding or inventing semantics.
6. Makes parser regressions reproducible through fixtures and deterministic tests.

Reliability priority:

```text
minimize field corruption
        ↓
minimize hard errors
        ↓
minimize field misses
        ↓
maximize perfect extraction
```

The parser does **not** need to be perfect. Import Review remains the final human recovery layer.

---

## 2. Core Principles

### 2.1 Graceful degradation

Parser outcomes should follow this order:

```text
correct structured data
        ↓
partial structured data + preserved raw information
        ↓
raw information + warning
        ↓
hard error
```

Never prefer fabricated structured data over preserved uncertain source text.

### 2.2 Hard errors are exceptional

Return a hard import error only when one of these conditions applies:

- URL is unsafe or violates SSRF rules.
- Content is unreadable or unsupported.
- No meaningful recipe candidate can be found.
- Multiple recipe candidates are genuinely ambiguous.
- Input contains insufficient recipe information to produce a useful review draft.
- A transport failure prevents retrieving any source data.

A partial but useful recipe must not become `recipe_not_found` merely because one core field is missing.

### 2.3 Preserve source semantics

Examples:

```text
Source: "6 large apples"
Do not invent: unit = "piece"

Source: "1–2 cups broth"
Do not collapse to an arbitrary single quantity.

Source:
Prep: 5 min
Chill: 8 hr
Total: 5 min

Do not recompute Total as 485 minutes.
Preserve publisher semantics.
```

---

## 3. Target Architecture

```text
                    INPUT
              ┌──────┴──────┐
              ▼             ▼
           Website         Text
              │             │
              ▼             ▼
         Acquisition   Normalization
              │             │
              └──────┬──────┘
                     ▼
              RawRecipeEvidence
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Ingredient  Instruction  Metadata
        Parser       Parser      Parser
          │          │          │
          └──────────┼──────────┘
                     ▼
               Field Results
          value / raw / warnings
                     │
                     ▼
           Extraction Assessment
                     │
           ┌─────────┴────────┐
           ▼                  ▼
       acceptable          uncertain
           │                  │
           │             safe fallback
           │                  │
           └─────────┬────────┘
                     ▼
               Recipe Draft
                     │
                     ▼
                Import Review
```

No LLM, browser automation, hostname-specific parser rules, or fuzzy semantic extraction are required for this reliability layer.

---

## 4. Shared Result Model

Introduce internal extraction evidence and diagnostics without changing recipe persistence yet.

Example:

```python
@dataclass
class FieldEvidence[T]:
    value: T | None
    raw: str | None
    source: str
    explicit: bool
    warnings: list[str]


@dataclass
class ParsedIngredientEvidence:
    raw: str
    quantity: float | None
    unit: str | None
    name: str
    note: str | None
    warnings: list[str]
```

Possible sources:

```text
recipe_scrapers
schema_org
wprm_dom
bounded_dom
text_parser
```

The evidence model is internal parser infrastructure. It does not need to be stored in the database.

---

## 5. Website Import Reliability

Current high-level flow should remain layered:

```text
safe fetch
    ↓
recipe-scrapers primary extraction
    ↓
normalization
    ↓
assessment
    ↓
optional structured evidence / DOM enrichment
    ↓
bounded DOM fallback if needed
    ↓
assessment
    ↓
editable draft
```

### 5.1 Do not use presence-only success gates

Ingredient count and instruction count are useful telemetry but are not enough to determine correctness.

Replace logic equivalent to:

```text
ingredient_count > 0
AND
instruction_count > 0
→ success
```

with field-aware assessment.

Example suspicious conditions:

- quantity parsed but known unit alias remains at the start of `name`;
- source has several instructions but normalization collapses them into one very large step;
- standalone numbering remains as instruction text;
- source has a Notes heading but notes are missing;
- source exposes a passive time label but structured additional time is missing;
- extraction loses a large portion of source ingredient entries;
- unit exists structurally in WPRM/JSON-LD but normalized ingredient has `unit=None`.

### 5.2 Partial website imports

If website extraction yields useful data such as:

```text
title        ✓
ingredients  ✓
instructions ✗
servings     ✓
image        ✓
```

return an editable partial draft rather than `422 recipe_not_found`.

Fallback should attempt recovery first, but fallback failure must not erase useful primary extraction.

### 5.3 Separate core recipe scope from metadata scope

Do not require the strict full-recipe DOM candidate when extracting optional metadata.

Split responsibilities:

```text
_recipe_core_candidate()
_recipe_metadata_scope()
```

Core fallback should remain conservative and unambiguous.

Metadata scope may be more tolerant while remaining bounded to the accepted recipe area.

Use it for:

- notes;
- passive/additional times;
- nutrition;
- yield/servings enrichment;
- group structure.

### 5.4 Preserve recipe-scrapers errors as diagnostics

Optional extraction methods should continue to fail softly, but distinguish:

```text
field genuinely absent
```

from:

```text
extractor method raised an exception
```

Example internal warning:

```text
extractor.instructions.failed
extractor.nutrients.failed
```

Log exception type and extractor method, but never raw recipe contents.

### 5.5 Use structured source evidence when text flattening is suspicious

Keep `recipe-scrapers` as primary extractor.

Use structured source evidence only when validation indicates information loss.

Preferred evidence order:

```text
Schema.org JSON-LD
WPRM semantic DOM
bounded recipe DOM
```

Do not add:

```text
if hostname == "loveandlemons.com"
```

Prefer format-aware logic such as WPRM class recognition.

---

## 6. Ingredient Parser Reliability

Refactor ingredient parsing conceptually into:

```text
raw ingredient
    ↓
lexical normalization
    ↓
tokenization
    ↓
quantity parsing
    ↓
unit parsing
    ↓
name/note classification
    ↓
canonical RecipeIngredient
```

### 6.1 Lexical normalization

Normalize safe whitespace variants before parsing:

- ASCII spaces;
- tabs;
- NBSP;
- narrow NBSP;
- repeated whitespace;
- list/bullet prefixes.

Preserve Unicode fraction semantics.

Avoid aggressive normalization that can destroy useful fraction representation.

### 6.2 Unit parsing

Maintain a canonical alias map:

```text
tablespoon / tablespoons / tbsp → tbsp
teaspoon / teaspoons / tsp      → tsp
cups / cup                       → cup
```

Do not infer a unit merely from a prefix.

Prevent errors such as:

```text
1 cupcake
→ incorrect: 1 cup + "cake"
```

### 6.3 Suspicious parse detection

Detect cases like:

```text
quantity != None
unit == None
name starts with a known unit alias
```

Example:

```text
raw: "2 tablespoons all-purpose flour"

bad result:
quantity = 2
unit = None
name = "tablespoons all-purpose flour"

warning:
recognized_unit_left_in_name
```

Structured DOM evidence may then be used to recover the unit.

### 6.4 Preserve ambiguous quantities

Examples:

```text
1–2 cups broth
½–¾ cup milk
a handful of parsley
salt to taste
```

Do not fabricate precision.

Prefer partial canonicalization plus preserved source text.

---

## 7. Instruction Parser Reliability

### 7.1 Preserve structure when available

Do not rely exclusively on flattened `instructions_list()` output.

Use Schema.org `HowToSection` / `HowToStep` or bounded DOM structure as evidence when available.

### 7.2 Detect likely structure loss

Warnings should be generated for cases such as:

- multiple source instruction nodes collapsed into one step;
- standalone numbers becoming steps;
- repeated identical steps;
- unexpectedly huge instruction strings;
- instruction section exists but extracted step count is zero.

### 7.3 Keep grouping conservative

Ingredient-group and instruction-group recovery decisions must be independent.

Do not reject otherwise useful instructions simply because subgroup detection fails.

---

## 8. Notes Reliability

Use one shared note-heading classifier for website and text imports.

Examples:

```text
Notes
Recipe Notes
Chef's Notes
Cook's Notes
Key Notes
Helpful Notes
Additional Notes
Tips & Notes
Tips and Notes
Notes & Tips
```

The source page description is not equivalent to recipe notes.

For MVP, notes may continue mapping to the existing user-facing description field if required, but extraction must preserve the semantic difference internally.

---

## 9. Time Reliability

Treat each source time field independently:

```text
Prep       → prep_time_minutes
Cook       → cook_time_minutes
Total      → total_time_minutes
Chill      → additional_time(label="Chill")
Rest       → additional_time(label="Rest")
Cooling    → additional_time(label="Cooling")
Marinate   → additional_time(label="Marinate")
Proof      → additional_time(label="Proof")
```

Do not derive or overwrite explicit publisher values merely because they do not satisfy:

```text
Total == Prep + Cook + Additional
```

### 9.1 Fix text import canonicalization

The text parser must return recognized:

```text
total_time_minutes
additional_time_label
additional_time_minutes
```

as structured fields instead of relegating them to description text.

### 9.2 Multiple passive times

If several passive times exist:

```text
Rest: 30 min
Proof: 1 hr
```

do not choose one arbitrarily.

For MVP:

- preserve what can be preserved safely;
- emit a warning;
- allow Import Review to resolve ambiguity.

Do not add a complex new persisted time-component model unless real product demand justifies it.

---

## 10. Text Import Reliability

Text import should use staged structural confidence.

### Strong evidence

Explicit recognized sections:

```text
Ingredients
Instructions
Notes
```

### Medium evidence

Recipe-like blocks such as:

```text
title
ingredient-like lines

instruction-like lines
```

even if:

- not every ingredient has a numeric quantity;
- instructions are not numbered.

### Weak evidence

Unstructured prose without reliable recipe boundaries.

Only weak/no evidence should lead directly to `insufficient_structure`.

Do not require every ingredient to parse perfectly before accepting a valid ingredient block.

---

## 11. Import Diagnostics

Introduce internal warning codes.

Examples:

```text
recognized_unit_left_in_name
ingredient_range_preserved_raw
ingredient_parse_partial

possible_instruction_collapse
standalone_instruction_marker_removed

notes_heading_without_notes
multiple_passive_times
explicit_time_parse_failed

extractor.ingredients.failed
extractor.instructions.failed
extractor.nutrients.failed

primary_core_partial
dom_fallback_used
dom_fallback_partial
```

Initially these warnings may be used only for logs/tests.

Later the API may expose them to Import Review.

Do not expose implementation-heavy diagnostics directly as scary user-facing errors.

---

## 12. Error Taxonomy

Internal failures should distinguish:

```text
unsafe_url
fetch_timeout
page_unavailable
unsupported_content_type

no_recipe_candidate
multiple_recipes
ambiguous_structure

extractor_failed
core_partial
field_parse_failed
```

User-facing error vocabulary may remain smaller.

A useful partial draft should normally not be converted into an error.

---

## 13. Testing Strategy

Reliability should be driven by a growing regression corpus.

Workflow for every reported failure:

```text
real miss
    ↓
capture minimal/sanitized fixture
    ↓
define expected semantic output
    ↓
reproduce failing test
    ↓
implement generic fix
    ↓
run complete corpus
```

Never patch one hostname unless the failure is genuinely domain-specific transport behavior.

### 13.1 Test layers

Maintain all three levels:

#### Unit tests

Examples:

```text
quantity parsing
unit aliases
Unicode fractions
ranges
notes aliases
time aliases
instruction markers
```

#### Structural fixture tests

Examples:

```text
Schema.org
WPRM
microdata
nested HowToSection
DOM notes
DOM nutrition
grouped ingredients
grouped instructions
```

#### Site-shaped regression fixtures

Add fixtures based on actual failures.

Priority additions:

```text
Love & Lemons Apple Crisp
- units remain separated from ingredient names
- Unicode fractions preserved

Damn Delicious Pot Roast
- Notes imported

Tastes Better From Scratch Pumpkin Overnight Oats
- Prep = 5 min
- Chill = 8 hr
- Total = 5 min
- Notes imported

Gimme Some Oven Green Julius
- canonical source servings preserved
- fractions parsed cleanly
- Notes imported

Food Network Stuffed Green Peppers
- Total preserved
- Active is not incorrectly mapped to Prep or Cook
```

Mock only the network boundary where possible so the rest of the real extraction pipeline executes.

---

## 14. Reliability Metrics

Track these metrics from fixtures and, where safe, production diagnostics:

### Usable Draft Rate

```text
imports that produce an editable recipe draft
/
all valid recipe inputs
```

### Hard Error Rate

```text
valid recipe imports ending without any usable draft
/
all valid recipe imports
```

### Field Miss Rate

```text
source fields present but not recovered
/
expected recoverable fields
```

### Field Corruption Rate

```text
structured values that materially disagree with the source
/
structured parsed fields
```

Primary objective:

```text
field_corruption_rate ↓
hard_error_rate       ↓
field_miss_rate       ↓
usable_draft_rate     ↑
```

Perfect extraction rate is secondary.

---

## 15. Implementation Order

### Phase 1 — Failure Policy

- Allow useful partial drafts for website imports.
- Preserve primary useful fields when DOM fallback fails.
- Keep hard failures for truly unusable imports.

### Phase 2 — Metadata correctness

- Fix text parser total/additional-time output.
- Share note heading classifier across text and website.
- Split metadata scope from strict core DOM fallback scope.

### Phase 3 — Ingredient robustness

- Add shared ingredient lexical normalization.
- Normalize Unicode whitespace safely.
- Add suspicious unit-in-name detection.
- Add Love & Lemons fixture.

### Phase 4 — Extraction assessment

Introduce field-level assessment for:

- ingredients;
- instructions;
- notes;
- times;
- structural counts.

Replace count-only acceptance as the correctness decision.

### Phase 5 — Structured recovery evidence

Use:

- Schema.org JSON-LD;
- WPRM semantic DOM;
- bounded DOM;

only when primary normalized output is suspicious or incomplete.

### Phase 6 — Observability

- Record extractor exceptions separately from absent fields.
- Log warning codes, extraction strategy, fallback reason, and field counts.
- Never log raw HTML or private recipe text.

### Phase 7 — Regression corpus

Convert every real parser failure into a permanent regression fixture.

---

## 16. Non-Goals

This reliability work does not require:

- LLM parsing;
- browser automation / Playwright;
- Scrapy;
- JavaScript rendering;
- hostname-specific parsers;
- fuzzy NLP;
- perfect recognition of every cooking phrase;
- automatic correction of ambiguous source content;
- replacing `recipe-scrapers`;
- large schema redesigns.

---

## 17. Acceptance Criteria

The reliability work is considered successful when:

- valid partial website imports no longer become unnecessary `422` responses;
- Love & Lemons-style units do not remain inside ingredient names when recoverable;
- explicit Notes are consistently recovered across supported text and DOM structures;
- total/additional times survive text parsing;
- explicit source times are not recomputed incorrectly;
- suspicious structured outputs generate diagnostics rather than silently passing;
- parser failures remain deterministic and reproducible through fixtures;
- existing regression fixtures continue to pass;
- every newly discovered production miss can be converted into a failing fixture before its fix.

---

## 18. Engineering Principle

Noomori's parser should be:

> **Conservative when interpreting, aggressive when preserving, tolerant when returning results, and strict when fabricating data.**

Import Review is part of the reliability architecture, not evidence that the parser failed.
