# Noomori — Household Invite Code Implementation References

**Purpose:** Engineering reference for implementing Noomori's temporary household invite code.  
**Scope:** Reference material only; this does **not** replace the canonical Household Join Code specification.  
**Target stack:** Expo / React Native + FastAPI + Supabase Postgres/RLS.  
**Noomori invite model:** 6-digit numeric code, temporary, single-use, Owner-generated, preview before join, final role = `member`.

---

# 1. How to Use This Reference

Do not copy any repository 1:1.

Study specific patterns:

```text
secure invite generation
temporary invite lifecycle
single-use redemption
preview-before-consume
atomic membership creation
Owner authorization
rate limiting
Supabase/RLS boundaries
```

Then map them onto the current Noomori codebase conventions.

The rule remains:

```text
inspect current code
→ reuse existing household/auth/API conventions
→ add the smallest missing invite boundary
```

---

# 2. Reference Summary

| Reference | Main value | Relevance |
|---|---|---:|
| ChoreQuest | Concrete FastAPI invite implementation | High |
| Cussi Parking | Owner/Member + 24-hour code UX | High |
| Rayfish | Single-use / revoke / burn-on-redeem semantics | Medium–High |
| Divine invite architecture | Validate vs consume separation | Medium |
| Supabase RLS / RPC | Invite lookup + atomic DB boundary | Very High |
| openCook | Recipe/family invite-code domain reference | Medium |
| Life360 | Mature small-group code sharing UX | High |
| Google Classroom | Human-enterable join-code UX | Medium |
| Honeydew | Recipe household invitation model | High |

---

# 3. ChoreQuest

Repository:

https://github.com/finalbillybong/ChoreQuest

Useful areas:

```text
backend/models.py
backend/routers/admin.py
backend/routers/auth.py
backend/rate_limit.py
```

## Why it is useful

It is one of the closest public references to Noomori's backend environment:

```text
Python
FastAPI
database-backed invite records
expiry
usage limits
rate limiting
```

## Patterns worth studying

### Dedicated invite entity

Conceptually:

```text
InviteCode
├── code
├── role
├── max_uses
├── times_used
├── created_by
├── expires_at
└── created_at
```

For Noomori, simplify to:

```text
household_invites
├── id
├── household_id
├── created_by
├── code_digest
├── created_at
├── expires_at
├── revoked_at?
├── consumed_at?
└── consumed_by?
```

### Secure RNG

ChoreQuest uses Python `secrets`, which is the correct primitive class for security-sensitive credentials.

Noomori:

```python
value = secrets.randbelow(1_000_000)
code = f"{value:06d}"
```

Python reference:

https://docs.python.org/3.12/library/secrets.html

### Collision handling

Pattern:

```text
generate
→ lookup / insert
→ collision?
   → regenerate
```

Noomori also needs this because six digits provide only 1,000,000 possible values.

### Rate limiting

ChoreQuest demonstrates that an MVP limiter can be small and local to the current deployment architecture.

Do not automatically introduce Redis solely because Join Code needs throttling.

Relevant OWASP guidance:

https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_and_Anti-Automation_Cheat_Sheet.html

## What not to copy

Do **not** copy plaintext invite storage as Noomori's canonical model.

Prefer:

```text
plaintext code
→ keyed digest / HMAC
→ persist digest only
```

Also do not copy role-from-invite semantics.

Noomori must always do:

```text
Join Code
→ role = member
```

Never:

```text
invite.role
→ owner
```

---

# 4. Cussi Parking

Repository:

https://github.com/marcomorosi06/Cussi-Parking-Android

## Why it is useful

The product model is close to Noomori:

```text
Owner
Member
small shared group
temporary invite code
mobile join flow
```

Relevant flow:

```text
Owner
→ Members
→ Generate Invite Code
→ share code

Recipient
→ Join with Invite Code
→ paste/type code
→ become Member
```

## Noomori lessons

Worth borrowing:

```text
Owner-only generation
temporary invite
mobile paste-code UX
small-group model
```

Do not use it as the main backend-security reference because its server stack differs from Noomori.

---

# 5. Rayfish

Repository:

https://github.com/rayfish/rayfish

## Why it is useful

The important semantic distinction is:

```text
single-use invitation
≠
reusable shared credential
```

Pattern:

```text
create invite
→ temporary credential

join with invite
→ verify
→ redeem
→ burn credential
```

They also expose concepts such as:

```text
list invites
revoke invite
```

## Noomori mapping

For Noomori:

```text
483921
```

means:

> one admission for one eligible user.

It does **not** mean:

> a permanent household password.

Successful join:

```text
consumed_at = now()
```

To add another person:

```text
Owner generates another invite.
```

---

# 6. Divine Invite Architecture

Reference:

https://github.com/divinevideo/divine-mobile/issues/2018

## Why it is useful

The useful architecture distinction is:

```text
validate invite
```

versus:

```text
consume invite
```

This maps directly to Noomori:

```text
Enter code
→ Validate
→ Preview
→ explicit confirmation
→ Join
```

### Preview

Must be read-only:

```text
code
→ validate
→ resolve household
→ return safe preview
```

Must NOT:

```text
create membership
consume invite
complete onboarding
```

### Join

Noomori should not create a generic `consumeInvite()` operation independent of membership.

Instead:

```text
join household
=
validate invite
+
insert membership
+
consume invite
```

as one business operation.

---

# 7. Supabase — RLS and Invite Lookup

Relevant discussion:

https://github.com/supabase/supabase/issues/4956

Supabase RLS docs:

https://supabase.com/docs/guides/database/postgres/row-level-security

Database Functions / RPC:

https://supabase.com/docs/guides/database/functions

## Why this matters most for Noomori

The difficult part is not generating six digits.

The difficult part is:

> How can an authenticated non-member prove possession of a valid invite without giving them broad SELECT access to invitation records?

## Anti-pattern

Avoid:

```ts
supabase
  .from("household_invites")
  .select("*")
  .eq("code", enteredCode)
```

plus weakened RLS.

Do not create invite policies equivalent to:

```sql
USING (true)
```

for authenticated users.

## Better boundary

Use:

```text
Expo
↓
existing authenticated API helper
↓
FastAPI
↓
controlled invite operation
↓
Postgres
```

The client should not be able to browse invite records.

---

# 8. Supabase RPC / Postgres Function for Atomic Join

Final join changes multiple related states:

```text
validate invite
insert household_members
consume invite
possibly update onboarding/profile
```

These must commit atomically.

Several sequential Supabase client calls from FastAPI are not automatically one transaction.

## Recommended boundary

Preview:

```text
FastAPI application logic
```

Final Join:

```text
FastAPI
↓
one narrow DB function / RPC
↓
single Postgres transaction
```

Conceptually:

```text
join_household_with_invite(current_user_id, code_digest)
```

Inside:

```text
1. locate invite
2. lock invite row
3. verify active
4. verify user has no household
5. insert household_members
   role = member
6. set consumed_at
7. set consumed_by
8. apply existing onboarding update if needed
9. return result
```

Any failure:

```text
rollback everything
```

If using `SECURITY DEFINER`, follow Supabase's current hardening guidance: restrict execution, control `search_path`, schema-qualify references, and keep the function narrow.

---

# 9. openCook

Repository:

https://github.com/oliexdev/openCook

## Why it is interesting

It is relevant at the product-domain level:

```text
recipes
family / household
invite code
```

It confirms that code-based household connection is not unusual for recipe products.

## What not to copy

Its household-code semantics are closer to a reusable shared secret.

Noomori should remain:

```text
temporary one-time admission credential
```

not:

```text
reusable household password
```

Use openCook as product/domain validation, not as the security architecture.

---

# 10. Life360 — Small-Group UX Reference

Source:

https://support.life360.com/hc/en-us/articles/23053409850647-Add-a-New-Member-to-My-Circle

Useful product pattern:

```text
Generate / Send Code
→ OS messaging/share apps
→ recipient receives code
```

Noomori can use:

```text
Invite member

        483 921

Expires in 24 hours.
Single use.

[ Copy ] [ Share ]
```

This makes code-based invitation much less friction-heavy for the Owner.

---

# 11. Google Classroom — Human-Enterable Code Reference

Source:

https://support.google.com/edu/classroom/answer/15605102

Relevant pattern:

```text
authenticated user
+
short code
+
explicit join action
```

This supports Noomori's decision to use a short manual credential for a one-time setup operation.

---

# 12. Honeydew — Recipe Household Reference

Source:

https://honeydewcook.com/support/en/using-the-app/household-sharing

Honeydew combines:

```text
recipes
household
Owner
Members
shared data
invite credential
```

Honeydew supports links/codes.

Noomori intentionally starts with code only to keep the MVP surface smaller.

---

# 13. Recommended Reading Order

## 1. ChoreQuest

Study:

```text
FastAPI structure
secure RNG
invite model
expiry validation
collision handling
rate limiting
```

Do not copy:

```text
plaintext code
role-from-invite
```

## 2. Supabase RLS + invite discussion

Study:

```text
controlled lookup
why broad invite-table access is dangerous
RLS boundary
```

## 3. Supabase Database Functions

Study:

```text
atomic join
row locking
transactional membership mutation
```

## 4. Cussi Parking

Study:

```text
Owner / Member UX
24-hour code
mobile entry
```

## 5. Rayfish

Study:

```text
single-use
revoke
burn-on-redeem
```

## 6. Divine

Study:

```text
validate vs consume
```

## 7. openCook

Study:

```text
recipe/family domain fit
```

---

# 14. Recommended Noomori Synthesis

```text
                       OWNER
                         │
                  Invite Member
                         │
                         ▼
                      FastAPI
                         │
                  existing auth
                         │
               Owner authorization
                         │
                         ▼
               secrets.randbelow()
                         │
                    "483921"
                         │
                     keyed digest
                         │
                         ▼
                 household_invites
                         │
              plaintext returned once
                         │
                ┌────────┴────────┐
                ▼                 ▼
              Copy              Share
                                  │
                                  ▼
                               Invitee
                                  │
                         Join Household
                                  │
                             enter code
                                  │
                                  ▼
                       FastAPI preview
                         ├── auth
                         ├── rate limit
                         ├── normalize
                         ├── digest lookup
                         └── safe preview
                                  │
                                  ▼
                     ┌──────────────────────┐
                     │ Join "Rumah Nanda"? │
                     │ Owner: Nanda         │
                     │ 3 members            │
                     │ [Cancel] [Join]      │
                     └──────────┬───────────┘
                                │
                                ▼
                         FastAPI Join
                                │
                         revalidate invite
                                │
                                ▼
                     Postgres atomic function
                         ├── lock invite
                         ├── validate active
                         ├── ensure no membership
                         ├── INSERT member
                         │      role = member
                         ├── consume invite
                         └── onboarding update
                                │
                                ▼
                              COMMIT
                                │
                                ▼
                    existing query invalidation
                                │
                                ▼
                    existing authenticated flow
```

---

# 15. Patterns Worth Copying

### ChoreQuest

```text
secrets-based generation
collision handling
expiry checks
small rate limiter
```

### Rayfish

```text
single-use
revoke
burn after redemption
```

### Divine

```text
validation does not equal consumption
```

### Supabase

```text
controlled invite lookup
narrow atomic DB operation
RLS remains canonical access boundary
```

### Life360 / Cussi Parking

```text
simple temporary code UX
native sharing
small trusted-group invitation
```

---

# 16. Patterns to Avoid

## Plaintext reusable household code

```text
household.code = "483921"
```

Avoid.

## Client direct invite-table SELECT

```text
Expo
→ SELECT invite WHERE code = ...
```

Avoid.

## Weak RLS for invite lookup

```sql
USING (true)
```

Avoid.

## Membership and consumption in separate commits

```text
INSERT member
commit

UPDATE invite consumed
commit
```

Avoid.

## Consume during preview

```text
Continue
→ invite becomes used
```

Avoid.

## Role from invite/client

```text
invite.role = owner
```

Avoid.

## No throttling

A six-digit code is a small credential space. Authentication alone is not enough.

---

# 17. Implementation Checklist

Before implementation:

- [ ] Inspect current Household router/service.
- [ ] Inspect current auth dependency.
- [ ] Inspect current Supabase client strategy.
- [ ] Inspect DB/RPC migration conventions.
- [ ] Inspect rate-limit infrastructure.
- [ ] Inspect onboarding completion flow.

Generation:

- [ ] Use `secrets`.
- [ ] Preserve leading zeros.
- [ ] Handle collisions.
- [ ] Store keyed digest.
- [ ] Set expiry.
- [ ] Revoke previous active invite.

Preview:

- [ ] Authenticated.
- [ ] Rate limited.
- [ ] Read-only.
- [ ] Does not consume invite.
- [ ] Returns safe preview only.

Join:

- [ ] Revalidate after preview.
- [ ] Lock/serialize redemption.
- [ ] Verify user has no household.
- [ ] Insert `role = member`.
- [ ] Consume invite atomically.
- [ ] Preserve existing one-household invariant.
- [ ] Handle retry after lost response.

After join:

- [ ] `household_members` remains authoritative.
- [ ] Existing RLS handles access.
- [ ] Existing query invalidation/navigation reused.

---

# 18. Final Recommendation

For Noomori, the best combination is:

```text
ChoreQuest
for FastAPI invite mechanics

+

Supabase RLS / Database Functions
for actual persistence/security boundaries

+

Rayfish
for single-use semantics

+

Divine
for preview-vs-consume separation

+

Life360 / Cussi Parking
for mobile invite-code UX
```

No single public repository should become Noomori's architecture.

The intended implementation remains:

> **small FastAPI invite orchestration + controlled preview + atomic Postgres membership redemption + existing Supabase household/RLS model.**

---

# 19. Source Index

## GitHub / Open Source

ChoreQuest  
https://github.com/finalbillybong/ChoreQuest

Cussi Parking Android  
https://github.com/marcomorosi06/Cussi-Parking-Android

Rayfish  
https://github.com/rayfish/rayfish

Divine invite architecture discussion  
https://github.com/divinevideo/divine-mobile/issues/2018

Supabase invite-code/RLS discussion  
https://github.com/supabase/supabase/issues/4956

openCook  
https://github.com/oliexdev/openCook

## Official Documentation / Product References

Supabase Row Level Security  
https://supabase.com/docs/guides/database/postgres/row-level-security

Supabase Database Functions  
https://supabase.com/docs/guides/database/functions

Python `secrets`  
https://docs.python.org/3.12/library/secrets.html

OWASP Authentication Cheat Sheet  
https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

OWASP Bot Management / Anti-Automation  
https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_and_Anti-Automation_Cheat_Sheet.html

Life360 — Add a New Member  
https://support.life360.com/hc/en-us/articles/23053409850647-Add-a-New-Member-to-My-Circle

Google Classroom — Join with a Code  
https://support.google.com/edu/classroom/answer/15605102

Honeydew — Household Sharing  
https://honeydewcook.com/support/en/using-the-app/household-sharing
