# Noomori Mobile App Design System

**Document type:** Mobile app design system  
**Applies to:** Noomori Android app wireframes and production UI  
**Relationship to landing page:** This system translates the latest Noomori landing-page design patch into a product UI system suitable for daily use.

> The landing page can be more expressive.  
> The app itself should be quieter, more utilitarian, and more content-first.

---

# 1. Product UI Direction

Noomori should feel:

- Warm
- Personal
- Calm
- Intimate
- Food-first
- Lightweight
- Thoughtful
- Easy to scan
- Familiar enough for daily use
- Distinct without looking decorative

The app should communicate **neutral minimalist warmth**.

### Cultural neutrality

Noomori should feel at home for a wide range of users and households. Avoid cultural signifiers unless they are part of user-generated recipe content.


Its identity should come from:

- Warm paper-like neutrals
- Restrained accent colors
- Quiet whitespace
- Simple geometry
- Recognizable food imagery
- Soft contrast
- Subtle depth
- Clear editorial typography hierarchy

The visual language should remain culturally neutral and broadly approachable.

Avoid:

- Culture-specific decorative motifs
- Theme-driven visual clichés
- Excessive beige
- Heavy gradients
- Decorative UI that competes with recipes
- Overly playful interaction patterns
- SaaS-like visual density

---

# 2. Product Principles

## 2.1 Food First

Recipe content should dominate the interface.

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

Use food imagery where it helps recognition, not as visual filler.

---

## 2.2 Personal by Default

Noomori should feel useful before a household is created.

Personal recipe collection is a complete product state.

Do not make sharing feel mandatory.

---

## 2.3 Shared When Useful

Household features should feel like a natural extension of personal use.

Use:

- Ownership labels
- Member avatars
- Household names
- Shared-state indicators

Do not rely on color alone to indicate shared content.

---

## 2.4 Explicit Sharing

Users should always understand:

- Whether a recipe is private or shared
- Which household owns a shared recipe
- Who added or edited it
- What will happen before a sharing action is confirmed

---

## 2.5 Quiet Utility

The app should not constantly advertise its own visual identity.

The interface should become visually quieter after the user enters recipe-reading or editing flows.

---

# 3. Information Architecture

Primary bottom navigation:

```text
Recipes
Household
Profile
```

Global primary action:

```text
FAB “+”
→ New Recipe
```

Core paths:

```text
Recipes
→ Recipe Detail
→ Edit Recipe

Household
→ Shared Recipes
→ Members
→ Household Settings

Profile
→ Account
→ App Settings
```

Additional MVP flows:

- Authentication
- Household onboarding
- Create Household
- Join Household
- Household preview before joining
- Recipes populated state
- Recipes empty state
- Add Recipe bottom sheet
- Write Recipe
- Import from URL
- Import Preview / Review
- Activity
- Account

Do not introduce unrelated product categories such as:

- AI assistant surfaces
- Meal planning
- Nutrition tracking
- Grocery management
- Social discovery

unless the product scope explicitly changes later.

---

# 4. Color System

The mobile app should use a quieter subset of the landing-page palette.

## 4.1 Core Tokens

| Token | Value | Role |
|---|---|---|
| `background` | `#F6F1E8` | Primary app canvas |
| `surface` | `#FFFDF8` | Cards, sheets, fields |
| `surface-subtle` | `#EDE4D6` | Secondary surfaces |
| `text-primary` | `#2E2A27` | Main content |
| `text-secondary` | `#6D655E` | Supporting copy |
| `primary` | `#C86A4A` | Primary actions |
| `primary-strong` | `#B95E40` | Pressed / stronger action |
| `secondary` | `#7A8B68` | Household / organizational accent |
| `border` | `#CFC5B7` | Dividers / outlines |
| `error` | `#B94A48` | Error states |
| `success` | `#657A58` | Success states |

Approximate distribution:

```text
75–80% neutrals
10–15% warm accent
5–10% secondary accent
```

---

# 5. Relationship to Landing-Page Colors

Landing page coral, seafoam, sage, peach, and butter can remain expressive there.

Inside the app:

- Reduce saturation
- Reduce gradient usage
- Prefer flat surfaces
- Use coral/clay mainly for primary interaction
- Use sage/tea tones for secondary context

The product UI should feel more stable and less campaign-like.

---

# 6. Gradients

## Default rule

**Do not use gradients as standard app surfaces.**

Use flat colors for:

- App bars
- Cards
- Bottom navigation
- Forms
- Sheets
- Dialogs
- Recipe pages

Gradient may be used only for rare decorative moments such as:

- Empty-state illustration background
- Onboarding header
- Celebration/success state

Even there, keep it subtle and low-contrast.

---

# 7. Typography

Use a clean, highly readable sans-serif family.

Typography should prioritize recipe readability over personality.

## 7.1 Type Scale

Suggested mobile hierarchy:

```text
Display / onboarding title
32px / 38px / 700

Screen title
24px / 30px / 700

Section title
20px / 26px / 650–700

Card title
16px / 22px / 600

Body
16px / 24px / 400

Body small
14px / 20px / 400

Label
13px / 18px / 500

Metadata
12px / 16px / 500
```

---

## 7.2 Recipe Reading

Recipe content gets slightly more generous spacing.

Ingredients:

```text
16px / 26px
```

Instructions:

```text
16px / 27px
```

Recipe title:

```text
28–32px / 34–38px
```

Avoid dense recipe pages.

---

# 8. Spacing System

Base spacing unit:

```text
4px
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

Common usage:

```text
Screen horizontal padding: 20px
Card padding: 16px
Large card padding: 20px
Section gap: 24–32px
Control gap: 12px
Compact metadata gap: 8px
```

Avoid arbitrary spacing values unless optical correction requires them.

---

# 9. Radius System

Use soft but restrained rounding.

```text
Small control: 8px
Input: 10px
Button: 10–12px
Card: 14px
Large feature card: 16px
Bottom sheet top radius: 24px
Dialog: 20px
Avatar: circular
```

Do not make every component pill-shaped.

---

# 10. Elevation

Depth should be quieter inside the app than on the landing page.

## Level 0

No shadow.

Used for:

- Primary canvas
- App bars
- Bottom navigation where separation can be achieved with border

## Level 1

```css
0 2px 8px rgba(46, 42, 39, 0.05)
```

Used for:

- Recipe cards
- Household cards

## Level 2

```css
0 6px 20px rgba(46, 42, 39, 0.08)
```

Used for:

- Floating sheets
- Menus
- FAB
- Floating controls

Avoid dramatic shadows.

---

# 11. Iconography

Use one outline icon family throughout the app.

## Default icon rules

```text
Stroke: 1.75–2px
Navigation icon: 24px
Action icon: 20–24px
Inline icon: 18–20px
Small metadata icon: 16px
```

Icons should be simple and highly recognizable.

Avoid:

- Mixing filled and outline icons
- Decorative hand-drawn icon styles
- Multiple unrelated icon packs

---

# 12. Semantic Icon Colors

Color should support meaning, not create meaning by itself.

Suggested mapping:

```text
Primary action
→ Clay / coral

Household / shared
→ Sage

Saved / organized
→ Muted green

Warnings
→ Warm amber

Errors
→ Muted red
```

Navigation icons should usually remain neutral except for the active state.

---

# 13. App Bar

## Standard App Bar

Height:

```text
56px
```

Contains:

- Back button when needed
- Screen title
- Optional trailing action

Background:

```text
background or surface
```

Avoid gradients.

Use divider only when scrolling content visually requires separation.

---

# 14. Bottom Navigation

Primary items:

```text
Recipes
Household
Profile
```

## Visual behavior

Inactive:

```text
Icon: text-secondary
Label: text-secondary
```

Active:

```text
Icon: primary or deep warm accent
Label: text-primary
```

Avoid colored navigation backgrounds for each tab.

Use one stable navigation surface.

---

# 15. Floating Action Button

Global FAB:

```text
+
```

Action:

```text
New Recipe
```

Suggested:

```text
56 × 56px
```

Background:

```text
primary
```

Foreground:

```text
#FFFDF8
```

The FAB should feel grounded, not overly elevated.

---

# 16. Buttons

## Primary Button

Use for:

- Save
- Continue
- Create Household
- Join Household
- Confirm import

Style:

```text
Background: primary
Text: warm white
Height: 48px
Radius: 10–12px
```

---

## Secondary Button

Use for:

- Alternate actions
- Cancel-adjacent actions
- Less important navigation

Style:

```text
Background: transparent / surface
Border: border
Text: text-primary
```

---

## Text Button

Use for:

- Tertiary actions
- Edit
- Skip
- Learn more

Do not overuse primary buttons within the same screen.

---

# 17. Input Fields

Default height:

```text
48–52px
```

Use:

- Persistent label where ambiguity is possible
- Placeholder only as supporting guidance
- Clear focused state
- Clear validation feedback

Default:

```text
Surface: surface
Border: border
Text: text-primary
```

Focus:

```text
Border: primary
```

Error:

```text
Border: error
Supporting text: error
```

---

# 18. Search Field

Search is visually quieter than data-entry fields.

Recommended:

```text
Height: 44–48px
Leading search icon
Soft surface-subtle background
No heavy border
```

Placeholder example:

```text
Search your recipes
```

---

# 19. Recipe Cards

Recipe cards are core Noomori components.

## Recipe Card Hierarchy

```text
Food image
Recipe title
Small metadata
Ownership / sharing state
Optional secondary action
```

### Rules

- Food image should be useful for recognition.
- Avoid excessive metadata.
- Do not show every possible recipe attribute.
- Shared state should remain visible but secondary.

---

## 19.1 Recipe Card Image

Recommended aspect ratio:

```text
4:3
```

or compact list thumbnails:

```text
1:1
```

Use consistent aspect ratios within the same view.

Avoid mixing arbitrary image proportions.

---

# 20. Recipe List Row

For denser views:

```text
Thumbnail
Title
Short metadata
Trailing affordance
```

Suggested thumbnail:

```text
64 × 64px
```

Keep list rows comfortably tappable.

---

# 21. Recipe Detail

Recipe detail should be one of the quietest screens.

Hierarchy:

```text
Food image
Recipe title
Ownership / household state
Recipe metadata
Ingredients
Instructions
Secondary metadata
```

Avoid decorative cards around every section.

Prefer whitespace and typography for separation.

---

# 22. Ingredients

Ingredients should prioritize scanability.

Recommended pattern:

```text
Quantity
Ingredient
Optional note
```

Use consistent line spacing.

Do not require checkbox interaction unless the product explicitly supports cooking mode.

---

# 23. Instructions

Numbered steps should be prominent enough to scan.

Pattern:

```text
01
Instruction text

02
Instruction text
```

Step numbers may use low-saturation accent treatment.

Do not place long instructions inside dense cards.

---

# 24. Household Context

Household information should be recognizable without dominating personal recipe usage.

Useful signals:

- Household name
- Member avatars
- “Shared” label
- Owner / contributor label

Example:

```text
Shared with The Family Kitchen
```

Do not use background color alone to represent a shared recipe.

---

# 25. Member Avatars

Recommended sizes:

```text
Small: 24px
Default: 32px
Large: 40px
```

Avatar stacks should overlap only slightly.

Always maintain accessible labels for member identity.

---

# 26. Household Cards

Hierarchy:

```text
Household name
Member count / avatars
Short contextual detail
Primary action if needed
```

Use sage-toned accents sparingly.

Do not make household cards dramatically more colorful than recipe cards.

---

# 27. Join Household Code Input

The join code should feel simple and trustworthy.

Recommended:

- Large readable characters
- Strong focus state
- Clear error message
- Avoid excessive OTP-style animation

If segmented:

```text
6–8 character cells
```

If codes may vary in length, prefer a normal text field.

---

# 28. Household Preview

Before joining, show:

```text
Household name
Household icon / avatar
Member count
Optional member preview
Clear Join action
Cancel / Back
```

The user should know what they are joining before confirmation.

---

# 29. Add Recipe Bottom Sheet

Trigger:

```text
FAB +
```

Suggested options:

```text
Write a recipe
Import from a website
Import from Instagram
```

Each option:

```text
Icon
Title
One-line explanation
```

Keep all options visually equal unless product strategy explicitly prioritizes one.

---

# 30. Import Preview / Review

This is a review screen, not a magical automation screen.

Clearly distinguish:

```text
Imported content
vs.
User-confirmed content
```

Allow users to review:

- Title
- Ingredients
- Instructions
- Image
- Source

Primary action:

```text
Save Recipe
```

Avoid AI-centric language if AI is used behind the scenes.

---

# 31. Empty States

Empty states should feel warm, useful, and concise.

Structure:

```text
Small illustration / icon
Clear title
One short explanation
Primary action
Optional secondary action
```

Example intent:

```text
No recipes yet
Start by adding one you already love.
[ Add recipe ]
```

Avoid large decorative illustrations that push the action below the fold.

---

# 32. Loading States

Prefer skeletons for recipe lists and card-heavy surfaces.

Avoid full-screen spinners unless:

- Authentication is resolving
- A blocking action genuinely requires it

Skeletons should match final layout dimensions.

---

# 33. Error States

Error state structure:

```text
What happened
What the user can do
Retry action
```

Avoid technical language.

Example:

```text
Couldn’t load your recipes.
Check your connection and try again.
[ Try again ]
```

---

# 34. Offline State

If recipe data can be locally available:

- Show available cached content
- Surface a quiet offline indicator
- Avoid blocking the entire app unnecessarily

Use an inline banner rather than a modal.

---

# 35. Snackbar

Use for lightweight confirmation:

```text
Recipe saved
Recipe shared
Household joined
```

Duration should be brief but readable.

Avoid stacking multiple snackbars.

---

# 36. Confirmation Dialog

Use only for consequential actions:

- Delete recipe
- Leave household
- Remove member
- Delete household

Structure:

```text
Clear consequence
Cancel
Destructive action
```

Do not use confirmation dialogs for routine saves.

---

# 37. Activity

Activity should remain secondary to recipe browsing.

Each row:

```text
Avatar / source icon
Action text
Recipe / household reference
Timestamp
```

Example:

```text
Maya added “Chicken Curry”
2h ago
```

Avoid social-feed treatment.

---

# 38. Profile

Profile should remain functional.

Recommended sections:

```text
Account
Household
App Settings
About
```

Avoid unnecessary profile customization if it does not support the product goal.

---

# 39. Image Language

## Prototype mock-image convention

All generated fixture imagery in the Noomori prototype uses one consistent warm editorial illustration style. Keep the treatment mature, flat, softly textured, and recognizable at card size. This convention applies to mock/generated content only; production recipe records may still display user-supplied photographs.

Food imagery should feel:

- Recognizable
- Warm
- Believable
- Home-cooked
- Lightly editorial

Avoid:

- Overprocessed stock photography
- Extreme saturation
- Dark restaurant-style imagery
- Illustration styles that are inconsistent across recipes
- 3D or childish food imagery

Where recipes have no image:

Use a calm placeholder, not random food imagery.

---

# 40. Illustration Language

Illustrations should be secondary and lightweight.

Preferred:

- Flat
- Soft linework
- Warm neutrals
- Small coral / sage accents

Avoid mascot-heavy visual systems unless intentionally introduced later.

---

# 41. Motion

Motion should support orientation.

Recommended:

```text
Button press: 100–150ms
Sheet transition: 200–250ms
Tab/content transition: 180–220ms
Snackbar: 200ms
```

Use easing that feels soft and direct.

Avoid:

- Elastic overshoot
- Excessive bounce
- Decorative looping animation

Respect:

```text
prefers-reduced-motion
```

---

# 42. Interaction States

Every interactive component should define:

- Default
- Pressed
- Focused
- Disabled
- Loading
- Error where relevant
- Success where relevant

Wireframes should annotate these states where behavior matters.

---

# 43. Screen States

Important screens should account for:

- Loading
- Empty
- Populated
- Error
- Offline

Do not design only the happy path.

---

# 44. Accessibility

Minimum requirements:

- Touch targets approximately 44–48px minimum
- Do not rely on color alone
- Sufficient text contrast
- Clear focus state
- Accessible icon labels
- Logical reading order
- Dynamic text resilience where possible
- Avoid tiny metadata text
- Ensure buttons remain distinguishable in disabled state

---

# 45. Responsive / Device Adaptation

Noomori is mobile-first.

Primary reference width:

```text
360–412px
```

Design should remain comfortable at:

```text
320px minimum practical width
```

Tablet adaptation should increase layout breathing room rather than simply stretching phone layouts.

---

# 46. Component Inventory

Core reusable components:

- AppBar
- BottomNavigation
- FAB
- PrimaryButton
- SecondaryButton
- TextButton
- TextField
- SearchField
- JoinCodeInput
- RecipeCard
- RecipeListRow
- HouseholdCard
- HouseholdPreviewCard
- MemberAvatar
- AvatarStack
- SectionHeader
- StatusLabel
- BottomSheet
- Snackbar
- ConfirmationDialog
- EmptyState
- ErrorState
- LoadingSkeleton
- OfflineBanner

---

# 47. Visual Hierarchy Rules

Default screen hierarchy:

```text
1. Screen purpose
2. Primary content
3. Primary action
4. Supporting context
5. Secondary action
6. Metadata
7. Decoration
```

For recipe screens:

```text
Recipe
>
Action
>
Ownership
>
Metadata
>
Decoration
```

For household screens:

```text
Household identity
>
Shared content
>
Members
>
Administrative controls
```

---

# 48. Wireframe Annotation Rules

Wireframes should annotate:

- Component type
- Interaction
- Navigation destination
- Empty/loading/error state
- Shared/private state
- Role restrictions
- Destructive actions
- Validation behavior

Do not use wireframes purely as visual mockups.

They should explain interaction behavior.

---

# 49. Owner / Member Permissions

Role-aware UI must remain explicit.

Owner-only actions may include:

- Household settings
- Remove member
- Delete household

Member UI should not display unavailable destructive controls as if they are usable.

Prefer hiding irrelevant owner actions over showing permanently disabled controls, unless discoverability requires otherwise.

---

# 50. Noomori UI Personality Checklist

Before approving a screen, ask:

- Is food or the user's recipe content still the focus?
- Does the screen feel calm?
- Is the main action obvious?
- Is sharing contextual rather than dominant?
- Are there unnecessary colors?
- Are icons consistent?
- Is text readable without zooming?
- Is decoration serving a purpose?
- Would the screen still work without imagery?
- Does it feel like the same warm, neutral product as the landing page without copying the landing page literally?

---

# 51. Implementation Priorities

## P0 — Foundation

1. Apply mobile color tokens.
2. Standardize typography.
3. Standardize spacing and radius.
4. Standardize buttons and fields.
5. Standardize navigation.

## P1 — Recipe System

1. Recipe cards.
2. Recipe list rows.
3. Recipe detail hierarchy.
4. Image behavior.
5. Empty/loading/error states.

## P2 — Household System

1. Shared-state label.
2. Household cards.
3. Avatar system.
4. Join flow.
5. Role-aware controls.

## P3 — Polish

1. Shadows.
2. Icon consistency.
3. Motion.
4. Small illustrative moments.
5. Responsive tablet behavior.

---

# 52. Implementation Constraint

When applying this design system to existing Noomori wireframes:

> **Do not redesign the information architecture or user journeys unless explicitly requested.**

Preserve:

- Recipes / Household / Profile navigation
- Global Add Recipe FAB
- Personal-first usage
- Explicit sharing
- Current MVP screen structure
- Role-aware household behavior
- Existing product scope

The goal is to make the wireframes **visually coherent with Noomori's refined neutral-warm brand direction while remaining more functional and restrained than the landing page**.

Noomori should not rely on any specific cultural aesthetic. The app should feel personal and warm because of its palette, spacing, typography, food imagery, and thoughtful interaction hierarchy.
