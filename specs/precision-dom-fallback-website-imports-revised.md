# Add a Precision DOM Fallback for Website Imports — Revised Plan

## Summary

Keep `recipe-scrapers` as the primary website extractor.

Noomori already calls it with `supported_only=False`, allowing supported-site adapters and generic structured-data extraction to run before any custom fallback. Do not replace that behavior wholesale.

Add a narrow Beautiful Soup DOM fallback only when the normalized primary result is missing core recipe content.

Core recipe content is:

- at least one parsed ingredient; and
- at least one parsed instruction.

The fallback is intentionally conservative. It should prefer returning `recipe_not_found` over importing noisy, incomplete, or unrelated page content.

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
      structured recipe-like text
           ↓
      existing parse_recipe_text()
           ↓
      ingredients AND instructions present?
           ├── yes → return fallback draft
           └── no → 422 recipe_not_found
```

The fallback must reuse the HTML already fetched by Noomori. It must not perform a second network request.

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

Do not add a second `requests`, Beautiful Soup, or Scrapy fetch path.

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

Where practical, also ignore obvious ad/share/navigation containers.

Do not fall back to the full `<body>`.

Candidate roots may include:

- `article`;
- `main`;
- elements whose ID or class strongly indicates recipe content.

A candidate must contain:

- a visible title heading;
- an explicit Ingredients heading; and
- an explicit Instructions, Directions, or Method heading.

A generic heading match alone is insufficient if the complete recipe structure is not contained within the same candidate.

### 5. Candidate Selection

Select the smallest complete container, not simply the deepest matching DOM element.

A complete candidate must contain the required recipe structure inside one shared container:

```text
title
+
ingredients section
+
instructions/directions/method section
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

### 6. Structural DOM Serialization

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

Normalize repeated whitespace while preserving meaningful line and list boundaries.

Do not serialize navigation, ads, related recipes, newsletter content, footer content, or unrelated article prose outside the chosen recipe container.

### 7. Text Length Limit

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

### 8. Reuse the Existing Deterministic Text Parser

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

### 9. Fallback Acceptance Gate

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

### 10. No Field-Level Merging

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

### 11. Images

Keep fallback `image_url` unset.

Do not add DOM image selection, OpenGraph image heuristics, or field-level image merging in this feature.

Image enrichment may be considered separately later.

### 12. Logging and Telemetry

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
- a page with only an Ingredients section returns `recipe_not_found`;
- a page with only a Method/Instructions section returns `recipe_not_found`;
- a page without an explicit recipe title heading returns `recipe_not_found`;
- generic article content without explicit recipe sections returns `recipe_not_found`.

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
- related-recipe content outside the selected container.

### Structural Serialization

Verify:

- headings remain distinct lines;
- unordered lists retain ingredient-style list prefixes;
- ordered lists retain deterministic numbering;
- paragraphs remain in DOM order;
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

### Regression Fixture

Add a minimized static fixture representing the structure of:

```text
https://www.scottishgoatmeat.co.uk/mild-indian-goat-curry.html
```

The fixture should represent the relevant structural pattern rather than depending on a live HTTP request:

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

Do not make tests depend on the live external site.

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
- client/UI changes;
- database/schema changes;
- unrelated Expo/frontend work.

## Acceptance Criteria

The feature is complete when:

1. A recipe page already handled correctly by `recipe-scrapers` continues using the primary extraction path.
2. An unlisted static recipe page with a clear title, Ingredients section, and Instructions/Directions/Method section can be imported through the DOM fallback.
3. The fallback never reads the entire page body as a generic recipe.
4. Ambiguous pages with multiple disjoint recipes are rejected.
5. Incomplete pages without both ingredients and instructions are rejected.
6. Fallback content is never silently truncated.
7. Existing fetch and SSRF protections are unchanged.
8. The client API contract remains unchanged.
9. Imported fallback recipes still enter the normal review/edit flow before save.
10. The Scottish Goat Meat-style regression fixture imports successfully through the fallback.
