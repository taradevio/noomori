# Noomori Home Redesign Specification

> **Status:** Draft v3  
> **Scope:** Home / Recipes library visual redesign only  
> **Repository:** `taradevio/noomori`  
> **Primary platform:** React Native / Expo  
> **Current UI stack:** NativeWind, Expo Router, NativeTabs, Expo Symbols, Reanimated, Gesture Handler, Keyboard Controller  
> **Design direction:** Warm Editorial Utility with Playful Precision  
> **Backend changes:** None  
> **Data model changes:** None  
> **API changes:** None  

---

## 1. Objective

Redesign the current Noomori Home / Recipes library so it feels like a polished consumer mobile product while preserving the working application architecture and behavior.

The redesign must:

- keep Noomori recipe-manager-first,
- keep food imagery visually dominant,
- preserve current responsive and accessibility behavior,
- migrate the visual identity from clay/coral + sage to teal + warm gold,
- use the selected Figma Recipe Sharing App Home frame as the primary mobile composition reference,
- use Clay as the visual-craft and personality reference,
- use Emil Kowalski's design-engineering and Expo animation skills as interaction/motion guardrails,
- keep the current Noomori repository as the source of truth for behavior and product capability,
- avoid backend changes,
- avoid fake product features,
- avoid replacing stable primitives unless there is a clear UX reason.

The implementation should be an **evolution of the current design system**, not a rewrite.

---

# 2. Reference & Authority Hierarchy

The redesign uses five layers with clearly separated responsibilities so the agent does not oscillate when UI/UX guidance overlaps.

## 2.1 Current Noomori repository — product & engineering source of truth

The current codebase has the highest authority over:

- available data and product capability,
- routes and navigation semantics,
- recipe/cookbook/household behavior,
- Activity behavior,
- query architecture,
- accessibility contracts,
- loading/error/empty states,
- performance-sensitive implementation decisions.

If a visual reference or design skill conflicts with current Noomori behavior:

> **Noomori wins.**

Do not invent a product feature to satisfy a visual reference.

## 2.2 Figma Recipe Sharing App — primary mobile composition reference

Use the selected Home frame for:

- compact mobile header proportions,
- food-first vertical rhythm,
- hero/image + context composition,
- layered rounded surfaces,
- horizontal recipe sections,
- section-title + action patterns,
- bottom-navigation proportions,
- center Add action,
- mobile spacing rhythm.

Do not inherit discovery-oriented concepts such as ratings, reviews, creator identity, cuisine taxonomy, Daily Recipe, or discovery navigation.

> **Use the composition, not the product.**

## 2.3 Clay — visual craft reference

Use Clay for:

- visual confidence,
- deliberate shapes,
- polished spacing,
- strong hierarchy,
- expressive but restrained details,
- thoughtful alignment,
- confident color use,
- small moments of delight.

Do not copy marketing-site animation density, giant display typography, decorative objects without utility, hover-driven behaviors, or web-only novelty.

Noomori should translate Clay's craft into a daily-use mobile utility.

## 2.4 Impeccable — UI/UX quality gate

Use Impeccable as the UI/UX critique, audit, and polish layer.

It has authority over questions such as:

- Is the hierarchy clear?
- Is spacing intentional?
- Does the screen feel generic?
- Is the UI becoming card soup?
- Are too many elements competing for emphasis?
- Are typography and density appropriate?
- Are components visually consistent?
- Are anti-patterns creeping in?
- Does the screen feel polished rather than AI-generated?
- Can the composition be simpler and stronger?

Use Impeccable most heavily for:

```text
static UI critique
visual hierarchy review
spacing / density review
design-system consistency
final polish
anti-slop review
```

Impeccable is **not** the final authority for Expo motion implementation.

## 2.5 Emil Kowalski skills — interaction & motion authority

Use:

```text
emil-design-eng
animate-expo
find-animation-opportunities
review-animations
improve-animations
```

For Expo-specific interaction or animation decisions:

> **`animate-expo` is the source of truth.**

This includes whether something should animate, press feedback, tab behavior, gestures, spring vs timing, easing, duration, Reanimated usage, reduced motion, sheet motion, and animation performance.

> **Static hierarchy must already feel good with motion disabled.**

## 2.6 Authority summary

```text
Current Noomori
→ product behavior + engineering source of truth

Figma Recipe Sharing App
→ mobile composition / layout reference

Clay
→ visual craft / personality reference

Impeccable
→ UI/UX critique, audit, polish, anti-slop quality gate

Emil Kowalski / animate-expo
→ interaction + motion source of truth
```

## 2.7 Conflict resolution

When guidance overlaps:

```text
Product behavior conflict
→ Noomori wins

Layout/composition conflict
→ Figma informs, Noomori product constraints decide

Visual polish conflict
→ Impeccable leads

Motion conflict
→ Emil / animate-expo leads

Engineering stability conflict
→ preserve current architecture unless the UX gain clearly justifies the regression cost
```

Examples:

- Figma suggests ratings, but Noomori has no ratings → do not add them.
- Figma has five tabs, but Noomori has three real destinations → keep Noomori IA.
- Impeccable suggests simplifying nested cards → simplify unless behavior requires the structure.
- A general critique suggests animated tabs, but `animate-expo` says tabs should not slide → no custom tab animation.
- A pixel-perfect navbar would require replacing stable NativeTabs → keep NativeTabs unless the UX benefit is substantial.

## 2.8 Agent working sequence

```text
1. Understand current Noomori behavior
2. Compose the screen using Figma layout language
3. Add Clay-inspired visual craft
4. Run Impeccable critique/audit
5. Fix hierarchy, spacing, density, and visual slop
6. Lock static UI
7. Find only justified animation opportunities
8. Implement motion with animate-expo
9. Run Impeccable visual audit again
10. Run Emil animation review
11. Validate on physical Android release build
```

Do not repeatedly change the visual direction after static UI is locked unless a real usability problem is found.

# 3. Design Direction

The target visual language is:

> **Warm Editorial Utility with Playful Precision**

Noomori should feel:

- calm,
- warm,
- food-first,
- editorial,
- modern,
- trustworthy,
- slightly playful,
- polished,
- easy to scan,
- suitable for frequent household use.

"Playful" should come from:

- shape,
- accent placement,
- imagery,
- spacing,
- subtle interaction feedback,
- occasional illustration,

not from:

- bounce everywhere,
- cartoon styling,
- gradients everywhere,
- novelty navigation,
- unnecessary animation.

---

# 4. Current-State Summary

The repository already has:

```text
src/shared/design-system/
  colors.json
  foundations.ts
  theme.ts
  index.ts
```

Current visual identity:

```text
background      #F6F1E8
surface         #FFFDF8
surfaceSubtle   #EDE4D6
textPrimary     #2E2A27
textSecondary   #6D655E
primary         #C86A4A
primaryStrong   #B95E40
secondary       #7A8B68
border          #CFC5B7
error           #B94A48
success         #657A58
onPrimary       #FFFDF8
```

Current Home route:

```text
src/app/(tabs)/index.tsx
```

Current Home view:

```text
src/shared/components/recipe/recipes-library-view.tsx
```

Current recipe card:

```text
src/shared/components/recipe/recipe-card.tsx
```

Current primary tabs:

```text
src/routes/app-tabs.tsx
```

Current Home already provides:

- semantic NativeWind color usage,
- 2-column mobile grid,
- 1-column fallback at larger font scale,
- 3-column tablet grid,
- reduced-motion awareness,
- accessibility labels and roles,
- safe-area handling,
- recipe search,
- recipe/cookbook states,
- loading / empty / error states,
- NativeTabs,
- existing Add Recipe flow.

These are behavioral assets, not legacy baggage.

Preserve them unless this spec explicitly changes presentation.

---

# 5. Product Principles

## 5.1 Food first

Priority:

```text
Recipe content
>
Primary action
>
Household context
>
Navigation
>
Decoration
```

## 5.2 Quiet utility

Routine interaction should remain calm.

## 5.3 Personal-first, household-aware

Home must remain complete for solo users.

## 5.4 No fabricated capability

Do not imply features not supported by Noomori.

## 5.5 Craft over ornament

A polished Noomori screen should feel expensive because of:

- spacing,
- typography,
- alignment,
- touch behavior,
- state clarity,
- imagery,
- consistency,

not because it has more effects.

---

# 6. Scope

## In scope

- Home visual hierarchy
- compact Home header
- search styling
- optional utility hero
- Recently Added horizontal recipe section
- primary recipe-library section
- recipe-card visual evolution
- Recipes/Cookbooks visual presentation where retained
- bottom navigation visual direction
- center Add Recipe action
- Home-required design tokens
- Home press states and micro-interactions
- reduced-motion behavior
- accessibility regression prevention
- Home-specific tests

## Out of scope

- backend
- API endpoints
- database schema
- import parser behavior
- household authorization
- recipe detail redesign
- recipe editor redesign
- onboarding redesign
- account redesign
- full dark mode rollout
- global font migration
- gluestack-ui migration
- custom navigation framework rewrite
- recommendation engine
- ratings/reviews
- social discovery
- new taxonomy systems

---

# 7. Design-System Migration Strategy

Keep:

```text
src/shared/design-system/
```

Do not introduce a second competing theme layer.

The redesign should continue consuming semantic tokens through:

- NativeWind,
- shared design-system exports,
- Expo Router theme where relevant.

Avoid raw feature-level hex values.

---

# 8. Color Direction

Source palette:

```text
#001219
#005F73
#0A9396
#94D2BD
#E9D8A6
#EE9B00
#CA6702
#BB3E03
#AE2012
#9B2226
```

Target semantic mapping:

```text
background           #FFFDF8
surface              #FFFFFF
surfaceSubtle        #F6F2E8

textPrimary          #001219
textSecondary        #4E6268

primary              #005F73
primaryStrong        #004B5A

secondary            #0A9396
brandSoft            #94D2BD

accent               #EE9B00
warmSoft             #E9D8A6

border               #DDE4E1
borderStrong         #BAC8C4

error                #AE2012
success              #0A9396
warning              #CA6702

onPrimary            #FFFFFF
onSecondary          #001219
onAccent             #001219
```

Derived colors are allowed where semantic completeness requires them.

---

# 9. Color Usage Rule

Recommended visual distribution:

```text
70–80% neutral / warm white
10–15% recipe photography
5–10% teal brand
<5% warm gold accent
```

Rule:

> **Teal establishes Noomori. Gold adds emphasis. Food photography carries visual richness.**

Do not scatter every source-palette color across one screen.

---

# 10. `colors.json` Target

```json
{
  "background": "#FFFDF8",
  "surface": "#FFFFFF",
  "surfaceSubtle": "#F6F2E8",
  "textPrimary": "#001219",
  "textSecondary": "#4E6268",
  "primary": "#005F73",
  "primaryStrong": "#004B5A",
  "secondary": "#0A9396",
  "brandSoft": "#94D2BD",
  "accent": "#EE9B00",
  "warmSoft": "#E9D8A6",
  "border": "#DDE4E1",
  "borderStrong": "#BAC8C4",
  "error": "#AE2012",
  "success": "#0A9396",
  "warning": "#CA6702",
  "onPrimary": "#FFFFFF",
  "onSecondary": "#001219",
  "onAccent": "#001219"
}
```

Compatibility aliases may remain during migration.

---

# 11. NativeWind Tokens

Extend `tailwind.config.js` for:

```text
bg-accent
text-accent
bg-brand-soft
bg-warm-soft
border-border-strong
text-warning
bg-warning
text-on-secondary
text-on-accent
```

Existing semantic utilities should remain valid during migration.

---

# 12. Spacing

Base unit:

```text
4
```

Preferred scale:

```text
4
8
12
16
20
24
32
40
48
64
```

Home reference:

```text
screen gutter mobile       16
tablet gutter              24
card gap                   12
section header → content   12
section → section          24–32
```

Do not introduce arbitrary spacing unless optical correction requires it.

---

# 13. Typography

Do not migrate the app to DM Sans during this phase.

Keep current platform system fonts.

Home target:

```text
Greeting / screen identity
20–24 / 26–30 / 700

Section title
18–20 / 24–26 / 600–700

Recipe-card title
15–17 / 20–23 / 600

Body
15–16 / 22–24 / 400

Metadata
12–14 / 16–20 / 400–500

Action / chip
13–14 / 18 / 600
```

Avoid tiny metadata solely to fit more cards.

---

# 14. Primary Home Composition

The Figma Home frame is the composition reference.

Noomori adaptation:

```text
Safe Area

Compact Header

Search

Optional Utility Hero

Rounded Main Content Surface

Recently Added
horizontal compact recipes →

Your Recipes / Library
responsive readable cards

Bottom Navigation
center Add action
```

The final page should feel vertically layered without becoming decorative.

---

# 15. Compact Header

Reference characteristics:

```text
height around 72
horizontal gutter 16
avatar around 40
compact trailing action around 40
```

Noomori preferred:

```text
[avatar] Hello, <display name>
```

or:

```text
Noomori
Your recipes, all in one place.
```

Use profile data only if it is already available without new data-layer work.

If Activity remains relevant, the current Activity action may remain as a trailing control.

Do not add a bell only because the reference has one.

---

# 16. Search

Keep current search behavior.

Target visual:

```text
height: 48
radius: 12
background: surfaceSubtle
border: transparent or very subtle
focus state: primary / secondary
icon: textSecondary
```

Preserve:

- clear action,
- accessibility label,
- keyboard search,
- current filtering behavior.

---

# 17. Optional Utility Hero

The Figma reference uses a large recipe hero.

In Noomori, a hero is allowed **only if it represents real utility**.

Acceptable concepts:

```text
Recently viewed
Latest saved
Continue with a recently opened recipe
```

Do not implement:

```text
Daily Recipe
Trending
Recommended for you
Rating
Creator profile
Cuisine discovery
```

unless the product later explicitly supports them.

If there is no useful hero concept using current data:

> **omit the hero.**

The page must still feel intentional without it.

---

# 18. Hero Composition

If implemented:

```text
large food image
+
compact information strip
```

Reference-inspired anatomy:

```text
┌──────────────────────────────┐
│                              │
│         Food image           │
│                              │
├──────────────────────────────┤
│ Recipe title      metadata   │
└──────────────────────────────┘
```

Suggested image height:

```text
140–170
```

Do not overlay unnecessary text on photography.

---

# 19. Rounded Main Content Surface

Use the Figma reference's layered transition as inspiration.

Recommended:

```text
surface background
top-left radius: 24
top-right radius: 24
```

This surface may contain:

- recent content,
- recipe-library content,
- compact section hierarchy.

Important:

> **Do not copy the Figma drag handle unless the surface is actually draggable.**

A drag indicator is an interaction affordance.

Static content must not pretend to be a sheet.

---

# 20. Quick Category Grid

The Figma reference has:

```text
4 × 2
meal/category shortcuts
```

Do **not** implement this category grid in Noomori Home during this phase.

Reason:

- Noomori does not currently need a discovery taxonomy,
- it would imply product capability not yet established,
- it risks shifting the app toward recipe discovery.

If future product needs justify quick shortcuts, revisit separately.

---

# 21. Recently Added Section

This section should use the Figma's horizontal-section pattern.

Anatomy:

```text
Recently added                See all

[compact card] [compact card] [compact card] →
```

This provides a visually distinct quick-access layer above the full library.

Do not make this a second large 2-column grid.

---

# 22. Recently Added Data Contract

No backend changes.

Only label a section `Recently added` if the existing loaded recipe order or timestamps make that meaning truthful.

Allowed:

- use already-available `created_at` if present in the current model,
- derive a short subset from the existing loaded list.

Not allowed:

- fabricate recency,
- add an endpoint just for the redesign.

Fallback when recency cannot be determined safely:

```text
Your recipes
```

and omit the separate Recent section.

---

# 23. Compact Recent Recipe Card

Reference inspiration:

```text
small square-ish image
short title
minimal metadata
```

Noomori target:

```text
width: 140–160
image: 1:1 or 4:3
title: max 2 lines
metadata: one short row maximum
```

Do not copy:

- ratings,
- review count,
- creator verification.

Possible metadata:

```text
30 min
Family
Cookbook name
```

only when real and useful.

---

# 24. Primary Recipe Library

Below Recent:

```text
Your recipes
```

or existing appropriate library label.

Use current responsive grid behavior:

```text
fontScale >= 1.3
→ 1 column

mobile
→ 2 columns

tablet
→ 3 columns
```

This remains the main recipe-management surface.

---

# 25. Main Recipe Card

Evolve current `RecipeCard`.

Keep:

- 4:3 imagery,
- image caching,
- error retry,
- accessibility label,
- real metadata only,
- household/shared context,
- responsive width.

Target:

```text
radius: 16
surface: white
border: subtle
shadow: none or nearly imperceptible
```

Title:

```text
15–16
600
max 2 lines
```

Photography should visually dominate.

---

# 26. Shared Recipe Context

Keep current shared state but make it visually quieter.

Preferred:

```text
small surface badge
thin border
secondary/success icon
short label
```

Do not let the shared badge compete with the dish photo.

---

# 27. Missing Image State

Use:

```text
surfaceSubtle
brandSoft at low opacity
warmSoft at low opacity
simple food / utensil icon
```

Keep it polished but quieter than a real photo.

Clay inspiration is allowed here as a small playful moment.

---

# 28. Recipes / Cookbooks

Current library supports:

```text
Recipes | Cookbooks
```

For this Home redesign:

- keep the underlying behavior,
- simplify visual presentation,
- keep Cookbooks secondary to recipe browsing,
- do not introduce unnecessary transition complexity.

A future IA pass may move Cookbooks elsewhere.

That is not required here.

---

# 29. Bottom Navigation Reference

The Figma navigation component uses a compact, evenly spaced bottom bar.

Reference characteristics:

```text
height around 68
white / surface background
44×44 navigation targets
24px icons
center plus
active emphasis
```

Use these as proportional references, not absolute implementation requirements.

---

# 30. Noomori Navigation Constraint

Current Noomori destinations:

```text
Recipes
Household
Account
```

Do **not** add fake destinations to create five-way visual symmetry.

Product architecture wins over screenshot symmetry.

---

# 31. Keep NativeTabs

Retain:

```text
NativeTabs
```

Do not replace it with a fully custom bottom navigation system during this phase.

Reasons:

- native semantics,
- accessibility,
- platform behavior,
- navigation history,
- safe area,
- Android integration,
- lower regression risk.

Use the closest native visual treatment instead of chasing pixel-perfect screenshot parity.

---

# 32. Navigation Visual Direction

Target:

```text
surface background

inactive:
  textSecondary

active:
  accent emphasis

primary Add:
  accent
```

Use:

```text
#EE9B00
```

as the warm navigation accent.

Do not introduce custom tab-slide animation.

---

# 33. Center Add Recipe Action

This is the strongest interaction borrowed from the Figma/screenshot reference.

Target:

```text
56 × 56
circle
accent background
high-contrast plus icon
slightly raised relative to tab surface
```

The Add button:

- is an action,
- is not a route,
- is not a fake tab,
- opens existing `AddRecipeBottomSheet`.

---

# 34. Add Recipe Positioning

Position relative to the bottom navigation and safe area.

Must account for:

- Android gesture navigation,
- iOS home indicator,
- device width,
- keyboard visibility.

Do not use one magic bottom offset for all devices.

---

# 35. Add Recipe Bottom Sheet

Reuse existing:

```text
AddRecipeBottomSheet
```

and routes:

```text
/recipe/new
/recipe/import-text
/recipe/import-url
```

No backend or flow changes required.

---

# 36. Clay Craft Translation

Clay should influence Noomori through details such as:

- confident use of brand color,
- intentional radius variation,
- clean transitions between surfaces,
- small unexpected visual detail in empty states,
- polished alignment,
- hierarchy through scale instead of excessive borders,
- visually distinct but restrained selected states,
- whitespace that feels editorial,
- surface compositions that feel designed rather than assembled.

Clay should **not** justify:

- random illustration in every section,
- large animated blobs,
- hover-like mobile effects,
- animated gradients,
- novelty for routine controls.

---

# 37. Impeccable UI/UX Quality Gate

Run an Impeccable-style review after the static Home composition is implemented and before motion polish.

Review the screen for:

- hierarchy,
- visual rhythm,
- spacing consistency,
- density,
- unnecessary nesting,
- card overuse,
- weak primary/secondary emphasis,
- inconsistent radius,
- inconsistent control sizing,
- excessive borders,
- excessive badges,
- visual noise,
- readability,
- touch affordance,
- responsive behavior,
- accessibility regressions,
- empty-state quality,
- visual originality.

Ask:

```text
Would this look generic if the Noomori logo were removed?
Is every card necessary?
Is the main action immediately obvious?
Are sections distinct without relying on boxes everywhere?
Is whitespace doing enough work?
Is teal being used as identity rather than decoration?
Is gold still an accent rather than a second primary?
Are recipe photos carrying the visual richness?
Does the Home screen still feel calm after repeated use?
```

### Anti-slop guardrails

Avoid:

- nested cards inside cards,
- excessive containers,
- generic dashboard sectioning,
- glassmorphism,
- random gradients,
- generic pill overload,
- decorative chips without function,
- fake social metrics,
- excessive icon badges,
- weak typography hierarchy,
- oversized rounded rectangles everywhere,
- random accent colors,
- reference patterns copied without product justification.

### Static UI completion gate

Do not start motion polish until:

- hierarchy is accepted,
- spacing is coherent,
- navigation feels stable,
- recipe imagery feels dominant,
- Home feels distinctly Noomori,
- the screen feels complete with animations disabled.

---

# 38. Emil Design-Engineering Policy

Run `emil-design-eng` thinking against each Home component.

Ask:

```text
Does this make hierarchy clearer?
Does this feel responsive?
Is this decorative element earning its space?
Would users notice if this detail were wrong?
Does the screen still work if animation is removed?
```

---

# 39. Animation Decision Gate

Use `animate-expo`.

Before implementing motion:

```text
1. Should this animate at all?
2. What purpose does it serve?
3. What is the cheapest correct primitive?
4. Which properties should animate?
5. Timing or spring?
6. Can it remain off the JS thread?
7. What does reduced motion do?
```

If there is no clear purpose:

> **do not animate.**

---

# 40. Motion Rules

## Tab switching

No custom slide.

## Recipe card press

Purpose:

```text
feedback
```

Target:

```text
scale 1 → 0.98
100–150ms
ease-out
```

## Add button press

```text
scale 1 → 0.96–0.97
100–150ms
```

No icon rotation.

## Search focus

Color/border state only.

## Recent card press

Same restrained press feedback as other cards.

## Segmented control

Subtle state indication only.

## Lists

No mount-time stagger for normal library browsing.

## Sheet

Use existing/native sheet behavior where possible.

---

# 41. Animation Constraints

Prefer:

```text
transform
opacity
```

Avoid continuous animation of:

```text
height
width
margin
padding
flex
top
left
gap
elevation
blur intensity
```

No per-frame React state updates.

No JS-thread gesture loop.

---

# 42. Existing Core `Animated`

Current Recipes/Cookbooks pager uses core `Animated`.

Do not migrate solely for style consistency.

Migrate only when:

- current behavior is measurably janky,
- the redesign requires a new gesture/motion behavior,
- the current implementation conflicts with the final interaction model.

New custom motion should use Reanimated.

---

# 43. Reduced Motion

Preserve current reduced-motion behavior.

For new interactions:

- remove nonessential scale/translation,
- retain useful state/color feedback,
- avoid overshoot,
- preserve comprehension.

---

# 44. Accessibility

Preserve or improve:

- minimum touch target 44pt / 48dp preferred,
- icon-only control labels,
- selected state semantics,
- screen-reader order,
- non-color-only state communication,
- dynamic type,
- 200% text-scale usability,
- safe bottom padding,
- Add button accessibility independent of tabs.

Do not sacrifice current 1-column large-font fallback.

---

# 45. Responsive Targets

Test:

```text
360
375
390
430
tablet if current support remains
```

Typography scaling:

```text
1.0
1.3
2.0
```

The Figma reference width of 375 is a **reference canvas**, not a fixed target width.

---

# 46. Loading / Empty / Error States

Preserve current state behavior.

## Loading

Use existing skeleton architecture.

Recolor to the new system.

## Empty

Keep a clear first-action CTA.

## Error

Keep actionable retry.

## Search empty

Keep Clear Search.

Do not replace stateful screen feedback with toast-only messaging.

---

# 47. Home Route Behavior

Do not change unless presentation requires a tiny prop-level adjustment:

- TanStack Query behavior,
- query keys,
- recipe cache seeding,
- refetch logic,
- cookbook fetching,
- Activity fetching,
- route semantics.

The redesign must not create data regressions.

---

# 48. Expected Files to Change

Likely:

```text
src/shared/design-system/colors.json
src/shared/design-system/foundations.ts
src/shared/design-system/theme.ts
src/shared/design-system/index.ts

tailwind.config.js

src/routes/app-tabs.tsx

src/shared/components/recipe/recipes-library-view.tsx
src/shared/components/recipe/recipe-card.tsx
```

Possible new components:

```text
src/shared/components/home/home-header.tsx
src/shared/components/home/recent-recipe-card.tsx
src/shared/components/home/home-section-header.tsx
src/shared/components/navigation/add-recipe-nav-action.tsx
```

Only extract a component when it has real reuse or meaning.

---

# 49. Files That Should Not Need Changes

Avoid touching:

```text
server/
supabase/
authorization
recipe parser
import parser
household backend
```

`src/app/(tabs)/index.tsx` should remain behaviorally stable where possible.

---

# 50. Dependency Policy

Do not add gluestack-ui for this phase.

Do not add a new animation library.

Use current:

```text
NativeWind
Expo Router
NativeTabs
Reanimated
Gesture Handler
Keyboard Controller
Expo Symbols
```

The design system defines **what** the interface should be.

The current implementation stack defines **how** it is built.

---

# 51. Testing

Run:

```bash
bun run lint
bun run test:functional:fe
```

Add targeted coverage for:

- recipe render,
- loading,
- empty,
- error + retry,
- search,
- clear search,
- recipe navigation,
- Add Recipe,
- conditional Activity,
- Recipes/Cookbooks behavior,
- recent-section derivation when enabled.

---

# 52. Accessibility Tests

Verify:

- Add Recipe has a clear accessible label,
- selected library state is announced,
- recipe cards remain buttons,
- icon-only actions retain labels,
- enlarged text changes layout safely.

---

# 53. Visual QA

- [ ] compact header feels intentional
- [ ] Home does not feel like a discovery feed
- [ ] food photography dominates
- [ ] warm-white background replaces beige-heavy canvas
- [ ] teal establishes identity
- [ ] gold is used selectively
- [ ] optional hero has real utility
- [ ] no fake drag handle exists
- [ ] Recently Added reads as quick access, not another full library
- [ ] primary recipe grid remains readable
- [ ] navbar does not invent destinations
- [ ] center Add feels intentional
- [ ] no arbitrary raw hex colors in feature components
- [ ] visual details feel Clay-inspired without becoming a marketing page

---

# 54. Motion QA

- [ ] no animation without purpose
- [ ] no tab slide
- [ ] no scale-from-zero
- [ ] no routine bounce
- [ ] no unnecessary list entrance stagger
- [ ] no per-frame React state
- [ ] no animated blur intensity
- [ ] no animated elevation
- [ ] reduced motion supported
- [ ] press feedback remains under ~150ms
- [ ] release build tested on real Android hardware

---

# 55. Performance Acceptance

The redesign must not regress:

- scrolling,
- image rendering,
- search typing,
- keyboard interaction,
- tab response,
- recipe opening,
- Add Recipe opening.

Final feel must be judged on:

```text
physical Android device
release build
populated recipe library
```

not only in Expo dev mode.

---

# 56. Implementation Phases

## Phase 1 — Visual tokens

Update:

- colors,
- NativeWind mappings,
- spacing aliases.

Do not change hierarchy yet.

## Phase 2 — Static Home structure

Implement:

- compact header,
- search,
- rounded content surface,
- section hierarchy.

No motion polish yet.

## Phase 3 — Recipe presentation

Implement:

- compact Recent recipe card,
- horizontal Recent section where data supports it,
- evolved main RecipeCard.

## Phase 4 — Navigation

Keep NativeTabs.

Apply:

- new active/inactive colors,
- surface treatment,
- center Add affordance.

## Phase 5 — Interaction polish

Use Emil skills to add:

- restrained press feedback,
- state transitions,
- no unnecessary animation.

## Phase 6 — QA

Run:

- lint,
- frontend tests,
- large-text checks,
- reduced motion,
- responsive widths,
- Android release-build review.

---

# 57. Acceptance Criteria

- [ ] Home uses the new semantic palette
- [ ] current backend and API behavior remain unchanged
- [ ] current query architecture remains stable
- [ ] current recipe image/cache behavior remains stable
- [ ] compact header is implemented
- [ ] search remains fully functional
- [ ] optional hero is omitted unless it has a real utility use case
- [ ] static rounded content surface does not show a fake drag handle
- [ ] Recently Added is horizontal when truthful recent data is available
- [ ] primary library preserves responsive columns
- [ ] large-font 1-column fallback remains
- [ ] RecipeCard remains image-first
- [ ] no ratings/reviews/creator metadata are fabricated
- [ ] NativeTabs remains the navigation primitive
- [ ] no fake navigation destinations are created
- [ ] Add Recipe remains an action, not a route tab
- [ ] Add Recipe opens the existing bottom sheet
- [ ] no custom tab-slide animation exists
- [ ] new press feedback follows `animate-expo`
- [ ] reduced motion is supported
- [ ] accessibility semantics are preserved
- [ ] existing frontend tests pass
- [ ] Home-specific tests pass
- [ ] physical Android release-build QA passes

---

# 58. Explicit Non-Goals

Do not use this redesign to justify:

- rewriting navigation,
- migrating to gluestack,
- redesigning every app screen,
- adding discovery categories,
- adding social mechanics,
- adding ratings,
- adding recommendations,
- adding AI surfaces,
- rewriting queries,
- changing recipe domain models,
- adding animation everywhere,
- copying Clay's marketing-site behavior literally.

---

# 59. Final Design Contract

Reference responsibility:

```text
Current Noomori repository
→ product behavior + engineering source of truth

Figma Recipe Sharing App
→ mobile composition and layout language

Clay
→ craft, personality, and visual confidence

Impeccable
→ UI/UX critique, audit, polish, and anti-slop quality gate

Emil Kowalski / animate-expo
→ interaction and motion discipline
```

Conflict rule:

```text
Product behavior conflict
→ Noomori wins

Visual composition conflict
→ Figma informs, Noomori constraints decide

Visual polish conflict
→ Impeccable leads

Motion conflict
→ Emil / animate-expo leads

Engineering stability conflict
→ preserve current architecture unless UX gain clearly justifies the cost
```

Implementation principle:

> **Borrow the references' composition and craft, not their product assumptions.**

Quality principle:

> **Impeccable decides whether the static interface is refined enough.**

Motion principle:

> **Emil decides whether and how the interface should move.**

Architecture principle:

> **Preserve what already works; redesign what users see and feel.**
