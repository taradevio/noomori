# Reorderable Recipe Instructions

## Summary

Add drag-to-reorder for instruction steps inside the shared `RecipeForm`.

Steps may only move within their current instruction section. The existing nested `instructionGroups[].steps` arrays remain the source of persisted ordering, so create, edit, and save require no backend, API, or database changes.

Use the already-installed Expo 56-compatible `react-native-gesture-handler` and `react-native-reanimated`. Do not add another drag-list dependency.

The interaction uses transient UI-thread drag state while the gesture is active and commits one reordered draft array only after a successful drop.

## Implementation

### 1. Gesture Root

Wrap the application root with `GestureHandlerRootView` as the outermost native interaction container:

```text
GestureHandlerRootView
  └── KeyboardProvider
      └── QueryClientProvider
          └── application
```

- Keep `flex: 1`.
- Preserve the existing `KeyboardProvider` and all other providers.
- Do not wrap individual recipe screens separately.

### 2. Instruction Drag Handle

Update instruction cards in the shared `RecipeForm`.

Each instruction receives:

- one 48×48 drag handle;
- one visible instruction number beside the handle;
- the existing delete action;
- the existing multiline text input.

Remove the duplicate circular instruction number.

Use the existing:

- `SymbolView`;
- NativeWind utilities;
- semantic design-system colors;
- current instruction card layout conventions.

Dragging starts only from the handle.

Use approximately an 8dp vertical activation threshold so small finger movement does not accidentally begin a drag.

Normal touches elsewhere on the instruction card continue to:

- edit text;
- focus the input;
- scroll the recipe form;
- activate existing controls.

### 3. Drag State

Keep two separate state layers.

#### Canonical state

React `draft.instructionGroups[].steps` remains authoritative.

Do not mutate or reorder it continuously while dragging.

#### Transient drag state

Use Reanimated shared values for:

- active step ID;
- source index;
- candidate destination index;
- dragged translation;
- measured step layouts;
- current scroll offset;
- drag-active state.

While dragging:

```text
React draft
= original order

Reanimated state
= provisional visual order
```

On successful drop:

```text
candidate index
↓
reorder one steps array
↓
setDraft(...)
```

On cancellation:

```text
clear transient drag state
↓
animate cards back
↓
do not mutate draft
```

### 4. Dynamic Step Heights

Instruction cards may have different heights because instruction text is multiline.

Measure the rendered bounds of every step in its current section.

Determine the provisional destination by comparing the dragged card's center with neighboring step midpoints.

Clamp the destination to:

```text
0 ... group.steps.length - 1
```

A step must never cross into another instruction section.

Recalculate layout information when instruction cards materially change size.

### 5. Provisional Reordering

Maintain a `candidateIndex` while dragging.

When the dragged card crosses another step's midpoint:

- update the candidate position;
- translate neighboring cards to visually make room;
- keep the actual React array unchanged.

Example:

```text
Before:

1  Chop onion
2  Heat pan       ← dragging
3  Add tomato
4  Simmer


Dragging toward position 4:

1  Chop onion
3  Add tomato
4  Simmer
   [gap]
2  Heat pan       ← floating
```

The provisional visual state must represent the destination clearly before release.

Only commit the array reorder when the drag successfully ends.

### 6. Keyboard Interaction

`RecipeForm` currently uses `KeyboardAwareScrollView` from `react-native-keyboard-controller`.

Before implementing full edge auto-scroll, verify that the current scroll container supports:

- reading the active scroll position;
- programmatic scrolling;
- temporarily disabling user scrolling;
- continuing to work after keyboard dismissal.

When drag begins:

- dismiss the software keyboard;
- prevent normal user scrolling while the drag is active;
- keep programmatic drag auto-scroll available.

Do not rely on layout measurements captured before the keyboard closes if the viewport size changes.

Refresh or use current layout/scroll values after keyboard dismissal as needed.

Existing keyboard-aware input behavior must resume normally after the drag ends.

### 7. Edge Auto-Scroll

Support dragging beyond the currently visible part of the form.

Create top and bottom edge zones of approximately 64dp.

When the dragged card enters an edge zone:

```text
far from edge
→ little/no auto-scroll

closer to edge
→ progressively faster auto-scroll
```

Express auto-scroll speed in distance per second, not distance per frame.

For example:

```text
velocity = dp / second
frame displacement = velocity × elapsed time
```

This prevents 90Hz/120Hz devices from scrolling substantially faster than 60Hz devices.

Include scroll displacement when resolving the dragged card's position and candidate index.

Stop auto-scroll immediately when:

- the gesture ends;
- the gesture is cancelled;
- the dragged item leaves the edge zone.

### 8. Drop Behavior

A valid drop:

1. resolves the final candidate index;
2. reorders only that instruction section's `steps`;
3. updates the draft once;
4. clears transient drag state;
5. updates numbering automatically from array position.

Do not persist an explicit `order` field.

Instruction numbering remains derived:

```ts
index + 1
```

Existing dirty-state detection should therefore become dirty automatically after a successful reorder.

Existing create/edit serialization should persist the reordered array unchanged.

### 9. Animation

Use Reanimated for:

- dragged-card translation;
- neighboring-card displacement;
- returning to position after cancellation;
- short layout settling after drop.

Visually distinguish the active dragged card with a stronger border or equivalent existing semantic treatment.

Avoid large scale, rotation, or decorative animations.

Respect the user's reduced-motion preference and keep motion functional rather than decorative.

## Accessibility

Drag-and-drop must not be the only way to reorder instructions.

Expose each drag handle as an adjustable control.

Provide its current position:

```text
Instruction 2 of 5
```

Support accessibility actions:

- `increment` → move one position later;
- `decrement` → move one position earlier.

Clamp actions at the first and last positions.

When a section contains only one instruction:

- expose the handle as disabled;
- do not start a drag.

After an accessibility reorder, announce the result, for example:

```text
Instruction moved to position 3 of 5.
```

Accessibility actions must call the same canonical reorder logic used when committing a drag.

Web Arrow Up/Down reordering is outside this initial feature scope and may be added later when the web recipe editor is actively supported.

## Pure Reorder Helpers

Keep canonical array operations independent from gesture physics.

Examples:

```ts
moveInstruction(
  steps,
  fromIndex,
  toIndex,
)
```

and, if useful:

```ts
resolveInstructionDestination(
  layouts,
  draggedCenter,
)
```

These helpers should contain no React Native, Gesture Handler, or Reanimated dependencies.

Gesture code determines:

```text
from / to
```

while the pure helper determines:

```text
new canonical array
```

## Test Plan

### Pure logic tests

Verify:

- first → last;
- last → first;
- middle → earlier;
- middle → later;
- same-position move;
- first-position clamp;
- last-position clamp;
- single-step section;
- dynamically sized midpoint destination resolution;
- steps from another section are untouched.

### Shared form tests

Verify:

- accessibility increment reorders a step;
- accessibility decrement reorders a step;
- numbering updates after reorder;
- single-step handles are disabled;
- delete removes the correct step after reorder;
- adding a step after reorder appends to the correct section;
- Save serializes instructions in the reordered array order;
- create and edit use the same behavior.

Do not attempt to reproduce native gesture physics, animation timing, or real scroll behavior primarily through Jest mocks.

### Integration / manual device tests

Validate on physical or realistic Android and iOS environments:

1. Drag upward inside a section.
2. Drag downward inside a section.
3. Attempt to cross a section boundary.
4. Reorder short and long multiline instructions.
5. Begin dragging while the keyboard is open.
6. Confirm keyboard dismissal does not cause item jumps.
7. Drag beyond the visible viewport using top/bottom auto-scroll.
8. Verify similar auto-scroll behavior on 60Hz and high-refresh-rate Android devices where available.
9. Cancel a drag and confirm the original order remains.
10. Reorder, Save, reopen Edit, and confirm the saved order.
11. Verify normal recipe-form scrolling after drag completes.
12. Verify `KeyboardAwareScrollView` still reveals focused inputs after reordering.
13. Verify reduced-motion behavior.
14. Verify accessibility reordering using a screen reader where practical.

## Implementation Order

Implement in this order to reduce integration risk:

### Phase 1 — Reorder invariant

- Add pure array reorder helper.
- Add accessibility move actions.
- Confirm Save persists the new order.

This proves the data model requires no backend change.

### Phase 2 — Basic handle drag

- Add `GestureHandlerRootView`.
- Add drag handles.
- Implement same-section drag without edge auto-scroll.
- Support dynamic card heights and candidate index.
- Commit only on release.

Validate on Android and iOS.

### Phase 3 — Scroll integration

- Verify compatibility with the existing `KeyboardAwareScrollView`.
- Add keyboard dismissal.
- Suspend manual scrolling while dragging.
- Add edge auto-scroll using time-normalized velocity.

Do not proceed with workaround-heavy scroll code if the current keyboard-aware container cannot expose reliable programmatic scrolling; reassess that boundary instead.

### Phase 4 — Polish

- Neighbor displacement animation.
- Active-card styling.
- Reduced-motion behavior.
- Screen-reader announcements.
- Cancellation and interaction regression pass.

## Out of Scope

This feature does not add:

- instruction-section reordering;
- dragging instructions between sections;
- ingredient reordering;
- direct reordering from recipe detail;
- automatic backend persistence while dragging;
- an explicit `order` database field;
- a new drag-and-drop dependency;
- web keyboard-arrow reordering;
- fixes for unrelated web, lint, Bun, or existing baseline failures.

## Assumptions

- Recipe detail remains read-only; reorder is available only during create/edit.
- Instruction array position is the canonical persisted order.
- Existing local instruction IDs are sufficient for gesture identity.
- Sections remain fixed.
- `react-native-gesture-handler` and Reanimated versions currently installed in Noomori remain compatible with Expo SDK 56.
- Existing unrelated working-tree changes must be preserved.
- The current `KeyboardAwareScrollView` implementation remains the recipe form's keyboard-handling owner outside active drag operations.

## Acceptance Criteria

The feature is complete when a user can:

```text
Edit/Create recipe
↓
hold an instruction drag handle
↓
move it within its section
↓
see the intended position before release
↓
drop it
↓
Save
↓
reopen the recipe
↓
observe the same instruction order
```

without breaking:

- text editing;
- keyboard avoidance;
- normal form scrolling;
- add/delete instruction behavior;
- validation;
- accessibility;
- existing create/edit persistence.
