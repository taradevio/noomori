# Noomori Toast & Push Notification Review

**Reviewed:** 2026-09-06  
**Repository:** `taradevio/noomori`  
**Commit inspected:** `3c952b4d6b5f984bcfe6036578624c16e8f87706`

## Summary

The current toast and push-notification implementation is already solid enough for MVP / closed testing.

This is not just a basic “show toast / request notification permission” implementation. It already covers:

- global route-stable toast hosting
- latest-toast-wins behavior
- safe dismiss IDs
- app-background-aware auto-dismiss timers
- swipe-to-dismiss
- reduced-motion behavior
- accessibility announcements
- Expo push-token registration
- token rotation
- stale token cleanup
- Expo push tickets and receipts
- foreground activity invalidation
- cold-start notification navigation
- actor exclusion
- silent household activity notifications
- server-owned push registration tables
- automated frontend and backend tests

The main recommendation is **not to redesign it**. Fix a few lifecycle/dependency issues, run real-device tests, then move on.

---

# Priority Findings

| Priority | Finding | Recommendation |
| --- | --- | --- |
| P1 | Notification state is not reconciled after returning from OS Settings | Fix before closed testing |
| P1 | Notification registration unnecessarily depends on `EXPO_ACCESS_TOKEN` | Decouple backend dependencies |
| P1/P2 | Foreground silent Android notification may not visibly surface | Make explicit UX decision |
| P2 | Push receipt loop runs per FastAPI process | Fine for single-instance MVP; revisit before scaling |
| P2 | Shared recipe `edited` push may become noisy/duplicated | Monitor, then gate on meaningful changes |
| P3 | Reduced Motion disables swipe dismissal entirely | Polish later |
| P3 | Accessibility needs VoiceOver/TalkBack smoke test | Test on physical devices |

---

# Toast Review

## Architecture

The current architecture is good.

`ToastHost` lives beside the root navigator instead of inside individual routes.

This means:

```text
Save recipe
↓
toast.success("Recipe saved")
↓
router.replace(...)
↓
Toast stays mounted
```

This is exactly the behavior needed for route-transition feedback.

Current root structure is approximately:

```text
GestureHandlerRootView
└─ KeyboardProvider
   └─ QueryClientProvider
      └─ ThemeProvider
         └─ SessionProvider
            └─ NotificationProvider
               ├─ SplashScreenController
               ├─ RootNavigator
               └─ ToastHost
```

## Latest-wins behavior

The toast store intentionally keeps only one current toast.

```text
Operation A completes
→ Toast A

Operation B completes
→ Toast B replaces Toast A
```

This is a good choice for Noomori because toasts represent the latest completed operation rather than a backlog of historical events.

Toast dismissal also carries the toast ID, so an old timer or gesture callback cannot accidentally dismiss a newer toast.

## Auto-dismiss

Current durations:

```text
success → 4 seconds
error   → 6 seconds
```

The timer pauses while the app is inactive/backgrounded and resumes once the app becomes active again.

This avoids a toast disappearing while the user cannot see it.

## Gesture behavior

Toast dismissal supports upward swiping.

The threshold is based on the measured toast height rather than a hard-coded distance:

```text
dismiss if:
offset <= -(height × 0.35)

OR

velocityY <= -700
```

Downward dragging applies rubber-band resistance.

This is a good interaction detail, especially when copy wraps or accessibility font sizes make the toast taller.

## Accessibility

Current implementation includes:

- `accessibilityRole="alert"`
- explicit accessibility labels
- different announcement priorities for success/error
- a close button with accessibility role/label
- web live-region behavior

This is stronger than the typical custom-toast implementation.

## Success vs dialog separation

The current recipe flow uses toast for transient results and Alert/dialog for decisions.

Example:

```text
Recipe saved
→ Toast

Recipe saved, but image upload failed.
Retry?
→ Alert / dialog
```

This separation is correct.

---

# P1 — Notification State Is Not Reconciled After OS Settings

Current flow:

```text
User enables notifications
↓
Permission denied
↓
App shows:
"Notifications are off"
↓
User taps "Open settings"
↓
User enables notifications in OS Settings
↓
Returns to Noomori
```

At this point, Noomori does not currently reconcile notification permission on `AppState → active`.

The switch may therefore still show `OFF`, and registration will not automatically finish.

The reverse can happen too:

```text
Noomori switch = ON
↓
User disables notifications in system settings
↓
Returns to Noomori
↓
Noomori switch can still display ON
```

The current local `enabled` state therefore means roughly:

> Noomori's last stored opt-in state

rather than:

> Notifications are currently usable by the OS.

## Recommended Fix

Reconcile whenever the app becomes active:

```text
AppState → active
↓
Notifications.getPermissionsAsync()
↓
read local opt-in
↓
reconcile OS permission + local preference
↓
refresh token registration/state when appropriate
```

For the “Open settings” flow, preserve user intent:

```text
User wants notifications ON
↓
OS permission missing
↓
Open settings
↓
Returns to app
↓
Permission now allowed
↓
Automatically finish registration
```

That avoids forcing the user to toggle the switch again.

---

# P1 — `get_admin_supabase()` Is Too Coupled to Expo

Current backend helper effectively requires both:

```text
SUPABASE_SERVICE_ROLE_KEY
AND
EXPO_ACCESS_TOKEN
```

before returning the admin Supabase client.

But these endpoints:

```text
PUT    /notifications/device
DELETE /notifications/device
```

only require database admin access.

They are registering/unregistering device tokens; they are not sending push notifications to Expo.

Therefore this configuration:

```text
SUPABASE_SERVICE_ROLE_KEY = available
EXPO_ACCESS_TOKEN         = missing
```

currently prevents device registration/unregistration even though the database is healthy.

This matters especially because sign-out currently performs server notification cleanup before discarding the local session.

## Recommended Separation

Use:

```text
get_admin_supabase()
→ requires Supabase service-role credentials only
```

and separately:

```text
get_expo_access_token()
→ required only when calling Expo push APIs
```

Actual delivery functions can continue to gate on:

```text
service role available?
expo token available?
```

but database registration endpoints should not depend on Expo delivery configuration.

---

# P1/P2 — Foreground Silent Notifications on Android

Household activity pushes intentionally use:

```text
sound = off
badge = off
```

This is a sensible product direction because household recipe activity should not feel noisy.

However, foreground Android behavior needs an explicit product decision.

Current foreground listener mainly does:

```text
notification received
↓
invalidate household activity query
```

So while the user is actively using Noomori:

```text
Household member edits recipe
↓
Push arrives
↓
No sound
↓
Potentially no visible Android heads-up
↓
Activity cache updates
```

The user may therefore receive no visible feedback.

## Two Valid Product Choices

### Option A — Keep foreground activity invisible

Use this if household activity is intentionally passive:

```text
Foreground:
refresh Activity only

Background:
system notification
```

This is valid.

### Option B — Surface a neutral in-app toast

Example:

```text
Rina updated "Chicken Curry"
```

This would fit the new toast system well.

If this path is chosen, add an `info`/neutral toast tone rather than misusing:

```text
toast.success(...)
```

because another household member editing a recipe is not a success result of the current user's action.

---

# Push Backend Review

The backend implementation is strong for the current stage.

## Device ownership

Push registration tables are server-owned.

App roles do not directly manipulate those rows.

Registration is bound to the authenticated user, and an Expo token cannot simply be taken over by another account.

Good.

## Recipient selection

Push fan-out excludes the actor:

```text
household members
− actor
↓
registered devices
```

This prevents users from receiving notifications about their own recipe activity.

## Push batching and retries

Implementation already handles:

```text
max 100 push messages per Expo batch

HTTP 429
→ retry

HTTP 5xx
→ retry

bounded attempts
→ maximum 3 tries
```

This is a good MVP reliability baseline.

## Tickets and receipts

Successful Expo ticket IDs are stored and later checked.

The receipt flow handles:

```text
DeviceNotRegistered
→ delete stale push token

missing receipt
→ keep pending

receipt older than 24h
→ expire stored receipt
```

This is substantially better than fire-and-forget push delivery.

## Idempotent share notifications

The database RPC returns whether sharing state actually changed.

Therefore:

```text
share request retry
```

does not automatically imply:

```text
duplicate "added" push
```

That is a good implementation detail.

---

# P2 — Receipt Worker Scaling

The FastAPI lifespan currently starts a receipt polling task.

Approximately:

```text
FastAPI process starts
↓
push_receipt_loop starts
↓
every 15 minutes:
check Expo receipts
```

For the current MVP, if deployment is:

```text
1 backend process / 1 replica
```

this is fine.

The issue appears when running:

```text
4 uvicorn workers
```

or:

```text
3 application replicas
```

because each process starts its own independent receipt poller.

That can result in multiple workers processing the same receipt rows.

## Recommendation

Do not redesign this yet for closed testing.

Before multi-worker / multi-instance scaling, move receipt processing to one of:

```text
dedicated scheduled worker
cron job
queue worker
database-backed claim/lock system
```

For now, one backend instance is sufficient.

---

# P2 — `edited` Push Can Become Noisy

Current semantic behavior is roughly:

```text
PUT /recipes/{id}
↓
recipe is shared?
↓ yes
queue "edited" notification
```

That means any successful update request can generate a push.

Possible future scenario:

```text
Save
↓
push

Save again without meaningful content change
↓
another push
```

Retry after an uncertain network timeout may cause similar duplicate side effects.

## Recommendation

Do not over-engineer this yet.

For MVP:

```text
manual explicit Save
→ one edited push
```

is acceptable.

Later, if telemetry or users report notification noise, gate activity on meaningful data changes:

```text
content actually changed?
↓ yes
activity + push
```

instead of:

```text
PUT occurred?
↓
push
```

---

# P3 — Reduced Motion and Swipe

Current toast gesture is disabled when Reduced Motion is enabled.

That means:

```text
Reduced Motion ON
→ swipe dismissal disabled
```

The close button remains available, so this is not a blocker.

However, Reduced Motion usually means:

> reduce or simplify animation

rather than:

> remove the interaction.

A future polish could keep the swipe gesture but use:

```text
minimal translation
or
immediate/fade dismissal
```

instead of the normal animated exit.

---

# P3 — Accessibility Smoke Test

Automated tests already cover accessibility announcements, but native screen readers still need real-device validation.

Test:

```text
TalkBack / VoiceOver

✓ toast is announced once
✓ close button receives focus
✓ large text wraps correctly
✓ error announcement does not unexpectedly interrupt critical content
✓ route transition does not cause duplicate announcements
```

This is a smoke test, not an architectural blocker.

---

# Recommended Real-Device Test Matrix

| Scenario | Android | iOS |
| --- | ---: | ---: |
| First enable → permission allow | ✅ | ✅ |
| First enable → permission deny | ✅ | ✅ |
| Deny → Open Settings → allow → return | **Critical** | **Critical** |
| Enabled → disable from OS Settings → return | **Critical** | **Critical** |
| Background push delivery | ✅ | ✅ |
| Foreground push behavior | **Critical** | ✅ |
| App killed → tap notification | ✅ | ✅ |
| `added` notification → recipe route | ✅ | ✅ |
| `edited` notification → recipe route | ✅ | ✅ |
| `unshared` notification → Activity route | ✅ | ✅ |
| Sign out while notifications enabled | ✅ | ✅ |
| Expo token rotation | Smoke | Smoke |
| Toast with TalkBack / VoiceOver | TalkBack | VoiceOver |
| Toast swipe dismissal | ✅ | ✅ |
| Toast large-font wrapping | ✅ | ✅ |
| Toast while route is replaced | ✅ | ✅ |

Android notification-channel behavior should also be tested on a fresh install/device state because notification-channel configuration persists at the OS level.

---

# Final Assessment

## Toast

**Score: 9/10**

The architecture is already good.

Strengths:

```text
global host
latest-wins store
safe IDs
background-aware timers
gesture dismissal
accessibility
reduced-motion handling
automated tests
```

Do not replace or redesign this subsystem.

## Notification Client

**Score: 8/10**

Strong overall implementation, but permission reconciliation after returning from OS Settings should be fixed before considering the feature complete.

## Push Backend

**Score: 8.5/10 for MVP**

Strong points:

```text
server-owned device registrations
authenticated ownership
actor exclusion
batching
bounded retries
tickets
receipts
stale token cleanup
idempotent share-state notification trigger
best-effort delivery isolated from recipe persistence
```

Main fix:

```text
decouple admin Supabase access
from Expo push credentials
```

Receipt polling can remain as-is until the backend starts using multiple workers/replicas.

---

# Recommended Next Steps

1. Add notification permission reconciliation on `AppState → active`.
2. Separate Supabase admin credentials from Expo delivery credentials.
3. Decide whether foreground household activity should:
   - silently refresh Activity, or
   - show a neutral in-app toast.
4. Run the real-device test matrix.
5. Fix only regressions found by those tests.
6. Stop polishing notification infrastructure and continue toward closed testing.

The current implementation is already sufficiently mature for the product stage. The goal now should be reliability verification rather than feature expansion.
