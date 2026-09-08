# Noomori Import-from-Text Golden Fixture Pack

This pack contains synthetic, original recipe text designed to represent real-world
format classes without copying complete recipes from third-party websites.

## Layout

- `input/*.txt` — pasted recipe text
- `expected/*.json` — desired semantic contract
- `manifest.json` — fixture index

## Why these classes

The corpus covers:

1. explicit plain-text metadata;
2. Google Docs-style labels-first / values-later table flattening;
3. Markdown tables and headings;
4. publisher-style `Ingredients` + `Method`;
5. Indonesian informal recipe language;
6. missing headings;
7. ambiguous servings;
8. dynamic/ambiguous ingredient quantities;
9. wrapped numbered instructions;
10. Unicode/editor clipboard noise;
11. duplicate conflicting metadata;
12. multiple-recipe rejection;
13. notes versus footer noise;
14. ingredient groups without trailing colons;
15. alternating nutrition label/value blocks.

## Testing rule

Golden fixtures are regression anchors, not exhaustive coverage.

Use them together with:

- parser invariants;
- equivalence-class parameterization;
- metamorphic formatting transformations;
- property-based tests (e.g. Hypothesis).

## Important semantics

- `null` servings means unknown, never implicit `1`.
- ambiguous values must not silently collapse to exact scalars.
- local ambiguity should return a partial draft.
- global ambiguity should reject rather than merge unrelated recipes.
- meaningful source text should not silently disappear.
