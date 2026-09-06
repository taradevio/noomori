# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People who keep a personal recipe library and may share selected recipes with a household.

## Product Purpose

Noomori makes saved recipes fast to find, organize, and open during everyday cooking.

## Positioning

A calm, direct recipe library focused on routine use rather than content discovery or social browsing.

## Operating Context

Used frequently on phones while planning meals or cooking, with tablet support and large-text accessibility.

## Capabilities and Constraints

- Personal recipes are searchable from the primary Home grid.
- Cookbooks are a secondary organization view.
- Household recipes remain a separate top-level destination.
- Adding a recipe is a global action available from every top-level tab.
- Existing backend, recipe models, queries, caches, and recipe routes must remain unchanged.
- Expo SDK 56 and Expo Router UI are the implementation baseline.

## Brand Commitments

- Warm-white surfaces, teal identity, and a restrained gold primary action.
- Recipe photography supplies visual richness.
- No discovery categories, fabricated metadata, decorative pills, gradients, fake social features, or unnecessary containers.

## Evidence on Hand

- `specs/specs-v3.md`
- `specs/recipe-app-sharing.png`
- `specs/FireShot Capture 002 - Clay.png`
- `specs/navbar and add button.png`
- `specs/Mobile App Settings Screen.png`

## Product Principles

- Optimize for fast scanning and routine usability.
- Keep the primary recipe library direct and searchable.
- Use spacing and typography for hierarchy before adding containers.
- Preserve real content, routes, state, and accessibility semantics.

## Accessibility & Inclusion

- Maintain 48dp minimum targets and visible focus states.
- Support one-column layouts at font scale 1.3 and above.
- Respect reduced-motion preferences without removing state communication.
