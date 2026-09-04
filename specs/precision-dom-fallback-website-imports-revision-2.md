# Add a Precision DOM Fallback for Website Imports — Revision 2

## Summary

Keep `recipe-scrapers` as the primary website extractor.

Noomori already calls it with `supported_only=False`, allowing supported-site adapters and generic structured-data extraction to run before any custom fallback. Do not replace that behavior wholesale.

Add a narrow Beautiful Soup DOM fallback only when the normalized primary result is missing core recipe content.

Core recipe content is:

- at least one parsed ingredient; and
- at least one parsed instruction.

The fallback is intentionally conservative. It should prefer returning `recipe_not_found` over importing noisy, incomplete, ambiguous, or unrelated page content.

Also extend the existing deterministic text parser with a small set of Indonesian recipe-section aliases so that:

- DOM fallback pages using Indonesian headings can reuse the same parser;
- pasted Indonesian recipe text benefits from the same deterministic behavior;
- no separate Indonesian-only website parser is introduced.

Baseline: preserve the existing website-import test suite and all current fetch/security behavior.

## Architecture

```text
URL
 ↓
existing safe HTML fetch
 ↓
recipe-scrapers
 ↓
current website normalization
 ↓
ingredients AND instructions present?
 ├── yes → return primary result
 └── no
      ↓
   precision DOM fallback
      ↓
   one complete recipe candidate?
      ├── no → 422 recipe_not_found
      └── yes
           ↓
      structural recipe-like text
           ↓
      existing parse_recipe_text()
      + small Indonesian section aliases
           ↓
      ingredients AND instructions present?
           ├── yes → return fallback draft
           └── no → 422 recipe_not_found
```

The fallback must reuse the HTML already fetched by Noomori.

It must not perform a second network request.

## Implementation Changes

### 1. Preserve the Existing Safe Fetch Layer

Keep the existing URL-import fetch path unchanged.

The fallback must not run for:

- unsafe URL failures;
- DNS/SSRF validation failures;
- unsupported content types;
- oversized responses;
- excessive redirects;
- page-unavailable failures;
- fetch timeouts.

Only extraction-level failure or insufficient normalized recipe content may trigger the DOM fallback.

Do not add a second `requests`, Beautiful Soup, Scrapy, or browser fetch path.

### 2. Primary Extraction Quality Gate

Run the existing `recipe-scrapers` extraction and website normalization first.

Treat the normalized primary result as complete enough only when it contains:

```text
ingredient_count >= 1
AND
instruction_count >= 1
```

A title alone must not count as core recipe content.

Examples:

```text
title ✅
ingredients ✅
instructions ✅
→ accept primary
```

```text
title ✅
ingredients ✅
instructions ❌
→ try DOM fallback
```

```text
title ✅
ingredients ❌
instructions ✅
→ try DOM fallback
```

```text
title ✅
ingredients ❌
instructions ❌
→ try DOM fallback
```

Fallback activation should therefore occur when:

- `recipe-scrapers` raises `recipe_not_found`; or
- the normalized primary result lacks ingredients; or
- the normalized primary result lacks instructions.

Do not merge primary and fallback core fields.

### 3. Beautiful Soup Dependency

Declare `beautifulsoup4` as a direct server dependency because Noomori will import it directly.

Keep `recipe-scrapers`.

Regenerate the server lockfile through the repository's existing dependency workflow.

Do not rely on Beautiful Soup being installed transitively through another package.

### 4. Precision DOM Candidate Extraction

Add a focused Beautiful Soup fallback inside the existing website-import server area.

Remove non-recipe/noise elements before candidate detection, including:

```text
script
style
template
nav
header
footer
aside
form
```

Where practical, also ignore obvious:

```text
advertisement
share controls
newsletter
breadcrumbs
related content
product recommendations
```

Do not fall back to the full `<body>`.

Candidate roots may include:

- `article`;
- `main`;
- elements whose ID or class strongly indicates recipe content.

A candidate must contain:

- a visible title heading;
- an explicit ingredient-section heading; and
- an explicit instruction-section heading.

A generic heading match alone is insufficient if the complete recipe structure is not contained within the same candidate.

### 5. Canonical Recipe Section Aliases

Keep a small deterministic alias set for top-level recipe sections.

English ingredient aliases:

```text
ingredient
ingredients
```

Indonesian ingredient aliases:

```text
bahan
bahan-bahan
```

English instruction aliases:

```text
instruction
instructions
direction
directions
method
```

Indonesian instruction aliases:

```text
cara membuat
cara memasak
langkah
langkah-langkah
```

Normalize matching conservatively:

- case-insensitive;
- trim surrounding whitespace;
- tolerate a trailing colon;
- tolerate repeated whitespace;
- do not use fuzzy semantic matching.

Example:

```text
BAHAN-BAHAN:
→ ingredients
```

```text
Cara Membuat
→ instructions
```

Do not interpret arbitrary headings containing the word `bahan` or `cara` as a top-level recipe section unless they match the explicit alias rules.

### 6. Section Subgroups

Within an active top-level recipe section, preserve meaningful subsection headings as group titles instead of flattening everything.

Examples:

```text
Ingredients
  Bahan-Bahan Cah Jamur
  Garnish
```

and:

```text
Instructions
  Tahu Bayam
  Cah Jamur
```

should remain conceptually equivalent to:

```text
ingredient group
ingredient group
```

and:

```text
instruction group
instruction group
```

respectively.

Top-level section aliases and subgroup headings must remain distinct concepts.

For example:

```text
Bahan-Bahan
```

may activate the Ingredients section.

But:

```text
Bahan-Bahan Cah Jamur
```

inside an already-active Ingredients section should be preserved as an ingredient-group title rather than activating a new top-level section.

### 7. Candidate Selection

Select the smallest complete container, not simply the deepest matching DOM element.

A complete candidate must contain the required recipe structure inside one shared container:

```text
title
+
ingredient section
+
instruction section
```

Selection behavior:

```text
one qualifying candidate
→ use it
```

```text
nested qualifying candidates
→ choose the smallest complete candidate
```

```text
two or more disjoint complete recipe candidates
→ reject as ambiguous
→ recipe_not_found
```

Never merge separate recipe candidates.

### 8. Structural DOM Serialization

Serialize only the selected recipe container.

Preserve enough HTML structure for the existing deterministic text parser.

Recommended mapping:

```text
h1–h4     → heading line
ul > li   → "- <text>"
ol > li   → "N. <text>"
p         → paragraph line
br        → newline
```

Example:

```html
<h1>Mild Indian Goat Curry</h1>

<h2>Ingredients</h2>
<ul>
  <li>500g diced goat meat</li>
  <li>2 onions</li>
</ul>

<h2>Method</h2>
<ol>
  <li>Heat the oil.</li>
  <li>Add the goat meat.</li>
</ol>
```

becomes:

```text
Mild Indian Goat Curry

Ingredients
- 500g diced goat meat
- 2 onions

Method
1. Heat the oil.
2. Add the goat meat.
```

Indonesian example:

```html
<h1>Tahu Bayam Cah Jamur</h1>

<h2>BAHAN-BAHAN</h2>

<h3>Bahan-Bahan Cah Jamur</h3>
<ul>
  <li>100 gr jamur shimeji</li>
  <li>1 sdm minyak wijen</li>
</ul>

<h3>Garnish</h3>
<ul>
  <li>Bawang daun dan cabai merah iris</li>
</ul>

<h2>CARA MEMBUAT</h2>

<h3>Tahu Bayam</h3>
<ol>
  <li>Haluskan bayam.</li>
  <li>Peras airnya.</li>
</ol>

<h3>Cah Jamur</h3>
<ol>
  <li>Siapkan wadah.</li>
  <li>Tumis bawang putih.</li>
</ol>
```

should serialize into parser-friendly text that preserves:

```text
title
top-level section
subgroup title
list items
top-level section
subgroup title
ordered steps
```

Normalize repeated whitespace while preserving meaningful line, heading, list, and group boundaries.

Do not serialize unrelated article prose outside the chosen recipe container.

### 9. Text Length Limit

Reuse the existing `RECIPE_TEXT_MAX_CHARS` limit of 20,000 characters.

Do not silently truncate fallback text.

Behavior:

```text
serialized candidate <= 20,000 chars
→ continue
```

```text
serialized candidate > 20,000 chars
→ abort fallback
→ recipe_not_found
```

Silent truncation is prohibited because it could create an apparently valid but incomplete recipe.

### 10. Reuse the Existing Deterministic Text Parser

Pass the serialized fallback text through the existing:

```python
parse_recipe_text(...)
```

Do not add a second ingredient/instruction parser specifically for website fallback.

The DOM fallback is responsible only for:

```text
HTML
→ precise recipe-like text
```

The existing parser remains responsible for:

```text
recipe-like text
→ ImportedRecipeTextDraft
```

Extend only the parser's top-level section aliases required for deterministic Indonesian recipe headings.

Do not add broad natural-language inference.

### 11. Fallback Acceptance Gate

After `parse_recipe_text()` returns a fallback draft, require:

```text
parsed ingredient_count >= 1
AND
parsed instruction_count >= 1
```

If either is missing:

```text
recipe_not_found
```

A title may remain optional at the parser/model layer, but the DOM candidate itself must have contained an explicit visible title heading before fallback extraction was attempted.

This fallback is not intended to rescue partial recipe pages.

### 12. No Field-Level Merging

Do not combine core recipe fields from different extraction strategies.

For example:

```text
primary ingredients
+
fallback instructions
```

is prohibited.

That could create a recipe assembled from unrelated page regions.

Use exactly one core extraction result:

```text
primary complete enough
→ primary result
```

otherwise:

```text
fallback complete enough
→ fallback result
```

otherwise:

```text
recipe_not_found
```

### 13. Images

Keep fallback `image_url` unset.

Do not add DOM image selection, OpenGraph image heuristics, or field-level image merging in this feature.

Image enrichment may be considered separately later.

### 14. Logging and Telemetry

Record which extraction strategy produced the successful result:

```text
extraction_strategy=recipe_scrapers
```

or:

```text
extraction_strategy=dom_fallback
```

When the fallback is invoked, also record a coarse reason such as:

```text
fallback_reason=primary_exception
fallback_reason=primary_missing_ingredients
fallback_reason=primary_missing_instructions
fallback_reason=primary_missing_both
```

Useful numeric context may include:

```text
ingredient_count
instruction_count
candidate_count
```

Do not log:

- raw HTML;
- full extracted recipe text;
- complete recipe content.

Keep logs diagnostic rather than content-bearing.

## Interfaces and Errors

No client, request, response, recipe-type, database, or API contract changes.

`POST /recipes/import/url` continues returning the existing:

```text
ImportedRecipeTextDraft
```

Successful fallback drafts continue through the existing Import Review flow and normal recipe-save path.

Failed, incomplete, oversized, or ambiguous fallback extraction returns:

```text
422 recipe_not_found
```

Existing fetch/security errors retain their current error codes and status mappings.

## Test Plan

### Existing Primary Extraction

- Preserve the current JSON-LD / structured-data fixture behavior.
- Verify a complete primary extraction does not invoke the DOM fallback.
- Preserve all existing fetch, SSRF, redirect, timeout, content-type, and size-limit tests.

### Primary Quality Gate

Verify fallback activation when:

- the primary extractor throws `recipe_not_found`;
- primary normalization produces ingredients but no instructions;
- primary normalization produces instructions but no ingredients;
- primary normalization produces neither.

Verify fallback is not invoked when primary normalization contains both ingredients and instructions.

### DOM Candidate Detection

Add fixtures verifying:

- one complete recipe candidate succeeds;
- nested complete candidates select the smallest complete container;
- separate/disjoint recipe candidates return `recipe_not_found`;
- a page with only an Ingredients/Bahan section returns `recipe_not_found`;
- a page with only a Method/Instructions/Cara Membuat section returns `recipe_not_found`;
- a page without an explicit recipe title heading returns `recipe_not_found`;
- generic article content without explicit recipe sections returns `recipe_not_found`.

### Section Alias Tests

Verify the deterministic parser recognizes:

```text
Ingredients
Ingredient
Bahan
Bahan-Bahan
Instructions
Instruction
Directions
Direction
Method
Cara Membuat
Cara Memasak
Langkah
Langkah-Langkah
```

Verify matching remains conservative:

- case-insensitive;
- optional trailing colon;
- no fuzzy/substring activation;
- subgroup headings are not confused with top-level section aliases.

### Group Preservation

Verify ingredient and instruction subgroups remain isolated and ordered.

Example:

```text
Ingredients
  Main
  Sauce
  Garnish
```

must not flatten into one unrelated block when the source clearly exposes groups.

Likewise:

```text
Instructions
  Tahu Bayam
  Cah Jamur
```

must preserve both instruction groups and their internal step order.

### Noise Exclusion

Verify the fallback excludes:

- scripts;
- styles;
- templates;
- navigation;
- sidebars;
- footer content;
- forms;
- ads where represented in the fixture;
- social/share controls;
- product-related blocks;
- related recipes;
- article recommendations outside the selected recipe container.

### Structural Serialization

Verify:

- headings remain distinct lines;
- unordered lists retain ingredient-style list prefixes;
- ordered lists retain deterministic numbering;
- paragraphs remain in DOM order;
- subgroup headings remain distinguishable from list items;
- multiline content remains parser-friendly;
- repeated whitespace is normalized without joining unrelated fields.

### Text Limit

Verify:

- candidates at or below 20,000 characters may proceed;
- candidates above 20,000 characters are rejected;
- no truncation occurs.

### Deterministic Parser Reuse

Verify fallback content passes through `parse_recipe_text()` and produces:

- expected title;
- expected ingredient quantities/units;
- ingredient groups where present;
- instruction groups/steps;
- supported metadata already handled by the existing parser.

### Regression Fixture 1 — Scottish Goat Meat

Add a minimized static fixture representing the relevant structure of:

```text
https://www.scottishgoatmeat.co.uk/mild-indian-goat-curry.html
```

The fixture must not depend on live HTTP.

Represent the relevant pattern:

```text
title heading
Ingredients heading
unordered ingredient list
Method heading
ordered instruction list
```

Expected behavior:

```text
primary extraction
→ insufficient / recipe_not_found

DOM fallback
→ success

title ✅
ingredients ✅
instructions ✅
```

This fixture covers:

```text
unlisted domain
English headings
simple flat recipe structure
static HTML
```

### Regression Fixture 2 — Sasa Indonesia

Add a minimized static fixture representing the relevant structure of:

```text
https://www.sasa.co.id/kreasisasa/recipe/tahu-bayam-cah-jamur
```

The fixture must not depend on live HTTP.

Represent the relevant recipe structure:

```text
Tahu Bayam Cah Jamur

BAHAN-BAHAN

Bahan-Bahan Cah Jamur
- ingredient
- ingredient

Garnish
- garnish ingredient

CARA MEMBUAT

Tahu Bayam
1. instruction
2. instruction

Cah Jamur
1. instruction
2. instruction
```

Also include representative surrounding noise outside the selected recipe container, such as:

```text
TIPS PENYAJIAN
Produk Terkait
Resep Lainnya
Artikel Terkait
```

Expected behavior:

```text
primary extraction
→ insufficient / recipe_not_found

DOM fallback
→ success

title ✅
ingredient groups ✅
instruction groups ✅
ingredient order preserved ✅
instruction order preserved ✅
noise excluded ✅
```

This fixture covers:

```text
Indonesian headings
localized top-level section aliases
nested ingredient groups
nested instruction groups
surrounding page noise
static HTML
```

The regression assertion must ensure unrelated content does not leak into the recipe.

Examples:

```text
"Produk Terkait" not in serialized recipe text
"Resep Lainnya" not in serialized recipe text
"Artikel Terkait" not in serialized recipe text
```

Do not assert against a live website response.

### Logging

Verify successful paths record:

```text
recipe_scrapers
```

or:

```text
dom_fallback
```

and fallback invocation records the correct coarse reason.

Do not assert or emit raw recipe page content in logs.

### Full Regression

Run:

- website-import tests;
- recipe-text-import tests;
- complete server test suite.

Do not fix unrelated baseline failures as part of this feature.

## Assumptions

- Precision is preferred over maximizing import success rate.
- Only static, publicly fetchable HTML is supported.
- English and a narrow set of Indonesian recipe-section aliases are supported deterministically.
- No JavaScript rendering is added.
- No authentication/cookie flow is added.
- No anti-bot bypass is added.
- No Scrapy crawler is added.
- No site-specific scraper is added.
- No whole-page heuristic extraction is added.
- No LLM extraction is added.
- No field-level merge between primary and fallback is added.
- Existing safe-fetch behavior remains the sole network acquisition layer.
- Existing deterministic text parsing remains the sole fallback recipe parser.

## Out of Scope

This feature does not add:

- Playwright or browser rendering;
- Scrapy;
- site-specific selectors/adapters;
- authenticated website imports;
- anti-bot workarounds;
- image extraction heuristics;
- AI/LLM recipe extraction;
- bulk crawling;
- multiple-recipe page support;
- broad multilingual NLP;
- fuzzy heading classification;
- client/UI changes;
- database/schema changes;
- unrelated Expo/frontend work.

## Acceptance Criteria

The feature is complete when:

1. A recipe page already handled correctly by `recipe-scrapers` continues using the primary extraction path.
2. An unlisted static English recipe page with a clear title, Ingredients section, and Instructions/Directions/Method section can be imported through the DOM fallback.
3. An unlisted/static Indonesian recipe page with `BAHAN-BAHAN` and `CARA MEMBUAT` can be imported through the same deterministic fallback path.
4. Ingredient and instruction subgroups remain ordered and isolated when represented by the source structure.
5. The fallback never reads the entire page body as a generic recipe.
6. Ambiguous pages with multiple disjoint recipes are rejected.
7. Incomplete pages without both ingredients and instructions are rejected.
8. Fallback content is never silently truncated.
9. Existing fetch and SSRF protections are unchanged.
10. The client API contract remains unchanged.
11. Imported fallback recipes still enter the normal review/edit flow before save.
12. The Scottish Goat Meat-style regression fixture imports successfully through the fallback.
13. The Sasa-style regression fixture imports successfully through the fallback.
14. Sasa-style surrounding content such as product recommendations, related recipes, and article links does not leak into the imported recipe.
