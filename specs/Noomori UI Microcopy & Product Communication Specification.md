# Noomori UI Microcopy & Product Communication Specification

**Status:** Implemented  
**Scope:** Mobile application UI copy  
**Applies to:** Authentication, onboarding, recipes, imports, cookbooks, household sharing, activity, settings, notifications, errors, loading states, empty states, confirmations, success feedback, accessibility copy, and sign-out  
**Primary objective:** Make Noomori sound warm, casual, familiar, and reassuring throughout the entire product while preserving clarity and precision.

---

# 1. Purpose

Noomori is a household recipe application that also gives each person a private recipe space.

The product should not communicate like:

- an administration dashboard,
- a database editor,
- an API client,
- a permissions system,
- an enterprise collaboration tool,
- developer documentation,
- or a generic SaaS application.

Noomori should communicate like:

> **A warm recipe notebook shared with the people you live and cook with.**

The current application already demonstrates this voice in selected places, particularly authentication and some recipe-library empty states.

Examples of the desired direction already present in Noomori:

> Recipes for your household—and you.

> Share recipes with the people you cook with.

> Your recipes will live here.

> Start by adding one you already love.

> Your changes are still here.

These examples should become the benchmark for communication throughout the rest of the product.

The primary problem addressed by this specification is inconsistency: Noomori begins warm and human, but becomes increasingly technical and rigid in recipe editing, household management, system states, and settings.

---

# 2. Goals

This specification aims to:

1. Establish one recognizable Noomori voice across the full application.
2. Remove implementation terminology from user-facing communication.
3. Make household interactions feel personal rather than administrative.
4. Make recipe editing feel like writing a recipe rather than editing structured data.
5. Give errors and edge states clear recovery paths.
6. Reassure users when their recipes or edits remain safe.
7. Clearly differentiate offline, validation, permission, conflict, server, empty, and partial-success states.
8. Standardize terminology across screens.
9. Improve CTA clarity by describing what happens next.
10. Ensure accessibility labels and hints use the same human language as visual copy.
11. Prevent raw backend/API errors from becoming UI copy.
12. Create reusable writing rules for future Noomori features.

---

# 3. Non-goals

This specification does **not** require Noomori to become:

- humorous,
- whimsical,
- overly conversational,
- cute,
- emoji-heavy,
- verbose,
- childish,
- aggressively branded,
- or informal during serious actions.

Warmth must not reduce clarity.

For example, this is **not** appropriate:

> Uh-oh! Your yummy recipe ran away 🥺

For a failed save, Noomori should instead say:

> Recipe not saved.

> Your changes are still here. Try again.

The second version is warm because it reassures the user, not because it performs personality.

---

# 4. Reference framework

This specification is informed by:

## R1. Existing Noomori `better-writing` skill

Key principles adopted:

- clarity over cleverness,
- consistency over unnecessary variation,
- one recognizable voice,
- plain language,
- verb-first actions,
- errors that explain recovery,
- useful empty states,
- meaningful placeholders,
- consequence-oriented destructive actions,
- user language instead of implementation language.

## R2. Supercharge Design — “How to Write Microcopy in UI”

Principles adopted:

- be clear and concise,
- prefer active voice,
- provide enough context,
- use positive language where appropriate,
- maintain terminology consistency,
- match copy to brand tone,
- make errors actionable,
- test and iterate.

## R3. Nielsen Norman Group — “The 3 I’s of Microcopy: Inform, Influence, and Interact”

Every piece of Noomori microcopy should have a primary purpose:

### Inform

Help the user understand:

- what something is,
- what happened,
- what will happen,
- why something matters,
- or what they need to know.

### Influence

Express brand voice or help users feel confident.

Best used for:

- onboarding,
- first-use experiences,
- empty states,
- reassuring moments.

Use sparingly in errors and destructive flows.

### Interact

Help the user understand:

- what they can do,
- what a control does,
- what happens after tapping,
- what needs to be entered.

Most:

- labels,
- buttons,
- validation,
- helper text,
- accessibility hints

belong primarily to this category.

A small UI string should generally have **one primary job**.

Avoid forcing a single sentence to:

- explain internal behavior,
- justify a feature,
- instruct the user,
- and describe the outcome

at the same time.

---

# 5. Noomori voice

## 5.1 Voice attributes

Noomori is:

- warm,
- calm,
- familiar,
- practical,
- reassuring,
- simple,
- respectful,
- quietly personal.

Noomori is not:

- corporate,
- clinical,
- bureaucratic,
- technical,
- overenthusiastic,
- robotic,
- sarcastic,
- quirky for the sake of personality.

---

# 6. Tone by situation

The voice remains consistent, but the tone should adapt to context.

| Situation | Tone |
|---|---|
| Welcome | Warm and inviting |
| Onboarding | Warm and confidence-building |
| Empty states | Encouraging and relaxed |
| Normal recipe tasks | Casual and direct |
| Household sharing | Familiar and human |
| Forms | Clear and practical |
| Success | Brief and positive |
| Loading | Neutral and quiet |
| Validation | Direct and helpful |
| Errors | Calm and reassuring |
| Offline | Clear and actionable |
| Permission | Neutral and explanatory |
| Destructive actions | Serious and explicit |
| Possible data loss | Precise and reassuring |
| Security/rate limit | Plain and neutral |

---

# 7. Core writing principles

## 7.1 Speak about the user's world

Prefer:

> Your recipes

over:

> Personal recipe library

Prefer:

> Invite someone

over:

> Manage household members

Prefer:

> Add the steps

over:

> Create structured instructions

Prefer:

> 4 servings

over:

> Base 4 servings

---

## 7.2 Explain consequences, not implementation

Bad:

> These handoff copies will be permanently discarded.

Good:

> These recipes will be removed from the household. The original recipes won't be affected.

Bad:

> Ingredient amounts scale from their original values.

Good:

> Change the servings to adjust ingredient amounts.

---

## 7.3 Do not explain what the UI already makes obvious

Avoid:

> Add structured amounts, units, names, and preparation notes.

when the interface immediately presents:

- Amount
- Unit
- Ingredient
- Note

The section may simply be:

> Ingredients

Microcopy should remove uncertainty, not narrate the interface.

---

## 7.4 Reassurance is Noomori's main expression of warmth

Useful phrases include:

> Your changes are still here.

> Your recipe is safe.

> Your own recipes will stay with you.

> The recipes inside will stay in your recipes.

> Your household will stay saved.

These are preferred over jokes, emojis, or exaggerated enthusiasm.

---

## 7.5 Avoid blame

Do not write:

> You entered an invalid code.

Prefer:

> This join code doesn't work anymore.

Do not write:

> You failed to provide a recipe title.

Prefer:

> Enter a recipe name.

---

## 7.6 Use contractions naturally

Prefer:

- you'll,
- it's,
- won't,
- couldn't,
- doesn't,
- you're.

This contributes to Noomori's casual tone.

Exceptions are acceptable where contractions reduce clarity.

---

## 7.7 Prefer sentence case

Use:

> Family or friend

not:

> Family / Friend

Use:

> household owner

in prose, not:

> Household Owner

Backend enum values may remain:

```text
owner
member
```

They should not dictate visible capitalization.

---

# 8. Canonical vocabulary

Use one term for one concept.

| Concept | Use | Avoid |
|---|---|---|
| Household invitation token | join code | invite code |
| Add a person | invite someone | invite member |
| Household owner | household owner / owner when context is obvious | Owner in prose |
| Household participant | person / member when role matters | Member in normal prose |
| User recipes | your recipes | personal recipe library where unnecessary |
| Household recipes | shared recipes | household recipe records |
| URL | recipe link | HTTP URL, website URL where unnecessary |
| Instruction item | step | instruction item |
| Recipe origin | source | provenance |
| Extra duration | extra time / additional time | additional duration where avoidable |
| Remove join code | deactivate code | revoke |
| Create join code | create join code | generate code |
| App settings | settings | configuration |
| Sign-out area | account | session |
| Household participant list | people / members | users |
| Recipe transition after leaving | recipes from someone who left | handoff |
| Stored handoff object | never expose | snapshot |
| Item count | recipe/recipes, cookbook/cookbooks | item/items |

---

# 9. Technical-language watchlist

The following terms should trigger review when used in visible UI:

```text
structured
base
scale
scaling
batch
snapshot
handoff
validation
authentication
HTTP
HTTPS
HTML
generate
revoke
invalidate
short-lived
availability
session
canonical
status code
request
response
payload
record
resource
process
```

These words are not globally banned.

Before using one, ask:

> Would a normal person naturally use this word while cooking, saving recipes, or sharing recipes at home?

If not, rewrite it.

---

# 10. Authentication

## Current strong copy

Keep:

> Recipes for your household—and you.

Keep or minimally revise:

> Save the dishes you love, and share them with your household when you choose.

### Loading

> Signing you in…

### Offline

> You're offline.

> Connect to the internet and try again.

### Generic sign-in failure

> Couldn't sign you in.

> Try again.

Do not expose:

```text
Google authentication URL was unavailable.
Authentication required.
Google session could not be created.
```

These belong to logging/monitoring.

---

# 11. Household onboarding

## Landing

### Recommended

Eyebrow:

> Your household

Heading:

> Share recipes with the people you cook with.

Body:

> Your recipes stay yours. Share whichever ones you want with your household.

Actions:

> Create household

> Join household

Avoid:

> Household setup

unless the design specifically needs a setup-progress label.

---

# 12. Create household

## Recommended

Heading:

> Create your household

Body:

> Give it a name to get started. You can invite someone later.

Field:

> Household name

Placeholder:

> Our kitchen

Helper:

> Something everyone at home will recognize.

CTA:

> Create household

Loading:

> Creating household…

Success:

> Your household is ready

Error:

> Couldn't create your household.

If confirmed offline:

> You're offline. Reconnect and try again.

Otherwise:

> Try again in a moment.

Do not introduce the owner role unless it materially affects the user's decision.

Avoid:

> You'll be the owner.

during initial creation unless permissions need explanation.

---

# 13. Join household

## Entry

Heading:

> Join a household

Body:

> Enter the join code someone shared with you.

Field:

> Join code

Helper:

> Type or paste the 6-digit code.

CTA:

> Continue

Loading:

> Checking code…

---

## Preview

Heading:

> Join “Our Kitchen”?

Body:

> Just checking that you've got the right household.

Information:

> Household  
> Our Kitchen

> Created by  
> Sarah

> People  
> 4

Reassurance:

> Your recipes will stay yours.

CTA:

> Join household

Secondary:

> Use a different code

Loading:

> Joining household…

---

# 14. Join-code errors

## Incomplete

> Enter all 6 digits.

## Invalid, expired, used, or deactivated when recovery is identical

> This join code doesn't work. Check the code, or ask for a new one.

Do not unnecessarily distinguish:

- expired,
- invalid,
- used,
- revoked

unless those states require different user actions.

## Rate limit

> Too many tries.

> Try again in a little while.

## Unknown

> Couldn't check the join code.

> Try again.

## Offline

> You're offline.

> Reconnect to check the join code.

---

# 15. Recipe library

## Personal empty state

Heading:

> Your recipes will live here.

Body:

> Add one you already love. It's yours until you choose to share it.

CTA:

> Add your first recipe

## Household empty state

Heading:

> Nothing shared yet

Body:

> Pick one of your recipes to share with the household.

CTA:

> Share a recipe

## Cookbook empty state

Heading:

> Your cookbooks will live here.

Body:

> Keep the recipes you come back to together.

CTA:

> Create a cookbook

---

# 16. Library counts

Do not use:

> 4 items

Use:

> 4 recipes

or:

> 4 cookbooks

The user should not have to infer what “items” means.

---

# 17. Search states

## No recipe matches

Heading:

> No recipes match that search

Body:

> Try another name or keyword.

CTA:

> Clear search

## No cookbook matches

Heading:

> No cookbooks match that search

Body:

> Try another cookbook name.

CTA:

> Clear search

Do not confuse search-empty states with true library-empty states.

---

# 18. Add recipe menu

Recommended:

### Option 1

> Write a recipe

> Start with a blank page.

### Option 2

> Paste a recipe

> Bring in one from your notes or messages.

### Option 3

> Import from a website

> Paste a recipe link and we'll fill it in.

Heading:

> Add a recipe

---

# 19. Import from text

## Heading

> Paste a recipe

## Body

> Copy one from your notes, messages, or anywhere else. You'll get a chance to check it before saving.

Field:

> Recipe text

Placeholder:

> Paste your recipe here…

Avoid:

> structured recipe

## CTA

> Import recipe

Loading:

> Importing recipe…

---

# 20. Text-import error states

## Not enough recognizable recipe content

Heading/message:

> Couldn't find enough recipe details. Make sure the text includes ingredients and steps, then try again.

## Multiple recipes

> More than one recipe found. Paste one recipe at a time.

## Ambiguous content

> Couldn't tell which text belongs to the recipe. Remove unrelated text, then try again.

Avoid:

> safely separate

> identify enough recipe information

> insufficient structure

---

# 21. Website import

Heading:

> Import from a website

Body:

> Paste a recipe link. You'll review everything before saving.

Field:

> Recipe link

Helper:

> Public recipe pages only. Sites that require sign-in aren't supported.

Placeholder:

> https://example.com/recipe

CTA:

> Import recipe

Loading:

> Preparing recipe…

---

# 22. Website validation and errors

## Invalid link

> Enter a valid recipe link.

Avoid:

> Enter a valid HTTP or HTTPS recipe link.

## Unsupported content

> This link doesn't look like a recipe page.

> Try another link or paste the recipe instead.

Avoid:

> This link isn't an HTML recipe page.

## Recipe not found

> No recipe found on this page.

> Try another link or paste the recipe instead.

## Page unavailable

> Couldn't open this page.

> Make sure it's public, then try again.

## Timeout

> This page is taking too long.

> Try again.

## Fallback CTA

> Paste recipe instead

---

# 23. Recipe editor

This is a high-priority rewrite area.

The recipe editor should feel like writing in a recipe notebook, not populating structured records.

---

# 24. Timing

Heading:

> Timing

Optional helper:

> Add any times you want to remember.

Fields:

> Prep time

> Cook time

> Total time

For custom time:

> Extra time

Field:

> What is it for?

Example placeholder:

> Chill

Duration:

> How long?

If layout requires shorter labels:

> Extra time

> Duration

Avoid:

> structured times

> additional time label

where a more natural label can fit.

---

# 25. Servings

Heading:

> Servings

When unset:

> How many does this recipe make?

Visible label:

> Servings

Placeholder:

> 4

CTA:

> Set servings

When set:

> Change the servings to adjust ingredient amounts.

Avoid:

> Set the exact base before scaling ingredient amounts.

> Ingredient amounts scale from their original values.

> Base servings

> Set base

---

# 26. Recipe detail servings

Current concept:

> Base 4 servings

Recommended:

> 4 servings

The user does not need the internal distinction between saved/base servings and displayed servings.

---

# 27. Ingredients

Heading:

> Ingredients

No helper is required by default.

If one is necessary:

> Add what you'll need for this recipe.

Avoid:

> Add structured amounts, units, names, and preparation notes.

Fields may remain:

> Amount

> Unit

> Ingredient

> Note

Example note:

> finely chopped

Empty:

> Start with your first ingredient.

Actions:

> Add ingredient

> Add section

---

# 28. Instructions

Section:

> Instructions

Optional helper:

> Add the steps in the order you cook them.

Individual:

> Step 1

> Step 2

Placeholder:

> Describe this step

Action:

> Add step

Avoid:

> Instruction 1

> Add instruction

when referring to individual steps.

---

# 29. Notes

Heading:

> Notes

Helper:

> Add a tip, substitution, family reminder, or anything else worth remembering.

Placeholder:

> Add a note

Avoid:

> Keep optional context separate from ingredients and directions.

---

# 30. Nutrition

Heading:

> Nutrition

Helper:

> Add nutrition details per serving, if you have them.

Avoid:

> These stay stable when the editor scales the batch.

---

# 31. Source

Heading:

> Source

Helper:

> Where did this recipe come from?

Options:

> My recipe

> Family or friend

> Website

For family/friend:

> Who shared it?

Placeholder:

> Mom

For website:

> Recipe link

Avoid:

> Website URL

where consistency with import terminology is possible.

---

# 32. Form validation

Validation should be:

- direct,
- local,
- specific,
- actionable.

Good:

> Enter a recipe name.

> Enter an ingredient name.

> Choose where this recipe came from.

> Use 200 characters or fewer.

> Enter a number, decimal, or fraction.

Avoid:

> Invalid recipe.

> Validation error.

> Invalid field.

> Required input missing.

---

# 33. Recipe saving

## Loading

> Saving…

Use the ellipsis character:

> …

not:

> ...

## Success

> Recipe saved

## Edit success

> Changes saved

## Failure with edits preserved

> Recipe not saved.

> Your changes are still here. Try again.

If offline is positively identified:

> Recipe not saved.

> You're offline. Your changes are still here—reconnect and try again.

This pattern should be reused whenever unsaved user work is preserved.

---

# 34. Partial success: photo failure

## New recipe

Heading:

> Recipe saved — just without the photo

Body:

> Your recipe is safe. Want to try the photo again?

Actions:

> Continue without photo

> Try photo again

## Edit

Heading:

> Changes saved — the photo stayed the same

Body:

> Your recipe edits are safe. Want to try the photo again?

Actions:

> Keep current photo

> Try photo again

Avoid generic:

> Continue

when a more specific action is available.

---

# 35. Unsaved changes

Heading:

> Discard changes?

Body:

> Your unsaved changes will be lost.

Actions:

> Keep editing

> Discard changes

Avoid:

> Discard

as the final destructive action where space allows.

---

# 36. Recipe detail

Do not overload recipe-detail UI with explanatory copy.

Primary content should remain the recipe.

Recommended metadata:

> Prep 15 min

> Cook 30 min

> Total 45 min

> 4 servings

Not:

> Base 4 servings

---

# 37. Recipe options

Heading:

> Recipe options

Actions:

> Share with household

> Remove from household

> Edit recipe

> Delete recipe

Use `remove from household` consistently. Keep `unshare` as an internal implementation term only.

---

# 38. Share confirmation

Heading:

> Share with Our Kitchen?

Body:

> Everyone in Our Kitchen will be able to see this recipe.

Actions:

> Cancel

> Share recipe

---

# 39. Remove-from-household confirmation

Heading:

> Remove from Our Kitchen?

Body:

> People in Our Kitchen won't be able to see this recipe anymore. It will stay in your recipes.

Actions:

> Cancel

> Remove recipe

---

# 40. Delete recipe

Heading:

> Delete recipe?

Body:

> This permanently deletes “Sunday Pasta.” This can't be undone.

Actions:

> Cancel

> Delete recipe

If the recipe must be removed from the household first:

> Remove it from the household before deleting it.

---

# 41. Recipe mutation errors

## Delete failure

Heading:

> Recipe not deleted

Body:

> It's still in your recipes. Try again.

Offline:

> It's still in your recipes. Reconnect and try again.

## Share failure

Heading:

> Recipe not shared

Body:

> Try again.

## Remove-from-household failure

Heading:

> Recipe is still shared

Body:

> Try again.

Prefer describing the resulting state:

> Recipe is still shared

over:

> Remove operation failed

---

# 42. Raw backend errors

This is an implementation requirement.

Never render:

```tsx
<Text>{error.message}</Text>
```

when `error.message` may originate from:

- API responses,
- server exceptions,
- auth libraries,
- database errors,
- HTTP errors,
- internal state.

Create a UI error-mapping layer.

Conceptually:

```ts
type UiError =
  | "offline"
  | "timeout"
  | "session_expired"
  | "permission"
  | "conflict"
  | "invalid_input"
  | "not_found"
  | "unknown";
```

Then map to feature-specific user copy.

Backend errors are **data**, not product copy.

---

# 43. Offline-state architecture

Where technically possible, distinguish actual offline/network failures from unknown failures.

Do not universally use:

> Check your connection and try again.

unless connectivity failure is known or strongly identified.

## Global/offline guidance

Possible banner:

> You're offline

> Some changes won't be available until you reconnect.

Avoid blocking the entire app if cached/local content remains usable.

---

# 44. Error-state hierarchy

When an operation fails, determine state in this order:

1. Is the device offline?
2. Did the request time out?
3. Did authentication expire?
4. Is permission missing?
5. Is the input invalid?
6. Is this a known conflict?
7. Is the resource gone?
8. Is it a known feature-specific state?
9. Otherwise use generic failure copy.

Do not guess a lower-level cause.

---

# 45. Generic unknown errors

Recommended:

> Couldn't load your recipes.

> Try again in a moment.

Or:

> Something went wrong.

> Try again.

Prefer feature-specific first lines:

> Couldn't load your household.

over generic:

> Something went wrong.

---

# 46. Loading states

Use short, quiet loading labels.

Examples:

> Loading recipes…

> Loading cookbook…

> Loading household…

> Checking join code…

> Preparing recipe…

> Saving…

> Sharing…

> Joining household…

Do not add playful loading copy simply to make the app feel warm.

Warmth is not required in every state.

---

# 47. Loading-content placeholders

Avoid unnecessary copy such as:

> Your saved recipe will appear here shortly.

when:

> Loading recipe…

plus skeleton/loading UI already communicates the state.

---

# 48. Debug information

Never show internal identifiers in normal production UI.

Remove:

> Recipe ID: `{uuid}`

from the visible recipe loading/error surface.

Internal IDs belong in:

- logs,
- Sentry,
- developer diagnostics,
- support metadata where explicitly requested.

---

# 49. Success-state principles

Success feedback should be:

- brief,
- specific,
- calm.

Good:

> Recipe saved

> Changes saved

> Recipe shared

> Cookbook created

> Join code ready

Avoid:

> Success!

> Operation completed successfully

> Yay! Your recipe is ready 🎉

---

# 50. Cookbooks

## Create

Heading:

> Name your cookbook

Helper:

> Give it a name you'll recognize.

Field:

> Cookbook name

Placeholder:

> Weeknight favorites

CTA:

> Choose recipes

## Recipe picker

Body:

> Choose any recipes you'd like to keep in this cookbook. You can also leave it empty for now.

Count:

> 3 selected

CTA:

> Create cookbook

or:

> Save changes

---

# 51. Empty cookbook

Heading:

> No recipes here yet

Body:

> Add a few whenever you're ready.

CTA if appropriate:

> Add recipes

Avoid:

> Add a few whenever you're ready.

---

# 52. Cookbook delete

Heading:

> Delete cookbook?

Body:

> The cookbook will be deleted. The recipes inside will stay in your recipes.

Actions:

> Cancel

> Delete cookbook

This is a strong example of Noomori's destructive-state pattern:

**what disappears + what stays.**

---

# 53. Cookbook delete failure

> Cookbook not deleted

> It's still here. Try again.

---

# 54. Activity

Recommended screen title:

> Household activity

instead of generic:

> Activity

## Solo household

Heading:

> It's quiet here for now

Body:

> Once someone joins your household, shared recipe updates will show up here.

## Shared household with no events

Heading:

> No updates yet

Body:

> When someone shares or changes a recipe, you'll see it here.

Avoid:

> Shared recipe updates will appear here after your household has another member.

This sounds like feature eligibility documentation.

---

# 55. Activity events

Good:

> Sarah added “Sunday Pasta”

> Alex updated “Nasi Goreng”

> Sarah removed “Apple Pie” from the household

Consider replacing:

> removed

with:

> removed … from the household

if space permits.

The latter is more natural language.

---

# 56. Household tab

The household area should feel especially personal.

Heading:

> Our Kitchen

Section:

> Shared recipes

Avoid turning the screen into household administration.

---

# 57. Recipes from someone who left

Internal model may remain:

```text
handoff
handoff_item
snapshot
pending
keep
remove
```

Visible UI must not expose those terms.

## Household banner

Heading:

> Recipes from someone who left

Body:

> Choose which ones you'd like to keep.

If a name is available:

> Recipes from Alex

> Choose which ones you'd like to keep in the household.

---

# 58. Handoff screen

Recommended heading:

> Recipes from Alex

Body:

> Alex left the household. Choose which of their shared recipes you'd like to keep here.

Recipe row secondary action:

> View recipe

Actions:

> Remove

> Keep

Bulk:

> Remove all

> Keep all

Avoid:

> Recipe review

> awaiting review

> Review recipe

> handoff

> snapshot

> saved recipe snapshot

---

# 59. Handoff remove-all confirmation

Heading:

> Remove all 3 recipes?

Body:

> They'll be removed from this household. Alex's original recipes won't be affected.

Actions:

> Cancel

> Remove all

---

# 60. Handoff completion

Heading:

> All done

Body:

> You've taken care of all the recipes.

Alternative, more neutral:

> Nothing left to decide

Prefer `All done` if visual design supports the warmer tone.

---

# 61. Handoff conflict

If a 409 or stale-state conflict occurs:

> Things changed while you were here.

> Refresh the recipes and try again.

CTA:

> Refresh

Do not expose backend conflict messages.

---

# 62. Household settings information architecture

Copy changes alone cannot make redundant administrative UI feel warm.

Where possible, simplify:

Current conceptual structure:

```text
Household
Name
Your role
Members
Invite member
Join code
```

Preferred:

```text
Our Kitchen
3 people

People
[people list]

Invite someone
[invite tools]
```

Avoid repeating information already visible in the page heading.

---

# 63. Household people

Heading:

> People

Examples:

> Sarah  
> Owner

> Nanda  
> You

Only show role labels where they provide actual value.

Do not write:

> 3 members · Owner

at the top if the same information is repeated below.

---

# 64. Inviting someone

Heading:

> Invite someone

Body:

> Create a join code and send it to the person you want to bring in.

Avoid:

> Invite member

> Share one short-lived code with the person you want to invite.

---

# 65. Join-code lifecycle

## No code

> Join codes work once and expire after 10 minutes.

CTA:

> Create join code

## Creating

> Creating code…

## Ready

Label:

> Join code

Code:

> 123 456

Helper:

> Works once and expires at 7:45 PM.

Actions:

> Copy code

> Share code

Feedback:

> Code copied

---

# 66. Existing join code

Heading:

> You already have a join code

Body:

> It expires at 7:45 PM.

CTA:

> Create new code

Secondary/destructive:

> Deactivate code

---

# 67. Replace join code

Confirmation:

> Create a new join code?

Body:

> The current code will stop working.

Actions:

> Keep current code

> Create new code

Avoid:

> Generate

---

# 68. Deactivate join code

Heading:

> Deactivate this join code?

Body:

> This join code will stop working.

Actions:

> Keep code

> Deactivate code

Avoid:

> Revoke code

> Immediately invalidates the active join code.

---

# 69. Shared invite message

Recommended:

> Join my household “Our Kitchen” on Noomori.

> Join code: 123 456

> It works once and expires in 10 minutes.

Keep it short because this copy leaves Noomori and enters another communication channel.

---

# 70. Household-role communication

Use role terminology only when role matters.

Bad:

> You'll join as a Member.

Better:

> Your recipes will stay yours.

Bad:

> Household invitations are managed by the Owner.

Better:

> Only the household owner can invite people.

Roles should explain capability, not dominate the interface.

---

# 71. Join another household while preserving current household

Heading:

> Join another household

Body:

> Your household will stay saved while you're away. You'll come back to it when you leave the other household.

CTA:

> Join another household

This is an appropriate place for reassurance because the user may worry about losing their current household.

---

# 72. Leaving a household

Heading:

> Leave household

Body:

> You'll lose access to this household's shared recipes. Your own recipes will stay with you.

If the user shared recipes:

> 3 recipes you shared will be left for the household owner to keep or remove.

Avoid:

> copied for the Owner to review

> awaiting handoff

---

# 73. Leave confirmation

Heading:

> Leave “Our Kitchen”?

Body:

> You'll lose access to its shared recipes. Your own recipes will stay with you.

If needed:

> 3 recipes you shared will stay behind for the household owner to keep or remove.

Actions:

> Cancel

> Leave household

---

# 74. Settings

Screen:

> Settings

Sections may include:

> Profile

> Household

> Notifications

> Account

Avoid:

> Session

`Session` is authentication-system terminology.

---

# 75. Household settings row

Recommended:

> Household

> People and invites

Alternative:

> Your household

> People, invites, and sharing

Avoid:

> Manage members and invitations

if a more casual description fits.

---

# 76. Notification settings

Row:

> Recipe activity

Eligible state:

> Get notified when shared recipes change.

Solo owner:

> Invite someone to get notified when shared recipes change.

Non-owner:

> Only the household owner can invite people.

Loading:

> Checking notification settings…

Error:

> Couldn't load notification settings.

CTA:

> Try again

Avoid:

> Checking notification availability…

> notification eligibility

---

# 77. Notification permission

Heading:

> Notifications are turned off

Body:

> Turn them on in your device settings if you'd like updates when shared recipes change.

Actions:

> Not now

> Open settings

Avoid `Cancel` when `Not now` better represents the choice.

---

# 78. Notification update failure

Unknown failure:

> Couldn't update notifications.

> Try again.

Confirmed offline:

> You're offline.

> Reconnect to change notification settings.

Do not assume every push-registration failure is caused by connectivity.

---

# 79. Sign out

Section:

> Account

Action:

> Sign out

Loading:

> Signing out…

Failure:

> Couldn't sign out.

If offline is confirmed:

> You're offline. Reconnect and try again.

Otherwise:

> Try again.

No extra personality needed.

---

# 80. State-language system

Every state should first be classified.

## 80.1 Loading

User needs:

> Is something happening?

Pattern:

> `[verb + object]…`

Examples:

> Loading recipes…

> Saving…

> Joining household…

---

## 80.2 Success

User needs:

> Did it work?

Pattern:

> `[object/action] + completed state`

Examples:

> Recipe saved

> Changes saved

> Join code ready

---

## 80.3 Offline

User needs:

> Why can't this happen and what can I do?

Pattern:

> You're offline.

> `[Impact]. Reconnect and try again.`

Example:

> You're offline.

> Reconnect to import this recipe.

---

## 80.4 Unknown error

User needs:

> Did it work and what now?

Pattern:

> Couldn't `[action]`.

> Try again.

Never fabricate a reason.

---

## 80.5 Validation

User needs:

> What should I fix?

Pattern:

> Direct instruction.

Examples:

> Enter a recipe name.

> Enter all 6 digits.

---

## 80.6 Empty state

User needs:

> What belongs here and what should I do?

Pattern:

> Friendly orientation.

> Clear next step.

Example:

> Your recipes will live here.

> Add one you already love.

---

## 80.7 Search zero state

User needs:

> Is the library empty, or did nothing match?

Pattern:

> No `[objects]` match that search.

> Try `[broader search guidance]`.

---

## 80.8 Permission

User needs:

> Why is this unavailable and where can I change it?

Pattern:

> `[Capability] is off.`

> `[Where/how to enable].`

---

## 80.9 Partial success

User needs:

> What worked? What didn't? Is my work safe?

Pattern:

> `[successful part] — [failed part]`

> `[reassurance]`

> `[next choices]`

---

## 80.10 Conflict/stale state

User needs:

> Why did the screen change?

Pattern:

> Things changed while you were here.

> Refresh and try again.

---

## 80.11 Destructive confirmation

User needs:

> What disappears? What remains?

Pattern:

> `[Destructive question]?`

> `[Loss]. [Preserved data].`

---

# 81. Error copy architecture

UI errors must not directly depend on server wording.

Recommended layering:

```text
Backend
    ↓
typed error / error code
    ↓
feature-level state mapper
    ↓
UI copy
```

Example:

```ts
function recipeShareError(error: unknown): RecipeShareUiError {
  if (isOffline(error)) return "offline";
  if (isSessionExpired(error)) return "session_expired";
  if (isAlreadyShared(error)) return "already_shared";
  if (isHouseholdUnavailable(error)) return "household_unavailable";
  return "unknown";
}
```

Then:

```ts
const messages = {
  offline: {
    title: "Recipe not shared",
    body: "You're offline. Reconnect and try again.",
  },
  already_shared: {
    title: "Already shared",
    body: "This recipe is already in your household.",
  },
  unknown: {
    title: "Couldn't share this recipe",
    body: "Try again.",
  },
};
```

---

# 82. Session-expired architecture

Do not display:

> Authentication required.

If the user's session has expired:

1. recover automatically when possible;
2. otherwise return them to authentication;
3. explain in user language only if necessary.

Recommended:

> Please sign in again

> Your sign-in expired. Sign in to keep using Noomori.

CTA:

> Sign in

---

# 83. Accessibility microcopy

Accessibility labels and hints must use the same terminology as visible UI.

Bad:

> Opens the saved recipe snapshot.

Good:

> Opens the recipe.

Bad:

> Immediately invalidates the active join code.

Good:

> Makes this join code stop working.

Bad:

> Validates the code and shows the household before joining.

Good:

> Checks the join code and shows the household.

Accessibility users must not receive more technical language than visual users.

---

# 84. Placeholders

Placeholders are examples, not permanent labels.

Good:

Field:

> Household name

Placeholder:

> Our kitchen

Good:

Field:

> Recipe name

Placeholder:

> Sunday tomato pasta

Bad:

Placeholder only:

> For example, 4

with no visible `Servings` label.

All inputs should retain understandable labels after text is entered.

---

# 85. Buttons

Buttons should normally begin with clear actions.

Good:

> Save recipe

> Share recipe

> Create join code

> Keep editing

> Delete cookbook

Avoid vague actions where consequence matters:

> Submit

> Confirm

> Continue

> Generate

> Process

`Continue` is acceptable in linear navigation where the outcome is naturally understood.

---

# 86. Destructive buttons

Repeat the consequence when reasonable.

Dialog:

> Delete recipe?

Button:

> Delete recipe

Dialog:

> Discard changes?

Button:

> Discard changes

Dialog:

> Deactivate join code?

Button:

> Deactivate code

---

# 87. Toast usage

Use toast for:

- completed CRUD operations,
- lightweight success confirmation,
- failures where the user remains on the same screen and no additional explanation is required.

Do not use toast for:

- complex recovery instructions,
- dangerous data loss,
- permission setup,
- partial success that requires a decision.

Examples:

Good toast:

> Recipe saved

Good toast:

> Code copied

Not sufficient as a toast:

> Recipe saved, but photo upload failed and user must choose what happens next.

Use a dialog or inline state instead.

---

# 88. Inline error usage

Use inline errors when:

- tied to a field,
- tied to a specific section,
- the user can immediately correct it,
- the context should remain visible.

Example:

Recipe name:

> Enter a recipe name.

Join code:

> Enter all 6 digits.

---

# 89. Full-page error usage

Use a full-page error when the page cannot function.

Example:

> Couldn't load your household

> Try again in a moment.

CTA:

> Try again

If cached content exists, prefer showing cached content plus a non-blocking update warning rather than replacing the entire screen.

---

# 90. Empty vs error

Never show an empty state unless data retrieval succeeded.

Bad sequence:

```text
request failed
↓
data = []
↓
"No recipes yet"
```

Correct:

```text
request failed
↓
"Couldn't load your recipes"
```

Only:

```text
request succeeded
data = []
↓
"Your recipes will live here"
```

---

# 91. Offline vs server error

Never write:

> Check your connection

unless there is evidence of a network problem.

Unknown:

> Couldn't load your recipes. Try again.

Known offline:

> You're offline. Reconnect to load your recipes.

Timeout:

> This is taking longer than expected. Try again.

---

# 92. Copy review checklist

Before merging new user-facing copy, check:

### User language

- Does this sound like something a normal cook/household member would say?
- Is implementation vocabulary leaking out?

### Clarity

- Does the user know what happened?
- Does the user know what to do next?

### Brevity

- Is any sentence explaining something the UI already shows?
- Can anything be removed without losing meaning?

### Consistency

- Are canonical terms used?
- Does the same action have the same name elsewhere?

### Tone

- Is the copy warm where appropriate?
- Is it serious where appropriate?
- Is it trying too hard to be playful?

### Safety/reassurance

If recipes, edits, sharing, or deletion are involved:

- Does the user know what stays?
- Does the user know what disappears?

### Error integrity

- Is this message based on the actual failure state?
- Are we guessing that the user's connection is the problem?
- Could raw backend text appear?

### Accessibility

- Does the accessibility copy use the same language?
- Does the control make sense without visual context?

---

# 93. Implementation priorities

## P0 — Must fix before considering the communication system complete

1. Remove visible Recipe ID/debug information.
2. Stop direct rendering of raw API/backend `error.message`.
3. Map authentication/session failures to user-facing recovery.
4. Separate genuine empty states from failed loads.
5. Remove visible `handoff`/`snapshot` terminology.
6. Prevent API error detail strings from becoming recipe-share UI.
7. Prevent API error detail strings from becoming cookbook UI.
8. Prevent household API messages from appearing directly in handoff UI.

---

## P1 — Main voice rewrite

Rewrite:

1. recipe editor,
2. household settings,
3. invite-code lifecycle,
4. handoff flow,
5. notifications,
6. join flow,
7. account/session terminology,
8. import errors.

---

## P2 — Consistency polish

Update:

1. CTA specificity,
2. sentence case,
3. `item/items` counts,
4. Recipe actions → Recipe options if adopted,
5. Activity → Household activity,
6. Instruction → Step for individual instructions,
7. Website URL → Recipe link,
8. ASCII `...` → typographic `…`,
9. accessibility hints,
10. generic empty-state wording.

---

# 94. Recommended code organization

Consider creating a lightweight content/state layer rather than scattering important error strings throughout screens.

Example:

```text
src/shared/copy/
  auth.ts
  household.ts
  recipes.ts
  imports.ts
  notifications.ts
  common.ts
```

Do not centralize every one-off heading merely for abstraction.

Prioritize centralization for:

- error maps,
- repeated states,
- terminology,
- repeated success messages.

---

# 95. Testing requirements

Tests should verify user-visible state copy for important flows.

At minimum:

## Authentication

- offline,
- generic failure,
- signing in.

## Household

- create success,
- create failure,
- invalid invite,
- expired invite,
- incomplete code,
- rate limit,
- join success,
- leave confirmation,
- leave failure.

## Recipe import

- invalid URL,
- unsupported page,
- no recipe detected,
- multiple recipes,
- timeout,
- offline,
- generic server failure,
- raw auth errors never visible.

## Recipe editing

- required fields,
- invalid quantity,
- save success,
- save failure with edits retained,
- photo partial failure,
- discard confirmation.

## Recipe sharing

- share success,
- duplicate share,
- share failure,
- remove-from-household failure,
- delete failure,
- raw backend detail never visible.

## Handoff

- pending,
- keep,
- remove,
- remove all,
- conflict,
- all complete,
- no internal vocabulary visible.

## Notifications

- loading,
- available,
- solo household,
- permission denied,
- system settings CTA,
- generic failure,
- offline failure.

## Cookbooks

- empty,
- search zero,
- load error,
- create success,
- update success,
- delete confirmation,
- delete failure.

---

# 96. Copy-focused test assertions

Where appropriate, explicitly assert prohibited strings do not appear.

Examples:

```ts
expect(screen.queryByText(/authentication required/i)).toBeNull();
expect(screen.queryByText(/handoff/i)).toBeNull();
expect(screen.queryByText(/snapshot/i)).toBeNull();
expect(screen.queryByText(/HTTP|HTTPS|HTML/i)).toBeNull();
expect(screen.queryByText(/Recipe ID:/i)).toBeNull();
```

Use judgment: these words may legitimately exist in dev-only tests/logs. The assertion applies to visible production UI.

---

# 97. Acceptance criteria

The microcopy pass is complete when:

1. A new user can move from sign-in to household creation/join without encountering unexplained role or system terminology.
2. Recipe creation reads like writing a recipe rather than completing a structured-data form.
3. No visible production copy references:
   - handoff,
   - snapshot,
   - authentication,
   - status code,
   - HTML,
   - HTTP/HTTPS,
   - internal IDs,
   unless explicitly necessary.
4. Invitation terminology is consistently `join code`.
5. `generate/revoke` have been replaced with user-oriented actions.
6. Owner/member terminology appears only where role matters.
7. Every recoverable error gives an appropriate next step.
8. Network copy only blames connectivity when network failure is identified.
9. Raw backend/API error messages cannot render directly.
10. Partial-success flows explain what succeeded and reassure users about saved data.
11. Destructive actions explain both what disappears and what remains where relevant.
12. Empty, loading, search-zero, error, offline, permission, and conflict states are visually and verbally distinct.
13. Accessibility labels and hints follow the same vocabulary.
14. Success feedback is brief and consistent.
15. The tone remains recognizable from onboarding through sign-out.

---

# 98. Final product-language test

For any new piece of Noomori copy, ask:

> **Would someone naturally say this while keeping a shared recipe notebook at home?**

If yes, it is probably moving in the right direction.

Then ask:

> **Does it still tell the user exactly what they need to know or do?**

Both conditions must be true.

Warmth without clarity is not useful.

Clarity without humanity is what makes the current technical sections feel rigid.

Noomori needs both.

---

# 99. References

### Internal

**Noomori `better-writing` skill**

Used for:

- voice consistency,
- severity assessment,
- plain-language guidance,
- CTA rules,
- error recovery,
- empty-state guidance,
- destructive-action language.

### External

**Supercharge Design — “How to Write Microcopy in UI”**  
Updated March 10, 2026.

Key concepts incorporated:

- clear and concise language,
- active voice,
- contextual CTAs,
- positive framing,
- terminology consistency,
- actionable error messages,
- brand-aligned tone.

**Nielsen Norman Group — “The 3 I’s of Microcopy: Inform, Influence, and Interact”**  
Published August 1, 2025.

Key concepts incorporated:

- microcopy should have a clear goal,
- informational microcopy helps users understand and make informed decisions,
- influential microcopy can establish brand connection,
- interaction microcopy supports interface use,
- goals should be prioritized rather than forcing each small string to accomplish everything.

---

# 100. Summary

Noomori's desired communication model is:

> **Warm at the door.  
> Warm while cooking.  
> Warm while sharing.  
> Calm when something goes wrong.  
> Clear when something matters.**

The application should feel like one consistent person is guiding the user from onboarding through everyday recipe use, household sharing, failures, settings, and sign-out.

The user should never need to understand Noomori's database, APIs, parser, role model, synchronization strategy, or internal workflow in order to understand the interface.

The system handles the complexity.

The copy explains only what the user needs.
