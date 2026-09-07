# Stable Recipe Activity Row

## Summary

Keep the Notifications section visible on supported native Settings screens and change only the Recipe activity row’s content based on household state.

The goal is to remove the current layout instability where the Notifications section appears only after the asynchronous household query resolves, while preserving the existing `["household"]` query and avoiding additional providers, sign-in prefetching, backend changes, or eager data loading.

Do not render a disabled notification switch for solo users. Instead, use the row as contextual feature discovery and provide a direct path to the existing household invite flow.

---

## Goals

- Keep the Settings information architecture stable while household eligibility is loading.
- Make Recipe activity discoverable for solo users without presenting it as a blocked or paywalled feature.
- Keep the notification switch available only when it is actually actionable.
- Give solo owners a clear path to invite another household member.
- Keep query failures recoverable from the Settings screen itself.
- Preserve current notification-provider, backend, database, and household invite behavior.
- Maintain large-text accessibility and screen-reader behavior.

## Non-Goals

- Do not prefetch household settings at sign-in.
- Do not add a new household or notification provider.
- Do not eagerly mount the Settings screen.
- Do not generate, copy, or revoke invitation codes from the Account screen.
- Do not change push-notification delivery behavior.
- Do not change backend, database, RLS, or notification-provider contracts.
- Do not attempt to eliminate the household settings request.
- Do not use a disabled notification switch as the solo-user state.

---

## Current Problem

`account.tsx` currently derives visibility from household data:

```ts
const showNotifications =
  notifications.available &&
  (householdQuery.data?.member_count ?? 0) >= 2;
```

On a cold cache, the initial household data is undefined.

The resulting flow is effectively:

```text
Settings renders
↓
household data is undefined
↓
Notifications section is hidden
↓
household request completes
↓
member_count >= 2
↓
Notifications section mounts
↓
Session section moves downward
```

This makes the Settings screen feel as if it is still rendering even though the rest of the page is already interactive.

The fix should make household eligibility an explicit row state instead of conditionally mounting the entire Notifications section.

---

## State Model

Replace the current boolean visibility model with an explicit Recipe activity state.

Suggested conceptual model:

```ts
type RecipeActivityState =
  | "loading"
  | "solo-owner"
  | "eligible"
  | "error"
  | "unavailable";
```

The exact implementation does not need to introduce this exported type if inline derivation is cleaner, but the UI behavior must follow these states.

### State Derivation

Use the existing `["household"]` query.

Conceptually:

```ts
const recipeActivityState =
  !notifications.available
    ? "unavailable"
    : householdQuery.isPending
      ? "loading"
      : householdQuery.isError || !householdQuery.data
        ? "error"
        : householdQuery.data.member_count >= 2
          ? "eligible"
          : householdQuery.data.member_count === 1 &&
              householdQuery.data.role === "owner"
            ? "solo-owner"
            : "unavailable";
```

Do not assume `member_count === 1` automatically means the current user can invite.

Even if the existing domain invariant makes a one-person household owner-led, the UI boundary should remain defensive and require:

```ts
member_count === 1 && role === "owner"
```

for the invite CTA.

---

# Implementation Changes

## 1. `src/app/(tabs)/account.tsx`

Replace the current conditional Notifications section with a stable section that remains mounted whenever `notifications.available === true`.

Keep Notifications hidden when `notifications.available === false`, preserving the current unsupported-platform/web behavior.

### Loading State

Render:

**Recipe activity**

> Checking notification availability…

Trailing content:

- A small non-interactive `ActivityIndicator`, or
- an empty reserved trailing slot if the spinner is visually noisy.

Do not render a switch.

Do not make the row interactive.

The key UX requirement is that the Notifications section exists immediately instead of appearing after the query resolves.

### Solo Owner State

Render:

**Recipe activity**

> Invite someone to get notified when shared recipes change.

Trailing content:

- Chevron.

Make the entire row a button.

On press, navigate to the existing Household settings route with the internal invite target:

```ts
router.push({
  pathname: "/household/settings",
  params: { section: "invite" },
});
```

Do not generate a join code from this row.

The Account screen should only route the user to the existing invitation surface.

### Eligible State

For households with at least two members, retain the current functional notification switch.

Use:

**Recipe activity**

> Get notified when shared recipes change.

This copy intentionally replaces:

> Shared recipe additions and updates

because household notifications can represent additions, updates, and recipes that stop being shared.

Keep the existing switch behavior:

- `notifications.enabled`
- `notifications.isPending`
- `notifications.setEnabled`
- sign-out pending state
- current accessibility semantics
- existing notification error handling

### Query Error State

Render:

**Recipe activity**

> Couldn’t check notification availability.

Trailing content:

**Retry**

Retry the existing query directly:

```ts
void householdQuery.refetch();
```

Do not route users to Household settings merely to retry the same household request.

The Household settings row remains available separately for users who actually want to manage their household.

### Notification Provider Error

Keep the existing notification-provider error message behavior for failures that occur while enabling or disabling notifications.

Household-query errors and notification-registration errors are separate concerns:

```text
household query error
→ row eligibility could not be determined
→ inline Retry

notification provider error
→ enable/disable operation failed
→ existing notification error message
```

Do not merge the two states.

---

## 2. Stable Row Layout

Reserve enough minimum vertical space for approximately two lines of secondary copy at normal font sizes.

Do not use a fixed height that clips or constrains accessibility text.

Preferred behavior:

```text
normal font
loading → solo → eligible
≈ stable row height

large accessibility font
row may grow naturally
```

Accessibility takes priority over absolute pixel stability.

### Trailing Control Area

Use a consistent trailing-control container width so the row does not horizontally reflow when transitioning between:

```text
loading   → spinner / blank
solo      → chevron
eligible  → switch
error     → Retry
```

Do not force all controls themselves to have identical sizes; reserve a consistent containing area instead.

---

## 3. `src/app/household/settings.tsx`

Add support for the optional internal route parameter:

```ts
section?: "invite"
```

Read it using Expo Router:

```ts
const { section } =
  useLocalSearchParams<{ section?: "invite" }>();
```

### Invite Target Behavior

When all of the following are true:

- `section === "invite"`
- household query data is ready
- current user role is `owner`
- the Invite member section has completed layout
- the invite target has not already been handled

then:

1. Scroll once to the existing **Invite member** section.
2. Use `animated: false`.
3. Move accessibility focus to the **Invite member** heading after the scroll.
4. Never auto-scroll again for the lifetime of that mounted route instance.

Use a ref such as:

```ts
const handledInviteTargetRef = useRef(false);
```

to prevent repeated scrolling after:

- query refetches
- generated-code state changes
- mutation state changes
- rerenders

### Scroll Target

Keep a ref to the `ScrollView`.

Capture the Invite member section’s Y position through `onLayout`.

Conceptually:

```ts
inviteSectionYRef.current = event.nativeEvent.layout.y;
```

Then:

```ts
scrollViewRef.current?.scrollTo({
  y: Math.max(0, inviteSectionY - topOffset),
  animated: false,
});
```

Use a small top offset if necessary so the heading is not flush against the top edge.

Do not rely on arbitrary timers to guess layout completion.

### Accessibility Focus

The **Invite member** heading should be an accessibility target.

After scrolling, send an accessibility `focus` event using the current React Native accessibility API supported by the Expo SDK 56 / React Native baseline.

Do not implement new code using the deprecated:

```ts
AccessibilityInfo.setAccessibilityFocus(...)
```

Prefer the current API pattern:

```ts
AccessibilityInfo.sendAccessibilityEvent(
  inviteHeadingRef.current,
  "focus",
);
```

Ensure the target is actually accessible and that the implementation matches the React Native version used by Expo SDK 56.

Use a next-frame/layout-safe mechanism if needed so focus is sent after the scroll/layout transition rather than before it.

### Invite Section Unavailable

If any of the following are true:

- user is not an owner
- household query fails
- `section` is invalid or absent
- Invite member section does not exist

leave Household settings at its normal position.

Do not show a new error solely because the invite target cannot be fulfilled.

Preserve the existing owner/member messaging.

---

# Interfaces

Add one internal navigation parameter:

```ts
section?: "invite"
```

for:

```text
/household/settings
```

Preferred navigation contract:

```ts
router.push({
  pathname: "/household/settings",
  params: { section: "invite" },
});
```

Do not construct the query string manually unless the existing routing convention requires it.

No public API changes.

No backend changes.

No database changes.

No notification-provider changes.

No household invite API changes.

---

# UX State Matrix

| State | Primary label | Secondary copy | Trailing | Interactive |
|---|---|---|---|---|
| Loading | Recipe activity | Checking notification availability… | Spinner or reserved blank | No |
| Solo owner | Recipe activity | Invite someone to get notified when shared recipes change. | Chevron | Yes |
| 2+ members | Recipe activity | Get notified when shared recipes change. | Switch | Yes |
| Household query error | Recipe activity | Couldn’t check notification availability. | Retry | Yes |
| Notifications unavailable | — | — | — | Section hidden |

---

# Accessibility Requirements

- Keep the notification row readable with large font scaling.
- Do not use fixed heights that clip secondary text.
- Preserve minimum 48dp interactive targets.
- The solo row must expose an appropriate button role and navigation hint.
- The eligible notification switch must retain its current accessibility state:
  - `busy`
  - `disabled`
  - current value
- The error Retry action must expose a clear button label.
- Loading state must not expose a fake interactive control.
- The Invite member heading must be a valid accessibility target.
- Deep-linking to the invite section must move screen-reader focus after scrolling.
- The invite target must only be processed once per mounted route instance.

---

# Test Plan

## `tests/frontend/account.functional.test.tsx`

Update tests to verify:

### Loading

- Notifications section is rendered immediately when notifications are available.
- `Recipe activity` is visible.
- Loading copy is visible.
- No notification switch is rendered.
- No interactive solo CTA is available yet.
- Session content remains mounted at the same time.

### Solo Owner

Given:

```text
member_count = 1
role = owner
```

verify:

- Solo invite copy renders.
- Chevron renders.
- Row is interactive.
- Pressing it navigates with:

```ts
{
  pathname: "/household/settings",
  params: { section: "invite" },
}
```

- No notification switch is rendered.

### Unexpected Solo Member

Given:

```text
member_count = 1
role = member
```

verify the UI does not expose the owner invite CTA.

Use the defensive fallback defined by the implementation.

### Eligible Household

Given:

```text
member_count >= 2
```

verify:

- Eligible copy renders.
- Existing functional switch renders.
- Current notification toggle behavior remains unchanged.

### Household Query Error

Verify:

- Error copy renders.
- Retry control is available.
- Pressing Retry calls `householdQuery.refetch()`.
- The user is not automatically routed to Household settings.
- The notification switch is not rendered.

### Notifications Unavailable

Verify:

- Notifications section remains hidden when `notifications.available === false`.

### State Transition Regression

Verify the component can transition from loading to eligible without conditionally mounting the Notifications section only after resolution.

The test does not need to assert pixel positions.

It should prove that:

```text
loading state
→ Notifications section already exists

eligible state
→ same capability area now contains the switch
```

---

## Household Settings Focused Test

Add a focused test for:

```text
/household/settings?section=invite
```

Given:

- household data is ready
- role is owner
- Invite member section has laid out

verify:

1. `scrollTo` is called once with `animated: false`.
2. Accessibility focus is sent to the Invite member heading.
3. Subsequent rerenders do not call `scrollTo` again.
4. Household-query refetches do not call `scrollTo` again.
5. Mutation-state changes do not call `scrollTo` again.

Also verify:

- without `section=invite`, no automatic scroll occurs.
- for a non-owner, no invite-target scroll occurs.

---

# Manual Regression Matrix

Run on a physical Android device in addition to automated tests.

## Cold Cache / Slow Network

Open Settings with no cached household data.

Verify:

```text
Settings renders
↓
Notifications section is already present
↓
only Recipe activity shows a loading state
↓
household query resolves
↓
row changes in place
```

The entire Notifications section must not suddenly appear and push Session downward.

## Solo Owner

- Open Settings.
- Confirm the solo CTA appears.
- Tap Recipe activity.
- Confirm Household settings opens.
- Confirm the page lands on Invite member.
- Confirm no join code is generated automatically.

## Eligible Household

- Confirm Recipe activity switch appears.
- Toggle notifications on and off.
- Verify pending state behavior remains correct.
- Verify existing permission flows remain unchanged.

## Error

Simulate household-query failure.

Verify:

- Recipe activity remains visible.
- Inline Retry works.
- Household settings remains independently accessible.

## Font Scaling

Test at minimum:

```text
1.0
1.3+
large accessibility font
```

Verify:

- no secondary text is clipped
- row can grow naturally
- trailing controls remain usable

## TalkBack

With a solo owner:

```text
Settings
→ Recipe activity
→ activate
→ Household settings
→ focus lands on Invite member
```

Verify this behavior manually even if the automated test confirms that the accessibility event was sent.

---

# Verification

Before implementation, verify the exact APIs against the documentation versions required by Expo SDK 56:

- Expo Router `useLocalSearchParams`
- Expo Router `HrefObject` / `pathname + params`
- React Native `ScrollView.scrollTo`
- React Native `AccessibilityInfo.sendAccessibilityEvent`
- current accessibility-ref requirements

After implementation, run:

```bash
bun run test
bunx expo lint
```

or the repository’s narrower frontend functional test command if one already exists.

At minimum, run:

- Account functional tests
- Household settings focused tests
- Full frontend functional suite
- Expo lint

---

# Assumptions

- A one-person household is expected to be owner-led under the current application invariant.
- The UI still checks `role === "owner"` defensively before exposing the invite CTA.
- Existing join-code UI remains the only place that generates, copies, shares, and revokes invitations.
- Notifications remain meaningful only once another household member exists.
- The Settings page may still perform a household request; eliminating that request is not part of this change.
- Stable information architecture is preferred over conditionally mounting Settings capabilities after async eligibility resolves.

---

# Final Behavior

```text
Settings
│
├── Profile
│
├── Household
│
├── Notifications
│      │
│      ├── loading
│      │      Recipe activity
│      │      Checking notification availability…
│      │
│      ├── solo owner
│      │      Recipe activity
│      │      Invite someone to get notified when
│      │      shared recipes change.              >
│      │
│      ├── eligible
│      │      Recipe activity
│      │      Get notified when shared
│      │      recipes change.                  [switch]
│      │
│      └── error
│             Recipe activity
│             Couldn’t check notification
│             availability.                    Retry
│
└── Session


solo owner tap
        ↓
/household/settings?section=invite
        ↓
scroll once
        ↓
Invite member
        ↓
move accessibility focus
```
