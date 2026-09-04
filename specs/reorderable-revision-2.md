# Reorderable Recipe Instructions — Ponytail Plan (Revision 2)

## Summary

Implement reorderable instruction steps in the shared `RecipeForm`.

Instructions may be reordered only within their current instruction section. Existing `instructionGroups[].steps` array order remains canonical and already persists through create/edit/save, so no API, database, migration, or dependency changes are required.

Ponytail constraint: use the already-installed Gesture Handler, Reanimated, `SymbolView`, NativeWind, current form state, and the existing keyboard-aware scroll container. Add only the small pure helpers and gesture behavior required by this feature.

## Implementation

### Root gesture boundary

Wrap the existing provider tree in `src/app/_layout.tsx` with an outer `GestureHandlerRootView` using `flex: 1`.

```text
GestureHandlerRootView
  └── KeyboardProvider
      └── QueryClientProvider
          └── existing application providers
```

Preserve all current providers and their existing order beneath the new root.

### Instruction card interaction

In `src/shared/components/recipe/recipe-form.tsx`:

- Replace duplicate instruction numbering with one visible instruction number.
- Add one 48×48 drag handle to each instruction card.
- Use the existing `SymbolView`, NativeWind utilities, and semantic design-system colors.
- Start dragging only from the handle.
- Use approximately an 8dp vertical activation threshold.
- Keep text input focus/editing, deletion, and ordinary form scrolling unchanged outside an active drag.
- Disable drag handles when a section contains only one step.

Do not make the entire instruction card draggable.

### Canonical and transient state

Keep two separate state layers.

#### Canonical React state

`draft.instructionGroups[].steps` remains authoritative.

Do not call `setDraft()` while the drag is still provisional.

#### Transient UI-thread state

Use Reanimated shared values for:

- active step ID;
- source index;
- candidate destination index;
- dragged translation;
- measured layouts;
- current scroll displacement;
- drag-active state.

While dragging:

```text
React draft
= unchanged canonical order

Reanimated state
= provisional visual order
```

A gesture start or midpoint crossing must not mutate the recipe draft.

Only a successful drop may commit a new canonical array.

### Dynamic-height destination resolution

Instruction cards may have different heights because instruction text is multiline.

Measure each rendered step within its current section.

Determine the candidate destination by comparing the dragged card center against neighboring card midpoints.

Clamp the destination to:

```text
0 ... steps.length - 1
```

Steps must never cross instruction-section boundaries.

Refresh layout information when card size materially changes.

### Provisional reordering

Maintain a transient `candidateIndex`.

When the dragged card crosses a neighboring midpoint:

- update the candidate index;
- visually displace neighboring cards to reveal the provisional destination;
- keep the React draft unchanged.

Example:

```text
Canonical:
1  Chop onion
2  Heat pan
3  Add tomato

Visual drag:
2  Heat pan   ← floating
1  Chop onion
3  Add tomato
```

The visual state may change continuously, but canonical recipe data must not.

### Drop and cancellation

On a successful drop:

1. resolve the final candidate index;
2. call the canonical reorder function once;
3. update only the targeted section's `steps`;
4. clear transient drag state;
5. allow numbering to update from array position.

On cancellation:

- clear transient drag state;
- animate visual items back if needed;
- do not mutate the canonical draft.

No rollback copy is required because canonical state never changes during the provisional gesture.

### Keyboard and scrolling integration

`RecipeForm` currently uses `KeyboardAwareScrollView` from `react-native-keyboard-controller`.

On drag activation:

- dismiss the software keyboard;
- suspend manual/user scrolling;
- keep programmatic drag auto-scroll available;
- refresh or use current measurements after any viewport change caused by keyboard dismissal.

Do not continue using stale pre-dismiss measurements if the visible viewport changes.

After the drag ends or is cancelled:

- restore ordinary user scrolling;
- preserve existing keyboard-aware input behavior.

Before adding complex scroll workarounds, confirm the existing keyboard-aware scroll container supports reliable programmatic scrolling and scroll-position tracking.

### Edge auto-scroll

Support dragging beyond the visible viewport.

Use approximately 64dp top and bottom edge zones.

Auto-scroll speed should increase progressively as the dragged card approaches the edge.

Define speed in distance per second, not distance per frame:

```text
frame displacement = velocity(dp/s) × elapsed time(s)
```

This keeps behavior reasonably consistent across 60Hz, 90Hz, and 120Hz devices.

Include current scroll displacement when resolving drag position and candidate destination.

Stop auto-scroll immediately when:

- the dragged item leaves the edge zone;
- the gesture ends;
- the gesture is cancelled.

### Animation

Use restrained Reanimated motion for:

- active-card translation;
- neighboring-card displacement;
- cancellation return;
- short settling after drop.

Use an existing semantic border treatment to distinguish the active dragged card.

Avoid decorative scale/rotation effects.

Respect reduced-motion preferences.

## Internal Helpers

Add a focused companion module with only the pure helpers needed by the feature.

### `moveInstruction`

```ts
moveInstruction(steps, fromIndex, toIndex)
```

Requirements:

- clamp source and destination indices;
- return a new reordered array for a real move;
- do not mutate the input array;
- if the effective source and destination positions are the same, treat the operation as a no-op and return the original array.

Examples:

```text
0 → 0      = no-op
0 → -1     = no-op after clamp
last → +1  = no-op after clamp
0 → 2      = reordered copy
```

### `resolveInstructionDestination`

```ts
resolveInstructionDestination(layouts, draggedCenter)
```

Requirements:

- resolve destination from variable-height midpoint crossings;
- remain independent of React Native, Gesture Handler, and Reanimated;
- operate only on the layout data supplied to it.

Do not introduce a generic sortable-list abstraction or alter public recipe types.

## Canonical Section Reorder

The form-level canonical reorder path owns section isolation.

Conceptually:

```ts
instructionGroups.map((group) =>
  group.id === targetGroupId
    ? {
        ...group,
        steps: moveInstruction(group.steps, fromIndex, toIndex),
      }
    : group,
)
```

Only the targeted section may change.

A reorder in section A must leave every other section unchanged.

## Accessibility

Drag-and-drop must not be the only way to reorder.

Expose each drag handle as an adjustable control with position information such as:

```text
Instruction 2 of 5
```

Support:

- `increment` → move one position later;
- `decrement` → move one position earlier.

Boundary actions clamp and become no-ops where appropriate.

For single-step sections:

- expose the handle as disabled;
- do not start a drag.

After an accessibility reorder, announce the resulting position, for example:

```text
Instruction moved to position 3 of 5.
```

Route accessibility actions and gesture drops through the same canonical section-reorder path.

Web Arrow Up/Down reordering remains outside this feature.

## Test Plan

### Pure logic

Verify:

- first → last;
- last → first;
- middle → earlier;
- middle → later;
- same-position no-op;
- clamped first-position no-op;
- clamped last-position no-op;
- one-item array;
- variable-height midpoint destination resolution.

### Shared form / canonical behavior

Verify:

- accessibility increment reorders correctly;
- accessibility decrement reorders correctly;
- numbering updates after reorder;
- single-step handles are disabled;
- only the targeted instruction section changes;
- unrelated sections remain byte-for-byte equivalent in order/content;
- canonical draft remains unchanged while a drag is provisional;
- cancellation leaves canonical order unchanged;
- a successful drop commits the reorder once;
- add instruction still appends to the correct section after reordering;
- delete removes the correct step after reordering;
- successful reorder marks the form dirty;
- Save serializes instructions in canonical reordered order;
- create and edit share the same behavior.

Do not rely on extensive Jest gesture, animation, frame, or scroll-physics simulation.

### Root layout

Verify that:

```text
GestureHandlerRootView
  └── existing provider tree
```

is preserved without removing or reordering the current application providers.

### Device validation

Validate on Android and iOS:

1. Drag upward within a section.
2. Drag downward within a section.
3. Attempt to cross a section boundary.
4. Reorder short and long multiline instructions.
5. Start dragging while the keyboard is open.
6. Confirm keyboard dismissal does not produce a jump or incorrect destination.
7. Confirm normal text-input keyboard avoidance still works after dragging.
8. Drag beyond the visible viewport using top/bottom auto-scroll.
9. Compare auto-scroll behavior on standard and high-refresh-rate Android devices where practical.
10. Cancel a drag and confirm the original order remains.
11. Reorder, Save, reopen Edit, and confirm the saved order.
12. Confirm ordinary form scrolling is restored after drag completion.
13. Confirm add/delete behavior remains correct after reorder.
14. Verify reduced-motion behavior.
15. Verify accessibility reordering with a screen reader where practical.

## Implementation Order

### Phase 1 — Canonical reorder invariant

- Add `moveInstruction`.
- Add `resolveInstructionDestination`.
- Add form-level section reorder function.
- Add accessibility move actions.
- Verify Save preserves reordered array order.

This phase proves the existing data model is sufficient.

### Phase 2 — Basic handle drag

- Add `GestureHandlerRootView`.
- Add the 48×48 instruction drag handle.
- Implement same-section dragging without edge auto-scroll.
- Support variable-height card midpoint resolution.
- Maintain transient candidate state.
- Commit only on successful release.
- Verify draft remains unchanged during provisional dragging.

Validate on Android and iOS.

### Phase 3 — Scroll and keyboard integration

- Verify programmatic control of the existing `KeyboardAwareScrollView`.
- Dismiss the keyboard on drag activation.
- Refresh layout assumptions after viewport changes.
- Suspend manual scrolling during active drag.
- Add time-normalized edge auto-scroll.

If the current keyboard-aware scroll container cannot expose reliable programmatic scrolling, reassess that boundary instead of adding workaround-heavy code.

### Phase 4 — Polish

- Neighbor displacement.
- Active-card visual treatment.
- Cancellation settling.
- Reduced-motion behavior.
- Screen-reader announcements.
- Full interaction regression pass.

## Out of Scope

This feature does not add:

- instruction-section reordering;
- cross-section step dragging;
- ingredient reordering;
- direct drag-to-reorder from recipe detail;
- automatic backend persistence while dragging;
- an explicit `order` database field;
- a new drag-and-drop dependency;
- a generic sortable-list abstraction;
- web arrow-key reordering;
- fixes for unrelated baseline failures.

## Assumptions

- Recipe detail remains read-only; reordering is available only during create/edit.
- Instruction array position is the canonical persisted order.
- Existing instruction IDs provide stable gesture identity.
- Sections remain fixed.
- Existing Gesture Handler and Reanimated versions remain compatible with Expo SDK 56.
- Existing working-tree changes must be preserved.
- `KeyboardAwareScrollView` remains the recipe form's keyboard-handling owner outside active drag operations.

## Acceptance Criteria

The feature is complete when a user can:

```text
Create/Edit recipe
↓
drag an instruction handle
↓
see a provisional destination
↓
drop within the same section
↓
Save
↓
reopen the recipe
↓
observe the same persisted instruction order
```

while preserving:

- text editing;
- keyboard avoidance;
- normal form scrolling;
- validation;
- dirty-state behavior;
- add/delete instruction behavior;
- accessibility;
- existing create/edit persistence.

During any active provisional drag:

```text
canonical draft order must remain unchanged
```

and only a successful drop may commit the new instruction order.
