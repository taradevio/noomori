# Household-first copy rewrite

## Summary

Reposition Noomori as a shared household recipe library with first-class personal use. Preserve the current warm, direct voice, selective sharing model, navigation, layouts, and inline-string architecture.

Canonical message:

- Promise: “Recipes for your household—and you.”
- Explanation: “Keep your own recipes organized, then share the ones everyone should have.”
- Reassurance: “Your personal recipes stay private until you share them with your household.”

## Current writing findings

### Positioning and terminology

| Severity | Location                                                                                                                                         | Before                                                                             | After                                                                      | Why                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| MEDIUM   | `PRODUCT.md:11`; `src/shared/components/auth/auth-screen.tsx:42`; `src/shared/components/recipe/recipes-library-view.tsx:181`                    | Personal recipe keeping leads; household sharing is secondary                      | Lead with household sharing and immediately reinforce private personal use | The current product brief and primary surfaces contradict the chosen household-first positioning |
| MEDIUM   | `src/shared/components/recipe/recipe-detail-view.tsx:613`; `src/shared/components/recipe/recipe-card.tsx:27`; `src/app/recipe/[id]/index.tsx:92` | “Share to household,” “Unshare,” “Shared”                                          | “Share with household,” “Remove from household,” “Shared with household”   | Sharing vocabulary is inconsistent and sometimes ambiguous                                       |
| MEDIUM   | `src/app/onboarding/join-household.tsx:31`; `src/app/household/settings.tsx:226`                                                                 | “Invite code” and “join code”                                                      | Use “join code” throughout                                                 | One object currently has two names                                                               |
| MEDIUM   | `src/app/(tabs)/account.tsx:99` and `:108`                                                                                                       | “Recipe activity”                                                                  | “Receive shared recipe updates”                                            | A toggle must describe what happens when it is on                                                |
| MEDIUM   | `src/shared/components/recipe/recipe-form.tsx:873`, `:973`, `:1035`, `:1250`, `:1413`                                                            | “Structured times,” “independently editable,” “stay stable when the editor scales” | Plain task-focused guidance such as “Add prep, cook, and total times”      | The recipe editor exposes implementation concepts instead of helping someone enter a recipe      |

### Actions, errors, and recovery

| Severity | Location                                                                                                                                                                                                                               | Before                                                                                                                                                      | After                                                                                                                                       | Why                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| HIGH     | `src/shared/components/recipe/recipe-create-screen.tsx`; `src/app/recipe/[id]/edit.tsx`                                                                                                                                                | A duplicate is recognized only when a `409` body exactly matches “This recipe is already in your recipes.”; other responses fall through to connection copy | Treat the save endpoints’ `409` response as a duplicate and show “You already have this recipe.”                                            | User-facing text must not be an API discriminator, and a content conflict must not be described as a connection failure |
| HIGH     | `src/shared/components/recipe/recipe-create-screen.tsx:198`, `:278`; `src/app/recipe/[id]/edit.tsx:77`, `:214`; `src/shared/components/recipe/recipe-detail-view.tsx:746`, `:817`; `src/app/household/recipe-handoffs.tsx:106`, `:136` | “Continue,” “Discard,” “Share,” “Unshare,” “Delete,” “Keep,” “Remove”                                                                                       | “Continue without photo,” “Discard changes,” “Share recipe,” “Remove from household,” “Delete recipe,” “Keep for household,” “Discard copy” | Consequential buttons do not consistently state their result; handoff actions can immediately create or discard a copy  |
| MEDIUM   | `src/shared/components/auth/google-sign-in-button.tsx:27`; `src/app/recipe/import-text.tsx:29`; `src/app/recipe/import-url.tsx:48`                                                                                                     | “We couldn’t…”                                                                                                                                              | “Couldn’t…” followed by a specific recovery action                                                                                          | First-person errors are inconsistent with the otherwise direct voice                                                    |
| MEDIUM   | `src/app/household/recipe-handoffs.tsx:132` and `:312`                                                                                                                                                                                 | “Couldn’t save that decision”                                                                                                                               | Name the failed action: “Couldn’t keep this recipe…” or “Couldn’t discard this copy…”                                                       | “Decision” is system language and does not tell the reader what failed                                                  |
| LOW      | `src/shared/components/recipe/recipes-library-view.tsx:415`; `src/shared/components/cookbook/cookbook-recipe-picker.tsx:167`                                                                                                           | “No recipes found”                                                                                                                                          | `No recipes found for “{query}”` with “Clear search”                                                                                        | Search empty states should identify the query and provide an exit                                                       |
| LOW      | `src/shared/components/recipe/recipe-form.tsx:1453`, `:1547`; `src/app/recipe/import-text.tsx:165`                                                                                                                                     | “Family / Friend,” `Saving...`, `Paste recipe here...`                                                                                                      | “Family or friend,” `Saving…`, `Paste recipe here…`                                                                                         | Sentence case and ellipsis styles are inconsistent                                                                      |

### Unresolved legal copy

| Severity | Location                                        | Before                                                   | After                                                                                     | Why                                                                 |
| -------- | ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| HIGH     | `src/shared/components/auth/auth-screen.tsx:53` | Terms of Service and Privacy Policy appear as plain text | Leave unchanged in this rewrite; track approved policy URLs and legal language separately | The screen asserts agreement without giving access to either policy |

**Block:** current copy is not approvable while the legal destinations remain unavailable. This does not block the household-first rewrite itself.

## Implementation changes

- Update `PRODUCT.md` instead of creating another content guide. Define the household-first promise, the personal-privacy reassurance, sentence case, direct error voice, verb-first actions, and the canonical terminology below.
- Keep `Your recipes` for the personal library and `Shared recipes` for the household collection. Use `household`, `join code`, `household activity`, `share with`, and `remove from` consistently.
- Rewrite the authentication hero, onboarding support text, and home subtitle around the canonical message. Retain the existing onboarding headline because it already expresses the product well.
- Make sharing explicit across recipe cards, detail actions, confirmations, success messages, activity events, notifications, and empty states. Confirmations must state both household access and that the original remains in the personal library.
- Explain handoff review before its actions: keeping creates an owner-held recipe shared with the household; discarding affects only the isolated copy, never the former member’s original.
- Rewrite recipe-form guidance in plain cooking language while retaining existing labels, fields, validation limits, and workflows.
- Normalize errors to `[what failed]. [how to recover].`, remove “we,” and make retry copy action-specific where multiple actions are possible.
- Show “You already have this recipe.” for personal create/edit conflicts. Classify the save endpoints’ `409` responses by status and operation rather than comparing response copy; keep the draft open and skip photo upload.
- Reserve connection guidance for rejected or timed-out requests. Use neutral retry guidance for non-conflict HTTP failures.
- Update visible labels and matching accessibility labels together. Preserve complete pluralized templates rather than concatenated sentence fragments.
- Do not introduce a copy constants module, localization framework, dependency, route change, layout change, API change, schema change, or type change.

## Test plan

- Update existing exact-copy assertions in authentication, library, account, recipe detail/editor/import, household settings/activity, and recipe-handoff tests.
- Add focused assertions that:
  - household sharing leads on authentication and onboarding surfaces;
  - personal recipes are described as private until explicitly shared;
  - sharing and removal confirmations state audience and persistence;
  - the notification switch describes its enabled state;
  - destructive and handoff buttons repeat their consequence;
  - personal duplicate `409` responses show “You already have this recipe.” even when the response detail changes, while genuine transport failures retain connection guidance;
  - search empty states include the query and clear action;
  - accessibility labels match the revised visible action.
- Run the affected frontend tests, then `bun run typecheck` and `bun run test:functional:fe`. Source verification is sufficient; no browser or screenshot review is required for this copy-only change.

## Assumptions

- Apply the rewrite on top of the current modified worktree without reverting ongoing household and handoff work.
- English remains the only supported interface language.
- Sharing stays selective; recipes are personal by default.
- “Recipe duplication” includes personal create and edit conflicts as well as household sharing and handoff conflicts.
- Navigation order and the `Household` tab label remain unchanged.
- The legal acceptance sentence remains untouched until approved URLs and wording are supplied.
- Before implementation changes any source, read the exact [Expo SDK 56 documentation](https://docs.expo.dev/versions/v56.0.0/) as required by `AGENTS.md`.
